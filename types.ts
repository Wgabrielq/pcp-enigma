

// Entity Definitions replicating a Relational DB Schema

export enum MaterialType {
  BOPP = 'BOPP',
  BOPP_MATE = 'BOPP MATE',
  BOPP_METALIZADO = 'BOPP METALIZADO',
  BOPP_DT = 'BOPP DT',
  BOPP_PERLADO = 'BOPP PERLADO',
  BOPP_BLANCO = 'BOPP BLANCO',
  PET = 'PET',
  PET_DT = 'PET DT',
  PET_PVDC = 'PET PVDC',
  PET_METALIZADO = 'PET METALIZADO',
  PE = 'PE',
  PE_BCO = 'PE BCO',
  CPP = 'CPP',
  BOPA = 'BOPA',
  PAPER = 'PAPEL',
  FOIL = 'ALUMINIO'
}

export const DEFAULT_MATERIAL_DENSITIES: Record<MaterialType, number> = {
  [MaterialType.BOPP]: 0.91,
  [MaterialType.BOPP_MATE]: 0.91,
  [MaterialType.BOPP_METALIZADO]: 0.91,
  [MaterialType.BOPP_DT]: 0.91,
  [MaterialType.BOPP_PERLADO]: 0.70, // Cavitado es menos denso
  [MaterialType.BOPP_BLANCO]: 0.95, // Pigmentado
  [MaterialType.PET]: 1.4,          // Corregido/Verificado a petición del usuario
  [MaterialType.PET_DT]: 1.4,
  [MaterialType.PET_PVDC]: 1.45,
  [MaterialType.PET_METALIZADO]: 1.40,
  [MaterialType.PE]: 0.92,          // Corregido/Verificado a petición del usuario
  [MaterialType.PE_BCO]: 1.00,      // Pigmento blanco sube densidad
  [MaterialType.CPP]: 0.90,
  [MaterialType.BOPA]: 1.15,
  [MaterialType.PAPER]: 1.0, 
  [MaterialType.FOIL]: 2.7
};

export interface Supplier {
  id: string;
  name: string; // Razón Social
  contact?: string;
  email?: string;
  phone?: string;
  origin?: string; // Nacional / Importado
  externalId?: string; // ID en ZetaSoftware
}

export interface Material {
  id: string;
  internalCode: string; // Código interno ERP
  name: string;
  supplier?: string; // Nuevo: Proveedor (Nombre guardado para referencia rápida)
  type: MaterialType;
  thickness: number; // micras
  density: number; // g/cm3
  width: number; // mm (Ancho real de la bobina en stock)
  costPerKg?: number;
  currentStockKg: number; // Inventario actual
  externalId?: string; // ID en ZetaSoftware
}

export interface Client {
  id: string;
  name: string;
  contact: string;
  email?: string;
  phone?: string;
  externalId?: string; // ID en ZetaSoftware
}

export type ProductFormat = 'BOBINA' | 'BOLSA';

// Nueva definición abstracta de una capa (Receta Ideal)
export interface LayerSpec {
  type: MaterialType;
  thickness: number; // micras
  width?: number; // mm (Ancho ideal. Si es 0/undefined usa el ancho de impresión + 20mm)
}

export interface ProductRecipe {
  id: string;
  sku: string;
  name: string;
  clientId: string;
  format: ProductFormat; // Nuevo: Bolsa o Bobina
  
  // Configuración de Merma Específica
  specificScrapPercent?: number; // Si existe, sobreescribe la global

  // Dimensiones Específicas
  // Comunes
  webWidth: number; // Ancho de bobina a imprimir (mm) - Fundamental para cálculo
  tracks: number; // Pistas / Montaje
  cylinder: number; // Desarrollo (mm)
  cutoff: number; // Paso (mm) - Fundamental para cálculo

  // Exclusivos Bobina
  windingDirection?: string; // Sentido de bobinado
  finalReelWidth?: number; // Ancho final bobina

  // Exclusivos Bolsa
  bagWidth?: number;
  bagHeight?: number;
  gusset?: number; // Fuelle

  // Estructura (Capas) - AHORA SON ESPECIFICACIONES, NO IDs
  layer1: LayerSpec; // Externa (Impresión)
  layer2?: LayerSpec; // Intermedia/Barrera
  layer3?: LayerSpec; // Interna (Sellante)
  
  // Insumos
  inkCoverage: number; // g/m2 promedio
  adhesiveCoverage: number; // g/m2
}

export enum OrderUnit {
  UNITS = 'Unidades',
  KILOS = 'Kilos',
  METERS = 'Metros'
}

export type OrderStatus = 'Pendiente' | 'En Producción' | 'Terminado';

// Detalle específico para el operario de qué material usar
export interface MaterialRequirementSnapshot {
  layer: string; // 'Capa 1', 'Capa 2', etc.
  materialName: string;
  internalCode: string;
  width: number;
  requiredKg: number;
  isSubstitute?: boolean;
  originalMaterialId?: string;
}

export interface ProductionOrder {
  id: string;
  orderCode: string; // Ej: OP-1001
  productId: string;
  productName: string;
  clientId?: string; // Added ID to fetch full details
  clientName: string;
  date: string;
  
  // Inputs
  quantityRequested: number;
  unit: OrderUnit;
  tolerancePercent: number;

  // Snapshot del Resultado (Para no recalcular si cambian materiales después)
  calculationSnapshot: CalculationResult;
  
  // Snapshot Técnico (Lo que necesita el operario)
  technicalDetails: {
    format: ProductFormat;
    webWidth: number;
    cylinder: number;
    cutoff: number;
    tracks: number;
    layers: string[]; // Nombres de materiales ['BOPP', 'PE']
    windingDirection?: string;
  };
  
  // Nuevo: Detalle exacto de materiales para el operario
  materialRequirements?: MaterialRequirementSnapshot[];

  // Workflow
  requiredStages: string[]; // ['Impresión', 'Laminación', 'Corte']
  status: OrderStatus;
  currentStage?: string; // Current active stage in workflow
  queueIndex?: number; // For drag and drop ordering in the queue
  notes?: string;
}

export interface ScrapBreakdown {
  startup: number;
  reprint: number;
  lamination: number;
  variable: number;
}

export interface CalculationResult {
  requiredLinearMeters: number; // Metros netos base
  grossLinearMeters: number; // Metros con merma
  maxLinearMetersWithTolerance: number; // Metros tope con tolerancia
  scrapMeters: number;
  scrapBreakdown: ScrapBreakdown; // Detalle de la merma
  
  // Material Requirements (Base Net + Scrap)
  layer1Kg: number;
  layer2Kg: number;
  layer3Kg: number;
  inkKg: number;
  adhesiveKg: number;

  // Max Requirements (Base Net + Scrap + Tolerance)
  maxLayer1Kg: number;
  maxLayer2Kg: number;
  maxLayer3Kg: number;
  maxInkKg: number;
  maxAdhesiveKg: number;
  
  totalWeightKg: number;
}

// Configuración SOAP ZetaSoftware
export interface ZetaConfig {
  enabled: boolean;
  apiUrl: string; // https://api.zetasoftware.com/z.apis.asoapstockactualv3
  // Credenciales SDTConnection
  desarrolladorCodigo: string;
  desarrolladorClave: string;
  empresaCodigo: string;
  empresaClave: string;
  usuarioCodigo: string;
  usuarioClave: string;
  rolCodigo: string;
}

export interface SystemConfig {
  fixedStartupMeters: number; // Ajuste Impresión
  reprintMeters: number; // Nuevo: Ajuste Reprint (DT)
  lamination1Meters: number; // Nuevo: Ajuste 1ra Laminación
  lamination2Meters: number; // Nuevo: Ajuste 2da Laminación
  variableScrapPercent: number;
  zetaConfig?: ZetaConfig; // Integración ERP
  materialDensities: Record<MaterialType, number>; // Densidades configurables
}