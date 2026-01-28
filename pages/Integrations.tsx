import React, { useState, useEffect } from 'react';
import { CourierName, IntegrationConfig } from '../types';
import { PostExAdapter } from '../services/couriers/postex';
import { ShopifyAdapter } from '../services/shopify';
import { supabase } from '../services/supabase';
import { Plug, CheckCircle2, XCircle, AlertTriangle, Key, Save, Globe, HelpCircle, X, ArrowLeftRight, Loader2, LayoutDashboard, Store, ExternalLink, RefreshCw, Copy } from 'lucide-react';

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
  
  // OAuth State
  const [authMethod, setAuthMethod] = useState<'token' | 'oauth'>('oauth');
  const [oauthCreds, setOauthCreds] = useState({ clientId: '', clientSecret: '' });
  const [isExchangingToken, setIsExchangingToken] = useState(false);
  
  // Calculate Redirect URI dynamically based on current environment
  const redirectUri = typeof window !== 'undefined' ? (window.location.origin + window.location.pathname) : '';

  // Guide Modal State
  const [showShopifyGuide, setShowShopifyGuide] = useState(false);
  const [guideTab, setGuideTab] = useState<'admin' | 'partner'>('partner');

  // Load Configs Helper
  const loadConfigs = async () => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        
        // 1. Load from DB if User Exists
        if (user) {
            const { data, error } = await supabase
                .from('integration_configs')
                .select('*')
                .eq('user_id', user.id);

            if (error) {
                console.error("Failed to load configs:", error);
                setDbError("Failed to load saved configurations.");
            } else if (data) {
                setConfigs(prev => {
                    const newConfigs = { ...prev };
                    data.forEach((conf: any) => {
                        newConfigs[conf.courier] = conf;
                    });
                    return newConfigs;
                });
            }
        } 
        
        // 2. Load from LocalStorage (Fallback / Guest Mode)
        const localData = localStorage.getItem('munafa_api_configs');
        if (localData) {
             const parsed = JSON.parse(localData);
             setConfigs(prev => {
                 const newConfigs = { ...prev };
                 // Only overwrite if not already loaded from DB or if DB is empty for that key
                 Object.keys(parsed).forEach(key => {
                     if (!newConfigs[key] || !newConfigs[key].is_active) {
                         newConfigs[key] = parsed[key];
                     }
                 });
                 return newConfigs;
             });
        }

        setLoading(false);
  };

  // Initial Load & OAuth Code Check
  useEffect(() => {
    const init = async () => {
        await loadConfigs();

        // Check for OAuth Code in URL
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const shop = params.get('shop');
        
        if (code && shop) {
            const storedCreds = localStorage.getItem('shopify_oauth_temp');
            if (storedCreds) {
                const { clientId, clientSecret } = JSON.parse(storedCreds);
                await handleTokenExchange(shop, code, clientId, clientSecret);
                // Clean URL
                window.history.replaceState({}, document.title, window.location.pathname);
                localStorage.removeItem('shopify_oauth_temp');
            }
        }
    };
    init();
  }, []);

  const handleTokenExchange = async (shop: string, code: string, clientId: string, clientSecret: string) => {
      setIsExchangingToken(true);
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
              throw new Error(JSON.stringify(data));
          }
      } catch (error) {
          console.error("OAuth Exchange Failed", error);
          setDbError("OAuth Failed: Could not exchange token. Check Client Secret.");
          setConnectionStatus(prev => ({ ...prev, 'Shopify': 'failed' }));
      } finally {
          setIsExchangingToken(false);
      }
  };

  const startOAuthFlow = () => {
      let shopUrl = configs['Shopify'].base_url.replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (shopUrl.indexOf('.') === -1 && shopUrl.length > 0) shopUrl += '.myshopify.com';

      if (!shopUrl || !oauthCreds.clientId || !oauthCreds.clientSecret) {
          alert("Please enter Store URL, Client ID, and Client Secret");
          return;
      }

      localStorage.setItem('shopify_oauth_temp', JSON.stringify(oauthCreds));

      const scopes = 'read_orders,read_products,read_customers';
      const nonce = Math.random().toString(36).substring(7);
      const authUrl = `https://${shopUrl}/admin/oauth/authorize?client_id=${oauthCreds.clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${nonce}`;
      
      window.open(authUrl, '_blank');
  };

  const handleInputChange = (courier: string, field: 'api_token' | 'base_url', value: string) => {
    setConfigs(prev => ({
        ...prev,
        [courier]: { ...prev[courier], [field]: value }
    }));
  };

  // Unified Save Function (DB + LocalStorage)
  const saveConfig = async (courier: string, configOverride?: IntegrationConfig) => {
    setDbError(null);
    const config = configOverride || configs[courier];
    
    // 1. Update Local State & Storage
    const updatedConfig = { ...config, is_active: true };
    setConfigs(prev => {
        const next = { ...prev, [courier]: updatedConfig };
        localStorage.setItem('munafa_api_configs', JSON.stringify(next));
        return next;
    });

    // 2. Try DB Save
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        // IMPORTANT: Destructure to remove 'id' if it's empty/invalid string.
        // If 'id' is empty string, Postgres will throw "invalid input syntax for type uuid"
        const { id, ...rest } = updatedConfig;
        
        const payload = {
            user_id: user.id,
            courier: courier,
            api_token: rest.api_token,
            base_url: rest.base_url,
            is_active: true
        };

        // Upsert based on unique constraint (user_id, courier)
        const { error } = await supabase
            .from('integration_configs')
            .upsert(payload, { onConflict: 'user_id, courier' }); 
        
        if (error) {
            console.error("Supabase Save Error:", error);
            setDbError(`Warning: Saved locally, but DB sync failed (${error.message})`);
            return false;
        }
    }

    // 3. Trigger App Refresh
    if (onConfigUpdate) onConfigUpdate();
    return true;
  };

  const handleConnect = async (courier: string, force = false) => {
    setTestingConnection(courier);
    setConnectionStatus(prev => ({ ...prev, [courier]: null }));
    setDbError(null);

    const config = configs[courier];
    let success = false;

    if (force) {
        success = await saveConfig(courier);
        if (!success && !dbError) {
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
                await saveConfig(courier);
            }
        } catch (e) {
            console.error("Test failed", e);
            success = false;
        }
    }

    setConnectionStatus(prev => ({ ...prev, [courier]: success ? 'success' : 'failed' }));
    setTestingConnection(null);
  };

  const Step = ({ num, text }: { num: number, text: string }) => (
    <div className="flex gap-4">
        <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
            {num}
        </div>
        <p className="text-sm text-slate-700 pt-1 leading-relaxed">{text}</p>
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Integrations</h2>
          <p className="text-slate-500 text-sm">Connect your Sales Channel (Shopify) and Couriers (PostEx) to see the full funnel.</p>
        </div>
        <button 
            onClick={() => window.location.reload()} 
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"
        >
            <RefreshCw size={14} /> Refresh Configs
        </button>
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
                {/* Auth Method Toggle */}
                <div className="flex p-1 bg-slate-100 rounded-lg">
                    <button 
                        onClick={() => setAuthMethod('oauth')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${authMethod === 'oauth' ? 'bg-white shadow-sm text-brand-600' : 'text-slate-500'}`}
                    >
                        OAuth (Partner App)
                    </button>
                    <button 
                        onClick={() => setAuthMethod('token')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${authMethod === 'token' ? 'bg-white shadow-sm text-brand-600' : 'text-slate-500'}`}
                    >
                        Access Token (Manual)
                    </button>
                </div>

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

                {authMethod === 'token' ? (
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-sm font-medium text-slate-700">Admin Access Token</label>
                            <button 
                                onClick={() => setShowShopifyGuide(true)}
                                className="text-xs text-brand-600 font-medium hover:underline flex items-center gap-1"
                            >
                                <HelpCircle size={12} /> How do I get this?
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
                    </div>
                ) : (
                    <div className="space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-100">
                        {/* WARNING BOX FOR WHITELISTING */}
                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs">
                            <div className="flex items-center gap-2 font-bold text-yellow-800 mb-1">
                                <AlertTriangle size={14} />
                                <span>Config Required</span>
                            </div>
                            <p className="text-yellow-700 mb-2">
                                To avoid "invalid_request", add this exact URL to <strong>Allowed redirection URL(s)</strong> in Partner Dashboard -> App Setup.
                            </p>
                            <div className="relative">
                                <code className="block w-full bg-white border border-yellow-300 p-2 rounded text-slate-600 font-mono break-all pr-8">
                                    {redirectUri}
                                </code>
                                <button 
                                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                                    onClick={() => navigator.clipboard.writeText(redirectUri)}
                                    title="Copy URL"
                                >
                                    <Copy size={14} />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Client ID (API Key)</label>
                            <input 
                                type="text"
                                className="w-full px-3 py-1.5 border rounded text-sm font-mono"
                                value={oauthCreds.clientId}
                                onChange={e => setOauthCreds({...oauthCreds, clientId: e.target.value})}
                                placeholder="From Partner Dashboard"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Client Secret</label>
                            <input 
                                type="password"
                                className="w-full px-3 py-1.5 border rounded text-sm font-mono"
                                value={oauthCreds.clientSecret}
                                onChange={e => setOauthCreds({...oauthCreds, clientSecret: e.target.value})}
                                placeholder="Start with shpss_..."
                            />
                        </div>
                        
                        {isExchangingToken ? (
                            <div className="flex items-center justify-center gap-2 text-brand-600 text-sm py-2">
                                <Loader2 className="animate-spin" size={16} /> Connecting...
                            </div>
                        ) : configs['Shopify'].api_token && configs['Shopify'].is_active ? (
                            <div className="text-center py-2">
                                <span className="text-xs font-bold text-green-600 flex items-center justify-center gap-1">
                                    <CheckCircle2 size={14} /> Token Generated Successfully
                                </span>
                            </div>
                        ) : (
                            <button 
                                onClick={startOAuthFlow}
                                className="w-full bg-slate-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                            >
                                <ExternalLink size={16} /> Connect via Shopify
                            </button>
                        )}
                        <p className="text-[10px] text-slate-400 text-center leading-tight">
                            Note: Opens in a <strong>new tab</strong>.
                        </p>
                    </div>
                )}

                {connectionStatus['Shopify'] === 'failed' && (
                    <div className="flex flex-col gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-xs">
                        <div className="flex items-center gap-2">
                            <AlertTriangle size={16} />
                            <span>Connection Failed. Check credentials.</span>
                        </div>
                        {dbError && <p className="ml-6 text-[10px]">{dbError}</p>}
                    </div>
                )}
                {connectionStatus['Shopify'] === 'success' && (
                    <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg text-xs">
                        <CheckCircle2 size={16} />
                        <span>Successfully authenticated with Shopify!</span>
                    </div>
                )}
            </div>

            {authMethod === 'token' && (
                <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end gap-2">
                    <button 
                        onClick={() => handleConnect('Shopify')}
                        disabled={testingConnection === 'Shopify'}
                        className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-all text-sm font-medium disabled:opacity-50"
                    >
                        {testingConnection === 'Shopify' ? 'Verifying...' : <><Plug size={16} /> Connect Shopify</>}
                    </button>
                </div>
            )}
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
                          <h3 className="text-xl font-bold text-slate-900">Get Shopify Access Token</h3>
                          <p className="text-sm text-slate-500">Choose the method that works for your store.</p>
                      </div>
                      <button onClick={() => setShowShopifyGuide(false)} className="text-slate-400 hover:text-slate-600 p-1">
                          <X size={24} />
                      </button>
                  </div>

                  {/* TABS */}
                  <div className="flex border-b border-slate-200">
                       <button 
                         onClick={() => setGuideTab('admin')}
                         className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${guideTab === 'admin' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                       >
                           <Store className="inline-block mr-2 mb-0.5" size={16} />
                           Via Store Admin
                       </button>
                       <button 
                         onClick={() => setGuideTab('partner')}
                         className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${guideTab === 'partner' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                       >
                           <LayoutDashboard className="inline-block mr-2 mb-0.5" size={16} />
                           Via Dev Dashboard
                       </button>
                  </div>
                  
                  <div className="p-6 space-y-6">
                      
                      {guideTab === 'admin' && (
                          <>
                             <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex gap-3">
                                <AlertTriangle className="text-indigo-600 shrink-0" size={20} />
                                <div>
                                    <p className="text-sm text-indigo-800 font-bold">Standard Method</p>
                                    <p className="text-xs text-indigo-700 mt-1">
                                        Use this if you can see the "Apps and sales channels" menu in your store settings. 
                                        If the "Allow custom app development" link is missing, check your user permissions or try the Dev Dashboard method.
                                    </p>
                                </div>
                             </div>

                             <div className="space-y-4">
                                <Step num={1} text="Go to Settings -> Apps and sales channels -> Develop apps." />
                                <Step num={2} text="Click 'Create an app' -> Name it 'MunafaBakhsh'." />
                                <Step num={3} text="Click 'Configure' Admin API integration." />
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
                                <Step num={4} text="Click Save -> Click 'Install app' (top right)." />
                                <Step num={5} text="Copy the 'Admin API access token' (starts with shpat_...)." />
                             </div>
                             
                             <div className="mt-2 text-center">
                                 <button onClick={() => setGuideTab('partner')} className="text-xs text-indigo-600 hover:underline">
                                     Can't find the button? Try the Dev Dashboard Method &rarr;
                                 </button>
                             </div>
                          </>
                      )}

                      {guideTab === 'partner' && (
                          <>
                             <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3">
                                <LayoutDashboard className="text-blue-600 shrink-0" size={20} />
                                <div>
                                    <p className="text-sm text-blue-800 font-bold">Alternative Method: Partner Dashboard</p>
                                    <p className="text-xs text-blue-700 mt-1">
                                        If the store admin hides the option, use the "Dev Dashboard" (Partner Account) to generate the token externally.
                                    </p>
                                </div>
                             </div>

                             <div className="space-y-4">
                                <Step num={1} text="Click the black 'Build apps in Dev Dashboard' button (or go to partners.shopify.com)." />
                                <Step num={2} text="In the Partner Dashboard, go to Apps -> Create App." />
                                <Step num={3} text="Select 'Custom App' manually." />
                                <div className="pl-12">
                                    <p className="text-xs text-red-500 font-bold mb-1">Important: Do NOT select Public App.</p>
                                    <p className="text-xs text-slate-500">
                                        You will be asked to select the store (`Huntly`) to install it on.
                                    </p>
                                </div>
                                <Step num={4} text="In the app overview, click 'Configure' Admin API integration." />
                                <Step num={5} text="Select scopes: `read_orders`, `read_products`, `read_customers` and click Save." />
                                <Step num={6} text="Click 'Install App' (top right)." />
                                <Step num={7} text="Reveal the 'Admin API access token' (starts with shpat_...)." />
                             </div>
                          </>
                      )}
                      
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

export default Integrations;