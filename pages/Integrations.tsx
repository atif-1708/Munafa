
import React, { useState, useEffect } from 'react';
import { CourierName, CourierConfig, SalesChannel, MarketingConfig } from '../types';
import { PostExAdapter } from '../services/couriers/postex';
import { ShopifyAdapter } from '../services/shopify';
import { FacebookService } from '../services/facebook';
import { TikTokService } from '../services/tiktok';
import { supabase } from '../services/supabase';
import { 
    CheckCircle2, AlertTriangle, Key, Globe, Loader2, Store, ArrowRight, 
    RefreshCw, ShieldCheck, Link, Truck, Info, Settings, Facebook, ExternalLink, Zap, Lock, Grid2X2
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

// Defined Order: PostEx First
const ORDERED_COURIERS = [
    CourierName.POSTEX,
    CourierName.TRAX,
    CourierName.LEOPARDS,
    CourierName.TCS,
    CourierName.MNP,
    CourierName.CALLCOURIER
];

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
  
  // Facebook State
  const [fbConfig, setFbConfig] = useState<MarketingConfig>({
      id: '', platform: 'Facebook', access_token: '', is_active: false
  });
  const [fbManualToken, setFbManualToken] = useState('');
  const [availableAdAccounts, setAvailableAdAccounts] = useState<{id: string, name: string}[]>([]);
  const [isVerifyingFb, setIsVerifyingFb] = useState(false);

  // TikTok State
  const [tiktokConfig, setTiktokConfig] = useState<MarketingConfig>({
    id: '', platform: 'TikTok', access_token: '', is_active: false
  });
  const [tiktokManualToken, setTiktokManualToken] = useState('');
  const [availableTikTokAccounts, setAvailableTikTokAccounts] = useState<{id: string, name: string}[]>([]);
  const [isVerifyingTikTok, setIsVerifyingTikTok] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

            // Load Facebook
            const { data: fbData } = await supabase.from('marketing_configs').select('*').eq('user_id', session.user.id).eq('platform', 'Facebook').limit(1);
            if (fbData && fbData.length > 0) {
                setFbConfig(fbData[0]);
                if(fbData[0].access_token) {
                    new FacebookService().getAdAccounts(fbData[0].access_token).then(setAvailableAdAccounts).catch(console.error);
                }
            }

            // Load TikTok
            const { data: tkData } = await supabase.from('marketing_configs').select('*').eq('user_id', session.user.id).eq('platform', 'TikTok').limit(1);
            if (tkData && tkData.length > 0) {
                setTiktokConfig(tkData[0]);
                if(tkData[0].access_token) {
                    new TikTokService().getAdvertisers(tkData[0].access_token).then(setAvailableTikTokAccounts).catch(console.error);
                }
            }
        } 
        setLoading(false);
    };
    loadConfigs();
  }, []);

  const handleShopifyConnect = async () => {
      setErrorMessage(null);
      setTestingConnection('Shopify');

      let url = shopifyConfig.store_url.trim();
      if (!url) {
          setErrorMessage("Please enter your store URL.");
          setTestingConnection(null);
          return;
      }

      // Cleanup URL for user friendliness (e.g. if they pasted full https link)
      url = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (url.includes('/')) url = url.split('/')[0];
      // Append .myshopify.com if missing
      const finalShop = url.includes('.') ? url : `${url}.myshopify.com`;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
          setErrorMessage("You must be logged in to connect.");
          setTestingConnection(null);
          return;
      }

      // Redirect to Backend OAuth Handler
      const host = window.location.origin; // e.g. https://myapp.vercel.app
      window.location.href = `${host}/api/shopify/login?shop=${finalShop}&userId=${session.user.id}`;
  };

  const handleDisconnectShopify = async () => {
      if (!window.confirm("Disconnect Shopify? This will stop order syncing.")) return;
      setShopifyConfig({ ...shopifyConfig, access_token: '', is_active: false });
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
           await supabase.from('sales_channels').update({ is_active: false, access_token: null }).eq('user_id', session.user.id).eq('platform', 'Shopify');
           if (onConfigUpdate) onConfigUpdate();
      }
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

  // --- FACEBOOK LOGIC ---
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

  // --- TIKTOK LOGIC ---
  const handleVerifyTikTokToken = async () => {
    setIsVerifyingTikTok(true);
    setErrorMessage(null);
    try {
        const accounts = await new TikTokService().getAdvertisers(tiktokManualToken);
        setAvailableTikTokAccounts(accounts);
        setTiktokConfig(prev => ({ ...prev, access_token: tiktokManualToken }));
    } catch (e: any) { setErrorMessage(e.message); }
    setIsVerifyingTikTok(false);
  };

  const handleSaveTikTokConfig = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if(session?.user && tiktokConfig.ad_account_id) {
       const payload = { user_id: session.user.id, platform: 'TikTok', access_token: tiktokConfig.access_token, ad_account_id: tiktokConfig.ad_account_id, is_active: true };
       const { data: existing } = await supabase.from('marketing_configs').select('id').eq('user_id', session.user.id).eq('platform', 'TikTok').limit(1);
       if (existing && existing.length > 0) await supabase.from('marketing_configs').update(payload).eq('id', existing[0].id);
       else await supabase.from('marketing_configs').insert(payload);
       setTiktokConfig({ ...tiktokConfig, is_active: true });
       if(onConfigUpdate) onConfigUpdate();
    }
  };

  const disconnectTikTok = async () => {
      setTiktokConfig({ id: '', platform: 'TikTok', access_token: '', is_active: false });
      const { data: { session } } = await supabase.auth.getSession();
      if(session?.user) await supabase.from('marketing_configs').delete().eq('user_id', session.user.id).eq('platform', 'TikTok');
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

      {/* CORE PLATFORMS GRID */}
      <section>
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Grid2X2 className="text-slate-500" size={20} /> Core Platforms
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              
              {/* SHOPIFY CARD */}
              <div className={`
                  relative overflow-hidden rounded-2xl border transition-all duration-300
                  ${shopifyConfig.is_active ? 'bg-green-100/30 border-green-200 shadow-sm' : 'bg-white border-slate-200 shadow-sm hover:shadow-lg'}
              `}>
                  <div className="p-8 h-full flex flex-col">
                      <div className="flex justify-between items-start mb-6">
                          <div className="flex items-center gap-4">
                              <div className="w-14 h-14 bg-[#95BF47] rounded-xl flex items-center justify-center text-white shadow-sm">
                                  <Store size={28} />
                              </div>
                              <div>
                                  <h3 className="font-bold text-xl text-slate-900">Shopify</h3>
                                  <p className="text-sm text-slate-500">Sales Channel</p>
                              </div>
                          </div>
                          {shopifyConfig.is_active && (
                              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold flex items-center gap-1">
                                  <CheckCircle2 size={14} /> Connected
                              </span>
                          )}
                      </div>

                      <div className="flex-1">
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
                                                Enter Store URL
                                            </label>
                                            <input 
                                                type="text"
                                                placeholder="your-store.myshopify.com"
                                                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-sm"
                                                value={shopifyConfig.store_url || ''}
                                                onChange={(e) => setShopifyConfig({...shopifyConfig, store_url: e.target.value})}
                                            />
                                            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                                                <Info size={12} /> You will be redirected to Shopify to approve the connection.
                                            </p>
                                        </div>
                                </div>
                                    
                                    <button 
                                        onClick={handleShopifyConnect}
                                        disabled={testingConnection === 'Shopify' || !shopifyConfig.store_url}
                                        className="w-full bg-[#95BF47] text-white py-3 rounded-xl text-sm font-bold hover:bg-[#86ad3e] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {testingConnection === 'Shopify' ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
                                        Connect Store
                                    </button>
                            </div>
                        )}
                      </div>
                  </div>
              </div>

              {/* FACEBOOK CARD */}
              <div className={`
                  relative overflow-hidden rounded-2xl border transition-all duration-300
                  ${fbConfig.is_active ? 'bg-blue-50/50 border-blue-200 shadow-sm' : 'bg-white border-slate-200 shadow-sm hover:shadow-lg'}
              `}>
                  <div className="p-8 h-full flex flex-col">
                      <div className="flex justify-between items-start mb-6">
                          <div className="flex items-center gap-4">
                              <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-sm">
                                  <Facebook size={28} />
                              </div>
                              <div>
                                  <h3 className="font-bold text-xl text-slate-900">Facebook Ads</h3>
                                  <p className="text-sm text-slate-500">Marketing Source</p>
                              </div>
                          </div>
                          {fbConfig.is_active && (
                              <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold flex items-center gap-1">
                                  <CheckCircle2 size={14} /> Connected
                              </span>
                          )}
                      </div>
                      
                      <div className="flex-1">
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
              </div>

              {/* TIKTOK CARD */}
              <div className={`
                  relative overflow-hidden rounded-2xl border transition-all duration-300
                  ${tiktokConfig.is_active ? 'bg-slate-50 border-slate-300 shadow-sm' : 'bg-white border-slate-200 shadow-sm hover:shadow-lg'}
              `}>
                  <div className="p-8 h-full flex flex-col">
                      <div className="flex justify-between items-start mb-6">
                          <div className="flex items-center gap-4">
                              <div className="w-14 h-14 bg-black rounded-xl flex items-center justify-center text-white shadow-sm">
                                  {/* Simple TikTok Symbol */}
                                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                                  </svg>
                              </div>
                              <div>
                                  <h3 className="font-bold text-xl text-slate-900">TikTok Ads</h3>
                                  <p className="text-sm text-slate-500">Marketing Source</p>
                              </div>
                          </div>
                          {tiktokConfig.is_active && (
                              <span className="px-3 py-1 bg-slate-200 text-slate-700 rounded-full text-xs font-bold flex items-center gap-1">
                                  <CheckCircle2 size={14} /> Connected
                              </span>
                          )}
                      </div>
                      
                      <div className="flex-1">
                        {tiktokConfig.is_active ? (
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                                        <Settings size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <label className="text-xs text-slate-500 font-bold uppercase mb-1 block">Advertiser ID</label>
                                        <p className="text-sm font-bold text-slate-900">{tiktokConfig.ad_account_id}</p>
                                    </div>
                                </div>
                                <button onClick={disconnectTikTok} className="text-sm text-red-600 hover:text-red-700 hover:underline">
                                    Disconnect TikTok
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {!availableTikTokAccounts.length ? (
                                    <>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">Access Token</label>
                                            <input 
                                                type="password"
                                                placeholder="Paste Long-Lived Token..."
                                                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-black outline-none transition-all"
                                                value={tiktokManualToken}
                                                onChange={(e) => setTiktokManualToken(e.target.value)}
                                            />
                                        </div>
                                        <button 
                                                onClick={handleVerifyTikTokToken}
                                                disabled={isVerifyingTikTok || !tiktokManualToken}
                                                className="w-full bg-slate-900 text-white py-3.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                            >
                                                {isVerifyingTikTok ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
                                                Verify & Fetch Advertisers
                                            </button>
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">Select Advertiser</label>
                                            <select 
                                                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-black outline-none bg-white"
                                                value={tiktokConfig.ad_account_id || ''}
                                                onChange={(e) => setTiktokConfig({...tiktokConfig, ad_account_id: e.target.value})}
                                            >
                                                <option value="">-- Select Advertiser --</option>
                                                {availableTikTokAccounts.map(acc => (
                                                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.id})</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex gap-3">
                                            <button onClick={() => { setAvailableTikTokAccounts([]); setTiktokConfig({...tiktokConfig, ad_account_id: ''}); }} className="flex-1 px-4 py-3 border border-slate-300 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50">Back</button>
                                            <button onClick={handleSaveTikTokConfig} disabled={isVerifyingTikTok || !tiktokConfig.ad_account_id} className="flex-2 w-full bg-black text-white py-3.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50">Save Configuration</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                      </div>
                  </div>
              </div>

          </div>
      </section>

      {/* COURIER SECTION */}
      <section>
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 mt-8">
            <Truck className="text-slate-500" size={20} /> Logistics Partners
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {ORDERED_COURIERS.map((courierName) => {
                const config = courierConfigs[courierName];
                const meta = COURIER_META[courierName];
                const isActive = config.is_active;
                const isComingSoon = courierName !== CourierName.POSTEX; // Only PostEx is active

                return (
                    <div key={courierName} className={`relative overflow-hidden rounded-xl border transition-all duration-300 flex flex-col ${isActive ? `${meta.bg} ${meta.border} shadow-sm` : 'bg-white border-slate-200 shadow-sm hover:shadow-md'}`}>
                        {/* Coming Soon Overlay */}
                        {isComingSoon && (
                            <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center text-slate-500">
                                <Lock size={24} className="mb-2 opacity-50" />
                                <span className="text-sm font-bold bg-slate-100 px-3 py-1 rounded-full border border-slate-200">Coming Soon</span>
                            </div>
                        )}
                        
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
                                    <input 
                                        type="password" 
                                        disabled={isComingSoon}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50" 
                                        placeholder="API Key" 
                                        value={config.api_token} 
                                        onChange={(e) => setCourierConfigs(prev => ({ ...prev, [courierName]: { ...prev[courierName], api_token: e.target.value } }))} 
                                    />
                                    <button 
                                        onClick={() => handleConnectCourier(courierName)} 
                                        disabled={testingConnection === courierName || isComingSoon} 
                                        className="w-full py-2.5 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {testingConnection === courierName ? <Loader2 className="animate-spin" size={14}/> : 'Connect'}
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
