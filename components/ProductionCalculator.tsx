
import React, { useState, useMemo, useEffect } from 'react';
import { getClients, getMaterials, getProducts, deductStock, getConfig, saveOrder, getOrders } from '../services/dataService';
import { calculateProductionRequirements, calculateRealMaterialWeight, calculateMetersFromRealWeight, calculateTheoreticalWebWeight } from '../services/calculationService';
import { OrderUnit, CalculationResult, Material, ProductionOrder, MaterialRequirementSnapshot, LayerSpec, MaterialType, ScrapBreakdown } from '../types';
import { Printer, Layers, Droplets, Scissors, AlertTriangle, CheckCircle, ArrowRight, ArrowUpRight, FileCheck, Lightbulb, AlertOctagon, CheckSquare, Search, Gauge, Edit2, X, Scale } from 'lucide-react';

const ProductionCalculator: React.FC = () => {
  // Data State
  const clients = getClients();
  const products = getProducts();
  const materials = getMaterials(); // Inventario Completo

  // Form State
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(0);
  const [tolerance, setTolerance] = useState<number>(10); // Default 10%
  const [useTolerance, setUseTolerance] = useState<boolean>(false); // Checkbox state
  const [orderSuccess, setOrderSuccess] = useState<{success: boolean, code?: string}>({success: false});
  const [unit, setUnit] = useState<OrderUnit>(OrderUnit.UNITS);

  // Manual Scrap Overrides
  const [scrapOverrides, setScrapOverrides] = useState<Partial<ScrapBreakdown> | undefined>(undefined);
  const [isEditingScrap, setIsEditingScrap] = useState(false);
  const [tempScrap, setTempScrap] = useState<ScrapBreakdown>({ startup: 0, reprint: 0, lamination: 0, variable: 0 });

  // Selected Materials for each layer (User choice from recommendations)
  const [selectedMaterials, setSelectedMaterials] = useState<Record<string, string>>({});
  // Substitutes (Filling balance)
  const [selectedSubstitutes, setSelectedSubstitutes] = useState<Record<string, string>>({});

  // Derived State
  const filteredProducts = useMemo(() => 
    products.filter(p => p.clientId === selectedClientId), 
  [selectedClientId, products]);

  const selectedProduct = useMemo(() => 
    products.find(p => p.id === selectedProductId), 
  [selectedProductId, products]);

  // Reset selections when product changes
  useEffect(() => {
    setSelectedMaterials({});
    setSelectedSubstitutes({});
    setUseTolerance(false); // Reset tolerance check
    setScrapOverrides(undefined); // Reset manual overrides
  }, [selectedProductId]);

  // --- SMART RECOMMENDATION ENGINE ---
  interface MaterialRecommendation {
    material: Material;
    isExactThickness: boolean;
    thicknessDiff: number;
    widthDiff: number;
    score: number; // Lower is better
    notes: string[];
  }

  const getRecommendations = (spec: LayerSpec, webWidth: number): MaterialRecommendation[] => {
    const requiredWidth = spec.width || webWidth;
    
    // 1. FILTER: Strict Type, Width >= Required
    const candidates = materials.filter(m => 
        m.type === spec.type && 
        m.width >= requiredWidth &&
        m.currentStockKg > 0
    );

    const recommendations: MaterialRecommendation[] = candidates.map(m => {
        const thicknessDiff = Math.abs(m.thickness - spec.thickness);
        const widthDiff = m.width - requiredWidth;
        const thicknessErrorPercent = thicknessDiff / spec.thickness;
        const isExactThickness = thicknessDiff === 0;
        
        const notes: string[] = [];
        
        // Rules
        if (!isExactThickness) {
            notes.push(`Espesor difiere en ${thicknessDiff}μ`);
            if (thicknessErrorPercent > 0.2) notes.push("¡FUERA DE TOLERANCIA DE ESPESOR!");
        }
        if (widthDiff > 0) {
             notes.push(`+${widthDiff}mm de ancho`);
        }

        // Scoring (Lower is better)
        // Primary: Thickness Exactness (0 or 1000 penalty)
        // Secondary: Width Closeness (add widthDiff)
        // Tertiary: Thickness Closeness if not exact
        let score = 0;
        if (!isExactThickness) score += 1000 + (thicknessDiff * 100);
        score += widthDiff;

        // Filter out Extreme Thickness difference (> 30% usually unusable)
        if (thicknessErrorPercent > 0.3) score += 10000;

        return {
            material: m,
            isExactThickness,
            thicknessDiff,
            widthDiff,
            score,
            notes
        };
    });

    // Sort by Score
    return recommendations.sort((a, b) => a.score - b.score);
  };

  // Pre-select best option if not set
  useEffect(() => {
    if (selectedProduct) {
        const autoSelect = (layerKey: string, spec?: LayerSpec) => {
            if (!spec) return;
            const recs = getRecommendations(spec, selectedProduct.webWidth);
            if (recs.length > 0 && !selectedMaterials[layerKey]) {
                // Auto select the first one (Best Match)
                setSelectedMaterials(prev => ({ ...prev, [layerKey]: recs[0].material.id }));
            }
        };

        autoSelect('layer1', selectedProduct.layer1);
        autoSelect('layer2', selectedProduct.layer2);
        autoSelect('layer3', selectedProduct.layer3);
    }
  }, [selectedProduct, quantity]); // Re-run if product changes


  // Calculation Logic
  let results: CalculationResult | null = null;
  let error: string | null = null;
  
  // Analysis State (Updated to calculate REAL needed Kg based on selection)
  let materialAnalysis = {
    layer1: { stockOk: true, missingKg: 0, requiredRealKg: 0 },
    layer2: { stockOk: true, missingKg: 0, requiredRealKg: 0 },
    layer3: { stockOk: true, missingKg: 0, requiredRealKg: 0 }
  };

  if (selectedProduct && quantity > 0) {
    try {
      // Pass overrides if they exist
      results = calculateProductionRequirements(quantity, tolerance, unit, selectedProduct, materials, scrapOverrides);
      
      const checkStock = (layerKey: string, theoreticalKg: number) => {
          // Determine meters required based on config
          const metersRequired = useTolerance ? results!.maxLinearMetersWithTolerance : results!.grossLinearMeters;
          
          const matId = selectedMaterials[layerKey];
          if (!matId) return { stockOk: false, missingKg: theoreticalKg, requiredRealKg: theoreticalKg };
          
          const mat = materials.find(m => m.id === matId);
          if (!mat) return { stockOk: false, missingKg: theoreticalKg, requiredRealKg: theoreticalKg };
          
          // CRITICAL CHANGE: Calculate weight based on REAL MATERIAL dimensions
          const realKgNeeded = calculateRealMaterialWeight(metersRequired, mat);
          
          if (mat.currentStockKg < realKgNeeded) {
              return { stockOk: false, missingKg: realKgNeeded - mat.currentStockKg, requiredRealKg: realKgNeeded };
          }
          return { stockOk: true, missingKg: 0, requiredRealKg: realKgNeeded };
      }

      materialAnalysis.layer1 = checkStock('layer1', results.layer1Kg);
      if (selectedProduct.layer2) materialAnalysis.layer2 = checkStock('layer2', results.layer2Kg);
      if (selectedProduct.layer3) materialAnalysis.layer3 = checkStock('layer3', results.layer3Kg);

    } catch (err: any) {
      error = err.message;
    }
  }

  const handleOpenScrapModal = () => {
    if (results) {
        setTempScrap({ ...results.scrapBreakdown });
        setIsEditingScrap(true);
    }
  }

  const handleSaveScrap = () => {
      setScrapOverrides(tempScrap);
      setIsEditingScrap(false);
  }

  const handleConfirmOrder = () => {
    if (!results || !selectedProduct) return;
    
    // Check missing selections
    if (!selectedMaterials['layer1']) { alert("Debe seleccionar un material para la Capa 1"); return; }
    if (selectedProduct.layer2 && !selectedMaterials['layer2']) { alert("Debe seleccionar un material para la Capa 2"); return; }
    if (selectedProduct.layer3 && !selectedMaterials['layer3']) { alert("Debe seleccionar un material para la Capa 3"); return; }

    const materialRequirements: MaterialRequirementSnapshot[] = [];
    const materialNames: string[] = [];

    // Helper to process each layer
    const processLayer = (layerKey: string, metersRequired: number, layerLabel: string) => {
        if (metersRequired <= 0) return;
        
        const matId = selectedMaterials[layerKey];
        const mat = materials.find(m => m.id === matId);
        if (!mat) return;

        materialNames.push(mat.name);
        
        // Calculate total Kg needed for this specific material
        const totalRealKg = calculateRealMaterialWeight(metersRequired, mat);

        const subId = selectedSubstitutes[layerKey];
        const subMat = materials.find(m => m.id === subId);

        // Logic: Use all primary, then substitute
        if (mat.currentStockKg < totalRealKg && subMat) {
             // We have a shortage. 
             // 1. How many meters can the primary material provide?
             const metersPossibleWithPrimary = calculateMetersFromRealWeight(mat.currentStockKg, mat);
             const metersForSubstitute = metersRequired - metersPossibleWithPrimary;
             
             // 2. Weights
             const primaryUsedKg = Math.max(0, mat.currentStockKg);
             const substituteUsedKg = calculateRealMaterialWeight(metersForSubstitute, subMat);

             if (primaryUsedKg > 0) {
                deductStock(mat.id, primaryUsedKg);
                materialRequirements.push({
                    layer: layerLabel,
                    materialName: mat.name,
                    internalCode: mat.internalCode,
                    width: mat.width,
                    requiredKg: Number(primaryUsedKg.toFixed(2))
                });
             }

             deductStock(subMat.id, substituteUsedKg);
             materialRequirements.push({
                layer: `${layerLabel} (COMPLEMENTO)`,
                materialName: subMat.name,
                internalCode: subMat.internalCode,
                width: subMat.width,
                requiredKg: Number(substituteUsedKg.toFixed(2)),
                // @ts-ignore
                isSubstitute: true,
                originalMaterialId: mat.id
             });
        } else {
            // Enough stock or no substitute selected (go negative)
            deductStock(mat.id, totalRealKg);
            materialRequirements.push({
                layer: layerLabel,
                materialName: mat.name,
                internalCode: mat.internalCode,
                width: mat.width,
                requiredKg: Number(totalRealKg.toFixed(2))
            });
        }
    };

    // Use Tolerance logic for meters requirement
    const getMeters = () => useTolerance ? results.maxLinearMetersWithTolerance : results.grossLinearMeters;
    const requiredMeters = getMeters();

    processLayer('layer1', requiredMeters, 'Capa 1 (Imp)');
    if (selectedProduct.layer2) processLayer('layer2', requiredMeters, 'Capa 2 (Lam)');
    if (selectedProduct.layer3) processLayer('layer3', requiredMeters, 'Capa 3 (Sell)');

    // Create Order Workflow Stages
    const stages: string[] = ['Impresión']; 
    
    // Add Reimpresión if BOPP DT or PET DT
    if (selectedProduct.layer1.type === MaterialType.BOPP_DT || selectedProduct.layer1.type === MaterialType.PET_DT) {
        stages.push('Reimpresión');
    }

    if (selectedProduct.layer2) stages.push('Laminación');
    if (selectedProduct.layer3) stages.push('Trilaminado');
    stages.push('Refilado'); 
    if (selectedProduct.format === 'BOLSA') stages.push('Confección (Bolsera)');

    const orderCode = `OP-${1000 + getOrders().length + 1}`;
    const newOrder: ProductionOrder = {
      id: `ord-${Date.now()}`,
      orderCode,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      clientId: selectedClientId,
      clientName: clients.find(c => c.id === selectedClientId)?.name || 'Desconocido',
      date: new Date().toISOString().split('T')[0],
      quantityRequested: quantity,
      unit: unit,
      tolerancePercent: tolerance,
      calculationSnapshot: results,
      technicalDetails: {
        format: selectedProduct.format,
        webWidth: selectedProduct.webWidth,
        cylinder: selectedProduct.cylinder,
        cutoff: selectedProduct.cutoff,
        tracks: selectedProduct.tracks,
        layers: materialNames,
        windingDirection: selectedProduct.windingDirection
      },
      materialRequirements: materialRequirements,
      requiredStages: stages,
      status: 'Pendiente',
      currentStage: undefined 
    };

    saveOrder(newOrder);
    setOrderSuccess({ success: true, code: orderCode });
    setTimeout(() => {
      setOrderSuccess({ success: false });
      setQuantity(0);
      setScrapOverrides(undefined);
    }, 4000);
  };

  const LayerSelector = ({ layerKey, spec, theoreticalKg, analysis, metersRequired }: { layerKey: string, spec: LayerSpec, theoreticalKg: number, analysis: any, metersRequired: number }) => {
     if (!selectedProduct) return null;
     const recommendations = getRecommendations(spec, selectedProduct.webWidth);
     const selectedMatId = selectedMaterials[layerKey];
     const selectedMat = materials.find(m => m.id === selectedMatId);

     // Show Real Kg if material selected, else show Theoretical
     const displayKg = selectedMat ? analysis.requiredRealKg : theoreticalKg;
     const isHeavier = selectedMat && analysis.requiredRealKg > theoreticalKg * 1.05; // 5% tolerance

     return (
        <div className="mb-6 bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
             <div className="flex justify-between items-start mb-3">
                 <div>
                     <h4 className="font-bold text-slate-800 uppercase text-sm">
                        {layerKey === 'layer1' ? 'Capa 1 (Impresión)' : layerKey === 'layer2' ? 'Capa 2 (Laminación)' : 'Capa 3 (Sellante)'}
                     </h4>
                     <p className="text-xs text-slate-500">
                        Req: {spec.type} {spec.thickness}μ | Ancho Ideal: {spec.width || selectedProduct.webWidth}mm
                     </p>
                 </div>
                 <div className="text-right">
                     <span className={`text-xl font-bold ${isHeavier ? 'text-amber-600' : 'text-slate-800'}`}>{displayKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} Kg</span>
                     <div className="text-[10px] text-slate-400 font-medium">
                        {selectedMat ? '(Cálculo Real)' : '(Estimado Teórico)'}
                     </div>
                 </div>
             </div>

             {/* RECOMMENDATION LIST */}
             <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                 {recommendations.length === 0 && <p className="text-xs text-red-500 italic">No hay inventario compatible para este tipo.</p>}
                 {recommendations.map((rec, idx) => {
                     // Calculate specific consumption for this recommendation option
                     const specificConsumptionKg = calculateRealMaterialWeight(metersRequired, rec.material);
                     const isSelected = selectedMatId === rec.material.id;

                     return (
                         <div 
                            key={rec.material.id}
                            onClick={() => setSelectedMaterials(prev => ({ ...prev, [layerKey]: rec.material.id }))}
                            className={`p-2 rounded border cursor-pointer transition-all flex justify-between items-center
                                ${isSelected
                                    ? 'bg-brand-50 border-brand-500 ring-1 ring-brand-500' 
                                    : 'bg-slate-50 border-slate-200 hover:border-brand-300'}`}
                         >
                            <div className="flex-1">
                                <div className="font-bold text-sm text-slate-800 flex items-center">
                                    {idx === 0 && <Lightbulb size={12} className="text-amber-500 mr-1" />}
                                    {rec.material.name} 
                                    <span className="ml-2 font-mono text-xs text-slate-500">[{rec.material.internalCode}]</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-1">
                                    {/* Tech Specs */}
                                    <div className="text-xs text-slate-600 space-x-2 flex items-center">
                                        <span className="bg-slate-200 px-1 rounded">{rec.material.width}mm</span>
                                        <span className="bg-slate-200 px-1 rounded">{rec.material.thickness}μ</span>
                                    </div>
                                    
                                    {/* Consumption & Stock */}
                                    <div className="text-xs text-right">
                                        <div className="flex items-center justify-end font-bold text-slate-700">
                                            <Scale size={10} className="mr-1"/> 
                                            Consumo: {specificConsumptionKg.toFixed(1)} Kg
                                        </div>
                                        <div className={rec.material.currentStockKg < specificConsumptionKg ? "text-red-500 font-bold" : "text-emerald-600 font-bold"}>
                                            Stock: {rec.material.currentStockKg} Kg
                                        </div>
                                    </div>
                                </div>
                                
                                {rec.notes.length > 0 && (
                                    <div className="text-[10px] text-amber-600 font-bold mt-1 border-t border-slate-200 pt-1">
                                        {rec.notes.join(' | ')}
                                    </div>
                                )}
                            </div>
                            {isSelected && <CheckCircle size={18} className="text-brand-600 ml-2"/>}
                         </div>
                     );
                 })}
             </div>

             {/* STOCK ISSUE HANDLER */}
             {selectedMat && !analysis.stockOk && (
                 <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs">
                     <p className="font-bold text-red-700 flex items-center mb-2">
                        <AlertOctagon size={14} className="mr-1"/> Falta Stock: {analysis.missingKg.toLocaleString()} Kg
                     </p>
                     <p className="mb-2">Seleccione una bobina adicional para completar:</p>
                     <select 
                        className="w-full border p-1 rounded"
                        onChange={(e) => setSelectedSubstitutes(prev => ({ ...prev, [layerKey]: e.target.value }))}
                        value={selectedSubstitutes[layerKey] || ''}
                     >
                         <option value="">-- Seleccionar Sustituto --</option>
                         {recommendations.filter(r => r.material.id !== selectedMatId).map(r => (
                             <option key={r.material.id} value={r.material.id}>
                                 {r.material.name} ({r.material.width}mm) - Stock: {r.material.currentStockKg}
                             </option>
                         ))}
                     </select>
                 </div>
             )}
        </div>
     );
  };

  if (orderSuccess.success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-12 text-center animate-fade-in">
        <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <FileCheck size={40} className="text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-green-800 mb-2">¡Orden {orderSuccess.code} Generada!</h2>
        <p className="text-green-700 mb-4">Se ha creado la hoja de ruta, guardado el historial y descontado el material.</p>
        <button onClick={() => setOrderSuccess({ success: false })} className="mt-6 text-green-800 underline font-bold">Volver a calcular</button>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in relative">
      
      {/* EDIT SCRAP MODAL */}
      {isEditingScrap && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm border border-slate-200 animate-scale-in">
                  <div className="flex justify-between items-center mb-4 border-b pb-2">
                      <h3 className="font-bold text-slate-800 flex items-center">
                          <Scissors size={18} className="mr-2 text-brand-600"/> Ajuste Manual de Mermas
                      </h3>
                      <button onClick={() => setIsEditingScrap(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                  </div>
                  <div className="space-y-4">
                      <div>
                          <label className="text-xs font-bold uppercase text-slate-500">Ajuste Impresión (m)</label>
                          <input type="number" className="w-full border p-2 rounded focus:ring-2 focus:ring-brand-500 outline-none font-bold text-slate-800"
                              value={tempScrap.startup} onChange={e => setTempScrap({...tempScrap, startup: Number(e.target.value)})} />
                      </div>
                      <div>
                          <label className="text-xs font-bold uppercase text-slate-500">Reimpresión (m)</label>
                          <input type="number" className="w-full border p-2 rounded focus:ring-2 focus:ring-purple-500 outline-none font-bold text-slate-800"
                              value={tempScrap.reprint} onChange={e => setTempScrap({...tempScrap, reprint: Number(e.target.value)})} />
                      </div>
                      <div>
                          <label className="text-xs font-bold uppercase text-slate-500">Laminación (m)</label>
                          <input type="number" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-800"
                              value={tempScrap.lamination} onChange={e => setTempScrap({...tempScrap, lamination: Number(e.target.value)})} />
                      </div>
                      <div>
                          <label className="text-xs font-bold uppercase text-slate-500">Variable (m)</label>
                          <input type="number" className="w-full border p-2 rounded focus:ring-2 focus:ring-amber-500 outline-none font-bold text-slate-800"
                              value={tempScrap.variable} onChange={e => setTempScrap({...tempScrap, variable: Number(e.target.value)})} />
                      </div>
                  </div>
                  <button onClick={handleSaveScrap} className="w-full mt-6 bg-brand-600 text-white py-2 rounded-lg font-bold hover:bg-brand-700">
                      Aplicar Cambios
                  </button>
              </div>
          </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
          <Printer className="mr-2 text-brand-600" />
          Calculadora de Producción
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Cliente</label>
            <select 
              className="w-full rounded-lg border-slate-300 border p-2.5 focus:ring-2 focus:ring-brand-500 focus:outline-none"
              value={selectedClientId}
              onChange={(e) => { setSelectedClientId(e.target.value); setSelectedProductId(''); }}
            >
              <option value="">Seleccionar...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-600 mb-1">Producto (SKU)</label>
            <select 
              className="w-full rounded-lg border-slate-300 border p-2.5 focus:ring-2 focus:ring-brand-500 focus:outline-none"
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              disabled={!selectedClientId}
            >
              <option value="">Seleccionar Ficha...</option>
              {filteredProducts.map(p => <option key={p.id} value={p.id}>{p.sku} - {p.name} ({p.format})</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Cantidad Pedida</label>
            <div className="flex">
               <input 
                type="number"
                className="w-full rounded-l-lg border-slate-300 border-y border-l p-2.5 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                value={quantity || ''}
                onChange={(e) => setQuantity(Number(e.target.value))}
                placeholder="0"
              />
               <select 
                className="bg-slate-100 rounded-r-lg border-slate-300 border p-2.5 focus:outline-none text-sm"
                value={unit}
                onChange={(e) => setUnit(e.target.value as OrderUnit)}
              >
                <option value={OrderUnit.UNITS}>Ud.</option>
                <option value={OrderUnit.KILOS}>Kg</option>
                <option value={OrderUnit.METERS}>m</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Tolerancia (+)</label>
             <div className="relative">
                <input 
                  type="number"
                  className="w-full rounded-lg border-slate-300 border p-2.5 focus:ring-2 focus:ring-brand-500 focus:outline-none pr-8"
                  value={tolerance}
                  onChange={(e) => setTolerance(Number(e.target.value))}
                />
                <span className="absolute right-3 top-2.5 text-slate-400 font-bold">%</span>
             </div>
          </div>
        </div>

        {error && <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center text-sm font-medium"><AlertTriangle className="mr-2" size={18} /> {error}</div>}
      </div>

      {results && selectedProduct && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* LEFT: RESULTS SUMMARY */}
          <div className="md:col-span-1 space-y-6">
            <div className="bg-slate-900 text-white rounded-xl shadow-lg p-6">
              <h3 className="text-sm font-bold uppercase text-slate-400 mb-4 flex items-center"><Gauge size={16} className="mr-2"/> Metros a Producir (Bruto)</h3>
              <div className="text-4xl font-bold mb-2 text-brand-400">{results.grossLinearMeters.toLocaleString()} m</div>
              
              {/* SCRAP BREAKDOWN VISUALIZATION - INTERACTIVE */}
              <div 
                className="mb-4 group cursor-pointer p-2 rounded-lg hover:bg-slate-800 transition-all hover:scale-[1.02] border border-transparent hover:border-slate-600 relative"
                onClick={handleOpenScrapModal}
                title="Click para editar metros de merma manualmente"
              >
                 <div className="absolute top-2 right-2 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                     <Edit2 size={14} />
                 </div>

                 <div className="flex h-2 rounded-full overflow-hidden mb-2 bg-slate-700">
                    {/* Startup: Gray */}
                    <div style={{ width: `${(results.scrapBreakdown.startup / results.grossLinearMeters) * 100}%` }} className="bg-slate-400" title="Ajuste Impresión"></div>
                    {/* Reprint: Purple */}
                    <div style={{ width: `${(results.scrapBreakdown.reprint / results.grossLinearMeters) * 100}%` }} className="bg-purple-500" title="Reprint"></div>
                    {/* Lamination: Blue */}
                    <div style={{ width: `${(results.scrapBreakdown.lamination / results.grossLinearMeters) * 100}%` }} className="bg-blue-500" title="Laminación"></div>
                    {/* Variable: Amber */}
                    <div style={{ width: `${(results.scrapBreakdown.variable / results.grossLinearMeters) * 100}%` }} className="bg-amber-500" title="Variable"></div>
                    {/* Net: Green (Remaining) */}
                    <div className="flex-1 bg-emerald-500 opacity-20"></div>
                 </div>
                 
                 <div className="text-[10px] text-slate-300 grid grid-cols-2 gap-x-2 gap-y-1 group-hover:text-white">
                    <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-slate-400 mr-1.5"></div> Ajuste Imp: {results.scrapBreakdown.startup}m</div>
                    {results.scrapBreakdown.reprint > 0 && <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-purple-500 mr-1.5"></div> Reprint: {results.scrapBreakdown.reprint}m</div>}
                    {results.scrapBreakdown.lamination > 0 && <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-blue-500 mr-1.5"></div> Laminación: {results.scrapBreakdown.lamination}m</div>}
                    <div className="flex items-center"><div className="w-2 h-2 rounded-full bg-amber-500 mr-1.5"></div> Variable: {results.scrapBreakdown.variable}m</div>
                 </div>
                 <div className="text-right text-xs font-bold text-slate-400 mt-2 border-t border-slate-700 pt-1 group-hover:text-brand-300">
                    Total Merma: {results.scrapMeters}m {scrapOverrides && "(Manual)"}
                 </div>
              </div>

              <div className="border-t border-slate-700 pt-4 space-y-3">
                 <div className="flex items-center justify-between">
                    <div>
                        <span className="block text-xs text-slate-500 uppercase">Máximo (+{tolerance}%)</span>
                        <span className="block text-lg font-bold">{results.maxLinearMetersWithTolerance.toLocaleString()} m</span>
                    </div>
                    {/* TOLERANCE CHECKBOX */}
                    <div className="flex items-center bg-slate-800 p-2 rounded border border-slate-600">
                        <input 
                            type="checkbox" 
                            id="useTolerance"
                            checked={useTolerance}
                            onChange={(e) => setUseTolerance(e.target.checked)}
                            className="w-4 h-4 text-brand-600 rounded bg-slate-700 border-slate-500 focus:ring-brand-500"
                        />
                        <label htmlFor="useTolerance" className="ml-2 text-xs font-bold text-slate-300 cursor-pointer select-none">
                            Usar Máx.
                        </label>
                    </div>
                 </div>
                 
                 <div className="bg-slate-800/50 p-2 rounded">
                    <span className="block text-xs text-slate-500 uppercase">Pedido Neto</span>
                    <span className="block text-md font-bold text-emerald-400">{results.requiredLinearMeters.toLocaleString()} m</span>
                 </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center uppercase text-sm">
                  <Droplets size={16} className="mr-2"/> Insumos Estimados {useTolerance && "(Max)"}
              </h3>
              <div className="space-y-3">
                 <div className="flex justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-600">Tintas Total</span>
                    <span className="font-bold text-slate-800">{useTolerance ? results.maxInkKg : results.inkKg} Kg</span>
                 </div>
                 <div className="flex justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-600">Adhesivos</span>
                    <span className="font-bold text-slate-800">{useTolerance ? results.maxAdhesiveKg : results.adhesiveKg} Kg</span>
                 </div>
                 <div className="flex justify-between pt-2">
                    <span className="text-brand-600 font-bold">Peso Total Orden</span>
                    <span className="font-bold text-xl text-brand-700">
                        {(
                            (materialAnalysis.layer1.requiredRealKg || results.layer1Kg) +
                            (selectedProduct.layer2 ? (materialAnalysis.layer2.requiredRealKg || results.layer2Kg) : 0) +
                            (selectedProduct.layer3 ? (materialAnalysis.layer3.requiredRealKg || results.layer3Kg) : 0) +
                            (useTolerance ? results.maxInkKg : results.inkKg) +
                            (useTolerance ? results.maxAdhesiveKg : results.adhesiveKg)
                        ).toLocaleString()} Kg
                    </span>
                 </div>
              </div>
            </div>

            <button 
              onClick={handleConfirmOrder}
              disabled={
                  !selectedMaterials['layer1'] || 
                  (!!selectedProduct.layer2 && !selectedMaterials['layer2']) || 
                  (!!selectedProduct.layer3 && !selectedMaterials['layer3'])
              }
              className="w-full py-4 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg shadow-lg transition-all flex justify-center items-center"
            >
              <CheckSquare size={24} className="mr-2" /> Confirmar Producción
            </button>
          </div>

          {/* RIGHT: MATERIAL ALLOCATION */}
          <div className="md:col-span-2">
             <div className="bg-slate-100 rounded-xl p-6 h-full">
                 <h3 className="font-bold text-slate-700 mb-4 flex items-center uppercase text-sm">
                    <Layers size={16} className="mr-2"/> Asignación de Materiales
                 </h3>
                 <p className="text-xs text-slate-500 mb-6">
                    Seleccione la bobina exacta del inventario para cada capa.
                    <br/>
                    <span className="text-brand-600 font-bold">Nota:</span> Se muestran solo materiales compatibles (Mismo Tipo, Ancho {'>='} {selectedProduct.webWidth}mm).
                 </p>

                 <LayerSelector 
                    layerKey="layer1" 
                    spec={selectedProduct.layer1} 
                    theoreticalKg={useTolerance ? results.maxLayer1Kg : results.layer1Kg}
                    analysis={materialAnalysis.layer1}
                    metersRequired={useTolerance ? results.maxLinearMetersWithTolerance : results.grossLinearMeters}
                 />

                 {selectedProduct.layer2 && (
                    <LayerSelector 
                        layerKey="layer2" 
                        spec={selectedProduct.layer2} 
                        theoreticalKg={useTolerance ? results.maxLayer2Kg : results.layer2Kg}
                        analysis={materialAnalysis.layer2}
                        metersRequired={useTolerance ? results.maxLinearMetersWithTolerance : results.grossLinearMeters}
                    />
                 )}

                {selectedProduct.layer3 && (
                    <LayerSelector 
                        layerKey="layer3" 
                        spec={selectedProduct.layer3} 
                        theoreticalKg={useTolerance ? results.maxLayer3Kg : results.layer3Kg}
                        analysis={materialAnalysis.layer3}
                        metersRequired={useTolerance ? results.maxLinearMetersWithTolerance : results.grossLinearMeters}
                    />
                 )}
             </div>
          </div>

        </div>
      )}
    </div>
  );
};

export default ProductionCalculator;
