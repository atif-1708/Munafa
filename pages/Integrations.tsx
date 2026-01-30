
import React, { useState, useEffect } from 'react';
import { CourierName, CourierConfig, SalesChannel, MarketingConfig } from '../types';
import { PostExAdapter } from '../services/couriers/postex';
import { FacebookService } from '../services/facebook';
import { supabase } from '../services/supabase';
import { 
    CheckCircle2, AlertTriangle, Key, Globe, Loader2, Store, ArrowRight, 
    RefreshCw, ShieldCheck, Link, Truck, Package, Info, Lock, Settings, ExternalLink, Facebook, HelpCircle, ChevronDown, ChevronUp 
} from 'lucide-react';

// Helper to get Env Vars safely
const getEnv = (key: string) => {
    try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
            // @ts-ignore
            return import.meta.env[key];
        }
    } catch (e) {}
    return '';
};

// UI Metadata for Couriers
const COURIER_META: Record<string, { color: string, bg: string, border: string, icon: string, label: string, desc: string }> = {
    [CourierName.POSTEX]: { 
        color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', icon: 'PX', label: 'PostEx',
        desc: 'Syncs financial remittances and real-time delivery statuses.'
    },
    [CourierName.TRAX]: { 
        color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', icon: 'TX', label: 'Trax',
        desc: 'Logistics & COD management integration.'
    },
    [CourierName.LEOPARDS]: { 
        color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: 'LP', label: 'Leopards',
        desc: 'Nationwide tracking and COD reconciliation.'
    },
    [CourierName.TCS]: { 
        color: 'text-red-900', bg: 'bg-red-100', border: 'border-red-300', icon: 'TCS', label: 'TCS',
        desc: 'Pakistan’s largest courier network integration.'
    },
    [CourierName.MNP]: { 
        color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: 'M&P', label: 'M&P',
        desc: 'Muller & Phipps logistics integration.'
    },
    [CourierName.CALLCOURIER]: { 
        color: 'text-cyan-700', bg: 'bg-cyan-50', border: 'border-cyan-200', icon: 'CC', label: 'CallCourier',
        desc: 'Cost-effective COD solutions.'
    },
};

interface IntegrationsProps {
    onConfigUpdate?: () => void;
}

const Integrations: React.FC<IntegrationsProps> = ({ onConfigUpdate }) => {
  // 1. Separate State for Sales Channels
  const [shopifyConfig, setShopifyConfig] = useState<SalesChannel>({
      id: '', platform: 'Shopify', store_url: '', access_token: '', is_active: false
  });

  // 2. Separate State for Couriers
  const [courierConfigs, setCourierConfigs] = useState<Record<string, CourierConfig>>(() => {
    const initial: Record<string, CourierConfig> = {};
    Object.values(CourierName).forEach(name => {
        initial[name] = { id: '', courier_id: name, api_token: '', is_active: false };
    });
    return initial;
  });

  // 3. Separate State for Marketing
  const [fbConfig, setFbConfig] = useState<MarketingConfig>({
      id: '', platform: 'Facebook', access_token: '', is_active: false
  });
  const [fbManualToken, setFbManualToken] = useState('');
  const [availableAdAccounts, setAvailableAdAccounts] = useState<{id: string, name: string}[]>([]);
  const [isVerifyingFb, setIsVerifyingFb] = useState(false);
  const [showFbGuide, setShowFbGuide] = useState(false);

  const [loading, setLoading] = useState(true);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  
  // Default to OAuth for "Automatic Integration" experience
  const [connectMethod, setConnectMethod] = useState<'oauth' | 'manual'>('oauth');
  
  // OAuth Configuration (Platform Level)
  const ENV_CLIENT_ID = getEnv('VITE_SHOPIFY_API_KEY');
  const ENV_CLIENT_SECRET = getEnv('VITE_SHOPIFY_API_SECRET');
  const isPlatformConfigured = !!ENV_CLIENT_ID && !!ENV_CLIENT_SECRET;

  const [isExchangingToken, setIsExchangingToken] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const redirectUri = typeof window !== 'undefined' ? (window.location.origin + window.location.pathname) : '';

  // Load Configs Helper
  const loadConfigs = async () => {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
            // A. Fetch Sales Channels
            const { data: salesData } = await supabase.from('sales_channels').select('*').eq('user_id', session.user.id).eq('platform', 'Shopify').single();
            if (salesData) setShopifyConfig(salesData);

            // B. Fetch Couriers
            const { data: courierData } = await supabase.from('integration_configs').select('*').eq('user_id', session.user.id);
            if (courierData) {
                setCourierConfigs(prev => {
                    const newConfigs = { ...prev };
                    courierData.forEach((conf: any) => {
                        const cName = conf.provider_id as string;
                        if (newConfigs[cName]) {
                            newConfigs[cName] = { 
                                ...newConfigs[cName], 
                                id: conf.id,
                                api_token: conf.api_token,
                                is_active: conf.is_active,
                                courier_id: cName
                            };
                        }
                    });
                    return newConfigs;
                });
            }

            // C. Fetch Marketing
            const { data: marketingData } = await supabase.from('marketing_configs').select('*').eq('user_id', session.user.id).eq('platform', 'Facebook').single();
            if (marketingData) {
                setFbConfig(marketingData);
                // If active, fetch ad accounts for dropdown
                if(marketingData.access_token) {
                    const svc = new FacebookService();
                    svc.getAdAccounts(marketingData.access_token).then(setAvailableAdAccounts).catch(console.error);
                }
            }
        } 
        setLoading(false);
  };

  useEffect(() => {
    const init = async () => {
        await loadConfigs();
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const shop = params.get('shop');
        
        // Handle Shopify OAuth Return
        if (code && shop && isPlatformConfigured) {
            await handleTokenExchange(shop, code, ENV_CLIENT_ID, ENV_CLIENT_SECRET);
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

          if (!response.ok) {
              const text = await response.text();
              throw new Error(`Shopify Error: ${text}`);
          }

          const data = await response.json();
          if (data.access_token) {
              const updatedConfig: SalesChannel = {
                  ...shopifyConfig,
                  store_url: shop,
                  access_token: data.access_token,
                  scope: data.scope,
                  is_active: true,
                  platform: 'Shopify'
              };
              setShopifyConfig(updatedConfig);
              await saveSalesChannel(updatedConfig);
          } else {
              throw new Error("Invalid response from Shopify. Token missing.");
          }
      } catch (error: any) {
          console.error("OAuth Exchange Failed", error);
          setErrorMessage(`Connection failed: ${error.message || 'Unknown error'}`);
      } finally {
          setIsExchangingToken(false);
      }
  };

  const startOAuthFlow = () => {
      if (!isPlatformConfigured) {
          alert("Platform Configuration Missing. Please contact support.");
          return;
      }
      let shopUrl = shopifyConfig.store_url?.trim() || '';
      shopUrl = shopUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (shopUrl.includes('/')) shopUrl = shopUrl.split('/')[0];
      if (shopUrl.indexOf('.') === -1 && shopUrl.length > 0) shopUrl += '.myshopify.com';

      if (!shopUrl) {
          setErrorMessage("Please enter your Store URL (e.g. store.myshopify.com)");
          return;
      }

      const scopes = 'read_orders,read_products,read_customers';
      const nonce = Math.random().toString(36).substring(7);
      const authUrl = `https://${shopUrl}/admin/oauth/authorize?client_id=${ENV_CLIENT_ID}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${nonce}`;
      window.location.href = authUrl; 
  };

  const handleManualConnect = async () => {
      if (!shopifyConfig.store_url || !shopifyConfig.access_token) {
          setErrorMessage("Please enter both Store URL and Access Token");
          return;
      }
      let shopUrl = shopifyConfig.store_url.trim();
      shopUrl = shopUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (shopUrl.indexOf('.') === -1 && shopUrl.length > 0) shopUrl += '.myshopify.com';
      const token = shopifyConfig.access_token.trim();

      const updatedConfig: SalesChannel = {
          ...shopifyConfig,
          store_url: shopUrl,
          access_token: token,
          is_active: true,
          platform: 'Shopify'
      };
      
      setShopifyConfig(updatedConfig);
      await saveSalesChannel(updatedConfig);
  };

  const handleCourierInputChange = (courierId: string, value: string) => {
    setCourierConfigs(prev => ({
        ...prev,
        [courierId]: { ...prev[courierId], api_token: value }
    }));
  };

  const saveSalesChannel = async (config: SalesChannel) => {
      setErrorMessage(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const payload = {
          user_id: session.user.id,
          platform: config.platform,
          store_url: config.store_url,
          access_token: config.access_token,
          scope: config.scope,
          is_active: config.is_active
      };
      
      const { error } = await supabase.from('sales_channels').upsert(payload, { onConflict: 'user_id, platform' });
      if (error) {
          setErrorMessage("Database Save Failed: " + error.message);
      } else {
          if (onConfigUpdate) onConfigUpdate();
      }
  };

  const saveCourierConfig = async (courierId: string, isActive: boolean) => {
    setErrorMessage(null);
    const config = courierConfigs[courierId];
    setCourierConfigs(prev => ({ ...prev, [courierId]: { ...config, is_active: isActive } }));

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
            const payload = {
                user_id: session.user.id,
                provider_id: courierId,
                api_token: config.api_token,
                is_active: isActive
            };
            const { error } = await supabase.from('integration_configs').upsert(payload, { onConflict: 'user_id, provider_id' }); 
            if (error) {
                setErrorMessage("Failed to save to database. " + error.message);
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

  const handleDisconnectShopify = async () => {
    if (!window.confirm("Disconnect Shopify? Orders will stop syncing.")) return;
    const disconnected: SalesChannel = { ...shopifyConfig, access_token: '', is_active: false };
    setShopifyConfig(disconnected);
    await saveSalesChannel(disconnected);
  };
  
  const handleConnectCourier = async (courierName: string) => {
    setTestingConnection(courierName);
    setErrorMessage(null);
    const config = courierConfigs[courierName];
    
    if (!config.api_token || config.api_token.length < 3) {
        setErrorMessage(`Please enter a valid API Token for ${courierName}.`);
        setTestingConnection(null);
        return;
    }

    if (courierName === CourierName.POSTEX) {
        const adapter = new PostExAdapter();
        const tempConfig = { id: '', provider_id: courierName, api_token: config.api_token, is_active: true };
        const success = await adapter.testConnection(tempConfig);
        if (!success && !window.confirm("Connection check failed (likely CORS or Invalid Key). Force save anyway?")) {
             setTestingConnection(null);
             return;
        }
    } else {
        await new Promise(r => setTimeout(r, 500));
    }

    await saveCourierConfig(courierName, true);
    setTestingConnection(null);
  };

  // --- Facebook Integration Handlers (Real) ---

  const handleVerifyFbToken = async () => {
      if (!fbManualToken || fbManualToken.length < 10) {
          setErrorMessage("Please enter a valid Facebook Access Token.");
          return;
      }

      setIsVerifyingFb(true);
      setErrorMessage(null);

      try {
          const svc = new FacebookService();
          const accounts = await svc.getAdAccounts(fbManualToken);
          
          if (accounts.length === 0) {
              setErrorMessage("Token valid, but no Ad Accounts found. Check permissions.");
          } else {
              setAvailableAdAccounts(accounts);
              setFbConfig(prev => ({ 
                  ...prev, 
                  access_token: fbManualToken, 
                  platform: 'Facebook',
                  is_active: false // Not active until saved
              }));
          }
      } catch (e: any) {
          console.error(e);
          setErrorMessage("Failed to verify token: " + (e.message || "Unknown Error"));
      } finally {
          setIsVerifyingFb(false);
      }
  };

  const handleSaveFbConfig = async () => {
      if (!fbConfig.ad_account_id) {
          setErrorMessage("Please select an Ad Account to track.");
          return;
      }
      
      setIsVerifyingFb(true);
      const newConfig: MarketingConfig = {
          ...fbConfig,
          is_active: true
      };
      
      setFbConfig(newConfig);
      
      const { data: { session } } = await supabase.auth.getSession();
      if(session?.user) {
         await supabase.from('marketing_configs').upsert({
             user_id: session.user.id,
             platform: 'Facebook',
             access_token: newConfig.access_token,
             ad_account_id: newConfig.ad_account_id,
             is_active: true
         }, { onConflict: 'user_id, platform' });
      }

      setIsVerifyingFb(false);
      if(onConfigUpdate) onConfigUpdate();
  };

  const disconnectFacebook = async () => {
      if(!window.confirm("Disconnect Facebook? Ad tracking will stop.")) return;
      
      setFbConfig({ id: '', platform: 'Facebook', access_token: '', is_active: false, ad_account_id: '' });
      setFbManualToken('');
      setAvailableAdAccounts([]);
      const { data: { session } } = await supabase.auth.getSession();
      if(session?.user) {
         await supabase.from('marketing_configs').delete().eq('user_id', session.user.id).eq('platform', 'Facebook');
      }
      if(onConfigUpdate) onConfigUpdate();
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      <div className="flex justify-between items-center pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Platform Integrations</h2>
          <p className="text-slate-500 mt-1">Connect your sales channels and logistics partners.</p>
        </div>
        <button onClick={() => window.location.reload()} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors">
            <RefreshCw size={14} /> Refresh Status
        </button>
      </div>

      {errorMessage && (
           <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex gap-3 text-sm text-red-800 animate-in fade-in slide-in-from-top-2">
               <AlertTriangle className="shrink-0 text-red-600" size={20} />
               <div>{errorMessage}</div>
           </div>
      )}

      {/* 1. SALES CHANNELS */}
      <section>
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Store className="text-slate-500" size={20} /> Sales Channels
          </h3>
          <div className={`
              relative overflow-hidden rounded-2xl border transition-all duration-300 max-w-2xl
              ${shopifyConfig.is_active ? 'bg-green-100/30 border-green-200 shadow-sm' : 'bg-white border-slate-200 shadow-md hover:shadow-lg'}
          `}>
               <div className="p-8">
                  <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-4">
                          <div className="w-14 h-14 bg-[#95BF47] rounded-xl flex items-center justify-center text-white shadow-sm">
                              <Store size={28} />
                          </div>
                          <div>
                              <h3 className="font-bold text-xl text-slate-900">Shopify Store</h3>
                              <p className="text-sm text-slate-500">Import Orders, Products & Customer Data</p>
                          </div>
                      </div>
                      {shopifyConfig.is_active && (
                          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold flex items-center gap-1">
                              <CheckCircle2 size={14} /> Connected
                          </span>
                      )}
                  </div>

                  {shopifyConfig.is_active ? (
                       <div className="space-y-6">
                           <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-green-100 shadow-sm">
                               <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                                   <Globe size={20} />
                               </div>
                               <div className="flex-1 min-w-0">
                                   <p className="text-xs text-slate-500 font-bold uppercase">Connected URL</p>
                                   <p className="text-sm font-medium text-slate-900 truncate" title={shopifyConfig.store_url}>
                                       {shopifyConfig.store_url}
                                   </p>
                               </div>
                               <CheckCircle2 size={20} className="text-green-500" />
                           </div>
                           <button onClick={handleDisconnectShopify} className="text-sm text-red-600 hover:text-red-700 hover:underline">
                               Disconnect Store
                           </button>
                       </div>
                  ) : (
                      <div className="space-y-4">
                          {/* Connection Method Tabs */}
                          <div className="flex bg-slate-100 p-1 rounded-lg mb-6">
                              <button 
                                onClick={() => setConnectMethod('oauth')} 
                                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${connectMethod === 'oauth' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                              >
                                Auto Connect (Recommended)
                              </button>
                              <button 
                                onClick={() => setConnectMethod('manual')} 
                                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${connectMethod === 'manual' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                              >
                                Manual API Token
                              </button>
                          </div>

                          {connectMethod === 'oauth' ? (
                              <>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Store URL</label>
                                    <div className="relative group">
                                        <Globe className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-green-600 transition-colors" size={18} />
                                        <input 
                                            type="text"
                                            placeholder="your-brand.myshopify.com"
                                            className="w-full pl-11 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                                            value={shopifyConfig.store_url || ''}
                                            onChange={(e) => setShopifyConfig({...shopifyConfig, store_url: e.target.value})}
                                            onKeyDown={(e) => e.key === 'Enter' && startOAuthFlow()}
                                        />
                                    </div>
                                </div>
                                <button 
                                    onClick={startOAuthFlow}
                                    disabled={!shopifyConfig.store_url || !isPlatformConfigured}
                                    className="w-full bg-slate-900 text-white py-3.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    Connect Shopify <ArrowRight size={16} />
                                </button>
                              </>
                          ) : (
                              <>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Store URL</label>
                                    <input 
                                        type="text"
                                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 outline-none"
                                        value={shopifyConfig.store_url || ''}
                                        onChange={(e) => setShopifyConfig({...shopifyConfig, store_url: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Access Token</label>
                                    <input 
                                        type="password"
                                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 outline-none"
                                        value={shopifyConfig.access_token || ''}
                                        onChange={(e) => setShopifyConfig({...shopifyConfig, access_token: e.target.value})}
                                    />
                                </div>
                                <button 
                                    onClick={handleManualConnect}
                                    disabled={!shopifyConfig.store_url || !shopifyConfig.access_token}
                                    className="w-full bg-slate-900 text-white py-3.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    Save Connection <ArrowRight size={16} />
                                </button>
                              </>
                          )}
                      </div>
                  )}
              </div>
          </div>
      </section>

      {/* 2. MARKETING */}
      <section>
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 mt-8">
              <Facebook className="text-blue-600" size={20} /> Marketing Integrations
          </h3>
           <div className={`
              relative overflow-hidden rounded-2xl border transition-all duration-300 max-w-2xl
              ${fbConfig.is_active ? 'bg-blue-50/50 border-blue-200 shadow-sm' : 'bg-white border-slate-200 shadow-md hover:shadow-lg'}
          `}>
               <div className="p-8">
                  <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-4">
                          <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-sm">
                              <Facebook size={28} />
                          </div>
                          <div>
                              <h3 className="font-bold text-xl text-slate-900">Facebook Ads</h3>
                              <p className="text-sm text-slate-500">Auto-sync campaign spend & calculate ROAS</p>
                          </div>
                      </div>
                      {fbConfig.is_active && (
                          <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold flex items-center gap-1">
                              <CheckCircle2 size={14} /> Connected
                          </span>
                      )}
                  </div>

                  {fbConfig.is_active ? (
                       <div className="space-y-6">
                           <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-blue-100 shadow-sm">
                               <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                   <Settings size={20} />
                               </div>
                               <div className="flex-1 min-w-0">
                                   <label className="text-xs text-slate-500 font-bold uppercase mb-1 block">Connected Account</label>
                                   <p className="text-sm font-bold text-slate-900">{fbConfig.ad_account_id}</p>
                                   <p className="text-xs text-slate-400 mt-1 truncate">Token: {fbConfig.access_token?.substring(0,10)}...</p>
                               </div>
                           </div>
                           <button onClick={disconnectFacebook} className="text-sm text-red-600 hover:text-red-700 hover:underline">
                               Disconnect Facebook
                           </button>
                       </div>
                  ) : (
                       <div className="space-y-4">
                           <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800 flex gap-2">
                               <Info className="shrink-0 text-blue-600" size={18} />
                               <div>
                                   <p className="mb-1">
                                       Use a <strong>System User Access Token</strong> (recommended) or Graph API token with <code>ads_read</code> and <code>read_insights</code> permissions.
                                   </p>
                                   <button 
                                        onClick={() => setShowFbGuide(!showFbGuide)}
                                        className="text-xs font-bold text-blue-600 underline flex items-center gap-1 mt-1"
                                   >
                                        How to get a permanent token? {showFbGuide ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                                   </button>
                               </div>
                           </div>
                           
                           {/* Step by Step Guide */}
                           {showFbGuide && (
                               <div className="bg-white border border-blue-100 rounded-lg p-4 text-xs space-y-2 animate-in fade-in slide-in-from-top-2">
                                   <p className="font-bold text-slate-700">Get a non-expiring System User Token:</p>
                                   <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                                       <li>Go to <a href="https://business.facebook.com/settings/system-users" target="_blank" className="text-blue-600 underline">Business Settings &gt; Users &gt; System Users</a>.</li>
                                       <li>Click <strong>Add</strong>, name it (e.g. "ProfitCalc"), set role to <strong>Admin</strong>.</li>
                                       <li>Click <strong>Add Assets</strong> and assign your Ad Account (Full Control).</li>
                                       <li>Click <strong>Generate New Token</strong>. Select your App.</li>
                                       <li>Check permissions: <code>ads_read</code> and <code>read_insights</code>.</li>
                                       <li>Click Generate and copy the token below.</li>
                                   </ol>
                               </div>
                           )}

                           {!availableAdAccounts.length ? (
                               <>
                                   <div>
                                       <label className="block text-sm font-bold text-slate-700 mb-2">Access Token</label>
                                       <div className="relative">
                                           <Key className="absolute left-4 top-3.5 text-slate-400" size={18} />
                                           <input 
                                               type="password"
                                               placeholder="EAAG..."
                                               className="w-full pl-11 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                               value={fbManualToken}
                                               onChange={(e) => setFbManualToken(e.target.value)}
                                           />
                                       </div>
                                   </div>
                                   <button 
                                        onClick={handleVerifyFbToken}
                                        disabled={isVerifyingFb || !fbManualToken}
                                        className="w-full bg-slate-900 text-white py-3.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {isVerifyingFb ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
                                        Verify & Fetch Accounts
                                    </button>
                               </>
                           ) : (
                               <>
                                   <div className="bg-green-50 text-green-700 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                                       <CheckCircle2 size={16} /> Token Verified
                                   </div>
                                   <div>
                                       <label className="block text-sm font-bold text-slate-700 mb-2">Select Ad Account</label>
                                       <select 
                                           className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                           value={fbConfig.ad_account_id || ''}
                                           onChange={(e) => setFbConfig({...fbConfig, ad_account_id: e.target.value})}
                                       >
                                           <option value="">-- Select Account --</option>
                                           {availableAdAccounts.map(acc => (
                                               <option key={acc.id} value={acc.id}>{acc.name} ({acc.id})</option>
                                           ))}
                                       </select>
                                   </div>
                                   <div className="flex gap-3">
                                       <button 
                                            onClick={() => { setAvailableAdAccounts([]); setFbConfig({...fbConfig, ad_account_id: ''}); }}
                                            className="flex-1 px-4 py-3 border border-slate-300 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50"
                                        >
                                            Back
                                        </button>
                                        <button 
                                            onClick={handleSaveFbConfig}
                                            disabled={isVerifyingFb || !fbConfig.ad_account_id}
                                            className="flex-2 w-full bg-[#1877F2] text-white py-3.5 rounded-xl text-sm font-bold hover:bg-[#166fe5] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {isVerifyingFb ? <Loader2 className="animate-spin" size={16} /> : <Facebook size={16} />}
                                            Save Configuration
                                        </button>
                                   </div>
                               </>
                           )}
                       </div>
                  )}
              </div>
           </div>
      </section>

      {/* 3. LOGISTICS PARTNERS */}
      <section>
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 mt-8">
            <Truck className="text-slate-500" size={20} /> Logistics Partners
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.values(CourierName).map((courierName) => {
                const config = courierConfigs[courierName];
                const meta = COURIER_META[courierName] || { 
                    color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200', icon: '??', label: courierName, desc: '' 
                };
                const isActive = config.is_active;

                return (
                    <div key={courierName} className={`
                        relative overflow-hidden rounded-xl border transition-all duration-300 flex flex-col
                        ${isActive ? `${meta.bg} ${meta.border} shadow-sm` : 'bg-white border-slate-200 shadow-sm hover:shadow-md'}
                    `}>
                        <div className="p-6 flex-1">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg shadow-sm bg-white ${meta.border} ${meta.color}`}>
                                        {meta.icon}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900">{meta.label}</h4>
                                        <span className="text-xs text-slate-500">Courier Integration</span>
                                    </div>
                                </div>
                                {isActive && (
                                    <span className="bg-white/50 p-1 rounded-full text-green-600">
                                        <CheckCircle2 size={18} />
                                    </span>
                                )}
                            </div>
                            
                            <p className="text-xs text-slate-500 mb-6 h-8 leading-relaxed line-clamp-2">
                                {meta.desc}
                            </p>

                            {isActive ? (
                                <div>
                                    <div className="p-3 bg-white/60 rounded-lg border border-white mb-4">
                                        <div className="flex items-center gap-2 text-xs text-slate-600 mb-1">
                                            <Key size={12} /> API Configured
                                        </div>
                                        <div className="text-xs font-mono text-slate-400 truncate">
                                            ••••••••••••••••
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => saveCourierConfig(courierName, false)} // Disconnect
                                        className="w-full py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                                    >
                                        Disconnect
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">API Token / Key</label>
                                        <input 
                                            type="password"
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none transition-all"
                                            placeholder={`Enter ${meta.label} Key`}
                                            value={config.api_token}
                                            onChange={(e) => handleCourierInputChange(courierName, e.target.value)}
                                        />
                                    </div>
                                    <button 
                                        onClick={() => handleConnectCourier(courierName)}
                                        disabled={testingConnection === courierName || !config.api_token}
                                        className={`w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                                            testingConnection === courierName 
                                                ? 'bg-slate-100 text-slate-400 cursor-wait'
                                                : 'bg-slate-900 text-white hover:bg-slate-800'
                                        }`}
                                    >
                                        {testingConnection === courierName ? (
                                            <><Loader2 className="animate-spin" size={14} /> Verifying...</>
                                        ) : (
                                            'Connect Account'
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
      </section>
    </div>
  );
};

export default Integrations;
