
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Couriers from './pages/Couriers';
import Profitability from './pages/Profitability';
import Integrations from './pages/Integrations';
import Settings from './pages/Settings';
import Inventory from './pages/Inventory';
import Marketing from './pages/Marketing';
import Reconciliation from './pages/Reconciliation'; 
import { PostExAdapter } from './services/couriers/postex';
import { TcsAdapter } from './services/couriers/tcs';
import { ShopifyAdapter } from './services/shopify'; 
import { Order, Product, AdSpend, CourierName, SalesChannel, CourierConfig, OrderStatus, ShopifyOrder, IntegrationConfig } from './types';
import { Loader2, AlertTriangle, X } from 'lucide-react';
import { supabase } from './services/supabase';
import { getCostAtDate } from './services/calculator';
import { COURIER_RATES, PACKAGING_COST_AVG } from './constants';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  
  // Login State
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState<{type: 'error' | 'success', text: string} | null>(null);

  const [currentPage, setCurrentPage] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // App Data State
  const [orders, setOrders] = useState<Order[]>([]);
  const [shopifyOrders, setShopifyOrders] = useState<ShopifyOrder[]>([]); 
  const [products, setProducts] = useState<Product[]>([]);
  const [adSpend, setAdSpend] = useState<AdSpend[]>([]);
  const [isConfigured, setIsConfigured] = useState(false);
  const [storeName, setStoreName] = useState('My Store');
  
  // Settings State
  const [settings, setSettings] = useState({
     rates: COURIER_RATES,
     packagingCost: PACKAGING_COST_AVG,
     overheadCost: 0,
     taxRate: 0,
     adsTaxRate: 0
  });
  
  // Trigger to force re-fetch
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Inventory Alert Count (Items with 0 COGS)
  const inventoryAlertCount = useMemo(() => {
      return products.filter(p => p.current_cogs === 0).length;
  }, [products]);

  // 1. Check Auth on Load
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
       setSession((prev: any) => {
           if (prev?.access_token === session?.access_token) return prev;
           return session;
       });
    });

    return () => subscription.unsubscribe();
  }, []);

  // --- Helper: Recalculate Order Costs ---
  const recalculateOrderCosts = useCallback((currentOrders: Order[], currentProducts: Product[]) => {
    return currentOrders.map(order => {
        const updatedItems = order.items.map(item => {
            const productDef = 
                currentProducts.find(p => p.variant_fingerprint && p.variant_fingerprint === item.variant_fingerprint) ||
                currentProducts.find(p => p.sku === item.sku) || 
                currentProducts.find(p => p.id === item.product_id);
            
            let correctCogs = item.cogs_at_time_of_order;
            
            if (productDef) {
                correctCogs = getCostAtDate(productDef, order.created_at);
            }

            return { ...item, cogs_at_time_of_order: correctCogs };
        });
        return { ...order, items: updatedItems };
    });
  }, []);

  // 2. Fetch Data when Session exists OR Demo Mode
  useEffect(() => {
    if (!session && !isDemoMode) return;

    const fetchAppData = async () => {
      setLoading(true);
      setError(null);

      try {
        const user = session?.user || { id: 'demo-user' };

        // 0. Ensure Profile Exists & Fetch Branding
        if (!isDemoMode && user.id !== 'demo-user') {
            const { data: profile } = await supabase.from('profiles').select('store_name').eq('id', user.id).single();
            if (profile) setStoreName(profile.store_name || 'My Store');
            else await supabase.from('profiles').insert([{ id: user.id, store_name: 'My Store' }]);
        }

        // A. Fetch Settings
        let fetchedSettings = { 
            rates: COURIER_RATES, 
            packagingCost: PACKAGING_COST_AVG,
            overheadCost: 0,
            taxRate: 0,
            adsTaxRate: 0
        };

        if (!isDemoMode) {
            const { data: settingsData } = await supabase.from('app_settings').select('*').eq('user_id', user.id).single();
            if (settingsData) {
                fetchedSettings = { 
                    rates: settingsData.courier_rates || COURIER_RATES, 
                    packagingCost: settingsData.packaging_cost || PACKAGING_COST_AVG,
                    overheadCost: settingsData.overhead_cost || 0,
                    taxRate: settingsData.courier_tax_rate || 0,
                    adsTaxRate: settingsData.ads_tax_rate || 0
                };
            }
        }
        setSettings(fetchedSettings);

        // B. Fetch SAVED Products
        let savedProducts: Product[] = [];
        if (!isDemoMode) {
            const { data: productData } = await supabase.from('products').select('*').eq('user_id', user.id);
            if (productData) {
                savedProducts = productData.map((p: any) => ({
                    id: p.id,
                    shopify_id: p.shopify_id || '',
                    title: p.title,
                    sku: p.sku,
                    variant_fingerprint: p.sku, // Default fallback
                    image_url: p.image_url || '',
                    current_cogs: p.current_cogs,
                    cost_history: p.cost_history || [],
                    group_id: p.group_id,
                    group_name: p.group_name,
                    aliases: p.aliases || [] // Load aliases
                }));
            }
        }

        // C. Fetch Ad Spend
        if (!isDemoMode) {
            const { data: adData } = await supabase.from('ad_spend').select('*').eq('user_id', user.id).order('date', { ascending: false });
            if (adData) {
                setAdSpend(adData.map((a: any) => ({
                    id: a.id,
                    date: a.date,
                    platform: a.platform,
                    amount_spent: a.amount_spent,
                    product_id: a.product_id || null,
                    campaign_id: a.campaign_id,
                    campaign_name: a.campaign_name
                })));
            }
        }

        // D. Fetch Integrations
        let postExConfig: IntegrationConfig | undefined;
        let tcsConfig: IntegrationConfig | undefined;
        let shopifyConfig: SalesChannel | undefined;
        
        if (!isDemoMode) {
             const { data: salesData } = await supabase
                .from('sales_channels')
                .select('*')
                .eq('user_id', user.id)
                .eq('is_active', true)
                .eq('platform', 'Shopify')
                .limit(1);
             
             if (salesData && salesData.length > 0) {
                 shopifyConfig = salesData[0];
             }

             const { data: courierData } = await supabase
                .from('integration_configs')
                .select('*')
                .eq('user_id', user.id)
                .eq('is_active', true);
            
            if (courierData) {
                postExConfig = courierData.find((c: any) => c.provider_id === CourierName.POSTEX);
                tcsConfig = courierData.find((c: any) => c.provider_id === CourierName.TCS);
            }
        }

        const anyActiveConfig = !!postExConfig || !!tcsConfig || !!shopifyConfig;

        if (!anyActiveConfig) {
            setLoading(false);
            setIsConfigured(false);
            setProducts(savedProducts);
            return;
        }

        setIsConfigured(true);
        const finalProducts = [...savedProducts];
        const seenFingerprints = new Set(savedProducts.map(p => p.variant_fingerprint || p.sku));

        // E. Fetch Shopify Data (Stats Only)
        if (shopifyConfig) {
            try {
                const shopifyAdapter = new ShopifyAdapter();
                const rawShopifyOrders = await shopifyAdapter.fetchOrders(shopifyConfig);
                setShopifyOrders(rawShopifyOrders);
            } catch (e: any) {
                console.error("Shopify Sync Error:", e);
                setError("Shopify Sync Failed: " + e.message);
            }
        } else {
            setShopifyOrders([]);
        }

        // F. Fetch Live Orders from Couriers
        let fetchedOrders: Order[] = [];

        // 1. PostEx
        if (postExConfig) {
            try {
                const postExAdapter = new PostExAdapter();
                const pxOrders = await postExAdapter.fetchRecentOrders(postExConfig);
                fetchedOrders = [...fetchedOrders, ...pxOrders];
            } catch (e: any) {
                console.error("PostEx Sync Error:", e);
                setError((prev) => (prev ? prev + " | " : "") + "PostEx Failed: " + e.message);
            }
        }

        // 2. TCS
        if (tcsConfig) {
            try {
                const tcsAdapter = new TcsAdapter();
                const tcsOrders = await tcsAdapter.fetchRecentOrders(tcsConfig);
                fetchedOrders = [...fetchedOrders, ...tcsOrders];
            } catch (e: any) {
                console.error("TCS Sync Error:", e);
                setError((prev) => (prev ? prev + " | " : "") + "TCS Failed: " + e.message);
            }
        }

        // Process discovered items from Courier Orders
        fetchedOrders.forEach(o => {
            o.items.forEach(item => {
                const fingerprint = item.variant_fingerprint || item.sku || 'unknown';

                const exists = finalProducts.some(p => 
                    p.sku === item.sku || 
                    (p.variant_fingerprint && p.variant_fingerprint === fingerprint)
                );

                if (!exists && !seenFingerprints.has(fingerprint)) {
                    seenFingerprints.add(fingerprint);
                    const uniqueId = (item.product_id && item.product_id !== 'unknown') ? item.product_id : fingerprint;
                    finalProducts.push({
                        id: uniqueId,
                        shopify_id: 'unknown',
                        title: item.product_name,
                        sku: fingerprint, 
                        variant_fingerprint: fingerprint,
                        image_url: '',
                        current_cogs: 0,
                        cost_history: [],
                        aliases: []
                    });
                }
            });
        });

        const processedOrders = fetchedOrders.map(order => {
            const rateCard = fetchedSettings.rates[order.courier] || fetchedSettings.rates[CourierName.POSTEX];
            const isRto = order.status === OrderStatus.RETURNED || order.status === OrderStatus.RTO_INITIATED;
            const updatedItems = order.items.map(item => {
                const productDef = finalProducts.find(p => (p.variant_fingerprint && p.variant_fingerprint === item.variant_fingerprint) || p.sku === item.sku);
                const historicalCogs = productDef ? getCostAtDate(productDef, order.created_at) : 0;
                return { ...item, cogs_at_time_of_order: historicalCogs };
            });
            
            const taxAmount = order.status === OrderStatus.DELIVERED ? (order.cod_amount * (fetchedSettings.taxRate / 100)) : 0;

            return {
                ...order,
                courier_fee: rateCard.forward,
                rto_penalty: isRto ? rateCard.rto : 0,
                packaging_cost: fetchedSettings.packagingCost,
                overhead_cost: fetchedSettings.overheadCost,
                tax_amount: taxAmount,
                items: updatedItems
            };
        });

        setOrders(processedOrders);

        // Save new products to DB for persistence
        if (!isDemoMode && finalProducts.length > savedProducts.length) {
             const newItems = finalProducts.filter(p => !savedProducts.find(sp => sp.id === p.id));
             
             if (newItems.length > 0) {
                 const payload = newItems.map(p => ({
                     user_id: user.id,
                     id: p.id,
                     shopify_id: p.shopify_id,
                     title: p.title,
                     sku: p.sku,
                     image_url: p.image_url,
                     current_cogs: p.current_cogs
                 }));
                 await supabase.from('products').upsert(payload);
             }
        }

        setProducts(finalProducts);
        setLoading(false);

      } catch (e: any) {
        console.error("App Data Fetch Error:", e);
        setError("Failed to load application data.");
        setLoading(false);
      }
    };

    fetchAppData();
  }, [session, isDemoMode, refreshTrigger]);

  const handleUpdateProducts = async (updatedProducts: Product[]) => {
      // Optimistic UI Update
      setProducts(prev => prev.map(p => {
          const updated = updatedProducts.find(u => u.id === p.id);
          return updated ? updated : p;
      }));

      // Update Orders Calculations based on new COGS
      const mergedProducts = products.map(p => updatedProducts.find(u => u.id === p.id) || p);
      const recalculatedOrders = recalculateOrderCosts(orders, mergedProducts);
      setOrders(recalculatedOrders);

      // Persist to DB
      if (!isDemoMode && session?.user) {
          const payload = updatedProducts.map(p => ({
              user_id: session.user.id,
              id: p.id,
              shopify_id: p.shopify_id,
              title: p.title,
              sku: p.sku,
              image_url: p.image_url,
              current_cogs: p.current_cogs,
              cost_history: p.cost_history,
              group_id: p.group_id,
              group_name: p.group_name,
              aliases: p.aliases
          }));
          const { error } = await supabase.from('products').upsert(payload);
          if (error) console.error("Failed to save product updates:", error);
      }
  };

  const handleMapProduct = async (shopifyTitle: string, systemProductId: string) => {
      // Find the target system product
      const targetProduct = products.find(p => p.id === systemProductId);
      if(!targetProduct) return;

      // Add alias (ensure unique)
      const currentAliases = targetProduct.aliases || [];
      if(currentAliases.includes(shopifyTitle)) return;
      
      const updatedProduct = { 
          ...targetProduct, 
          aliases: [...currentAliases, shopifyTitle] 
      };

      // Ensure no other product claims this alias (Clean up old mappings)
      const cleanedProducts = products.map(p => {
          if (p.id === systemProductId) return updatedProduct;
          if (p.aliases && p.aliases.includes(shopifyTitle)) {
              return { ...p, aliases: p.aliases.filter(a => a !== shopifyTitle) };
          }
          return p;
      });

      // Update UI & DB
      await handleUpdateProducts(cleanedProducts);
  };
  
  const handleUpdateAdSpend = async (newAds: AdSpend[]) => {
      setAdSpend(prev => [...prev, ...newAds]);
      if (!isDemoMode && session?.user) {
          const payload = newAds.map(a => ({
              user_id: session.user.id,
              date: a.date,
              platform: a.platform,
              amount_spent: a.amount_spent,
              product_id: a.product_id
          }));
          await supabase.from('ad_spend').insert(payload);
      }
  };

  const handleDeleteAdSpend = async (id: string) => {
      setAdSpend(prev => prev.filter(a => a.id !== id));
      if (!isDemoMode && session?.user) {
          await supabase.from('ad_spend').delete().eq('id', id).eq('user_id', session.user.id);
      }
  };

  const handleSyncAdSpend = async (platform: string, start: string, end: string, newAds: AdSpend[]) => {
      const startDate = new Date(start);
      const endDate = new Date(end);
      
      // Update Local State: Remove old, add new
      setAdSpend(prev => {
          const others = prev.filter(a => {
              const d = new Date(a.date);
              const inRange = d >= startDate && d <= endDate;
              const isPlatform = a.platform === platform;
              return !(inRange && isPlatform);
          });
          return [...others, ...newAds];
      });

      // DB Sync
      if (!isDemoMode && session?.user) {
          // Delete old
          await supabase.from('ad_spend')
            .delete()
            .eq('user_id', session.user.id)
            .eq('platform', platform)
            .gte('date', start)
            .lte('date', end);
          
          // Insert new
          if (newAds.length > 0) {
              const payload = newAds.map(a => ({
                  user_id: session.user.id,
                  date: a.date,
                  platform: a.platform,
                  amount_spent: a.amount_spent,
                  product_id: a.product_id,
                  campaign_id: a.campaign_id,
                  campaign_name: a.campaign_name,
                  purchases: a.purchases
              }));
              await supabase.from('ad_spend').insert(payload);
          }
      }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthMessage(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthMessage({type: 'error', text: error.message});
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthMessage(null);
    const { data, error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: { data: { store_name: 'My Store' } }
    });
    if (error) setAuthMessage({type: 'error', text: error.message});
    else setAuthMessage({type: 'success', text: 'Account created! Please log in.'});
  };

  const handleDemoMode = () => {
    setIsDemoMode(true);
    setAuthMode('login');
  };

  if (authLoading) return <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-400"><Loader2 className="animate-spin" size={32} /></div>;

  if (!session && !isDemoMode) {
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <h2 className="text-center text-3xl font-extrabold text-slate-900 tracking-tight">MunafaBakhsh<span className="text-brand-600">Karobaar</span></h2>
                <p className="mt-2 text-center text-sm text-slate-600">Profit Intelligence for Pakistani Sellers</p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-slate-200">
                    <div className="flex justify-center mb-6 bg-slate-100 p-1 rounded-lg">
                        <button onClick={() => setAuthMode('login')} className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${authMode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Login</button>
                        <button onClick={() => setAuthMode('signup')} className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${authMode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Sign Up</button>
                    </div>

                    <form className="space-y-6" onSubmit={authMode === 'login' ? handleLogin : handleSignup}>
                        <div>
                            <label className="block text-sm font-medium text-slate-700">Email address</label>
                            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-brand-500 focus:border-brand-500 sm:text-sm" />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700">Password</label>
                            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-brand-500 focus:border-brand-500 sm:text-sm" />
                        </div>

                        {authMessage && (
                            <div className={`text-sm p-2 rounded ${authMessage.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                {authMessage.text}
                            </div>
                        )}

                        <div>
                            <button type="submit" className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500">
                                {authMode === 'login' ? 'Sign in' : 'Create account'}
                            </button>
                        </div>
                    </form>

                    <div className="mt-6">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-300" /></div>
                            <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-gray-500">Or continue with</span></div>
                        </div>
                        <div className="mt-6">
                            <button onClick={handleDemoMode} className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50">
                                View Demo Account
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar 
        currentPage={currentPage} 
        setPage={setCurrentPage} 
        storeName={storeName}
        email={session?.user?.email || 'demo@munafabakhsh.com'}
        inventoryAlertCount={inventoryAlertCount}
      />

      <div className="flex-1 ml-64 overflow-y-auto h-screen p-8">
        {loading && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
                <Loader2 className="animate-spin text-brand-600" size={40} />
            </div>
        )}
        
        {error && (
            <div className="mb-6 bg-red-50 border border-red-200 p-4 rounded-xl flex gap-3 text-red-800">
                <AlertTriangle className="shrink-0" />
                <div>
                    <h4 className="font-bold">Sync Error</h4>
                    <p className="text-sm">{error}</p>
                    <button onClick={() => setRefreshTrigger(prev => prev + 1)} className="mt-2 text-xs font-bold underline">Retry Sync</button>
                </div>
            </div>
        )}

        {!isConfigured && !loading && currentPage !== 'integrations' && currentPage !== 'settings' ? (
             <div className="flex flex-col items-center justify-center h-[80vh] text-center max-w-lg mx-auto">
                 <div className="w-16 h-16 bg-brand-100 text-brand-600 rounded-2xl flex items-center justify-center mb-6">
                     <AlertTriangle size={32} />
                 </div>
                 <h2 className="text-2xl font-bold text-slate-900 mb-2">Setup Required</h2>
                 <p className="text-slate-500 mb-8">
                     To start analyzing your profits, please connect your Courier (PostEx, TCS) or Store first.
                 </p>
                 <button 
                    onClick={() => setCurrentPage('integrations')}
                    className="bg-brand-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-brand-700 transition-colors shadow-lg shadow-brand-200"
                 >
                     Go to Integrations
                 </button>
             </div>
        ) : (
            <>
                {currentPage === 'dashboard' && <Dashboard orders={orders} shopifyOrders={shopifyOrders} adSpend={adSpend} adsTaxRate={settings.adsTaxRate} storeName={storeName} />}
                {currentPage === 'orders' && <Orders orders={orders} />}
                {currentPage === 'couriers' && <Couriers orders={orders} />}
                {currentPage === 'profitability' && <Profitability orders={orders} shopifyOrders={shopifyOrders} products={products} adSpend={adSpend} adsTaxRate={settings.adsTaxRate} storeName={storeName} />}
                {currentPage === 'inventory' && <Inventory products={products} orders={orders} shopifyOrders={shopifyOrders} onUpdateProducts={handleUpdateProducts} />}
                {currentPage === 'marketing' && <Marketing adSpend={adSpend} products={products} orders={orders} onAddAdSpend={handleUpdateAdSpend} onDeleteAdSpend={handleDeleteAdSpend} onSyncAdSpend={handleSyncAdSpend} onNavigate={setCurrentPage} />}
                {currentPage === 'integrations' && <Integrations onConfigUpdate={() => setRefreshTrigger(prev => prev + 1)} />}
                {currentPage === 'settings' && <Settings onUpdateStoreName={setStoreName} />}
                {currentPage === 'reconciliation' && (
                    <Reconciliation 
                        shopifyOrders={shopifyOrders} 
                        courierOrders={orders} 
                        products={products} 
                        storeName={storeName} 
                    />
                )}
            </>
        )}
      </div>
    </div>
  );
};

export default App;
