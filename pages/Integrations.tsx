import React, { useState, useEffect } from 'react';
import { CourierName, IntegrationConfig } from '../types';
import { PostExAdapter } from '../services/couriers/postex';
import { supabase } from '../services/supabase';
import { Plug, CheckCircle2, XCircle, AlertTriangle, Key, Save } from 'lucide-react';

interface IntegrationsProps {
    onConfigUpdate?: () => void;
}

const Integrations: React.FC<IntegrationsProps> = ({ onConfigUpdate }) => {
  const [configs, setConfigs] = useState<Record<string, IntegrationConfig>>({
    [CourierName.POSTEX]: { id: '', courier: CourierName.POSTEX, api_token: '', is_active: false },
    [CourierName.TRAX]: { id: '', courier: CourierName.TRAX, api_token: '', is_active: false }
  });
  const [loading, setLoading] = useState(true);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, 'success' | 'failed' | null>>({});
  const [dbError, setDbError] = useState<string | null>(null);

  // Load from Supabase
  useEffect(() => {
    const loadConfigs = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
            .from('integration_configs')
            .select('*')
            .eq('user_id', user.id);

        if (data) {
            const newConfigs = { ...configs };
            data.forEach((conf: any) => {
                newConfigs[conf.courier] = conf;
            });
            setConfigs(newConfigs);
        }
        setLoading(false);
    };
    loadConfigs();
  }, []);

  const handleInputChange = (courier: string, value: string) => {
    setConfigs(prev => ({
        ...prev,
        [courier]: { ...prev[courier], api_token: value }
    }));
  };

  const saveToSupabase = async (courier: CourierName) => {
    setDbError(null);
    const config = configs[courier];
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        const { error } = await supabase
            .from('integration_configs')
            .upsert({
                user_id: user.id,
                courier: courier,
                api_token: config.api_token,
                is_active: true
            }, { onConflict: 'user_id, courier' });
        
        if (error) {
            console.error("Supabase Save Error:", error);
            setDbError(`DB Save Failed: ${error.message} (${error.code})`);
            return false;
        }
        
        // Update local state to reflect active
        setConfigs(prev => ({
            ...prev,
            [courier]: { ...prev[courier], is_active: true }
        }));

        // Notify Parent App to Reload
        if (onConfigUpdate) onConfigUpdate();

        return true;
    }
    return false;
  };

  const handleConnect = async (courier: CourierName, force = false) => {
    setTestingConnection(courier);
    setConnectionStatus(prev => ({ ...prev, [courier]: null }));
    setDbError(null);

    const config = configs[courier];
    let success = false;

    if (force) {
        success = await saveToSupabase(courier);
        if (!success) {
            setConnectionStatus(prev => ({ ...prev, [courier]: 'failed' }));
        }
    } else {
        try {
            if (courier === CourierName.POSTEX) {
                const adapter = new PostExAdapter();
                success = await adapter.testConnection(config);
            } else {
                await new Promise(r => setTimeout(r, 1000));
                success = config.api_token.length > 5;
            }

            if (success) {
                const saved = await saveToSupabase(courier);
                if (!saved) success = false; 
            }
        } catch (e) {
            console.error("Test failed", e);
            success = false;
        }
    }

    setConnectionStatus(prev => ({ ...prev, [courier]: success ? 'success' : 'failed' }));
    setTestingConnection(null);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Courier Integrations</h2>
          <p className="text-slate-500 text-sm">Securely connect your courier accounts.</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex gap-3 text-sm text-blue-700">
        <div className="mt-0.5"><Plug size={18} /></div>
        <div>
            <span className="font-bold">Developer Tip:</span> Use the token <code>demo_123</code> to activate Simulation Mode. 
            This bypasses CORS restrictions and generates realistic sample data for testing the dashboard.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PostEx Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative overflow-hidden">
            <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                    <div className="bg-yellow-400 w-10 h-10 rounded-lg flex items-center justify-center text-black font-bold text-xs">
                        PX
                    </div>
                    <div>
                        <h3 className="font-bold text-lg text-slate-900">PostEx</h3>
                        <p className="text-xs text-slate-500">COD & Financials API</p>
                    </div>
                </div>
                <div className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${configs[CourierName.POSTEX].is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {configs[CourierName.POSTEX].is_active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {configs[CourierName.POSTEX].is_active ? 'Connected' : 'Not Connected'}
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">API Token</label>
                    <div className="relative">
                        <Key className="absolute left-3 top-2.5 text-slate-400" size={16} />
                        <input 
                            type="password"
                            placeholder="Paste your PostEx Merchant Token"
                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none text-sm font-mono"
                            value={configs[CourierName.POSTEX].api_token}
                            onChange={(e) => handleInputChange(CourierName.POSTEX, e.target.value)}
                        />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Found in PostEx Portal {'>'} Settings {'>'} API Integration</p>
                </div>

                {connectionStatus[CourierName.POSTEX] === 'failed' && (
                    <div className="flex flex-col gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-xs">
                        <div className="flex items-center gap-2">
                            <AlertTriangle size={16} />
                            <span>Connection Failed. Invalid Token or CORS Error.</span>
                        </div>
                        {dbError ? (
                            <div className="pl-6 font-mono text-xs">{dbError}</div>
                        ) : (
                            <div className="pl-6 text-slate-600">
                                If you are sure the token is correct, the browser might be blocking the request. 
                                You can force save to continue.
                            </div>
                        )}
                    </div>
                )}

                {connectionStatus[CourierName.POSTEX] === 'success' && (
                    <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg text-xs">
                        <CheckCircle2 size={16} />
                        <span>Successfully authenticated! Data is syncing...</span>
                    </div>
                )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end gap-2">
                {connectionStatus[CourierName.POSTEX] === 'failed' && (
                    <button 
                        onClick={() => handleConnect(CourierName.POSTEX, true)}
                        className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition-all text-sm font-medium"
                    >
                        <Save size={16} /> Force Save
                    </button>
                )}
                <button 
                    onClick={() => handleConnect(CourierName.POSTEX)}
                    disabled={testingConnection === CourierName.POSTEX}
                    className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-all text-sm font-medium disabled:opacity-50"
                >
                    {testingConnection === CourierName.POSTEX ? 'Verifying...' : <><Plug size={16} /> Connect Account</>}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Integrations;