

import { Client, Material, MaterialType, ProductRecipe, SystemConfig, ProductionOrder, OrderStatus, Supplier, LayerSpec, DEFAULT_MATERIAL_DENSITIES } from '../types';
import { ZetaService } from './zetaService';
import * as XLSX from 'xlsx';

// --- DEFAULT DATA (SEED) ---
// CLEAN SLATE FOR VERSION 2.1
const DEFAULT_CLIENTS: Client[] = [];

const DEFAULT_SUPPLIERS: Supplier[] = [];

const DEFAULT_MATERIALS: Material[] = [];

const DEFAULT_PRODUCTS: ProductRecipe[] = [];

const DEFAULT_CONFIG: SystemConfig = {
  fixedStartupMeters: 500, // Ajuste Impresión
  reprintMeters: 300,      // Ajuste Reprint
  lamination1Meters: 300,  // Ajuste 1ra Laminación
  lamination2Meters: 300,  // Ajuste 2da Laminación
  variableScrapPercent: 0.05,
  materialDensities: DEFAULT_MATERIAL_DENSITIES, // Densidades iniciales
  zetaConfig: {
      enabled: false,
      apiUrl: 'https://api.zetasoftware.com/z.apis.asoapstockactualv3',
      desarrolladorCodigo: '',
      desarrolladorClave: '',
      empresaCodigo: '',
      empresaClave: '',
      usuarioCodigo: '',
      usuarioClave: '',
      rolCodigo: '0'
  }
};

// --- LOCAL STORAGE HELPERS ---
const load = <T>(key: string, defaults: T): T => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return defaults;
    
    // Config Migration Strategy: Merge saved config with defaults to ensure new fields exist
    if (key === 'flexo_config') {
        const savedConfig = JSON.parse(item);
        const defaultsAny = defaults as any;
        
        // Deep merge for zetaConfig
        const mergedZeta = { ...(defaultsAny.zetaConfig || {}), ...(savedConfig.zetaConfig || {}) };
        
        // Merge Material Densities (Ensure all keys exist if new types added or missing in old config)
        const mergedDensities = { ...(defaultsAny.materialDensities || {}), ...(savedConfig.materialDensities || {}) };

        return { 
            ...defaultsAny, 
            ...savedConfig, 
            zetaConfig: mergedZeta,
            materialDensities: mergedDensities
        } as T;
    }
    
    return JSON.parse(item);
  } catch (e) {
    console.error(`Error loading ${key}`, e);
    return defaults;
  }
};

const save = (key: string, data: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Error saving ${key}`, e);
  }
};

// --- FILE SYSTEM ACCESS API STATE ---
let dbFileHandle: any = null; // FileSystemFileHandle

// --- DATA NORMALIZATION / MIGRATION ---
// Ensures that loaded products match the new LayerSpec interface to prevent crashes
const normalizeProducts = (products: any[]): ProductRecipe[] => {
    return products.map(p => {
        // Migration: Ensure layer1 exists and has Type/Thickness
        // If old data used 'materialId', we can't easily recover spec without looking up material, 
        // so we default to BOPP 20mic to prevent crash.
        const layer1: LayerSpec = p.layer1 && p.layer1.type ? p.layer1 : { 
            type: MaterialType.BOPP, 
            thickness: 20, 
            width: (p.webWidth || 0) + 20 // Default rule: WebWidth + 20
        };

        const layer2: LayerSpec | undefined = p.layer2 && p.layer2.type ? p.layer2 : undefined;
        const layer3: LayerSpec | undefined = p.layer3 && p.layer3.type ? p.layer3 : undefined;

        return {
            ...p,
            layer1,
            layer2,
            layer3
        } as ProductRecipe;
    });
};

// --- STATE ---
let CLIENTS: Client[] = load('flexo_clients', DEFAULT_CLIENTS);
let SUPPLIERS: Supplier[] = load('flexo_suppliers', DEFAULT_SUPPLIERS);
let MATERIALS: Material[] = load('flexo_materials', DEFAULT_MATERIALS);
// Load and Normalize Products immediately
let PRODUCTS: ProductRecipe[] = normalizeProducts(load('flexo_products', DEFAULT_PRODUCTS));
let CONFIG: SystemConfig = load('flexo_config', DEFAULT_CONFIG);
let ORDERS: ProductionOrder[] = load('flexo_orders', []);

// --- AUTO SAVE LOGIC ---
const triggerAutoSave = async () => {
  // Always save to LocalStorage as backup
  save('flexo_clients', CLIENTS);
  save('flexo_suppliers', SUPPLIERS);
  save('flexo_materials', MATERIALS);
  save('flexo_products', PRODUCTS);
  save('flexo_orders', ORDERS);
  save('flexo_config', CONFIG);

  // If File Handle exists, write to disk
  if (dbFileHandle) {
    try {
      const db = {
        clients: CLIENTS,
        suppliers: SUPPLIERS,
        materials: MATERIALS,
        products: PRODUCTS,
        orders: ORDERS,
        config: CONFIG,
        lastModified: new Date().toISOString()
      };
      
      const writable = await dbFileHandle.createWritable();
      await writable.write(JSON.stringify(db, null, 2));
      await writable.close();
      console.log("Auto-saved to Drive/Disk");
    } catch (err) {
      console.error("Failed to auto-save to disk:", err);
      // Don't alert on every auto-save failure to avoid spamming the user
    }
  }
};

export const connectAndLoadDB = async (): Promise<boolean> => {
  // Check browser support
  if (typeof (window as any).showOpenFilePicker !== 'function') {
      alert("Tu navegador no soporta la sincronización automática (File System API). Esta función requiere Chrome, Edge o Opera en escritorio.\n\nPara móviles o navegadores no soportados, usa la importación manual en Configuración.");
      return false;
  }

  try {
    // @ts-ignore - File System Access API
    const [handle] = await (window as any).showOpenFilePicker({
      types: [{
        description: 'JSON Database',
        accept: { 'application/json': ['.json'] },
      }],
      multiple: false,
    });

    dbFileHandle = handle;
    const file = await dbFileHandle.getFile();
    const text = await file.text();
    const json = JSON.parse(text);

    if (!json.clients || !json.materials) {
       alert("El archivo seleccionado no es una base de datos válida de PCP Enigma.");
       return false;
    }

    // Load into memory
    CLIENTS = json.clients || [];
    SUPPLIERS = json.suppliers || [];
    MATERIALS = json.materials || [];
    // Normalize products on load from DB file too
    PRODUCTS = normalizeProducts(json.products || []);
    ORDERS = json.orders || [];
    CONFIG = { ...DEFAULT_CONFIG, ...(json.config || {}) }; // Merge config to ensure new fields

    // Save to local storage immediately
    triggerAutoSave();
    
    return true;
  } catch (err: any) {
    if (err.name === 'AbortError') return false;
    
    // Specific handling for iframe/security restrictions (Preview Environments)
    if (err.name === 'SecurityError' || (err.message && err.message.includes('Cross origin'))) {
        alert("⚠️ Restricción de Entorno Detectada\n\nEstás ejecutando la App en un entorno restringido (iframe) que bloquea el acceso directo al disco duro.\n\nSOLUCIÓN:\n1. Ejecuta el proyecto localmente o despliégalo en GitHub Pages.\n2. Mientras tanto, usa la opción 'Configuración > Importar/Restaurar' para cargar tus datos manualmente.");
        return false;
    }

    console.error("Error connecting DB:", err);
    alert("Error al conectar: " + err.message);
    return false;
  }
};

export const isDBConnected = () => !!dbFileHandle;

// --- ZETA SYNC INTEGRATION ---
export const syncWithZeta = async (): Promise<{success: boolean, message: string}> => {
    if (!CONFIG.zetaConfig || !CONFIG.zetaConfig.enabled) {
        return { success: false, message: 'Integración Zeta no configurada o deshabilitada.' };
    }

    // Initialize Service with Config
    const zeta = new ZetaService(CONFIG.zetaConfig);
    let counts = { clients: 0, suppliers: 0, materials: 0 };

    try {
        // 1. Sync Materials (Stock Update is Critical)
        const zMaterials = await zeta.getMaterials();
        zMaterials.forEach(zm => {
            const existingIdx = MATERIALS.findIndex(m => 
                (m.externalId && m.externalId === zm.externalId) || 
                (m.internalCode === zm.internalCode) // Fallback to Internal Code matching
            );

            if (existingIdx >= 0) {
                // Update stock and cost mainly, keep user defined props if they were manually refined?
                // For now, we overwrite details if Zeta is master.
                // We PRESERVE width/thickness if Zeta returned 0 (failed parsing) but we have a value.
                const current = MATERIALS[existingIdx];
                MATERIALS[existingIdx] = {
                    ...current,
                    currentStockKg: zm.currentStockKg, // Always update stock
                    // costPerKg: zm.costPerKg, // WSDL does not provide cost in this specific view
                    externalId: zm.externalId,
                    // Only update tech specs if Zeta parsing was successful, otherwise keep local manual edit
                    thickness: zm.thickness > 0 ? zm.thickness : current.thickness,
                    width: zm.width > 0 ? zm.width : current.width,
                    type: zm.type !== MaterialType.BOPP ? zm.type : current.type
                };
            } else {
                MATERIALS.push(zm);
                counts.materials++;
            }
        });

        triggerAutoSave();
        return { 
            success: true, 
            message: `Sincronización Exitosa:\nInventario actualizado.\n+${counts.materials} Artículos nuevos detectados.` 
        };

    } catch (error: any) {
        return { success: false, message: 'Error de conexión con Zeta SOAP: ' + error.message };
    }
}


// --- GETTERS ---
export const getClients = () => [...CLIENTS];
export const getSuppliers = () => [...SUPPLIERS];
export const getMaterials = () => [...MATERIALS];
export const getProducts = () => [...PRODUCTS];
export const getConfig = () => ({ ...CONFIG });
export const getOrders = () => [...ORDERS].sort((a, b) => (a.queueIndex || 0) - (b.queueIndex || 0));

// --- SETTERS / MUTATORS ---

// Products
export const saveProduct = (product: ProductRecipe) => {
  const index = PRODUCTS.findIndex(p => p.id === product.id);
  if (index >= 0) {
    PRODUCTS[index] = product;
  } else {
    PRODUCTS.push(product);
  }
  triggerAutoSave();
};

export const deleteProduct = (id: string) => {
  PRODUCTS = PRODUCTS.filter(p => p.id !== id);
  triggerAutoSave();
};

// Clients
export const saveClient = (client: Client) => {
  const index = CLIENTS.findIndex(c => c.id === client.id);
  if (index >= 0) {
    CLIENTS[index] = client;
  } else {
    CLIENTS.push(client);
  }
  triggerAutoSave();
};

export const deleteClient = (id: string) => {
  CLIENTS = CLIENTS.filter(c => c.id !== id);
  triggerAutoSave();
};

// Suppliers
export const saveSupplier = (supplier: Supplier) => {
  const index = SUPPLIERS.findIndex(s => s.id === supplier.id);
  if (index >= 0) {
    SUPPLIERS[index] = supplier;
  } else {
    SUPPLIERS.push(supplier);
  }
  triggerAutoSave();
};

export const deleteSupplier = (id: string) => {
  SUPPLIERS = SUPPLIERS.filter(s => s.id !== id);
  triggerAutoSave();
};

// Materials
export const saveMaterial = (material: Material) => {
  const index = MATERIALS.findIndex(m => m.id === material.id);
  if (index >= 0) {
    MATERIALS[index] = material;
  } else {
    MATERIALS.push(material);
  }
  triggerAutoSave();
};

export const deleteMaterial = (id: string) => {
  MATERIALS = MATERIALS.filter(m => m.id !== id);
  triggerAutoSave();
};

// ORDERS
export const saveOrder = (order: ProductionOrder) => {
  // Assign a high index to put it at the end of the queue by default
  if (order.queueIndex === undefined) {
    const maxIndex = ORDERS.reduce((max, o) => Math.max(max, o.queueIndex || 0), 0);
    order.queueIndex = maxIndex + 1;
  }
  
  const index = ORDERS.findIndex(o => o.id === order.id);
  if (index >= 0) {
      ORDERS[index] = order;
  } else {
      ORDERS.push(order);
  }
  triggerAutoSave();
};

export const updateOrderStatus = (orderId: string, status: OrderStatus) => {
  const order = ORDERS.find(o => o.id === orderId);
  if (order) {
    order.status = status;
    triggerAutoSave();
  }
};

export const updateOrderStage = (orderId: string, stage: string) => {
  const order = ORDERS.find(o => o.id === orderId);
  if (order) {
    order.currentStage = stage;
    triggerAutoSave();
  }
};

export const reorderQueue = (orders: ProductionOrder[]) => {
    orders.forEach((o, idx) => {
        const existingOrder = ORDERS.find(ex => ex.id === o.id);
        if (existingOrder) {
            existingOrder.queueIndex = idx;
        }
    });
    triggerAutoSave();
}

export const deleteOrder = (id: string) => {
    ORDERS = ORDERS.filter(o => o.id !== id);
    triggerAutoSave();
}

// STOCK MANAGEMENT
export const deductStock = (materialId: string, amountKg: number) => {
  const index = MATERIALS.findIndex(m => m.id === materialId);
  if (index >= 0) {
    MATERIALS[index].currentStockKg = Math.max(0, MATERIALS[index].currentStockKg - amountKg);
    triggerAutoSave();
    return true;
  }
  return false;
};

// Config
export const updateConfig = (newConfig: Partial<SystemConfig>) => {
  CONFIG = { ...CONFIG, ...newConfig };
  triggerAutoSave();
};

// --- EXPORT ---
export const generateExcelExport = () => {
  const wb = XLSX.utils.book_new();

  // 1. Orders History
  const flatOrders = ORDERS.map(o => ({
    'Codigo': o.orderCode,
    'Fecha': o.date,
    'Cliente': o.clientName,
    'Producto': o.productName,
    'Estado': o.status,
    'Etapa Actual': o.currentStage || 'Inicio',
    'Pedido': `${o.quantityRequested} ${o.unit}`,
    'Metros Brutos': o.calculationSnapshot.grossLinearMeters,
    'Peso Total (Kg)': o.calculationSnapshot.totalWeightKg,
    'Etapas': o.requiredStages.join(', ')
  }));
  const wsOrders = XLSX.utils.json_to_sheet(flatOrders);
  XLSX.utils.book_append_sheet(wb, wsOrders, "Historial Producción");

  // 2. Clients
  const wsClients = XLSX.utils.json_to_sheet(CLIENTS);
  XLSX.utils.book_append_sheet(wb, wsClients, "Clientes");

  // 3. Suppliers
  const wsSuppliers = XLSX.utils.json_to_sheet(SUPPLIERS);
  XLSX.utils.book_append_sheet(wb, wsSuppliers, "Proveedores");

  // 4. Inventory
  const wsMaterials = XLSX.utils.json_to_sheet(MATERIALS);
  XLSX.utils.book_append_sheet(wb, wsMaterials, "Inventario");

  // 5. Recipes
  const flatProducts = PRODUCTS.map(p => {
    const client = CLIENTS.find(c => c.id === p.clientId)?.name || 'N/A';
    return {
      SKU: p.sku,
      Producto: p.name,
      Cliente: client,
      Formato: p.format,
      'Ancho Impresión': p.webWidth,
      'Capa 1 Tipo': p.layer1.type,
      'Capa 1 Mic': p.layer1.thickness,
      'Capa 2 Tipo': p.layer2?.type || '-',
      'Capa 3 Tipo': p.layer3?.type || '-',
      '% Merma Ficha': p.specificScrapPercent ? p.specificScrapPercent * 100 : 'Default'
    };
  });
  const wsProducts = XLSX.utils.json_to_sheet(flatProducts);
  XLSX.utils.book_append_sheet(wb, wsProducts, "Fichas Técnicas");

  XLSX.writeFile(wb, "PCP_Enigma_DB.xlsx");
};

export const exportDatabaseJSON = () => {
  const db = {
    clients: CLIENTS,
    suppliers: SUPPLIERS,
    materials: MATERIALS,
    products: PRODUCTS,
    orders: ORDERS,
    config: CONFIG,
    exportedAt: new Date().toISOString()
  };
  
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", `pcp_backup_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

export const importDatabaseJSON = async (file: File): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        
        if (!json.clients || !json.materials || !json.products) {
           alert("Archivo inválido: Estructura de datos incorrecta.");
           resolve(false);
           return;
        }

        if(confirm("ADVERTENCIA: Esto borrará los datos actuales y cargará los del archivo. ¿Continuar?")) {
            save('flexo_clients', json.clients);
            save('flexo_suppliers', json.suppliers || []);
            save('flexo_materials', json.materials);
            save('flexo_products', normalizeProducts(json.products)); // NORMALIZE ON IMPORT
            save('flexo_orders', json.orders);
            save('flexo_config', { ...DEFAULT_CONFIG, ...(json.config || {}) }); // Merge config
            
            CLIENTS = json.clients;
            SUPPLIERS = json.suppliers || [];
            MATERIALS = json.materials;
            PRODUCTS = normalizeProducts(json.products);
            ORDERS = json.orders;
            CONFIG = { ...DEFAULT_CONFIG, ...(json.config || {}) };
            
            resolve(true);
        } else {
            resolve(false);
        }
      } catch (e) {
        console.error(e);
        alert("Error leyendo el archivo JSON.");
        resolve(false);
      }
    };
    reader.readAsText(file);
  });
}