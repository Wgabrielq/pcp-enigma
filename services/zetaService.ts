

import { Client, Supplier, Material, MaterialType, DEFAULT_MATERIAL_DENSITIES, ZetaConfig } from '../types';

// LISTA BLANCA DE PROVEEDORES / MARCAS PERMITIDAS PARA IMPORTAR MATERIAL
const ALLOWED_IMPORT_SOURCES = [
    'POLO FILMS',
    'VITOPEL',
    'TERPHANE',
    'MULTIPACK',
    'RBS'
];

export class ZetaService {
  private config: ZetaConfig;

  constructor(config: ZetaConfig) {
    this.config = config;
  }

  // --- HELPER: SOAP REQUEST ---
  private async soapRequest(action: string, bodyXml: string): Promise<Document> {
    const envelope = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:zet="ZetaSoftware">
         <soapenv:Header/>
         <soapenv:Body>
            ${bodyXml}
         </soapenv:Body>
      </soapenv:Envelope>
    `;

    try {
      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': `ZetaSoftwareaction/${action}`
        },
        body: envelope.trim()
      });

      if (!response.ok) {
        throw new Error(`Error HTTP Zeta SOAP: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");

      const fault = xmlDoc.getElementsByTagName("soapenv:Fault")[0];
      if (fault) {
        throw new Error("SOAP Fault: " + fault.textContent);
      }

      return xmlDoc;
    } catch (error) {
      console.error("Error en SOAP Request:", error);
      throw error;
    }
  }

  // --- CLIENTES (Stub - No implementado en este WSDL) ---
  async getClients(): Promise<Client[]> {
    // El WSDL proporcionado es solo para Stock, no para clientes.
    // Retornamos vacío para no romper la interfaz existente.
    console.log("Zeta Sync: Omitiendo Clientes (WSDL limitado a Stock)");
    return [];
  }

  // --- PROVEEDORES (Stub - No implementado en este WSDL) ---
  async getSuppliers(): Promise<Supplier[]> {
    console.log("Zeta Sync: Omitiendo Proveedores (WSDL limitado a Stock)");
    return [];
  }

  // --- INVENTARIO (SOAP StockActualV3) ---
  async getMaterials(): Promise<Material[]> {
    console.log("Iniciando Sincronización SOAP StockActualV3...");
    
    // Construcción del cuerpo de la petición SOAP según WSDL
    const requestBody = `
      <zet:SOAPStockActualV3.QUERY>
         <zet:Queryin>
            <zet:Connection>
               <zet:DesarrolladorCodigo>${this.config.desarrolladorCodigo}</zet:DesarrolladorCodigo>
               <zet:DesarrolladorClave>${this.config.desarrolladorClave}</zet:DesarrolladorClave>
               <zet:EmpresaCodigo>${this.config.empresaCodigo}</zet:EmpresaCodigo>
               <zet:EmpresaClave>${this.config.empresaClave}</zet:EmpresaClave>
               <zet:UsuarioCodigo>${this.config.usuarioCodigo}</zet:UsuarioCodigo>
               <zet:UsuarioClave>${this.config.usuarioClave}</zet:UsuarioClave>
               <zet:RolCodigo>${this.config.rolCodigo}</zet:RolCodigo>
            </zet:Connection>
            <zet:Data>
               <zet:Page>1</zet:Page>
               <zet:Filters>
                   <zet:VencimientoDesde xsi:nil="true" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>
                   <zet:VencimientoHasta xsi:nil="true" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>
                   <zet:DepositoCodigo>0</zet:DepositoCodigo>
                   <zet:LocalCodigo>0</zet:LocalCodigo>
                   <zet:CantidadDesde>0</zet:CantidadDesde>
                   <zet:CantidadHasta>999999</zet:CantidadHasta>
               </zet:Filters>
            </zet:Data>
         </zet:Queryin>
      </zet:SOAPStockActualV3.QUERY>
    `;

    // Acción definida en el WSDL
    const soapAction = "apis.ASOAPSTOCKACTUALV3.QUERY";
    
    const xmlDoc = await this.soapRequest(soapAction, requestBody);
    
    // Parsear respuesta
    // Estructura: <Response> -> <Item> -> <ArticuloCodigo>, <ArticuloNombre>, <StockActual>
    const items = xmlDoc.getElementsByTagName("Item");
    const materials: Material[] = [];
    
    console.log(`Zeta SOAP: Recibidos ${items.length} items brutos.`);

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        // Helpers para extraer texto de etiquetas
        const getVal = (tag: string) => item.getElementsByTagName(tag)[0]?.textContent || "";
        
        const codigo = getVal("ArticuloCodigo");
        const nombre = getVal("ArticuloNombre");
        const stockStr = getVal("StockActual");
        const stock = parseFloat(stockStr) || 0;

        // FILTRO DE LISTA BLANCA (Misma lógica que antes)
        const searchString = nombre.toUpperCase();
        const isAllowed = ALLOWED_IMPORT_SOURCES.some(source => searchString.includes(source));

        if (isAllowed) {
             // Lógica de Parsing Inteligente (Recuperada)
             const nameUpper = nombre.toUpperCase();
             let detectedType = MaterialType.BOPP;
             let detectedThickness = 0;
             let detectedWidth = 0;

             // 1. Detección de Tipo
             if (nameUpper.includes('PET')) detectedType = MaterialType.PET;
             else if (nameUpper.includes('PEBD') || nameUpper.includes('POLIETILENO')) detectedType = MaterialType.PE;
             else if (nameUpper.includes('BOPA') || nameUpper.includes('NYLON')) detectedType = MaterialType.BOPA;
             else if (nameUpper.includes('CPP')) detectedType = MaterialType.CPP;
             else if (nameUpper.includes('PAPEL')) detectedType = MaterialType.PAPER;
             else if (nameUpper.includes('MATE')) detectedType = MaterialType.BOPP_MATE;
             else if (nameUpper.includes('METAL')) detectedType = MaterialType.BOPP_METALIZADO;

             // 2. Detección de Espesor
             const micMatch = nameUpper.match(/(\d+([.,]\d+)?)\s*(MIC|MC|MY|MICRAS)/);
             if (micMatch) {
                detectedThickness = parseFloat(micMatch[1].replace(',', '.'));
             }

             // 3. Detección de Ancho
             const widthMatch = nameUpper.match(/(\d+)\s*(MM|CM)/);
             if (widthMatch) {
                let val = parseInt(widthMatch[1]);
                if (widthMatch[2] === 'CM') val *= 10;
                detectedWidth = val;
             }

             // Determinar proveedor basado en nombre (ya que filtramos por esto)
             let supplierName = 'Zeta Import';
             const matchedSource = ALLOWED_IMPORT_SOURCES.find(s => nameUpper.includes(s));
             if (matchedSource) supplierName = matchedSource;

             materials.push({
                id: `zeta-m-${codigo}`,
                internalCode: codigo,
                name: nombre,
                supplier: supplierName,
                type: detectedType,
                thickness: detectedThickness || 20,
                density: DEFAULT_MATERIAL_DENSITIES[detectedType] || 0.91,
                width: detectedWidth || 0,
                currentStockKg: stock,
                externalId: codigo
             });
        }
    }

    console.log(`Zeta SOAP: ${materials.length} materiales procesados tras filtro.`);
    return materials;
  }
}
