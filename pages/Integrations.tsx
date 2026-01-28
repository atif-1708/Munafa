import React, { useState, useEffect } from 'react';
import { CourierName, IntegrationConfig } from '../types';
import { PostExAdapter } from '../services/couriers/postex';
import { ShopifyAdapter } from '../services/shopify';
import { supabase } from '../services/supabase';
import { Plug, CheckCircle2, XCircle, AlertTriangle, Key, Save, ShoppingBag, Globe, HelpCircle, X, ExternalLink, ChevronRight, Settings as SettingsIcon, Users, Link as LinkIcon, ArrowRight } from 'lucide-react';

interface IntegrationsProps {
    onConfigUpdate?: () => void;
}

const Integrations: React.FC<IntegrationsProps> = ({ onConfigUpdate }) => {
  const [configs, setConfigs] = useState<Record<string, IntegrationConfig>>({
    [CourierName.POSTEX]: { id: '', courier: CourierName.POSTEX, api_token: '', is_active: false },
    ['Shopify']: { id: '', courier: 'Shopify', api_token: '', base_url: '', is_active: false }
  });
  const [loading, setLoading] = useState(true);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, 'success' | 'failed' | null>>({});
  const [dbError, setDbError] = useState<string | null>(null);
  
  // Guide Modal State
  const [showShopifyGuide, setShowShopifyGuide] = useState(false);
  const [storeSubdomain, setStoreSubdomain] = useState('');

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

  const handleInputChange = (courier: string, field: 'api_token' | 'base_url', value: string) => {
    setConfigs(prev => ({
        ...prev,
        [courier]: { ...prev[courier], [field]: value }
    }));
  };

  const saveToSupabase = async (courier: string) => {
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
                base_url: config.base_url,
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

  const handleConnect = async (courier: string, force = false) => {
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
            } else if (courier === 'Shopify') {
                const adapter = new ShopifyAdapter();
                success = await adapter.testConnection(config);
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
          <h2 className="text-2xl font-bold text-slate-900">Integrations</h2>
          <p className="text-slate-500 text-sm">Connect your Sales Channel (Shopify) and Couriers (PostEx) to see the full funnel.</p>
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
        
        {/* Shopify Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative overflow-hidden">
             <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                    <div className="bg-green-500 w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                        S
                    </div>
                    <div>
                        <h3 className="font-bold text-lg text-slate-900">Shopify</h3>
                        <p className="text-xs text-slate-500">Sales & Demand Source</p>
                    </div>
                </div>
                <div className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${configs['Shopify'].is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {configs['Shopify'].is_active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {configs['Shopify'].is_active ? 'Connected' : 'Not Connected'}
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Store URL</label>
                    <div className="relative">
                        <Globe className="absolute left-3 top-2.5 text-slate-400" size={16} />
                        <input 
                            type="text"
                            placeholder="my-store.myshopify.com"
                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-sm font-mono"
                            value={configs['Shopify'].base_url}
                            onChange={(e) => handleInputChange('Shopify', 'base_url', e.target.value)}
                        />
                    </div>
                </div>
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="block text-sm font-medium text-slate-700">Admin Access Token</label>
                        <button 
                            onClick={() => setShowShopifyGuide(true)}
                            className="text-xs text-brand-600 font-medium hover:underline flex items-center gap-1"
                        >
                            <HelpCircle size={12} /> Can't find token?
                        </button>
                    </div>
                    <div className="relative">
                        <Key className="absolute left-3 top-2.5 text-slate-400" size={16} />
                        <input 
                            type="password"
                            placeholder="shpat_xxxxxxxxxxxxxxxx"
                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-sm font-mono"
                            value={configs['Shopify'].api_token}
                            onChange={(e) => handleInputChange('Shopify', 'api_token', e.target.value)}
                        />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Requires <code>read_orders</code> and <code>read_products</code> scopes.</p>
                </div>

                {connectionStatus['Shopify'] === 'failed' && (
                    <div className="flex flex-col gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-xs">
                        <div className="flex items-center gap-2">
                            <AlertTriangle size={16} />
                            <span>Connection Failed. Check URL and Token.</span>
                        </div>
                    </div>
                )}
                {connectionStatus['Shopify'] === 'success' && (
                    <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg text-xs">
                        <CheckCircle2 size={16} />
                        <span>Successfully authenticated with Shopify!</span>
                    </div>
                )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button 
                    onClick={() => handleConnect('Shopify')}
                    disabled={testingConnection === 'Shopify'}
                    className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-all text-sm font-medium disabled:opacity-50"
                >
                    {testingConnection === 'Shopify' ? 'Verifying...' : <><Plug size={16} /> Connect Shopify</>}
                </button>
            </div>
        </div>

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
                            onChange={(e) => handleInputChange(CourierName.POSTEX, 'api_token', e.target.value)}
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

      {/* SHOPIFY GUIDE MODAL */}
      {showShopifyGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                      <div>
                          <h3 className="text-xl font-bold text-slate-900">How to get the Access Token</h3>
                          <p className="text-sm text-slate-500">The "Dev Dashboard" credentials (API Key) will <strong>NOT</strong> work here.</p>
                      </div>
                      <button onClick={() => setShowShopifyGuide(false)} className="text-slate-400 hover:text-slate-600 p-1">
                          <X size={24} />
                      </button>
                  </div>
                  
                  <div className="p-6 space-y-6">
                      
                      {/* DIRECT LINK TOOL */}
                      <div className="bg-indigo-50 p-5 rounded-xl border border-indigo-100">
                          <div className="flex items-start gap-3 mb-4">
                              <LinkIcon className="text-indigo-600 shrink-0 mt-1" size={20} />
                              <div>
                                  <h4 className="font-bold text-indigo-900 text-sm">Force Open the "Custom App" Page</h4>
                                  <p className="text-xs text-indigo-700 mt-1">
                                      If the "Allow custom app development" link is missing, use this tool to jump directly to the hidden page.
                                  </p>
                              </div>
                          </div>
                          
                          <div className="bg-white p-3 rounded-lg border border-indigo-200">
                               <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                                   Enter Store Name (Subdomain)
                               </label>
                               <div className="flex gap-2">
                                   <div className="relative flex-1">
                                       <input 
                                           type="text" 
                                           placeholder="e.g. huntly-pk" 
                                           className="w-full pl-3 pr-24 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                           value={storeSubdomain}
                                           onChange={e => setStoreSubdomain(e.target.value.replace('.myshopify.com', '').replace('https://', '').split('/')[0])}
                                       />
                                       <span className="absolute right-3 top-2.5 text-xs text-slate-400 pointer-events-none">.myshopify.com</span>
                                   </div>
                                   <a 
                                       href={`https://admin.shopify.com/store/${storeSubdomain}/settings/apps/development`}
                                       target="_blank"
                                       rel="noopener noreferrer"
                                       className={`bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-indigo-700 transition-all ${!storeSubdomain ? 'opacity-50 pointer-events-none' : ''}`}
                                   >
                                       Open Page <ExternalLink size={14}/>
                                   </a>
                               </div>
                               <div className="mt-2 flex justify-between items-center">
                                   <p className="text-[10px] text-slate-400">
                                       Try this if above fails: <a href={`https://${storeSubdomain}.myshopify.com/admin/settings/apps/development`} target="_blank" className="underline text-indigo-600 hover:text-indigo-800">Legacy Admin Link</a>
                                   </p>
                               </div>
                          </div>
                      </div>

                      <div className="space-y-4 pt-4 border-t border-slate-100">
                          <p className="font-bold text-slate-900 text-sm">Once the page opens:</p>
                          <Step 
                              num={1} 
                              text="Click 'Create an app' -> Name it 'MunafaBakhsh'." 
                          />
                          <Step 
                              num={2} 
                              text="Go to 'Configuration' tab -> 'Configure' Admin API integration." 
                          />
                          <div className="pl-12">
                              <div className="bg-slate-100 p-3 rounded-lg text-xs font-mono text-slate-700 border border-slate-200">
                                  <p className="font-bold text-slate-900 mb-2">Check these boxes:</p>
                                  <ul className="list-disc pl-4 space-y-1">
                                      <li>read_orders</li>
                                      <li>read_products</li>
                                      <li>read_customers</li>
                                  </ul>
                              </div>
                          </div>
                          <Step 
                              num={3} 
                              text="Click Save -> Click 'Install app' (top right)." 
                          />
                          <Step 
                              num={4} 
                              text="Copy the 'Admin API access token' (starts with shpat_...) and paste it here." 
                          />
                      </div>
                      
                      <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                          <button 
                            onClick={() => setShowShopifyGuide(false)}
                            className="bg-brand-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-brand-700 transition-colors"
                          >
                              I have the token
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

const Step = ({ num, text }: { num: number, text: string }) => (
    <div className="flex gap-4">
        <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
            {num}
        </div>
        <p className="text-sm text-slate-700 pt-1 leading-relaxed">{text}</p>
    </div>
);

export default Integrations;