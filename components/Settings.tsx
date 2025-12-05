
import React, { useState, useRef } from 'react';
import { getConfig, updateConfig, generateExcelExport, exportDatabaseJSON, importDatabaseJSON, syncWithZeta } from '../services/dataService';
import { Settings as SettingsIcon, Save, Download, Database, Cloud, Upload, RefreshCw, Server, Lock, User, Briefcase, Info, HelpCircle } from 'lucide-react';

const Settings: React.FC = () => {
  const [config, setConfig] = useState(getConfig());
  const [saved, setSaved] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
     if (e.target.files && e.target.files[0]) {
        const success = await importDatabaseJSON(e.target.files[0]);
        if (success) {
            alert("Base de datos restaurada correctamente. La página se recargará.");
            window.location.reload();
        }
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
     }
  }

  const handleZetaSync = async () => {
      setIsSyncing(true);
      const result = await syncWithZeta();
      setIsSyncing(false);
      
      if (result.success) {
          alert(result.message);
      } else {
          alert("Error: " + result.message);
      }
  }

  const updateZetaField = (field: string, value: string) => {
      setConfig({
          ...config,
          zetaConfig: {
              ...config.zetaConfig!,
              [field]: value
          }
      });
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in space-y-8">
      
      {/* Configuración de Cálculos */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <div className="flex items-center mb-6 pb-4 border-b border-slate-100">
          <div className="bg-slate-100 p-3 rounded-full mr-4">
            <SettingsIcon className="text-slate-600" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Parámetros de Producción</h2>
            <p className="text-slate-500 text-sm">Variables globales para el cálculo de merma y metraje</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block font-medium text-slate-700 mb-2">Ajuste Impresión</label>
              <p className="text-xs text-slate-500 mb-2">Metros fijos perdidos en arranque de impresión.</p>
              <div className="flex items-center">
                <input 
                  type="number" 
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 outline-none"
                  value={config.fixedStartupMeters}
                  onChange={(e) => setConfig({...config, fixedStartupMeters: Number(e.target.value)})}
                />
                <span className="ml-2 text-slate-600 font-medium text-xs">m</span>
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-2">Ajuste Reprint (DT)</label>
              <p className="text-xs text-slate-500 mb-2">Extra si el material es tipo DT (Reimpresión).</p>
              <div className="flex items-center">
                <input 
                  type="number" 
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 outline-none"
                  value={config.reprintMeters || 0}
                  onChange={(e) => setConfig({...config, reprintMeters: Number(e.target.value)})}
                />
                <span className="ml-2 text-slate-600 font-medium text-xs">m</span>
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-2">Ajuste 1° Laminado</label>
              <p className="text-xs text-slate-500 mb-2">Extra si la ficha tiene Capa 2.</p>
              <div className="flex items-center">
                <input 
                  type="number" 
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 outline-none"
                  value={config.lamination1Meters || 0}
                  onChange={(e) => setConfig({...config, lamination1Meters: Number(e.target.value)})}
                />
                <span className="ml-2 text-slate-600 font-medium text-xs">m</span>
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-2">Ajuste 2° Laminado</label>
              <p className="text-xs text-slate-500 mb-2">Extra si la ficha tiene Capa 3.</p>
              <div className="flex items-center">
                <input 
                  type="number" 
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 outline-none"
                  value={config.lamination2Meters || 0}
                  onChange={(e) => setConfig({...config, lamination2Meters: Number(e.target.value)})}
                />
                <span className="ml-2 text-slate-600 font-medium text-xs">m</span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <label className="block font-medium text-slate-700 mb-2">% Merma Variable (Proceso)</label>
            <p className="text-xs text-slate-500 mb-2">Porcentaje de seguridad sobre el metraje neto (ej. 0.05 = 5%).</p>
            <div className="flex items-center">
              <input 
                type="number" 
                step="0.01"
                className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 outline-none max-w-xs"
                value={config.variableScrapPercent}
                onChange={(e) => setConfig({...config, variableScrapPercent: Number(e.target.value)})}
              />
              <span className="ml-3 text-slate-600 font-medium">factor (0.1 = 10%)</span>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between">
             {saved ? <span className="text-green-600 font-medium text-sm animate-pulse">¡Guardado correctamente!</span> : <span></span>}
             <button type="submit" className="bg-brand-600 text-white px-6 py-2 rounded-lg hover:bg-brand-700 transition-colors flex items-center">
               <Save className="mr-2" size={18} /> Guardar Cambios
             </button>
          </div>
        </form>
      </div>

      {/* Integración ZetaSoftware SOAP */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <div className="flex items-center mb-6 pb-4 border-b border-slate-100">
          <div className="bg-indigo-100 p-3 rounded-full mr-4">
            <Server className="text-indigo-600" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Integración ERP (ZetaSoftware SOAP)</h2>
            <p className="text-slate-500 text-sm">Sincroniza inventario (StockActualV3)</p>
          </div>
        </div>

        <div className="space-y-4">
            <div className="flex items-center mb-4">
                <input 
                    type="checkbox" 
                    id="zetaEnabled" 
                    checked={config.zetaConfig?.enabled || false}
                    onChange={(e) => setConfig({
                        ...config, 
                        zetaConfig: { ...config.zetaConfig!, enabled: e.target.checked }
                    })}
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <label htmlFor="zetaEnabled" className="ml-2 block text-sm font-bold text-slate-700">Habilitar Integración SOAP</label>
            </div>

            {config.zetaConfig?.enabled && (
                <div className="space-y-6 p-5 bg-indigo-50 rounded-lg border border-indigo-100 animate-fade-in">
                    
                    {/* INFO BOX */}
                    <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-900 p-4 text-sm rounded-r mb-4">
                        <div className="flex">
                            <Info className="shrink-0 mr-2" size={20}/>
                            <div>
                                <p className="font-bold">¿Dónde obtengo estos datos?</p>
                                <p className="mt-1">
                                    Estos datos son provistos por el soporte de ZetaSoftware o el administrador de su sistema ERP.
                                    Requiere un usuario web habilitado para uso de API.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase text-indigo-700 mb-1">URL Endpoint WSDL</label>
                        <input 
                            type="text" 
                            className="w-full border p-2 rounded text-sm bg-white"
                            placeholder="https://api.zetasoftware.com/z.apis.asoapstockactualv3"
                            value={config.zetaConfig?.apiUrl || ''}
                            onChange={(e) => updateZetaField('apiUrl', e.target.value)}
                        />
                        <p className="text-[10px] text-indigo-400 mt-1">Generalmente no cambia. Verificar versión V3.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                         {/* SECCIÓN 1: INTEGRADOR */}
                         <div className="col-span-2 border-t border-indigo-200 pt-4">
                            <h4 className="text-sm font-bold text-indigo-900 mb-2 flex items-center">
                                <Lock size={14} className="mr-1"/> 1. Credenciales de Integrador (Partner)
                            </h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-indigo-600 mb-1">Código</label>
                                    <input type="text" className="w-full border p-2 rounded text-sm bg-white" placeholder="Ej. DES123"
                                        value={config.zetaConfig?.desarrolladorCodigo || ''} onChange={(e) => updateZetaField('desarrolladorCodigo', e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-indigo-600 mb-1">Clave</label>
                                    <input type="password" className="w-full border p-2 rounded text-sm bg-white" placeholder="******"
                                        value={config.zetaConfig?.desarrolladorClave || ''} onChange={(e) => updateZetaField('desarrolladorClave', e.target.value)} />
                                </div>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-1">Identifica a la aplicación "PCP Enigma" ante Zeta.</p>
                         </div>

                         {/* SECCIÓN 2: EMPRESA */}
                         <div className="col-span-2 border-t border-indigo-200 pt-4">
                             <h4 className="text-sm font-bold text-indigo-900 mb-2 flex items-center">
                                <Briefcase size={14} className="mr-1"/> 2. Credenciales de Empresa (Cliente)
                             </h4>
                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-indigo-600 mb-1">Código Empresa</label>
                                    <input type="text" className="w-full border p-2 rounded text-sm bg-white" placeholder="Ej. EMP001"
                                        value={config.zetaConfig?.empresaCodigo || ''} onChange={(e) => updateZetaField('empresaCodigo', e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-indigo-600 mb-1">Clave Empresa</label>
                                    <input type="password" className="w-full border p-2 rounded text-sm bg-white" placeholder="******"
                                        value={config.zetaConfig?.empresaClave || ''} onChange={(e) => updateZetaField('empresaClave', e.target.value)} />
                                </div>
                             </div>
                             <p className="text-[10px] text-slate-500 mt-1">Identifica su base de datos específica en Zeta.</p>
                         </div>

                         {/* SECCIÓN 3: USUARIO */}
                         <div className="col-span-2 border-t border-indigo-200 pt-4">
                             <h4 className="text-sm font-bold text-indigo-900 mb-2 flex items-center">
                                <User size={14} className="mr-1"/> 3. Usuario Web (API User)
                             </h4>
                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-indigo-600 mb-1">Código Usuario</label>
                                    <input type="number" className="w-full border p-2 rounded text-sm bg-white" placeholder="Ej. 10"
                                        value={config.zetaConfig?.usuarioCodigo || ''} onChange={(e) => updateZetaField('usuarioCodigo', e.target.value)} />
                                    <p className="text-[10px] text-slate-400">Suele ser un número.</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-indigo-600 mb-1">Clave Usuario</label>
                                    <input type="password" className="w-full border p-2 rounded text-sm bg-white" placeholder="******"
                                        value={config.zetaConfig?.usuarioClave || ''} onChange={(e) => updateZetaField('usuarioClave', e.target.value)} />
                                </div>
                             </div>
                         </div>
                    </div>
                    
                    <div className="border-t border-indigo-200 pt-4">
                         <div className="flex items-center">
                            <label className="block text-xs font-bold uppercase text-indigo-700 mr-2">Rol Código:</label>
                            <input type="number" className="w-24 border p-2 rounded text-sm bg-white"
                                value={config.zetaConfig?.rolCodigo || '0'} onChange={(e) => updateZetaField('rolCodigo', e.target.value)} />
                             <span className="ml-2 text-[10px] text-slate-500 flex items-center"><HelpCircle size={10} className="mr-1"/> 0 = Rol por defecto.</span>
                         </div>
                    </div>

                    <div className="pt-4">
                        <button 
                            type="button"
                            onClick={handleZetaSync}
                            disabled={isSyncing}
                            className="w-full bg-indigo-600 text-white px-4 py-3 rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center font-bold shadow-lg"
                        >
                            <RefreshCw className={`mr-2 ${isSyncing ? 'animate-spin' : ''}`} size={20} />
                            {isSyncing ? 'Conectando con ZetaSoftware...' : 'Probar Conexión y Sincronizar'}
                        </button>
                        <p className="text-xs text-indigo-500 mt-3 text-center font-medium">
                            Se descargarán solo artículos de: POLO FILMS, VITOPEL, TERPHANE, MULTIPACK, RBS.
                        </p>
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* Exportación de Datos */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <div className="flex items-center mb-6 pb-4 border-b border-slate-100">
          <div className="bg-emerald-100 p-3 rounded-full mr-4">
            <Database className="text-emerald-600" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Base de Datos (Respaldo)</h2>
            <p className="text-slate-500 text-sm">Guarda y carga tu información manualmente</p>
          </div>
        </div>
        
        <div className="space-y-4">
           <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
            <div className="text-slate-600 text-sm max-w-xs">
              <strong>Reporte Excel (.xlsx)</strong><br/>
              Tablas de Clientes, Materiales y Fichas legibles para humanos.
            </div>
            <button 
              onClick={generateExcelExport}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors flex items-center shadow"
            >
              <Download className="mr-2" size={18} /> Excel
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                <div className="text-blue-800 text-sm mb-3 font-bold flex items-center">
                   <Cloud className="mr-2" size={16} /> 1. Guardar (Backup)
                </div>
                <p className="text-xs text-blue-600 mb-3">Descarga el archivo JSON. Guárdalo en tu Google Drive para llevarlo a otra PC.</p>
                <button 
                onClick={exportDatabaseJSON}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center shadow text-sm"
                >
                <Download className="mr-2" size={16} /> Descargar DB
                </button>
            </div>

            <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                <div className="text-amber-800 text-sm mb-3 font-bold flex items-center">
                   <Upload className="mr-2" size={16} /> 2. Restaurar (Importar)
                </div>
                <p className="text-xs text-amber-600 mb-3">Carga el archivo JSON desde tu PC o Drive para recuperar tus datos.</p>
                <input 
                    type="file" 
                    accept=".json" 
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleImport}
                />
                <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors flex items-center justify-center shadow text-sm"
                >
                <Upload className="mr-2" size={16} /> Cargar DB
                </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Settings;
