
import React, { useState, useEffect } from 'react';
import { CourierName, CourierConfig, SalesChannel, MarketingConfig } from '../types';
import { PostExAdapter } from '../services/couriers/postex';
import { ShopifyAdapter } from '../services/shopify';
import { FacebookService } from '../services/facebook';
import { supabase } from '../services/supabase';
import { 
    CheckCircle2, AlertTriangle, Key, Globe, Loader2, Store, ArrowRight, 
    RefreshCw, ShieldCheck, Link, Truck, Info, Settings, Facebook, ChevronDown, ChevronUp, Lock, HelpCircle, Hash 
} from 'lucide-react';

// ... (Existing Courier Meta and Interfaces kept same, only updating Logic)
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
      id: '', platform: 'Shopify', store_url: '', access_token: '', scope: '', is_active: false
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
  const [showShopifyGuide, setShowShopifyGuide] = useState(false);

  const [loading, setLoading] = useState(true);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSavingShopify, setIsSavingShopify] = useState(false);

  // Load Configs Helper
  const loadConfigs = async () => {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
            // A. Fetch Sales Channels
            const { data: salesData } = await supabase.from('sales_channels')
                .select('*')
                .eq('user_id', session.user.id)
                .eq('platform', 'Shopify')
                .limit(1);
            
            if (salesData && salesData.length > 0) {
                const data = salesData[0];
                setShopifyConfig({
                    id: data.id,
                    platform: data.platform,
                    store_url: data.store_url,
                    access_token: data.access_token,
                    scope: data.scope || '',
                    is_active: data.is_active
                });
            }

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
            const { data: marketingData } = await supabase.from('marketing_configs')
                .select('*')
                .eq('user_id', session.user.id)
                .eq('platform', 'Facebook')
                .limit(1);

            if (marketingData && marketingData.length > 0) {
                const mData = marketingData[0];
                setFbConfig(mData);
                if(mData.access_token) {
                    const svc = new FacebookService();
                    svc.getAdAccounts(mData.access_token).then(setAvailableAdAccounts).catch(console.error);
                }
            }
        } 
        setLoading(false);
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  const handleTestShopify = async () => {
      setErrorMessage(null);
      setTestingConnection('Shopify');
      
      const token = shopifyConfig.access_token.trim();
      const url = shopifyConfig.store_url.trim();

      if (!url.includes('.')) {
          setErrorMessage("Invalid URL. Please enter your myshopify domain (e.g. mystore.myshopify.com).");
          setTestingConnection(null);
          return;
      }
      
      if (token.length < 10) {
          setErrorMessage("Invalid Token. The Access Token seems too short.");
          setTestingConnection(null);
          return;
      }

      try {
          const adapter = new ShopifyAdapter();
          const tempConfig = { ...shopifyConfig, store_url: url, access_token: token };
          const result = await adapter.testConnection(tempConfig);
          
          if (result.success) {
              await handleManualConnect(true); 
          } else {
              setErrorMessage(`Connection Failed: ${result.message}`);
          }
      } catch (e: any) {
          setErrorMessage("Connection Error: " + e.message);
      } finally {
          setTestingConnection(null);
      }
  };

  const handleManualConnect = async (verified: boolean = false) => {
      setErrorMessage(null);
      if (!shopifyConfig.store_url || !shopifyConfig.access_token) {
          setErrorMessage("Please enter Store URL and Access Token");
          return;
      }

      const updatedConfig: SalesChannel = {
          ...shopifyConfig,
          scope: 'read_orders,read_products,read_customers', 
          is_active: true,
          platform: 'Shopify'
      };
      
      const saved = await saveSalesChannel(updatedConfig);
      if (saved) {
          setShopifyConfig(updatedConfig);
      }
  };

  const handleCourierInputChange = (courierId: string, value: string) => {
    setCourierConfigs(prev => ({
        ...prev,
        [courierId]: { ...prev[courierId], api_token: value }
    }));
  };

  const saveSalesChannel = async (config: SalesChannel): Promise<boolean> => {
      setErrorMessage(null);
      setIsSavingShopify(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
          setErrorMessage("You must be logged in to save configurations.");
          setIsSavingShopify(false);
          return false;
      }

      const payload = {
          user_id: session.user.id,
          platform: config.platform,
          store_url: config.store_url,
          access_token: config.access_token,
          scope: config.scope,
          is_active: config.is_active
      };
      
      try {
          const { data: existing } = await supabase.from('sales_channels')
              .select('id')
              .eq('user_id', session.user.id)
              .eq('platform', config.platform)
              .limit(1);
          
          let error;

          if (existing && existing.length > 0) {
              const { error: updateError } = await supabase.from('sales_channels').update(payload).eq('id', existing[0].id);
              error = updateError;
          } else {
              const { error: insertError } = await supabase.from('sales_channels').insert(payload);
              error = insertError;
          }

          if (error) {
              console.error("Supabase Save Error:", error);
              setErrorMessage("Database Save Failed: " + error.message);
              setIsSavingShopify(false);
              return false;
          } else {
              if (onConfigUpdate) onConfigUpdate();
              setIsSavingShopify(false);
              return true;
          }
      } catch (e: any) {
          console.error("Save Exception:", e);
          setErrorMessage("Save Error: " + e.message);
          setIsSavingShopify(false);
          return false;
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

            const { data: existing } = await supabase.from('integration_configs')
                .select('id')
                .eq('user_id', session.user.id)
                .eq('provider_id', courierId)
                .limit(1);
            
            let error;
            if (existing && existing.length > 0) {
                const { error: uErr } = await supabase.from('integration_configs').update(payload).eq('id', existing[0].id);
                error = uErr;
            } else {
                const { error: iErr } = await supabase.from('integration_configs').insert(payload);
                error = iErr;
            }

            if (error) {
                setErrorMessage("Failed to save. " + error.message);
                return false;
            }
            return true;
        }
        return false;
    } catch (e: any) {
        setErrorMessage("Save Error: " + e.message);
        return false;
    } finally {
        if (onConfigUpdate) onConfigUpdate();
    }
  };

  const handleDisconnectShopify = async () => {
    if (!window.confirm("Disconnect Shopify? Orders will stop syncing.")) return;
    
    const disconnected: SalesChannel = { ...shopifyConfig, access_token: '', is_active: false };
    const saved = await saveSalesChannel(disconnected);
    if (saved) {
        setShopifyConfig(disconnected);
    }
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
        if (!success && !window.confirm("Connection check failed. Force save anyway?")) {
             setTestingConnection(null);
             return;
        }
    } else {
        await new Promise(r => setTimeout(r, 500));
    }

    await saveCourierConfig(courierName, true);
    setTestingConnection(null);
  };

  // ... (Facebook Logic kept mostly same, purely UI)
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
              setFbConfig(prev => ({ ...prev, access_token: fbManualToken, platform: 'Facebook', is_active: false }));
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
      const newConfig: MarketingConfig = { ...fbConfig, is_active: true };
      setFbConfig(newConfig);
      const { data: { session } } = await supabase.auth.getSession();
      if(session?.user) {
         const { data: existing } = await supabase.from('marketing_configs').select('id').eq('user_id', session.user.id).eq('platform', 'Facebook').limit(1);
         const payload = { user_id: session.user.id, platform: 'Facebook', access_token: newConfig.access_token, ad_account_id: newConfig.ad_account_id, is_active: true };
         if (existing && existing.length > 0) {
             await supabase.from('marketing_configs').update(payload).eq('id', existing[0].id);
         } else {
             await supabase.from('marketing_configs').insert(payload);
         }
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
                              <h3 className="font-bold text-xl text-slate-900">Shopify Integration</h3>
                              <p className="text-sm text-slate-500">Connect using Admin API Token</p>
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
                                   <p className="text-xs text-slate-500 font-bold uppercase">Connected Store</p>
                                   <p className="text-sm font-medium text-slate-900 truncate" title={shopifyConfig.store_url}>
                                       {shopifyConfig.store_url}
                                   </p>
                               </div>
                               <CheckCircle2 size={20} className="text-green-500" />
                           </div>
                           <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-500">
                               <p className="font-mono truncate">Token: ••••••••••••••••••••••{shopifyConfig.access_token.slice(-4)}</p>
                           </div>
                           <button onClick={handleDisconnectShopify} className="text-sm text-red-600 hover:text-red-700 hover:underline">
                               Disconnect Store
                           </button>
                       </div>
                  ) : (
                      <div className="space-y-6">
                           {/* Guide Section */}
                           <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                                <div className="flex items-start gap-3">
                                    <HelpCircle className="text-brand-600 mt-0.5 shrink-0" size={18} />
                                    <div>
                                        <p className="text-sm font-bold text-slate-800 mb-1">How to generate Credentials?</p>
                                        <button 
                                            onClick={() => setShowShopifyGuide(!showShopifyGuide)}
                                            className="text-xs font-bold text-brand-600 hover:text-brand-800 flex items-center gap-1 mt-1"
                                        >
                                            {showShopifyGuide ? 'Hide Instructions' : 'Show Guide'} 
                                            {showShopifyGuide ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                                        </button>
                                    </div>
                                </div>

                                {showShopifyGuide && (
                                    <div className="mt-4 pt-4 border-t border-slate-200 text-xs space-y-3 animate-in fade-in slide-in-from-top-2">
                                        <ol className="list-decimal pl-4 space-y-2 text-slate-600">
                                            <li>Go to Shopify Admin &gt; Settings &gt; Apps and sales channels &gt; Develop apps.</li>
                                            <li>Create app "ProfitCalc", click Configure Admin API scopes.</li>
                                            <li>Enable: <code>read_orders</code>, <code>read_products</code>, <code>read_customers</code>.</li>
                                            <li>Install app and copy the token starting with <code>shpat_</code>.</li>
                                        </ol>
                                    </div>
                                )}
                           </div>

                           <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">
                                        Store URL <span className="text-slate-400 font-normal">(.myshopify.com)</span>
                                    </label>
                                    <div className="relative">
                                        <Globe className="absolute left-4 top-3.5 text-slate-400" size={18} />
                                        <input 
                                            type="text"
                                            placeholder="e.g. mystore-123.myshopify.com"
                                            className="w-full pl-11 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-sm transition-all"
                                            value={shopifyConfig.store_url || ''}
                                            onChange={(e) => setShopifyConfig({...shopifyConfig, store_url: e.target.value})}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">
                                        Admin API Access Token <span className="text-slate-400 font-normal">(starts with shpat_)</span>
                                    </label>
                                    <div className="relative">
                                        <Key className="absolute left-4 top-3.5 text-slate-400" size={18} />
                                        <input 
                                            type="password"
                                            placeholder="shpat_..."
                                            className="w-full pl-11 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-sm transition-all"
                                            value={shopifyConfig.access_token || ''}
                                            onChange={(e) => setShopifyConfig({...shopifyConfig, access_token: e.target.value})}
                                        />
                                    </div>
                                </div>
                           </div>
                            
                            <div className="flex gap-3 pt-2">
                                <button 
                                    onClick={handleTestShopify}
                                    disabled={testingConnection === 'Shopify' || !shopifyConfig.store_url || !shopifyConfig.access_token}
                                    className="flex-1 bg-white border border-slate-300 text-slate-700 py-3 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {testingConnection === 'Shopify' ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
                                    Verify
                                </button>
                                <button 
                                    onClick={() => handleManualConnect(false)}
                                    disabled={!shopifyConfig.store_url || !shopifyConfig.access_token || isSavingShopify}
                                    className="flex-[2] bg-slate-900 text-white py-3 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isSavingShopify ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
                                    Save & Connect 
                                </button>
                            </div>
                      </div>
                  )}
              </div>
          </div>
      </section>

      {/* 2. MARKETING & 3. LOGISTICS SECTIONS REMAIN UNCHANGED IN UI STRUCTURE (Code omitted for brevity as logic didn't change deeply, just context) */}
      <section>
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 mt-8">
              <Facebook className="text-blue-600" size={20} /> Marketing Integrations
          </h3>
          {/* ... Same Facebook UI as before ... */}
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
                              <p className="text-sm text-slate-500">Auto-sync campaign spend</p>
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
                               </div>
                           </div>
                           <button onClick={disconnectFacebook} className="text-sm text-red-600 hover:text-red-700 hover:underline">
                               Disconnect Facebook
                           </button>
                       </div>
                  ) : (
                       <div className="space-y-4">
                           {!availableAdAccounts.length ? (
                               <>
                                   <div>
                                       <label className="block text-sm font-bold text-slate-700 mb-2">Access Token</label>
                                       <input 
                                           type="password"
                                           placeholder="EAAG..."
                                           className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                           value={fbManualToken}
                                           onChange={(e) => setFbManualToken(e.target.value)}
                                       />
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
                                       <button onClick={() => { setAvailableAdAccounts([]); setFbConfig({...fbConfig, ad_account_id: ''}); }} className="flex-1 px-4 py-3 border border-slate-300 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50">Back</button>
                                       <button onClick={handleSaveFbConfig} disabled={isVerifyingFb || !fbConfig.ad_account_id} className="flex-2 w-full bg-[#1877F2] text-white py-3.5 rounded-xl text-sm font-bold hover:bg-[#166fe5] transition-all flex items-center justify-center gap-2 disabled:opacity-50">Save Configuration</button>
                                   </div>
                               </>
                           )}
                       </div>
                  )}
              </div>
           </div>
      </section>

      {/* 3. Logistics Section (Visuals only, logic is generic) */}
      <section>
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 mt-8">
            <Truck className="text-slate-500" size={20} /> Logistics Partners
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.values(CourierName).map((courierName) => {
                const config = courierConfigs[courierName];
                const meta = COURIER_META[courierName];
                const isActive = config.is_active;
                return (
                    <div key={courierName} className={`relative overflow-hidden rounded-xl border transition-all duration-300 flex flex-col ${isActive ? `${meta.bg} ${meta.border} shadow-sm` : 'bg-white border-slate-200 shadow-sm hover:shadow-md'}`}>
                        <div className="p-6 flex-1">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg shadow-sm bg-white ${meta.border} ${meta.color}`}>{meta.icon}</div>
                                    <div><h4 className="font-bold text-slate-900">{meta.label}</h4></div>
                                </div>
                                {isActive && <span className="bg-white/50 p-1 rounded-full text-green-600"><CheckCircle2 size={18} /></span>}
                            </div>
                            {isActive ? (
                                <button onClick={() => saveCourierConfig(courierName, false)} className="w-full py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-red-50 hover:text-red-600 transition-colors">Disconnect</button>
                            ) : (
                                <div className="space-y-3">
                                    <input type="password" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="API Key" value={config.api_token} onChange={(e) => handleCourierInputChange(courierName, e.target.value)} />
                                    <button onClick={() => handleConnectCourier(courierName)} disabled={testingConnection === courierName} className="w-full py-2.5 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2">{testingConnection === courierName ? <Loader2 className="animate-spin" size={14}/> : 'Connect'}</button>
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
