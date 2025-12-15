

import React, { useState, useEffect } from 'react';
import { Material, MaterialType, DEFAULT_MATERIAL_DENSITIES, Supplier } from '../types';
import { getMaterials, saveMaterial, deleteMaterial, getSuppliers, getConfig } from '../services/dataService';
import { Plus, Trash2, Save, Package, Search, Factory, X } from 'lucide-react';

const MaterialManager: React.FC = () => {
  const [materials, setMaterials] = useState<Material[]>(getMaterials());
  const [suppliers, setSuppliers] = useState<Supplier[]>(getSuppliers());
  const [isEditing, setIsEditing] = useState(false);
  const [currentMaterial, setCurrentMaterial] = useState<Partial<Material>>({});
  const [searchTerm, setSearchTerm] = useState('');

  // Refresh both materials and suppliers list
  const refresh = () => {
      setMaterials(getMaterials());
      setSuppliers(getSuppliers());
  }

  // Update suppliers when entering edit mode to ensure list is fresh
  useEffect(() => {
      if (isEditing) setSuppliers(getSuppliers());
  }, [isEditing]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentMaterial.name && currentMaterial.internalCode) {
      saveMaterial({
        id: currentMaterial.id || `m${Date.now()}`,
        internalCode: currentMaterial.internalCode!,
        name: currentMaterial.name!,
        supplier: currentMaterial.supplier,
        type: currentMaterial.type || MaterialType.BOPP,
        thickness: Number(currentMaterial.thickness) || 0,
        density: Number(currentMaterial.density) || 0,
        width: Number(currentMaterial.width) || 0,
        currentStockKg: Number(currentMaterial.currentStockKg) || 0,
        costPerKg: Number(currentMaterial.costPerKg) || 0,
      });
      setIsEditing(false);
      setCurrentMaterial({});
      refresh();
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar material? Esto podría afectar recetas existentes.')) {
      deleteMaterial(id);
      refresh();
    }
  };

  const handleTypeChange = (type: MaterialType) => {
    const config = getConfig();
    // Prioritize user config density, fallback to default constant
    const defaultDensity = config.materialDensities?.[type] || DEFAULT_MATERIAL_DENSITIES[type];
    
    setCurrentMaterial({
      ...currentMaterial,
      type,
      density: defaultDensity
    });
  }

  const filteredMaterials = materials.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.internalCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const COMMON_MATERIALS = [
    "BOPP Transparente", "BOPP Mate", "BOPP Metalizado", "BOPP Blanco", "BOPP Perlado",
    "PET Transparente", "PET Metalizado", "PET DT", "PET PVDC",
    "PEBD Transparente", "PEBD Blanco",
    "CPP Transparente", "CPP Metalizado",
    "BOPP DT", "BOPA (Nylon)"
  ];

  return (
    <div className="space-y-6 animate-fade-in relative">
      <datalist id="material-names">
        {COMMON_MATERIALS.map(name => <option key={name} value={name} />)}
      </datalist>

      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center">
            <Package className="mr-2 text-brand-600" /> Gestión de Inventario
          </h2>
          <p className="text-sm text-slate-500">Administra bobinas, anchos y existencias</p>
        </div>
        
        <div className="flex space-x-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar código o nombre..." 
              className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={() => { setCurrentMaterial({ type: MaterialType.BOPP, density: 0.91 }); setIsEditing(true); }}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-brand-700 transition-colors shadow-md"
          >
            <Plus size={18} className="mr-1" /> Ingresar Material
          </button>
        </div>
      </div>

      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white p-6 rounded-xl shadow-2xl border border-brand-200 w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-fade-in relative">
                <button 
                    onClick={() => setIsEditing(false)}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
                >
                    <X size={24} />
                </button>

                <h3 className="font-bold text-slate-700 mb-6 text-xl border-b pb-2 flex items-center">
                    <Package className="mr-2 text-brand-600"/>
                    {currentMaterial.id ? 'Editar' : 'Ingresar'} Bobina al Inventario
                </h3>
                
                <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    
                    <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Código Interno</label>
                    <input 
                        className="w-full border p-2 rounded focus:ring-2 focus:ring-brand-500 outline-none font-mono bg-slate-50"
                        value={currentMaterial.internalCode || ''}
                        onChange={e => setCurrentMaterial({...currentMaterial, internalCode: e.target.value})}
                        required
                        placeholder="Ej. MP-1023"
                        autoFocus
                    />
                    </div>

                    <div className="md:col-span-2">
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Descripción</label>
                    <input 
                        list="material-names"
                        className="w-full border p-2 rounded focus:ring-2 focus:ring-brand-500 outline-none"
                        value={currentMaterial.name || ''}
                        onChange={e => setCurrentMaterial({...currentMaterial, name: e.target.value})}
                        required
                        placeholder="Ej. BOPP Metalizado"
                    />
                    </div>

                    <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Proveedor</label>
                    <div className="relative">
                        <Factory className="absolute left-2 top-2 text-slate-400" size={16} />
                        <select 
                        className="w-full border p-2 pl-8 rounded focus:ring-2 focus:ring-brand-500 outline-none"
                        value={currentMaterial.supplier || ''}
                        onChange={e => setCurrentMaterial({...currentMaterial, supplier: e.target.value})}
                        >
                            <option value="">Seleccionar Proveedor...</option>
                            {suppliers.map(s => (
                                <option key={s.id} value={s.name}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                    </div>

                    <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Tipo</label>
                    <select 
                        className="w-full border p-2 rounded focus:ring-2 focus:ring-brand-500 outline-none"
                        value={currentMaterial.type}
                        onChange={e => handleTypeChange(e.target.value as MaterialType)}
                    >
                        {Object.values(MaterialType).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    </div>

                    <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Espesor (μm)</label>
                    <input 
                        type="number" step="0.1"
                        className="w-full border p-2 rounded focus:ring-2 focus:ring-brand-500 outline-none"
                        value={currentMaterial.thickness || ''}
                        onChange={e => setCurrentMaterial({...currentMaterial, thickness: Number(e.target.value)})}
                        required
                    />
                    </div>

                    <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Densidad (g/cm³)</label>
                    <input 
                        type="number" step="0.01"
                        className="w-full border p-2 rounded focus:ring-2 focus:ring-brand-500 outline-none bg-slate-50"
                        value={currentMaterial.density || ''}
                        onChange={e => setCurrentMaterial({...currentMaterial, density: Number(e.target.value)})}
                        required
                    />
                    </div>

                    <div>
                    <label className="block text-xs font-bold uppercase text-brand-600 mb-1">Ancho Bobina (mm)</label>
                    <input 
                        type="number"
                        className="w-full border-2 border-brand-100 p-2 rounded focus:ring-2 focus:ring-brand-500 outline-none"
                        value={currentMaterial.width || ''}
                        onChange={e => setCurrentMaterial({...currentMaterial, width: Number(e.target.value)})}
                        required
                        placeholder="Ancho real"
                    />
                    </div>

                    <div className="bg-emerald-50 p-2 rounded border border-emerald-100 md:col-start-4">
                    <label className="block text-xs font-bold uppercase text-emerald-700 mb-1">Stock Actual (Kg)</label>
                    <input 
                        type="number" step="0.1"
                        className="w-full border border-emerald-300 p-2 rounded focus:ring-2 focus:ring-emerald-500 outline-none text-emerald-800 font-bold"
                        value={currentMaterial.currentStockKg || ''}
                        onChange={e => setCurrentMaterial({...currentMaterial, currentStockKg: Number(e.target.value)})}
                        required
                        placeholder="0.00"
                    />
                    </div>
                    
                    <div className="md:col-span-4 flex justify-end space-x-3 mt-4 pt-4 border-t border-slate-100">
                    <button 
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                        Cancelar
                    </button>
                    <button 
                        type="submit"
                        className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 flex items-center shadow-lg"
                    >
                        <Save size={18} className="mr-2" /> Guardar en Inventario
                    </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-semibold">Código</th>
              <th className="px-4 py-3 font-semibold">Material</th>
              <th className="px-4 py-3 font-semibold">Prov.</th>
              <th className="px-4 py-3 font-semibold">Ancho</th>
              <th className="px-4 py-3 font-semibold">Micras</th>
              <th className="px-4 py-3 font-semibold text-right">Stock (Kg)</th>
              <th className="px-4 py-3 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredMaterials.map(material => (
              <tr key={material.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-4 py-3 font-mono text-slate-500 text-xs">{material.internalCode}</td>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {material.name}
                  <span className="block text-xs text-slate-400">{material.type} | Dens: {material.density}</span>
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs">{material.supplier || '-'}</td>
                <td className="px-4 py-3 text-slate-700 font-medium">{material.width} mm</td>
                <td className="px-4 py-3 text-slate-600">{material.thickness} μ</td>
                <td className="px-4 py-3 text-right">
                  <span className={`font-bold px-2 py-1 rounded ${material.currentStockKg < 100 ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {material.currentStockKg.toLocaleString()} Kg
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-2 opacity-60 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => { setCurrentMaterial(material); setIsEditing(true); }}
                    className="text-brand-600 hover:text-brand-800 font-medium p-1 hover:bg-brand-50 rounded"
                  >
                    Editar
                  </button>
                  <button 
                    onClick={() => handleDelete(material.id)}
                    className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
             {filteredMaterials.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                  No se encontraron materiales con ese criterio.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MaterialManager;