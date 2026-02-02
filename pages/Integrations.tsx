
import React, { useState, useEffect } from 'react';
import { CourierName, CourierConfig, SalesChannel, MarketingConfig } from '../types';
import { PostExAdapter } from '../services/couriers/postex';
import { TcsAdapter } from '../services/couriers/tcs';
import { ShopifyAdapter } from '../services/shopify';
import { FacebookService } from '../services/facebook';
import { TikTokService } from '../services/tiktok';
import { supabase } from '../services/supabase';
import { 
    CheckCircle2, AlertTriangle, Key, Globe, Loader2, Store, ArrowRight, 
    RefreshCw, ShieldCheck, Link, Truck, Info, Settings, Facebook, ExternalLink, Zap, Lock, Grid, CreditCard, User, CheckSquare, Square, ToggleLeft, ToggleRight
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
        color: 'text-red-900', bg: 'bg-red-50', border: 'border-red-200', icon: 'TCS', label: 'TCS',
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

// Defined Order
const ORDERED_COURIERS = [
    CourierName.POSTEX,
    CourierName.TCS, // Promoted
    CourierName.TRAX,
    CourierName.LEOPARDS,
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
  
  // Expanded Config State to handle Username/Password for TCS
  const [courierConfigs, setCourierConfigs] = useState<Record<string, CourierConfig>>(() => {
    const initial: Record<string, CourierConfig> = {};
    Object.values(CourierName).forEach(name => {
        initial[name] = { id: '', courier_id: name, api_token: '', username: '', password: '', merchant_id: '', is_active: false };
    });
    return initial;
  });
  
  // Facebook State
  const [fbConfig, setFbConfig] = useState<MarketingConfig>({
      id: '', platform: 'Facebook', access_token: '', ad_account_ids: [], is_active: false
  });
  const [fbManualToken, setFbManualToken] = useState('');
  const [availableAdAccounts, setAvailableAdAccounts] = useState<{id: string, name: string}[]>([]);
  const [isVerifyingFb, setIsVerifyingFb] = useState(false);

  // TikTok State
  const [tiktokConfig, setTiktokConfig] = useState<MarketingConfig>({
    id: '', platform: 'TikTok', access_token: '', ad_account_ids: [], is_active: false
  });
  const [availableTikTokAccounts, setAvailableTikTokAccounts] = useState<{id: string, name: string}[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Local state for TCS Toggle
  const [useTcsManualToken, setUseTcsManualToken] = useState(false);

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
                        if (newConfigs[cName]) {
                            newConfigs[cName] = { 
                                ...newConfigs[cName], 
                                id: conf.id, 
                                api_token: conf.api_token || '', 
                                username: conf.username || '',
                                password: conf.password || '',
                                merchant_id: conf.merchant_id || '',
                                is_active: conf.is_active, 
                                courier_id: cName 
                            };
                            
                            // Auto-detect TCS manual mode
                            if (cName === CourierName.TCS && conf.api_token && conf.api_token.length > 20) {
                                setUseTcsManualToken(true);
                            }
                        }
                    });
                    return newConfigs;
                });
            }

            // Load Marketing Configs
            const { data: mkData } = await supabase.from('marketing_configs').select('*').eq('user_id', session.user.id);
            if (mkData) {
                mkData.forEach((m: any) => {
                    if (m.platform === 'Facebook') {
                        setFbConfig({ ...m, is_active: m.is_active });
                        if(m.access_token) setFbManualToken(m.access_token);
                    }
                    if (m.platform === 'TikTok') setTiktokConfig({ ...m, is_active: m.is_active });
                });
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
      if (!url) { setErrorMessage("Enter URL"); setTestingConnection(null); return; }
      url = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (url.includes('/')) url = url.split('/')[0];
      const finalShop = url.includes('.') ? url : `${url}.myshopify.com`;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const host = window.location.origin;
      window.location.href = `${host}/api/shopify/login?shop=${finalShop}&userId=${session.user.id}`;
  };

  const handleDisconnectShopify = async () => {
      if (!window.confirm("Disconnect Shopify?")) return;
      setShopifyConfig({ ...shopifyConfig, access_token: '', is_active: false });
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
           await supabase.from('sales_channels').update({ is_active: false, access_token: null }).eq('user_id', session.user.id).eq('platform', 'Shopify');
           if (onConfigUpdate) onConfigUpdate();
      }
  };

  const handleVerifyFacebook = async () => {
      setErrorMessage(null);
      setIsVerifyingFb(true);
      try {
          const service = new FacebookService();
          const accounts = await service.getAdAccounts(fbManualToken);
          setAvailableAdAccounts(accounts);
          
          if(accounts.length === 0) throw new Error("No Ad Accounts found for this token.");
          
          // Default to current selections or empty if none
          const currentSelection = fbConfig.ad_account_ids || [];
          if (currentSelection.length === 0 && accounts.length > 0) {
             // Optional: Select first by default? No, let user select.
             // setFbConfig(prev => ({ ...prev, ad_account_ids: [accounts[0].id] }));
          }
      } catch (e: any) {
          setErrorMessage("Facebook Error: " + e.message);
      } finally {
          setIsVerifyingFb(false);
      }
  };

  const toggleFbAccount = (accountId: string) => {
    setFbConfig(prev => {
        const current = prev.ad_account_ids || [];
        if (current.includes(accountId)) {
            return { ...prev, ad_account_ids: current.filter(id => id !== accountId) };
        } else {
            return { ...prev, ad_account_ids: [...current, accountId] };
        }
    });
  };

  const handleSaveFacebook = async () => {
      if (availableAdAccounts.length === 0 && !fbConfig.is_active) return;
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const payload = {
          user_id: session.user.id,
          platform: 'Facebook' as const,
          access_token: fbManualToken,
          ad_account_ids: fbConfig.ad_account_ids,
          is_active: true
      };

      await supabase.from('marketing_configs').upsert(payload, { onConflict: 'user_id, platform' });
      setFbConfig(prev => ({ 
          ...prev, 
          platform: payload.platform,
          access_token: payload.access_token,
          ad_account_ids: payload.ad_account_ids,
          is_active: payload.is_active
      }));
      if (onConfigUpdate) onConfigUpdate();
  };

  const handleTikTokConnect = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      
      const host = window.location.origin;
      window.location.href = `${host}/api/tiktok/login?userId=${session.user.id}`;
  };

  const handleDisconnectMarketing = async (platform: 'Facebook' | 'TikTok') => {
      if (!window.confirm(`Disconnect ${platform}?`)) return;
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      await supabase.from('marketing_configs').delete().eq('user_id', session.user.id).eq('platform', platform);
      
      if (platform === 'Facebook') {
          setFbConfig({ id: '', platform: 'Facebook', access_token: '', ad_account_ids: [], is_active: false });
          setFbManualToken('');
          setAvailableAdAccounts([]);
      } else {
          setTiktokConfig({ id: '', platform: 'TikTok', access_token: '', ad_account_ids: [], is_active: false });
      }
      if (onConfigUpdate) onConfigUpdate();
  };

  const saveCourierConfig = async (courierId: string, isActive: boolean) => {
    setErrorMessage(null);
    const config = courierConfigs[courierId];
    setCourierConfigs(prev => ({ ...prev, [courierId]: { ...config, is_active: isActive } }));
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
        const payload = { 
            user_id: session.user.id, 
            provider_id: courierId, 
            api_token: config.api_token, 
            username: config.username,
            password: config.password,
            merchant_id: config.merchant_id,
            is_active: isActive 
        };
        const { data: existing } = await supabase.from('integration_configs').select('id').eq('user_id', session.user.id).eq('provider_id', courierId).limit(1);
        if (existing && existing.length > 0) await supabase.from('integration_configs').update(payload).eq('id', existing[0].id);
        else await supabase.from('integration_configs').insert(payload);
        if (onConfigUpdate) onConfigUpdate();
    }
  };

  const handleConnectCourier = async (courierName: string) => {
    setTestingConnection(courierName);
    setErrorMessage(null);
    
    try {
        let success = false;
        if (courierName === CourierName.POSTEX) {
            const adapter = new PostExAdapter();
            success = await adapter.testConnection({ ...courierConfigs[courierName], is_active: true } as any);
        } else if (courierName === CourierName.TCS) {
            const adapter = new TcsAdapter();
            success = await adapter.testConnection({ ...courierConfigs[courierName], is_active: true } as any);
        }

        if (!success) throw new Error("Connection check failed"); // Should be caught by specific error in adapter usually
        
        await saveCourierConfig(courierName, true);

    } catch (e: any) {
        // Here we handle the error gracefully and offer to save anyway
        const msg = e.message || "Unknown Error";
        const userWantsToForceSave = window.confirm(`Connection failed: ${msg}.\n\nDo you want to save these credentials anyway?`);
        
        if (userWantsToForceSave) {
            await saveCourierConfig(courierName, true);
        } else {
            setErrorMessage(msg);
        }
    } finally {
        setTestingConnection(null);
    }
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

      {/* CORE PLATFORMS GRID (Shopify, FB, TikTok) */}
      <section>
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Grid className="text-slate-500" size={20} /> Core Platforms
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {/* SHOPIFY CARD */}
              <div className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${shopifyConfig.is_active ? 'bg-green-100/30 border-green-200 shadow-sm' : 'bg-white border-slate-200 shadow-sm hover:shadow-lg'}`}>
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
                          {shopifyConfig.is_active && <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold flex items-center gap-1"><CheckCircle2 size={14} /> Connected</span>}
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
                                <button onClick={handleDisconnectShopify} className="text-sm text-red-600 hover:text-red-700 hover:underline">Disconnect Store</button>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Enter Store URL</label>
                                    <input type="text" placeholder="your-store.myshopify.com" className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-sm" value={shopifyConfig.store_url || ''} onChange={(e) => setShopifyConfig({...shopifyConfig, store_url: e.target.value})} />
                                </div>
                                <button onClick={handleShopifyConnect} disabled={testingConnection === 'Shopify' || !shopifyConfig.store_url} className="w-full bg-[#95BF47] text-white py-3 rounded-xl text-sm font-bold hover:bg-[#86ad3e] transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                                    {testingConnection === 'Shopify' ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />} Connect Store
                                </button>
                            </div>
                        )}
                      </div>
                  </div>
              </div>

              {/* FACEBOOK CARD */}
              <div className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${fbConfig.is_active ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-slate-200 shadow-sm hover:shadow-lg'}`}>
                   <div className="p-8 h-full flex flex-col">
                       <div className="flex justify-between items-start mb-6">
                           <div className="flex items-center gap-4">
                               <div className="w-14 h-14 bg-[#1877F2] rounded-xl flex items-center justify-center text-white shadow-sm">
                                   <Facebook size={28} />
                               </div>
                               <div>
                                   <h3 className="font-bold text-xl text-slate-900">Facebook Ads</h3>
                                   <p className="text-sm text-slate-500">Marketing Data</p>
                               </div>
                           </div>
                           {fbConfig.is_active && <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold flex items-center gap-1"><CheckCircle2 size={14} /> Active</span>}
                       </div>
                       <div className="flex-1">
                           {fbConfig.is_active ? (
                               <div className="space-y-6">
                                   <div className="p-4 bg-white rounded-xl border border-blue-100">
                                       <p className="text-xs text-slate-500 font-bold uppercase mb-1">Ad Accounts</p>
                                       <p className="text-sm font-medium text-slate-900 truncate">{fbConfig.ad_account_ids.length} Linked Accounts</p>
                                   </div>
                                   <button onClick={() => handleDisconnectMarketing('Facebook')} className="text-sm text-red-600 hover:text-red-700 hover:underline">Disconnect</button>
                               </div>
                           ) : (
                               <div className="space-y-4">
                                   <div>
                                       <label className="block text-xs font-bold text-slate-700 mb-1">Access Token</label>
                                       <input 
                                           type="password" 
                                           placeholder="EAAB..." 
                                           className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                                           value={fbManualToken}
                                           onChange={(e) => setFbManualToken(e.target.value)}
                                       />
                                       <p className="text-[10px] text-slate-400 mt-1">
                                           Use a System User Token with 'ads_read' permission.
                                       </p>
                                   </div>
                                   {availableAdAccounts.length > 0 ? (
                                       <div className="space-y-2">
                                           <label className="block text-xs font-bold text-slate-700">Select Ad Accounts</label>
                                           <div className="max-h-48 overflow-y-auto border border-slate-300 rounded-lg bg-white p-2 space-y-1">
                                               {availableAdAccounts.map(acc => {
                                                   const isSelected = fbConfig.ad_account_ids.includes(acc.id);
                                                   return (
                                                       <div 
                                                            key={acc.id} 
                                                            onClick={() => toggleFbAccount(acc.id)}
                                                            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border border-blue-100' : 'hover:bg-slate-50 border border-transparent'}`}
                                                       >
                                                           {isSelected ? (
                                                               <CheckSquare size={18} className="text-blue-600 shrink-0" />
                                                           ) : (
                                                               <Square size={18} className="text-slate-300 shrink-0" />
                                                           )}
                                                           <div className="min-w-0">
                                                               <p className={`text-sm truncate ${isSelected ? 'font-bold text-blue-900' : 'text-slate-700'}`}>{acc.name}</p>
                                                               <p className="text-[10px] text-slate-400 font-mono">ID: {acc.id}</p>
                                                           </div>
                                                       </div>
                                                   );
                                               })}
                                           </div>
                                           <div className="flex justify-between items-center mt-2">
                                                <span className="text-xs text-slate-500 font-medium">
                                                    {fbConfig.ad_account_ids.length} selected
                                                </span>
                                                <button onClick={handleSaveFacebook} disabled={fbConfig.ad_account_ids.length === 0} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50">
                                                    Save Config
                                                </button>
                                           </div>
                                       </div>
                                   ) : (
                                       <button 
                                           onClick={handleVerifyFacebook} 
                                           disabled={!fbManualToken || isVerifyingFb}
                                           className="w-full bg-slate-900 text-white py-2 rounded-lg text-sm font-bold hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2"
                                       >
                                           {isVerifyingFb ? <Loader2 className="animate-spin" size={14}/> : 'Verify Token'}
                                       </button>
                                   )}
                               </div>
                           )}
                       </div>
                   </div>
              </div>

              {/* TIKTOK CARD */}
              <div className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${tiktokConfig.is_active ? 'bg-slate-100 border-slate-300 shadow-sm' : 'bg-white border-slate-200 shadow-sm hover:shadow-lg'}`}>
                   <div className="p-8 h-full flex flex-col">
                       <div className="flex justify-between items-start mb-6">
                           <div className="flex items-center gap-4">
                               <div className="w-14 h-14 bg-black rounded-xl flex items-center justify-center text-white shadow-sm">
                                   <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>
                               </div>
                               <div>
                                   <h3 className="font-bold text-xl text-slate-900">TikTok Ads</h3>
                                   <p className="text-sm text-slate-500">Marketing Data</p>
                               </div>
                           </div>
                           {tiktokConfig.is_active && <span className="px-3 py-1 bg-slate-200 text-slate-800 rounded-full text-xs font-bold flex items-center gap-1"><CheckCircle2 size={14} /> Active</span>}
                       </div>
                       <div className="flex-1">
                           {tiktokConfig.is_active ? (
                               <div className="space-y-6">
                                   <div className="p-4 bg-white rounded-xl border border-slate-200">
                                       <p className="text-xs text-slate-500 font-bold uppercase mb-1">Ad Accounts</p>
                                       <p className="text-sm font-medium text-slate-900 truncate">Connected via OAuth</p>
                                   </div>
                                   <button onClick={() => handleDisconnectMarketing('TikTok')} className="text-sm text-red-600 hover:text-red-700 hover:underline">Disconnect</button>
                               </div>
                           ) : (
                               <div className="space-y-6">
                                   <p className="text-sm text-slate-500">Connect your TikTok for Business account to sync spend and conversion data.</p>
                                   <button onClick={handleTikTokConnect} className="w-full bg-black text-white py-3 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                                       <Zap size={16} /> Connect TikTok
                                   </button>
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
                const isComingSoon = courierName !== CourierName.POSTEX && courierName !== CourierName.TCS;

                // Input fields mapping
                const isTCS = courierName === CourierName.TCS;

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
                                    {isTCS ? (
                                        <>
                                            <div className="flex justify-center gap-2 mb-2 p-1 bg-slate-50 rounded-lg border border-slate-100">
                                                <button 
                                                    onClick={() => { setUseTcsManualToken(false); setCourierConfigs(prev => ({...prev, [CourierName.TCS]: {...prev[CourierName.TCS], api_token: ''}})); }}
                                                    className={`flex-1 py-1 text-[10px] font-bold rounded flex items-center justify-center gap-1 ${!useTcsManualToken ? 'bg-white shadow text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                                                >
                                                    <Key size={10} /> Auto-Auth
                                                </button>
                                                <button 
                                                    onClick={() => setUseTcsManualToken(true)}
                                                    className={`flex-1 py-1 text-[10px] font-bold rounded flex items-center justify-center gap-1 ${useTcsManualToken ? 'bg-white shadow text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                                                >
                                                    <Zap size={10} /> Manual Token
                                                </button>
                                            </div>

                                            {useTcsManualToken ? (
                                                <div className="space-y-1">
                                                    <input 
                                                        type="password"
                                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-yellow-50 focus:bg-white transition-colors" 
                                                        placeholder="Paste Access Token (Bearer)" 
                                                        value={config.api_token} 
                                                        onChange={(e) => setCourierConfigs(prev => ({ ...prev, [courierName]: { ...prev[courierName], api_token: e.target.value } }))} 
                                                    />
                                                    <p className="text-[9px] text-orange-600 text-center">Warning: Tokens expire every 24h. Update daily.</p>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="space-y-1">
                                                        <input 
                                                            type="text"
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" 
                                                            placeholder="Client ID (or Username)" 
                                                            value={config.username} 
                                                            onChange={(e) => setCourierConfigs(prev => ({ ...prev, [courierName]: { ...prev[courierName], username: e.target.value } }))} 
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <input 
                                                            type="password"
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" 
                                                            placeholder="Client Secret (or Password)" 
                                                            value={config.password} 
                                                            onChange={(e) => setCourierConfigs(prev => ({ ...prev, [courierName]: { ...prev[courierName], password: e.target.value } }))} 
                                                        />
                                                    </div>
                                                </>
                                            )}
                                            
                                            <div className="space-y-1">
                                                <input 
                                                    type="text"
                                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" 
                                                    placeholder="Cost Center Code (Acct No)" 
                                                    value={config.merchant_id} 
                                                    onChange={(e) => setCourierConfigs(prev => ({ ...prev, [courierName]: { ...prev[courierName], merchant_id: e.target.value } }))} 
                                                />
                                            </div>
                                            <p className="text-[10px] text-slate-400 leading-tight">
                                                {useTcsManualToken 
                                                    ? "Ensure the token matches the Cost Center." 
                                                    : "Credentials differ from Portal login. Contact AM for API credentials."}
                                            </p>
                                        </>
                                    ) : (
                                        <input 
                                            type="password" 
                                            disabled={isComingSoon}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50" 
                                            placeholder="API Key / Token" 
                                            value={config.api_token} 
                                            onChange={(e) => setCourierConfigs(prev => ({ ...prev, [courierName]: { ...prev[courierName], api_token: e.target.value } }))} 
                                        />
                                    )}
                                    
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
