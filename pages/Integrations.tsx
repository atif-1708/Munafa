
import React, { useState, useEffect } from 'react';
import { CourierName, CourierConfig, SalesChannel, MarketingConfig } from '../types';
import { PostExAdapter } from '../services/couriers/postex';
import { ShopifyAdapter } from '../services/shopify';
import { FacebookService } from '../services/facebook';
import { supabase } from '../services/supabase';
import { 
    CheckCircle2, AlertTriangle, Key, Globe, Loader2, Store, ArrowRight, 
    RefreshCw, ShieldCheck, Link, Truck, Info, Settings, Facebook, ChevronDown, ChevronUp, Lock, HelpCircle, Hash, ExternalLink 
} from 'lucide-react';

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
  const [shopifyConfig, setShopifyConfig] = useState<SalesChannel>({
      id: '', platform: 'Shopify', store_url: '', access_token: '', scope: '', is_active: false
  });
  const [courierConfigs, setCourierConfigs] = useState<Record<string, CourierConfig>>(() => {
    const initial: Record<string, CourierConfig> = {};
    Object.values(CourierName).forEach(name => {
        initial[name] = { id: '', courier_id: name, api_token: '', is_active: false };
    });
    return initial;
  });
  const [fbConfig, setFbConfig] = useState<MarketingConfig>({
      id: '', platform: 'Facebook', access_token: '', is_active: false
  });
  const [fbManualToken, setFbManualToken] = useState('');
  const [availableAdAccounts, setAvailableAdAccounts] = useState<{id: string, name: string}[]>([]);
  const [isVerifyingFb, setIsVerifyingFb] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSavingShopify, setIsSavingShopify] = useState(false);

  useEffect(() => {
    const loadConfigs = async () => {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
            const { data: salesData } = await supabase.from('sales_channels').select('*').eq('user_id', session.user.id).eq('platform', 'Shopify').limit(1);
            if (salesData && salesData.length > 0) setShopifyConfig({ ...salesData[0], scope: salesData[0].scope || '' });

            const { data: courierData } = await supabase.from('integration_configs').select('*').eq('user_id', session.user.id);
            if (courierData) {
                setCourierConfigs(prev => {
                    const newConfigs = { ...prev };
                    courierData.forEach((conf: any) => {
                        const cName = conf.provider_id as string;
                        if (newConfigs[cName]) newConfigs[cName] = { ...newConfigs[cName], id: conf.id, api_token: conf.api_token, is_active: conf.is_active, courier_id: cName };
                    });
                    return newConfigs;
                });
            }

            const { data: marketingData } = await supabase.from('marketing_configs').select('*').eq('user_id', session.user.id).eq('platform', 'Facebook').limit(1);
            if (marketingData && marketingData.length > 0) {
                setFbConfig(marketingData[0]);
                if(marketingData[0].access_token) {
                    new FacebookService().getAdAccounts(marketingData[0].access_token).then(setAvailableAdAccounts).catch(console.error);
                }
            }
        } 
        setLoading(false);
    };
    loadConfigs();
  }, []);

  const handleTestShopify = async () => {
      setErrorMessage(null);
      setTestingConnection('Shopify');
      
      const token = shopifyConfig.access_token.trim();
      let url = shopifyConfig.store_url.trim();
      if (!url.includes('.')) {
          setErrorMessage("Invalid URL. Format: yourstore.myshopify.com");
          setTestingConnection(null);
          return;
      }

      try {
          const adapter = new ShopifyAdapter();
          const result = await adapter.testConnection({ ...shopifyConfig, store_url: url, access_token: token });
          if (result.success) await handleManualConnect(); 
          else setErrorMessage(`Connection Failed: ${result.message}`);
      } catch (e: any) {
          setErrorMessage("Connection Error: " + e.message);
      } finally {
          setTestingConnection(null);
      }
  };

  const handleManualConnect = async () => {
      setErrorMessage(null);
      setIsSavingShopify(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
          setErrorMessage("You must be logged in.");
          setIsSavingShopify(false);
          return;
      }

      const payload = {
          user_id: session.user.id,
          platform: 'Shopify',
          store_url: shopifyConfig.store_url,
          access_token: shopifyConfig.access_token,
          scope: 'read_orders,read_products,read_customers',
          is_active: true
      };
      
      const { data: existing } = await supabase.from('sales_channels').select('id').eq('user_id', session.user.id).eq('platform', 'Shopify').limit(1);
      
      if (existing && existing.length > 0) {
          await supabase.from('sales_channels').update(payload).eq('id', existing[0].id);
      } else {
          await supabase.from('sales_channels').insert(payload);
      }
      
      setShopifyConfig({ ...shopifyConfig, is_active: true });
      if (onConfigUpdate) onConfigUpdate();
      setIsSavingShopify(false);
  };

  const handleDisconnectShopify = async () => {
      if (!window.confirm("Disconnect Shopify?")) return;
      setShopifyConfig({ ...shopifyConfig, access_token: '', is_active: false });
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
           await supabase.from('sales_channels').update({ is_active: false }).eq('user_id', session.user.id).eq('platform', 'Shopify');
      }
  };

  const openShopifyAdmin = () => {
      if(!shopifyConfig.store_url) return;
      let clean = shopifyConfig.store_url.replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (clean.includes('/')) clean = clean.split('/')[0];
      if (!clean.includes('.')) clean += '.myshopify.com';
      window.open(`https://${clean}/admin/settings/apps/development`, '_blank');
  };

  const saveCourierConfig = async (courierId: string, isActive: boolean) => {
    setErrorMessage(null);
    const config = courierConfigs[courierId];
    setCourierConfigs(prev => ({ ...prev, [courierId]: { ...config, is_active: isActive } }));
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
        const payload = { user_id: session.user.id, provider_id: courierId, api_token: config.api_token, is_active: isActive };
        const { data: existing } = await supabase.from('integration_configs').select('id').eq('user_id', session.user.id).eq('provider_id', courierId).limit(1);
        if (existing && existing.length > 0) await supabase.from('integration_configs').update(payload).eq('id', existing[0].id);
        else await supabase.from('integration_configs').insert(payload);
        if (onConfigUpdate) onConfigUpdate();
    }
  };

  const handleConnectCourier = async (courierName: string) => {
    setTestingConnection(courierName);
    if (courierName === CourierName.POSTEX) {
        const adapter = new PostExAdapter();
        const success = await adapter.testConnection({ ...courierConfigs[courierName], is_active: true } as any);
        if (!success && !window.confirm("Connection failed. Save anyway?")) { setTestingConnection(null); return; }
    }
    await saveCourierConfig(courierName, true);
    setTestingConnection(null);
  };

  const handleVerifyFbToken = async () => {
      setIsVerifyingFb(true);
      try {
          const accounts = await new FacebookService().getAdAccounts(fbManualToken);
          setAvailableAdAccounts(accounts);
          setFbConfig(prev => ({ ...prev, access_token: fbManualToken }));
      } catch (e: any) { setErrorMessage(e.message); }
      setIsVerifyingFb(false);
  };

  const handleSaveFbConfig = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if(session?.user && fbConfig.ad_account_id) {
         const payload = { user_id: session.user.id, platform: 'Facebook', access_token: fbConfig.access_token, ad_account_id: fbConfig.ad_account_id, is_active: true };
         const { data: existing } = await supabase.from('marketing_configs').select('id').eq('user_id', session.user.id).limit(1);
         if (existing && existing.length > 0) await supabase.from('marketing_configs').update(payload).eq('id', existing[0].id);
         else await supabase.from('marketing_configs').insert(payload);
         setFbConfig({ ...fbConfig, is_active: true });
         if(onConfigUpdate) onConfigUpdate();
      }
  };

  const disconnectFacebook = async () => {
      setFbConfig({ id: '', platform: 'Facebook', access_token: '', is_active: false });
      const { data: { session } } = await supabase.auth.getSession();
      if(session?.user) await supabase.from('marketing_configs').delete().eq('user_id', session.user.id);
  };

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

      {/* SHOPIFY SECTION */}
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
                              <p className="text-sm text-slate-500">Sync Orders, Customers & Products</p>
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
                               <Globe size={20} className="text-green-600" />
                               <div className="flex-1 min-w-0">
                                   <p className="text-xs text-slate-500 font-bold uppercase">Connected Store</p>
                                   <p className="text-sm font-medium text-slate-900 truncate">{shopifyConfig.store_url}</p>
                               </div>
                           </div>
                           <button onClick={handleDisconnectShopify} className="text-sm text-red-600 hover:text-red-700 hover:underline">
                               Disconnect Store
                           </button>
                       </div>
                  ) : (
                      <div className="space-y-6">
                           <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">
                                        1. Enter Store URL
                                    </label>
                                    <input 
                                        type="text"
                                        placeholder="your-store.myshopify.com"
                                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-sm"
                                        value={shopifyConfig.store_url || ''}
                                        onChange={(e) => setShopifyConfig({...shopifyConfig, store_url: e.target.value})}
                                    />
                                </div>

                                {shopifyConfig.store_url.length > 3 && (
                                    <div className="animate-in fade-in slide-in-from-top-2">
                                        <label className="block text-sm font-bold text-slate-700 mb-2">
                                            2. Get Access Token
                                        </label>
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 flex items-center justify-between">
                                            <div className="text-xs text-slate-600">
                                                Click to open Shopify Admin and create a token.
                                            </div>
                                            <button 
                                                onClick={openShopifyAdmin}
                                                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-700 flex items-center gap-2"
                                            >
                                                Open Admin <ExternalLink size={12}/>
                                            </button>
                                        </div>

                                        <label className="block text-sm font-bold text-slate-700 mb-2">
                                            3. Paste Token
                                        </label>
                                        <input 
                                            type="password"
                                            placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxx"
                                            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-sm"
                                            value={shopifyConfig.access_token || ''}
                                            onChange={(e) => setShopifyConfig({...shopifyConfig, access_token: e.target.value})}
                                        />
                                    </div>
                                )}
                           </div>
                            
                            <button 
                                onClick={handleTestShopify}
                                disabled={testingConnection === 'Shopify' || !shopifyConfig.store_url || !shopifyConfig.access_token}
                                className="w-full bg-[#95BF47] text-white py-3 rounded-xl text-sm font-bold hover:bg-[#86ad3e] transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
                            >
                                {testingConnection === 'Shopify' ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
                                Connect Store
                            </button>
                      </div>
                  )}
              </div>
          </div>
      </section>

      {/* COURIER SECTION (Keep Existing UI) */}
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
                                    <input type="password" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="API Key" value={config.api_token} onChange={(e) => setCourierConfigs(prev => ({ ...prev, [courierName]: { ...prev[courierName], api_token: e.target.value } }))} />
                                    <button onClick={() => handleConnectCourier(courierName)} disabled={testingConnection === courierName} className="w-full py-2.5 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2">{testingConnection === courierName ? <Loader2 className="animate-spin" size={14}/> : 'Connect'}</button>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
      </section>

      {/* MARKETING SECTION (Keep Existing UI) */}
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
    </div>
  );
};

export default Integrations;
