
import React, { useState, useEffect } from 'react';
import { getMaterials, getClients, saveProduct, getProducts, deleteProduct } from '../services/dataService';
import { ProductRecipe, MaterialType, LayerSpec } from '../types';
import { Plus, Save, Box, Circle, List, Edit, Trash2, Search, Layers, Ruler, AlertTriangle } from 'lucide-react';

const ProductManager: React.FC = () => {
  const materials = getMaterials();
  const clients = getClients();
  
  // View State: 'list' or 'form'
  const [view, setView] = useState<'list' | 'form'>('list');
  const [products, setProducts] = useState<ProductRecipe[]>(getProducts());
  const [searchTerm, setSearchTerm] = useState('');

  const DEFAULT_LAYER: LayerSpec = { type: MaterialType.BOPP, thickness: 20, width: 0 };

  const DEFAULT_PRODUCT: Partial<ProductRecipe> = {
    format: 'BOBINA',
    tracks: 1,
    inkCoverage: 3.0,
    adhesiveCoverage: 1.8,
    specificScrapPercent: 0.05,
    windingDirection: 'A1',
    layer1: { ...DEFAULT_LAYER },
  };

  const [newProduct, setNewProduct] = useState<Partial<ProductRecipe>>(DEFAULT_PRODUCT);
  const [saved, setSaved] = useState(false);

  // Refresh list
  useEffect(() => {
    setProducts(getProducts());
  }, [view]);

  const handleEdit = (product: ProductRecipe) => {
    setNewProduct(product);
    setView('form');
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Estás seguro de eliminar esta ficha técnica? Se borrará del historial.')) {
      deleteProduct(id);
      setProducts(getProducts());
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newProduct.name && newProduct.clientId && newProduct.layer1) {
      const product: ProductRecipe = {
        ...newProduct as ProductRecipe,
        id: newProduct.id || `p${Date.now()}`,
      };
      saveProduct(product);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setView('list'); // Return to list after save
      }, 1500);
    }
  };

  const handleChange = (field: keyof ProductRecipe, value: any) => {
    setNewProduct(prev => ({ ...prev, [field]: value }));
  };

  const handleLayerChange = (layerKey: 'layer1' | 'layer2' | 'layer3', field: keyof LayerSpec, value: any) => {
      setNewProduct(prev => {
          const currentLayer = prev[layerKey] || { ...DEFAULT_LAYER };
          
          // If clearing a layer (e.g. layer2/3), we might handle it differently, 
          // but here we just update the properties.
          
          return {
              ...prev,
              [layerKey]: { ...currentLayer, [field]: value }
          };
      });
  };

  const toggleLayer = (layerKey: 'layer2' | 'layer3', enabled: boolean) => {
      setNewProduct(prev => {
          if (enabled) {
              return { ...prev, [layerKey]: { ...DEFAULT_LAYER } };
          } else {
              const copy = { ...prev };
              delete copy[layerKey];
              return copy;
          }
      });
  };

  const toggleView = () => {
    if (view === 'list') {
      setNewProduct(DEFAULT_PRODUCT); // Reset for new
      setView('form');
    } else {
      setView('list');
    }
  };

  // --- WINDING OPTIONS GENERATOR (A1-G6) ---
  const windingOptions = [
      ...['A','B','C','D','E','F','G'].flatMap(char => [1,2,3,4,5,6].map(num => `${char}${num}`))
  ];

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* HEADER & TOGGLE */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            {view === 'list' ? 'Fichas Técnicas' : (newProduct.id ? 'Editar Ficha' : 'Nueva Ficha Técnica')}
          </h2>
          <p className="text-sm text-slate-500">
            {view === 'list' ? 'Gestiona las recetas de producción' : 'Define estructura ideal y parámetros'}
          </p>
        </div>
        <button 
          onClick={toggleView}
          className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center transition-colors ${
             view === 'list' 
             ? 'bg-brand-600 text-white hover:bg-brand-700 shadow-md' 
             : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {view === 'list' ? <><Plus size={18} className="mr-2" /> Nueva Ficha</> : <><List size={18} className="mr-2" /> Ver Listado</>}
        </button>
      </div>

      {/* --- LIST VIEW --- */}
      {view === 'list' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
           {/* Search Bar */}
           <div className="p-4 border-b border-slate-100">
             <div className="relative max-w-md">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Buscar por nombre o SKU..." 
                  className="pl-10 pr-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
             </div>
           </div>

           <table className="w-full text-left text-sm">
             <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase">
               <tr>
                 <th className="px-6 py-3 font-semibold">SKU / Producto</th>
                 <th className="px-6 py-3 font-semibold">Cliente</th>
                 <th className="px-6 py-3 font-semibold">Estructura</th>
                 <th className="px-6 py-3 font-semibold">Dimensiones</th>
                 <th className="px-6 py-3 font-semibold text-right">Acciones</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100">
               {filteredProducts.length === 0 && (
                 <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400">No hay productos registrados.</td></tr>
               )}
               {filteredProducts.map(p => {
                 const clientName = clients.find(c => c.id === p.clientId)?.name || 'N/A';
                 return (
                   <tr key={p.id} className="hover:bg-slate-50 transition-colors group">
                     <td className="px-6 py-4">
                        <div className="font-bold text-slate-800">{p.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{p.sku}</div>
                     </td>
                     <td className="px-6 py-4 text-slate-600">{clientName}</td>
                     <td className="px-6 py-4">
                        <div className="text-xs space-y-1">
                            {/* PROTECCIÓN CONTRA DATOS ANTIGUOS: Si layer1 no existe, muestra N/A */}
                            <div className="font-bold text-brand-700">{p.layer1?.type || 'N/A'} {p.layer1?.thickness || 0}μ</div>
                            {p.layer2 && <div className="text-slate-600">+ {p.layer2.type} {p.layer2.thickness}μ</div>}
                            {p.layer3 && <div className="text-slate-600">+ {p.layer3.type} {p.layer3.thickness}μ</div>}
                        </div>
                     </td>
                     <td className="px-6 py-4 text-slate-600 text-xs space-y-1">
                        <div className="flex items-center"><Ruler size={12} className="mr-1"/> Ancho Imp: {p.webWidth}mm</div>
                        <div className="flex items-center"><Layers size={12} className="mr-1"/> Pistas: {p.tracks}</div>
                        <div className="flex items-center"><Box size={12} className="mr-1"/> Paso: {p.cutoff}mm</div>
                     </td>
                     <td className="px-6 py-4 text-right space-x-2 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEdit(p)} className="text-brand-600 hover:bg-brand-50 p-1.5 rounded tooltip" title="Editar">
                          <Edit size={18} />
                        </button>
                        <button onClick={() => handleDelete(p.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded tooltip" title="Eliminar">
                          <Trash2 size={18} />
                        </button>
                     </td>
                   </tr>
                 );
               })}
             </tbody>
           </table>
        </div>
      )}

      {/* --- FORM VIEW --- */}
      {view === 'form' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 max-w-5xl mx-auto p-8 animate-fade-in">
          <form onSubmit={handleSubmit} className="space-y-8">
            
            {/* General Info */}
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">1. Información Comercial</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="label-text">Cliente</label>
                  <select 
                    className="input-field"
                    required
                    value={newProduct.clientId}
                    onChange={(e) => handleChange('clientId', e.target.value)}
                  >
                    <option value="">Seleccionar...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-text">SKU / Código</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="Ej. BOL-500G" 
                    value={newProduct.sku || ''}
                    onChange={(e) => handleChange('sku', e.target.value)} 
                  />
                </div>
                <div>
                  <label className="label-text">Nombre del Producto</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="Ej. Bolsa Arroz 500g Premium" 
                    required 
                    value={newProduct.name || ''}
                    onChange={(e) => handleChange('name', e.target.value)} 
                  />
                </div>
              </div>
            </section>

            {/* Format Selection */}
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">2. Formato y Dimensiones</h3>
              
              <div className="flex space-x-4 mb-6">
                <button
                  type="button"
                  onClick={() => handleChange('format', 'BOBINA')}
                  className={`flex items-center px-6 py-3 rounded-lg border-2 transition-all ${
                    newProduct.format === 'BOBINA' 
                      ? 'border-brand-500 bg-brand-50 text-brand-700' 
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <Circle className="mr-2" size={20} /> Bobina (Reel)
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('format', 'BOLSA')}
                  className={`flex items-center px-6 py-3 rounded-lg border-2 transition-all ${
                    newProduct.format === 'BOLSA' 
                      ? 'border-brand-500 bg-brand-50 text-brand-700' 
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <Box className="mr-2" size={20} /> Bolsa (Bag)
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-slate-50 p-6 rounded-lg border border-slate-200">
                
                {/* CAMPOS ESPECÍFICOS BOBINA */}
                {newProduct.format === 'BOBINA' && (
                  <>
                    <div>
                      <label className="label-text text-brand-600">Ancho Final Bobina (mm)</label>
                      <input type="number" className="input-field" required value={newProduct.finalReelWidth || ''} onChange={(e) => handleChange('finalReelWidth', Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="label-text text-brand-600">Paso / Cutoff (mm)</label>
                      <input type="number" className="input-field" required value={newProduct.cutoff || ''} onChange={(e) => handleChange('cutoff', Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="label-text">Sentido Bobinado</label>
                      <select className="input-field" value={newProduct.windingDirection} onChange={(e) => handleChange('windingDirection', e.target.value)}>
                        {windingOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </>
                )}

                {/* CAMPOS ESPECÍFICOS BOLSA */}
                {newProduct.format === 'BOLSA' && (
                  <>
                     <div>
                      <label className="label-text text-brand-600">Ancho Bolsa / Paso (mm)</label>
                      <input type="number" className="input-field" required value={newProduct.bagWidth || ''} onChange={(e) => {
                        handleChange('bagWidth', Number(e.target.value));
                        handleChange('cutoff', Number(e.target.value)); // El Ancho es el Paso de cálculo
                      }} />
                    </div>
                    <div>
                      <label className="label-text text-slate-600">Alto / Largo (mm)</label>
                      <input type="number" className="input-field" required value={newProduct.bagHeight || ''} onChange={(e) => {
                        handleChange('bagHeight', Number(e.target.value));
                      }} />
                    </div>
                    <div>
                      <label className="label-text">Fuelle (mm)</label>
                      <input type="number" className="input-field" placeholder="0" value={newProduct.gusset || ''} onChange={(e) => handleChange('gusset', Number(e.target.value))} />
                    </div>
                  </>
                )}

                {/* CAMPOS COMUNES */}
                <div className="border-l border-slate-300 pl-6 md:col-span-1 col-span-2">
                   <label className="label-text text-slate-900 font-bold">Ingeniería</label>
                   <div className="space-y-3 mt-2">
                     <div>
                        <label className="text-xs text-slate-500">Pistas (Montaje)</label>
                        <input type="number" className="input-field py-1" min="1" required value={newProduct.tracks || 1} onChange={(e) => handleChange('tracks', Number(e.target.value))} />
                     </div>
                     <div>
                        <label className="text-xs text-slate-500">Desarrollo Cilindro (mm)</label>
                        <input type="number" className="input-field py-1" required value={newProduct.cylinder || ''} onChange={(e) => handleChange('cylinder', Number(e.target.value))} />
                     </div>
                     <div>
                        <label className="text-xs text-brand-600 font-bold">Ancho Impreso (mm)</label>
                        <input type="number" className="input-field py-1 border-brand-300 bg-white" required value={newProduct.webWidth || ''} onChange={(e) => handleChange('webWidth', Number(e.target.value))} />
                     </div>
                   </div>
                </div>
              </div>
            </section>

            {/* Structure Layers */}
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">3. Estructura y Receta Ideal</h3>
              <p className="text-xs text-slate-500 mb-4">Define el material ideal. La calculadora buscará el stock que mejor se ajuste.</p>
              
              <div className="space-y-6 p-6 bg-slate-50 rounded-xl border border-slate-200">
                
                {/* Capa 1 */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                  <div className="md:col-span-1">
                     <label className="label-text text-brand-700 font-bold">Capa 1 (Impresión)</label>
                     <select 
                        className="input-field font-bold"
                        value={newProduct.layer1?.type || MaterialType.BOPP}
                        onChange={(e) => handleLayerChange('layer1', 'type', e.target.value)}
                     >
                        {Object.values(MaterialType).map(t => <option key={t} value={t}>{t}</option>)}
                     </select>
                  </div>
                  <div>
                    <label className="label-text">Espesor (μm)</label>
                    <input type="number" className="input-field" placeholder="20" required value={newProduct.layer1?.thickness || ''} onChange={(e) => handleLayerChange('layer1', 'thickness', Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="label-text">Ancho Ideal (mm)</label>
                    <input 
                      type="number" 
                      className="input-field" 
                      placeholder={((newProduct.webWidth || 0) + 20).toString()} 
                      value={newProduct.layer1?.width || ''} 
                      onChange={(e) => handleLayerChange('layer1', 'width', Number(e.target.value))} 
                    />
                    <span className="text-[10px] text-slate-400">Vacío = Ancho Impreso + 20mm</span>
                  </div>
                  <div>
                    <label className="label-text">Tinta (g/m²)</label>
                    <input type="number" step="0.1" className="input-field" value={newProduct.inkCoverage} onChange={(e) => handleChange('inkCoverage', Number(e.target.value))} />
                  </div>
                  
                  {/* VALIDACIÓN DE ANCHO */}
                  {newProduct.webWidth && newProduct.layer1?.width && newProduct.layer1.width < newProduct.webWidth && (
                      <div className="md:col-span-4 bg-red-50 text-red-700 p-2 rounded text-xs flex items-center">
                          <AlertTriangle size={14} className="mr-2"/>
                          El ancho del material ({newProduct.layer1.width}mm) es MENOR al ancho impreso ({newProduct.webWidth}mm).
                      </div>
                  )}
                </div>

                {/* Capa 2 */}
                <div className="relative border-t border-slate-200 pt-4 mt-2">
                  <div className="flex items-center mb-2">
                    <input 
                        type="checkbox" 
                        id="hasLayer2"
                        className="mr-2"
                        checked={!!newProduct.layer2}
                        onChange={(e) => toggleLayer('layer2', e.target.checked)}
                    />
                    <label htmlFor="hasLayer2" className="text-sm font-bold text-slate-700 select-none cursor-pointer">Capa 2 (Laminación)</label>
                  </div>
                  
                  {newProduct.layer2 && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start animate-fade-in">
                        <div className="md:col-span-1">
                            <select 
                                className="input-field"
                                value={newProduct.layer2.type}
                                onChange={(e) => handleLayerChange('layer2', 'type', e.target.value)}
                            >
                                {Object.values(MaterialType).map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label-text">Espesor (μm)</label>
                            <input type="number" className="input-field" required value={newProduct.layer2.thickness} onChange={(e) => handleLayerChange('layer2', 'thickness', Number(e.target.value))} />
                        </div>
                        <div>
                            <label className="label-text">Ancho Ideal (mm)</label>
                            <input 
                              type="number" 
                              className="input-field" 
                              placeholder={((newProduct.webWidth || 0) + 20).toString()} 
                              value={newProduct.layer2.width || ''} 
                              onChange={(e) => handleLayerChange('layer2', 'width', Number(e.target.value))} 
                            />
                            <span className="text-[10px] text-slate-400">Vacío = Ancho Impreso + 20mm</span>
                        </div>
                        <div>
                            <label className="label-text">Adhesivo (g/m²)</label>
                            <input type="number" step="0.1" className="input-field" value={newProduct.adhesiveCoverage} onChange={(e) => handleChange('adhesiveCoverage', Number(e.target.value))} />
                        </div>

                         {/* VALIDACIÓN DE ANCHO */}
                        {newProduct.webWidth && newProduct.layer2.width && newProduct.layer2.width < newProduct.webWidth && (
                            <div className="md:col-span-4 bg-red-50 text-red-700 p-2 rounded text-xs flex items-center">
                                <AlertTriangle size={14} className="mr-2"/>
                                El ancho del material ({newProduct.layer2.width}mm) es MENOR al ancho impreso ({newProduct.webWidth}mm).
                            </div>
                        )}
                    </div>
                  )}
                </div>

                {/* Capa 3 */}
                <div className="relative border-t border-slate-200 pt-4 mt-2">
                  <div className="flex items-center mb-2">
                    <input 
                        type="checkbox" 
                        id="hasLayer3"
                        className="mr-2"
                        checked={!!newProduct.layer3}
                        onChange={(e) => toggleLayer('layer3', e.target.checked)}
                    />
                    <label htmlFor="hasLayer3" className="text-sm font-bold text-slate-700 select-none cursor-pointer">Capa 3 (Trilaminado)</label>
                  </div>
                  
                  {newProduct.layer3 && (
                     <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start animate-fade-in">
                        <div className="md:col-span-1">
                            <select 
                                className="input-field"
                                value={newProduct.layer3.type}
                                onChange={(e) => handleLayerChange('layer3', 'type', e.target.value)}
                            >
                                {Object.values(MaterialType).map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label-text">Espesor (μm)</label>
                            <input type="number" className="input-field" required value={newProduct.layer3.thickness} onChange={(e) => handleLayerChange('layer3', 'thickness', Number(e.target.value))} />
                        </div>
                        <div>
                            <label className="label-text">Ancho Ideal (mm)</label>
                            <input 
                              type="number" 
                              className="input-field" 
                              placeholder={((newProduct.webWidth || 0) + 20).toString()} 
                              value={newProduct.layer3.width || ''} 
                              onChange={(e) => handleLayerChange('layer3', 'width', Number(e.target.value))} 
                            />
                            <span className="text-[10px] text-slate-400">Vacío = Ancho Impreso + 20mm</span>
                        </div>
                         {/* VALIDACIÓN DE ANCHO */}
                        {newProduct.webWidth && newProduct.layer3.width && newProduct.layer3.width < newProduct.webWidth && (
                            <div className="md:col-span-4 bg-red-50 text-red-700 p-2 rounded text-xs flex items-center">
                                <AlertTriangle size={14} className="mr-2"/>
                                El ancho del material ({newProduct.layer3.width}mm) es MENOR al ancho impreso ({newProduct.webWidth}mm).
                            </div>
                        )}
                    </div>
                  )}
                </div>

              </div>
            </section>

            <div className="pt-6 flex justify-end space-x-3">
              <button 
                type="button" 
                onClick={() => setView('list')}
                className="px-6 py-3 rounded-lg font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                className="flex items-center bg-brand-600 hover:bg-brand-700 text-white px-8 py-3 rounded-lg font-bold shadow-lg transition-all hover:scale-105"
              >
                <Save className="mr-2" /> Guardar Ficha Técnica
              </button>
            </div>

            {saved && (
              <div className="p-4 bg-green-50 text-green-700 rounded-lg text-center font-medium border border-green-200 animate-bounce">
                ¡Ficha técnica guardada exitosamente!
              </div>
            )}
          </form>
        </div>
      )}

      <style>{`
        .label-text { display: block; font-size: 0.875rem; font-weight: 500; color: #475569; margin-bottom: 0.25rem; }
        .input-field { width: 100%; border-radius: 0.5rem; border: 1px solid #cbd5e1; padding: 0.625rem; outline: none; transition: border-color 0.2s; }
        .input-field:focus { border-color: #0ea5e9; ring: 2px; ring-color: #0ea5e9; }
      `}</style>
    </div>
  );
};

export default ProductManager;
