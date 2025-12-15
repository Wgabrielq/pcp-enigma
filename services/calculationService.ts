

import { Material, ProductRecipe, OrderUnit, CalculationResult, LayerSpec, DEFAULT_MATERIAL_DENSITIES, MaterialType, ScrapBreakdown } from '../types';
import { getConfig } from './dataService';

/**
 * Calcula el peso TEÓRICO de una bobina basada en la especificación técnica.
 * Fórmula: (Ancho(m) * Largo(m) * Espesor(mic) * Densidad) / 1000 = Kg
 * Nota: Si spec.width no está definido, usa webWidth + 20mm (Regla de negocio)
 */
export const calculateTheoreticalWebWeight = (
  printWebWidthMm: number, // Ancho de impresión base
  lengthMeters: number,
  spec: LayerSpec
): number => {
  // Regla: Si no hay ancho ideal en la capa, se asume Ancho Impreso + 20mm
  const effectiveWidthMm = spec.width && spec.width > 0 ? spec.width : (printWebWidthMm + 20);
  
  const widthM = effectiveWidthMm / 1000;
  
  // Use Config density or Fallback
  const config = getConfig();
  const density = config.materialDensities?.[spec.type] || DEFAULT_MATERIAL_DENSITIES[spec.type] || 0.91; 

  return (widthM * lengthMeters * spec.thickness * density) / 1000;
};

/**
 * NUEVO: Calcula el peso REAL que tendrá una bobina específica para una cantidad de metros.
 * Usa las propiedades reales del material (Ancho real, densidad real, espesor real).
 */
export const calculateRealMaterialWeight = (
    meters: number,
    material: Material
): number => {
    const widthM = material.width / 1000;
    
    // Si el material tiene densidad específica guardada, usarla, sino usar la del tipo desde Config
    const config = getConfig();
    const density = material.density || config.materialDensities?.[material.type] || DEFAULT_MATERIAL_DENSITIES[material.type] || 0.91;
    
    return (widthM * meters * material.thickness * density) / 1000;
};

/**
 * NUEVO: Calcula cuántos metros rinde una cantidad de Kg de un material específico.
 * Útil para saber hasta dónde alcanza el stock actual.
 */
export const calculateMetersFromRealWeight = (
    kg: number,
    material: Material
): number => {
    const widthM = material.width / 1000;
    
    const config = getConfig();
    const density = material.density || config.materialDensities?.[material.type] || DEFAULT_MATERIAL_DENSITIES[material.type] || 0.91;
    
    // Kg = (Ancho * Metros * Esp * Den) / 1000
    // Metros = (Kg * 1000) / (Ancho * Esp * Den)
    const denominator = widthM * material.thickness * density;
    if (denominator === 0) return 0;
    
    return (kg * 1000) / denominator;
};

/**
 * Motor de Cálculo de Producción
 */
export const calculateProductionRequirements = (
  quantity: number,
  tolerancePercent: number,
  unit: OrderUnit,
  product: ProductRecipe,
  materials: Material[], // Kept for interface compatibility but used less in this step
  scrapOverrides?: Partial<ScrapBreakdown> // NUEVO: Permite sobreescribir los metros de merma manualmente
): CalculationResult => {
  
  // Obtener configuración actual del sistema
  const config = getConfig();

  // Usar merma específica del producto si existe, sino la global
  const usedVariableScrapPercent = product.specificScrapPercent !== undefined 
    ? product.specificScrapPercent 
    : config.variableScrapPercent;

  // Validar pistas para evitar división por cero
  const tracks = product.tracks > 0 ? product.tracks : 1;

  // 1. Normalizar a Metros Lineales (Netos de Máquina)
  let requiredLinearMeters = 0;

  if (unit === OrderUnit.METERS) {
    // CORRECCIÓN: Si el pedido es en Metros Finales, se divide por el número de pistas.
    requiredLinearMeters = quantity / tracks;

  } else if (unit === OrderUnit.UNITS) {
    // Fórmula: (Unidades * Paso) / Pistas / 1000
    requiredLinearMeters = (quantity * product.cutoff) / (tracks * 1000);

  } else if (unit === OrderUnit.KILOS) {
    // Cálculo inverso complejo basado en la RECETA IDEAL
    let weightPerMeter = calculateTheoreticalWebWeight(product.webWidth, 1, product.layer1);
    if (product.layer2) weightPerMeter += calculateTheoreticalWebWeight(product.webWidth, 1, product.layer2);
    if (product.layer3) weightPerMeter += calculateTheoreticalWebWeight(product.webWidth, 1, product.layer3);
    
    // Sumar adhesivo y tinta
    const widthM = product.webWidth / 1000;
    const inkWeight = (widthM * 1 * product.inkCoverage) / 1000; 
    
    let layersCount = 1;
    if (product.layer2) layersCount++;
    if (product.layer3) layersCount++;
    
    const adhesiveWeight = (layersCount > 1) 
      ? ((layersCount - 1) * (widthM * 1 * product.adhesiveCoverage) / 1000)
      : 0;

    const totalKgPerMeter = weightPerMeter + inkWeight + adhesiveWeight;
    
    requiredLinearMeters = quantity / totalKgPerMeter;
  }

  // 2. Calcular Merma Detallada (O usar Overrides si existen)
  
  // Arranque
  const startupScrap = scrapOverrides?.startup !== undefined 
      ? scrapOverrides.startup 
      : config.fixedStartupMeters;

  // Reprint
  const defaultReprint = (product.layer1.type === MaterialType.BOPP_DT || product.layer1.type === MaterialType.PET_DT) 
      ? (config.reprintMeters || 0) : 0;
  const reprintScrap = scrapOverrides?.reprint !== undefined 
      ? scrapOverrides.reprint 
      : defaultReprint;

  // Laminación (Combinada 1 y 2)
  const defaultLam1 = product.layer2 ? (config.lamination1Meters || 0) : 0;
  const defaultLam2 = product.layer3 ? (config.lamination2Meters || 0) : 0;
  const laminationScrap = scrapOverrides?.lamination !== undefined
      ? scrapOverrides.lamination
      : (defaultLam1 + defaultLam2);

  // Variable
  const defaultVariable = Math.ceil(requiredLinearMeters * usedVariableScrapPercent);
  const variableScrap = scrapOverrides?.variable !== undefined
      ? scrapOverrides.variable
      : defaultVariable;

  const scrapMeters = startupScrap + reprintScrap + laminationScrap + variableScrap;
  const grossLinearMeters = Math.ceil(requiredLinearMeters + scrapMeters);

  // 3. Calcular Maximo con Tolerancia
  const toleranceMeters = requiredLinearMeters * (tolerancePercent / 100);
  const maxLinearMetersWithTolerance = Math.ceil(grossLinearMeters + toleranceMeters);

  // 4. Explosión de Materiales (Base Gross Meters)
  const layer1Kg = calculateTheoreticalWebWeight(product.webWidth, grossLinearMeters, product.layer1);
  const layer2Kg = product.layer2 ? calculateTheoreticalWebWeight(product.webWidth, grossLinearMeters, product.layer2) : 0;
  const layer3Kg = product.layer3 ? calculateTheoreticalWebWeight(product.webWidth, grossLinearMeters, product.layer3) : 0;

  // 5. Explosión de Materiales (Max Meters with Tolerance)
  const maxLayer1Kg = calculateTheoreticalWebWeight(product.webWidth, maxLinearMetersWithTolerance, product.layer1);
  const maxLayer2Kg = product.layer2 ? calculateTheoreticalWebWeight(product.webWidth, maxLinearMetersWithTolerance, product.layer2) : 0;
  const maxLayer3Kg = product.layer3 ? calculateTheoreticalWebWeight(product.webWidth, maxLinearMetersWithTolerance, product.layer3) : 0;

  // Insumos (Calculados sobre Gross, pero podemos estimar max también)
  const calculateInsums = (meters: number) => {
    const totalAreaM2 = (product.webWidth / 1000) * meters;
    const ink = (totalAreaM2 * product.inkCoverage) / 1000;
    let adhesive = 0;
    if (product.layer2) adhesive += (totalAreaM2 * product.adhesiveCoverage) / 1000;
    if (product.layer3) adhesive += (totalAreaM2 * product.adhesiveCoverage) / 1000;
    return { ink, adhesive };
  };

  const stdInsums = calculateInsums(grossLinearMeters);
  const maxInsums = calculateInsums(maxLinearMetersWithTolerance);

  return {
    requiredLinearMeters: Math.ceil(requiredLinearMeters),
    grossLinearMeters,
    maxLinearMetersWithTolerance,
    scrapMeters,
    scrapBreakdown: {
        startup: startupScrap,
        reprint: reprintScrap,
        lamination: laminationScrap, 
        variable: variableScrap
    },
    
    // Standard Weights
    layer1Kg: Number(layer1Kg.toFixed(2)),
    layer2Kg: Number(layer2Kg.toFixed(2)),
    layer3Kg: Number(layer3Kg.toFixed(2)),
    inkKg: Number(stdInsums.ink.toFixed(2)),
    adhesiveKg: Number(stdInsums.adhesive.toFixed(2)),

    // Max Weights
    maxLayer1Kg: Number(maxLayer1Kg.toFixed(2)),
    maxLayer2Kg: Number(maxLayer2Kg.toFixed(2)),
    maxLayer3Kg: Number(maxLayer3Kg.toFixed(2)),
    maxInkKg: Number(maxInsums.ink.toFixed(2)),
    maxAdhesiveKg: Number(maxInsums.adhesive.toFixed(2)),

    totalWeightKg: Number((layer1Kg + layer2Kg + layer3Kg + stdInsums.ink + stdInsums.adhesive).toFixed(2))
  };
};