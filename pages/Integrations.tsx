import React, { useState, useEffect } from 'react';
import { CourierName, IntegrationConfig } from '../types';
import { PostExAdapter } from '../services/couriers/postex';
import { ShopifyAdapter } from '../services/shopify';
import { supabase } from '../services/supabase';
import { CheckCircle2, AlertTriangle, Key, Globe, Loader2, Store, ArrowRight, RefreshCw, Trash2, ShieldCheck, Link } from 'lucide-react';

// Helper to get Env Vars safely
const getEnv = (key: string) => {
    // @ts-ignore
    return import.meta.env[key] || '';
};

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
  
  // OAuth Configuration (Platform Level)
  const ENV_CLIENT_ID = getEnv('VITE_SHOPIFY_API_KEY');
  const ENV_CLIENT_SECRET = getEnv('VITE_SHOPIFY_API_SECRET');
  const isPlatformConfigured = !!ENV_CLIENT_ID && !!ENV_CLIENT_SECRET;

  const [isExchangingToken, setIsExchangingToken] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Dynamic Redirect URI
  const redirectUri = typeof window !== 'undefined' ? (window.location.origin + window.location.pathname) : '';

  // Load Configs Helper
  const loadConfigs = async () => {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
            const { data } = await supabase
                .from('integration_configs')
                .select('*')
                .eq('user_id', session.user.id);

            if (data) {
                setConfigs(prev => {
                    const newConfigs = { ...prev };
                    data.forEach((conf: any) => {
                        newConfigs[conf.courier] = {
                            ...newConfigs[conf.courier], ...conf, is_active: conf.is_active
                        };
                    });
                    return newConfigs;
                });
            }
        } 
        setLoading(false);
  };

  // Initial Load & OAuth Code Check
  useEffect(() => {
    const init = async () => {
        await loadConfigs();

        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const shop = params.get('shop');
        
        if (code && shop && isPlatformConfigured) {
            await handleTokenExchange(shop, code, ENV_CLIENT_ID, ENV_CLIENT_SECRET);
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    };
    init();
  }, []);

  const handleTokenExchange = async (shop: string, code: string, clientId: string, clientSecret: string) => {
      setIsExchangingToken(true);
      setErrorMessage(null);
      try {
          const proxyUrl = 'https://corsproxy.io/?';
          const tokenUrl = `https://${shop}/admin/oauth/access_token`;
          const fullUrl = `${proxyUrl}${encodeURIComponent(tokenUrl)}`;

          const response = await fetch(fullUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  client_id: clientId,
                  client_secret: clientSecret,
                  code: code
              })
          });

          const data = await response.json();
          if (data.access_token) {
              const updatedConfig = {
                  ...configs['Shopify'],
                  base_url: shop,
                  api_token: data.access_token,
                  courier: 'Shopify',
                  is_active: true
              };
              
              setConfigs(prev => ({ ...prev, 'Shopify': updatedConfig }));
              await saveConfig(updatedConfig.courier, updatedConfig);
              setConnectionStatus(prev => ({ ...prev, 'Shopify': 'success' }));
          } else {
              throw new Error("Invalid response from Shopify");
          }
      } catch (error) {
          console.error("OAuth Exchange Failed", error);
          setErrorMessage("Connection failed. Please try again.");
          setConnectionStatus(prev => ({ ...prev, 'Shopify': 'failed' }));
      } finally {
          setIsExchangingToken(false);
      }
  };

  const startOAuthFlow = () => {
      if (!isPlatformConfigured) {
          alert("Platform Configuration Missing. Please contact support.");
          return;
      }
      
      let shopUrl = configs['Shopify'].base_url.trim();
      
      // Auto-clean URL
      shopUrl = shopUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (shopUrl.includes('/')) shopUrl = shopUrl.split('/')[0]; // Remove paths like /admin
      if (shopUrl.indexOf('.') === -1 && shopUrl.length > 0) shopUrl += '.myshopify.com';

      if (!shopUrl) {
          setErrorMessage("Please enter your Store URL (e.g. store.myshopify.com)");
          return;
      }

      const scopes = 'read_orders,read_products,read_customers';
      const nonce = Math.random().toString(36).substring(7);
      
      // Redirect to Shopify
      const authUrl = `https://${shopUrl}/admin/oauth/authorize?client_id=${ENV_CLIENT_ID}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${nonce}`;
      
      window.location.href = authUrl; 
  };

  const handleInputChange = (courier: string, field: 'api_token' | 'base_url', value: string) => {
    setConfigs(prev => ({
        ...prev,
        [courier]: { ...prev[courier], [field]: value }
    }));
  };

  const saveConfig = async (courier: string, configOverride?: IntegrationConfig) => {
    setErrorMessage(null);
    const config = configOverride || configs[courier];
    const isActive = configOverride ? configOverride.is_active : true;
    const updatedConfig = { ...config, is_active: isActive };
    
    setConfigs(prev => ({ ...prev, [courier]: updatedConfig }));

    try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
            const { id, ...rest } = updatedConfig;
            const payload = {
                user_id: session.user.id,
                courier: courier,
                api_token: rest.api_token,
                base_url: rest.base_url,
                is_active: isActive
            };

            const { error } = await supabase
                .from('integration_configs')
                .upsert(payload, { onConflict: 'user_id, courier' }); 
            
            if (error) {
                console.error("Supabase Save Error:", error);
                return false;
            }
            return true;
        }
        return false;
    } catch (e: any) {
        return false;
    } finally {
        if (onConfigUpdate) onConfigUpdate();
    }
  };

  const handleDisconnect = async (courier: string) => {
    if (!window.confirm("Are you sure you want to disconnect? Data syncing will stop.")) return;
    const current = configs[courier];
    const disconnectedConfig: IntegrationConfig = { ...current, api_token: '', base_url: '', is_active: false };
    setConfigs(prev => ({ ...prev, [courier]: disconnectedConfig }));
    await saveConfig(courier, disconnectedConfig);
  };
  
  const handleConnectPostEx = async () => {
    setTestingConnection(CourierName.POSTEX);
    setErrorMessage(null);
    const config = configs[CourierName.POSTEX];
    
    // Simple validation
    if (!config.api_token || config.api_token.length < 5) {
        setErrorMessage("Please enter a valid PostEx Merchant Token.");
        setTestingConnection(null);
        return;
    }

    const adapter = new PostExAdapter();
    const success = await adapter.testConnection(config);
    
    if (success) {
        await saveConfig(CourierName.POSTEX);
        setConnectionStatus(prev => ({ ...prev, [CourierName.POSTEX]: 'success' }));
    } else {
        // Fallback: Force save if it fails due to CORS but user insists
        if (window.confirm("Connection check failed (likely CORS). Force save anyway?")) {
            await saveConfig(CourierName.POSTEX);
            setConnectionStatus(prev => ({ ...prev, [CourierName.POSTEX]: 'success' }));
        } else {
             setConnectionStatus(prev => ({ ...prev, [CourierName.POSTEX]: 'failed' }));
        }
    }
    setTestingConnection(null);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Platform Integrations</h2>
          <p className="text-slate-500 mt-1">Connect your store and courier accounts to enable automatic profit tracking.</p>
        </div>
        <button onClick={() => window.location.reload()} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors">
            <RefreshCw size={14} /> Refresh Status
        </button>
      </div>

      {!isPlatformConfigured && (
           <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex gap-3 text-sm text-amber-800">
               <AlertTriangle className="shrink-0 text-amber-600" size={20} />
               <div>
                   <strong>Admin Configuration Required:</strong> The platform owner must configure the Shopify API Credentials in the environment variables (<code>VITE_SHOPIFY_API_KEY</code>) for integrations to work.
               </div>
           </div>
      )}

      {errorMessage && (
           <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex gap-3 text-sm text-red-800 animate-in fade-in slide-in-from-top-2">
               <AlertTriangle className="shrink-0 text-red-600" size={20} />
               <div>{errorMessage}</div>
           </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Shopify Card */}
        <div className={`
            relative overflow-hidden rounded-2xl border transition-all duration-300
            ${configs['Shopify'].is_active ? 'bg-green-50/50 border-green-200 shadow-sm' : 'bg-white border-slate-200 shadow-md hover:shadow-lg'}
        `}>
             <div className="p-8">
                <div className="flex justify-between items-start mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-[#95BF47] rounded-xl flex items-center justify-center text-white shadow-sm">
                            <Store size={28} />
                        </div>
                        <div>
                            <h3 className="font-bold text-xl text-slate-900">Shopify Store</h3>
                            <p className="text-sm text-slate-500">Import Orders & Products</p>
                        </div>
                    </div>
                    {configs['Shopify'].is_active && (
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold flex items-center gap-1">
                            <CheckCircle2 size={14} /> Active
                        </span>
                    )}
                </div>

                {configs['Shopify'].is_active ? (
                     <div className="space-y-6">
                         <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-green-100 shadow-sm">
                             <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                                 <Globe size={20} />
                             </div>
                             <div className="flex-1 min-w-0">
                                 <p className="text-xs text-slate-500 font-bold uppercase">Connected URL</p>
                                 <p className="text-sm font-medium text-slate-900 truncate" title={configs['Shopify'].base_url}>
                                     {configs['Shopify'].base_url}
                                 </p>
                             </div>
                             <CheckCircle2 size={20} className="text-green-500" />
                         </div>
                         
                         <div className="flex gap-3">
                             <button disabled className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium opacity-90 cursor-default flex items-center justify-center gap-2">
                                 <RefreshCw size={16} className="animate-spin" /> Syncing Automatically
                             </button>
                             <button onClick={() => handleDisconnect('Shopify')} className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 hover:text-red-600 transition-colors">
                                 Disconnect
                             </button>
                         </div>
                     </div>
                ) : (
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Store URL</label>
                            <div className="relative group">
                                <Globe className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-green-600 transition-colors" size={18} />
                                <input 
                                    type="text"
                                    placeholder="your-brand.myshopify.com"
                                    className="w-full pl-11 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                                    value={configs['Shopify'].base_url}
                                    onChange={(e) => handleInputChange('Shopify', 'base_url', e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && startOAuthFlow()}
                                />
                            </div>
                            <p className="text-xs text-slate-400 mt-2 ml-1">
                                Enter your standard <code>.myshopify.com</code> URL.
                            </p>
                        </div>

                        {isExchangingToken ? (
                             <button disabled className="w-full bg-slate-100 text-slate-500 py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-not-allowed">
                                 <Loader2 className="animate-spin" size={18} /> Verifying Connection...
                             </button>
                        ) : (
                            <button 
                                onClick={startOAuthFlow}
                                disabled={!configs['Shopify'].base_url || !isPlatformConfigured}
                                className="w-full bg-slate-900 text-white py-3.5 rounded-xl text-sm font-bold hover:bg-slate-800 hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:translate-y-0 disabled:shadow-none"
                            >
                                Connect Shopify <ArrowRight size={16} />
                            </button>
                        )}
                        
                        <div className="flex items-center gap-2 justify-center text-xs text-slate-400 pt-2">
                            <ShieldCheck size={14} /> Secure OAuth 2.0 Connection
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* PostEx Card */}
        <div className={`
            relative overflow-hidden rounded-2xl border transition-all duration-300
            ${configs[CourierName.POSTEX].is_active ? 'bg-yellow-50/50 border-yellow-200 shadow-sm' : 'bg-white border-slate-200 shadow-md hover:shadow-lg'}
        `}>
            <div className="p-8">
                <div className="flex justify-between items-start mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-[#FFC700] rounded-xl flex items-center justify-center text-black font-bold text-xl shadow-sm">PX</div>
                        <div>
                            <h3 className="font-bold text-xl text-slate-900">PostEx Courier</h3>
                            <p className="text-sm text-slate-500">Sync Financials & Status</p>
                        </div>
                    </div>
                    {configs[CourierName.POSTEX].is_active && (
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold flex items-center gap-1">
                            <CheckCircle2 size={14} /> Active
                        </span>
                    )}
                </div>
                
                {configs[CourierName.POSTEX].is_active ? (
                     <div className="space-y-6">
                         <div className="p-4 bg-white rounded-xl border border-yellow-100 shadow-sm">
                             <p className="text-sm text-slate-600">
                                 <span className="font-bold text-slate-900">Connected.</span> We are automatically pulling order statuses and remittance data.
                             </p>
                         </div>
                         <button onClick={() => handleDisconnect(CourierName.POSTEX)} className="w-full py-2.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 hover:text-red-600 transition-colors">
                             Disconnect Account
                         </button>
                     </div>
                 ) : (
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Merchant API Token</label>
                            <div className="relative group">
                                <Key className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-yellow-600 transition-colors" size={18} />
                                <input 
                                    type="password"
                                    placeholder="Paste token from PostEx Portal"
                                    className="w-full pl-11 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition-all font-mono text-sm"
                                    value={configs[CourierName.POSTEX].api_token}
                                    onChange={(e) => handleInputChange(CourierName.POSTEX, 'api_token', e.target.value)}
                                />
                            </div>
                            <div className="flex justify-between items-center mt-2">
                                <p className="text-xs text-slate-400 ml-1">
                                    Settings {'>'} API Integration
                                </p>
                                <a href="https://merchant.postex.pk" target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                    Open Portal <Link size={10} />
                                </a>
                            </div>
                        </div>

                        <button 
                            onClick={handleConnectPostEx}
                            disabled={testingConnection === CourierName.POSTEX || !configs[CourierName.POSTEX].api_token}
                            className="w-full bg-slate-900 text-white py-3.5 rounded-xl text-sm font-bold hover:bg-slate-800 hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:translate-y-0 disabled:shadow-none"
                        >
                            {testingConnection === CourierName.POSTEX ? (
                                <><Loader2 className="animate-spin" size={18} /> Verifying...</>
                            ) : (
                                'Connect PostEx Account'
                            )}
                        </button>
                    </div>
                 )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default Integrations;