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
import { PostExAdapter } from './services/couriers/postex';
import { Order, Product, AdSpend, CourierName, IntegrationConfig, OrderStatus } from './types';
import { Loader2, AlertTriangle, LogIn, UserPlus, ShieldCheck, RefreshCw, Box } from 'lucide-react';
import { supabase } from './services/supabase';
import { calculateMetrics, getCostAtDate } from './services/calculator';
import { COURIER_RATES, PACKAGING_COST_AVG } from './constants';
import { getOrders, getAdSpend } from './services/mockData';

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
  const [products, setProducts] = useState<Product[]>([]);
  const [adSpend, setAdSpend] = useState<AdSpend[]>([]);
  const [isConfigured, setIsConfigured] = useState(false);
  
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

  // 1. Check Auth on Load
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // --- Helper: Recalculate Order Costs ---
  const recalculateOrderCosts = useCallback((currentOrders: Order[], currentProducts: Product[]) => {
    return currentOrders.map(order => {
        const updatedItems = order.items.map(item => {
            // MATCHING STRATEGY: Fingerprint -> SKU -> ID
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

        // 0. Ensure Profile Exists
        if (!isDemoMode && user.id !== 'demo-user') {
            const { data: profile, error: fetchError } = await supabase
                .from('profiles')
                .select('id')
                .eq('id', user.id)
                .single();
            
            if (!profile && !fetchError) {
                 await supabase.from('profiles').insert([{ id: user.id, store_name: 'My Store' }]);
            } else if (fetchError && fetchError.code === 'PGRST116') {
                 await supabase.from('profiles').insert([{ id: user.id, store_name: 'My Store' }]);
            }
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
        } else {
            const localSettings = localStorage.getItem('munafa_settings');
            if (localSettings) fetchedSettings = JSON.parse(localSettings);
        }
        setSettings(fetchedSettings);

        // B. Fetch SAVED Products (Database Source of Truth)
        let savedProducts: Product[] = [];
        if (!isDemoMode) {
            const { data: productData } = await supabase
                .from('products')
                .select('*')
                .eq('user_id', user.id);
            
            if (productData) {
                // Map DB snake_case to Product interface
                savedProducts = productData.map((p: any) => ({
                    id: p.id,
                    shopify_id: p.shopify_id || '',
                    title: p.title,
                    sku: p.sku,
                    // If we stored fingerprint in SKU in DB, or separate field (assuming existing SKU col for now)
                    variant_fingerprint: p.sku, 
                    image_url: p.image_url || '',
                    current_cogs: p.current_cogs,
                    cost_history: p.cost_history || [],
                    group_id: p.group_id,
                    group_name: p.group_name
                }));
            }
        }

        // C. Fetch Ad Spend
        if (!isDemoMode) {
            const { data: adData, error: adError } = await supabase
                .from('ad_spend')
                .select('*')
                .eq('user_id', user.id)
                .order('date', { ascending: false });
            
            if (adData) {
                setAdSpend(adData.map((a: any) => ({
                    id: a.id,
                    date: a.date,
                    platform: a.platform,
                    amount_spent: a.amount_spent,
                    product_id: a.product_id,
                    attributed_orders: a.attributed_orders
                })));
            }
            if (adError) {
                console.warn("Could not fetch ad_spend.", adError);
            }
        }

        // D. Fetch Integrations & Orders
        let postExConfig: IntegrationConfig | undefined;
        let anyActiveConfig = false;

        if (!isDemoMode) {
            const { data: configData } = await supabase.from('integration_configs').select('*').eq('user_id', user.id);
            if (configData && configData.length > 0) {
                 anyActiveConfig = configData.some(c => c.is_active);
                 postExConfig = configData.find(c => c.courier === CourierName.POSTEX && c.is_active);
            }
        } else {
            const localConfigs = localStorage.getItem('munafa_api_configs');
            if (localConfigs) {
                const configs = JSON.parse(localConfigs);
                anyActiveConfig = Object.values(configs).some((c: any) => c.is_active);
                postExConfig = configs[CourierName.POSTEX];
            }
        }

        if (!anyActiveConfig) {
            setLoading(false);
            setIsConfigured(false);
            setProducts(savedProducts);
            return;
        }

        setIsConfigured(true);

        // E. Fetch Live Orders
        if (postExConfig && postExConfig.is_active) {
            const postExAdapter = new PostExAdapter();
            const rawOrders = await postExAdapter.fetchRecentOrders(postExConfig);

            // Merge Logic: Detect new products based on FINGERPRINT
            const finalProducts = [...savedProducts];
            // We use the fingerprint (stored in sku for consistency) as the check
            const seenFingerprints = new Set(savedProducts.map(p => p.variant_fingerprint || p.sku));

            rawOrders.forEach(o => {
                // USER REQUEST: Don't include products that are ONLY in Booked or Unbooked (Pending) status.
                // We also exclude Cancelled.
                const isRelevantForInventory = 
                    o.status !== OrderStatus.PENDING && 
                    o.status !== OrderStatus.BOOKED && 
                    o.status !== OrderStatus.CANCELLED;

                if (!isRelevantForInventory) return;

                o.items.forEach(item => {
                    // Critical: Use the fingerprint generated by the adapter
                    const fingerprint = item.variant_fingerprint || item.sku || 'unknown';
                    
                    if (!seenFingerprints.has(fingerprint)) {
                        seenFingerprints.add(fingerprint);

                        // Ensure ID is unique. If product_id is missing or 'unknown', use fingerprint as fallback.
                        // This prevents all inferred products from sharing the ID 'unknown' and updating in unison.
                        const uniqueId = (item.product_id && item.product_id !== 'unknown') 
                            ? item.product_id 
                            : fingerprint;

                        finalProducts.push({
                            id: uniqueId,
                            shopify_id: 'unknown',
                            title: item.product_name,
                            sku: fingerprint, // We treat the fingerprint as the SKU for internal tracking
                            variant_fingerprint: fingerprint,
                            image_url: '',
                            current_cogs: 0,
                            cost_history: []
                        });
                    }
                });
            });

            // Process Orders (apply correct costs from finalProducts)
            const processedOrders = rawOrders.map(order => {
                const rateCard = fetchedSettings.rates[order.courier] || fetchedSettings.rates[CourierName.POSTEX];
                const isRto = order.status === OrderStatus.RETURNED || order.status === OrderStatus.RTO_INITIATED;
                
                const updatedItems = order.items.map(item => {
                    const productDef = finalProducts.find(p => 
                        (p.variant_fingerprint && p.variant_fingerprint === item.variant_fingerprint) || 
                        p.sku === item.sku
                    );
                    const historicalCogs = productDef ? getCostAtDate(productDef, order.created_at) : 0;
                    return { ...item, cogs_at_time_of_order: historicalCogs };
                });
                
                // Calculate Tax (Applied on Delivered Orders)
                const taxAmount = order.status === OrderStatus.DELIVERED ? (order.cod_amount * (fetchedSettings.taxRate / 100)) : 0;

                return {
                    ...order,
                    items: updatedItems,
                    packaging_cost: fetchedSettings.packagingCost,
                    overhead_cost: fetchedSettings.overheadCost,
                    tax_amount: taxAmount,
                    courier_fee: rateCard.forward,
                    rto_penalty: isRto ? rateCard.rto : 0
                };
            });

            setProducts(finalProducts);
            setOrders(processedOrders);

        } else {
            setOrders([]);
            setProducts(savedProducts);
        }

      } catch (err: any) {
        console.error("Data Sync Error", err);
        setError("Failed to sync data. " + (err.message || ""));
        setIsConfigured(true); 
      } finally {
        setLoading(false);
      }
    };

    fetchAppData();
  }, [session, isDemoMode, refreshTrigger]);

  const loadDemoData = () => {
    setLoading(true);
    setTimeout(() => {
        const mockOrders = getOrders([]);
        const inferredProducts: Product[] = [];
        const seen = new Set();
        mockOrders.forEach(o => {
            const item = o.items[0];
            if (!seen.has(item.sku)) {
                seen.add(item.sku);
                inferredProducts.push({
                    id: item.product_id,
                    shopify_id: 'unknown',
                    title: item.product_name,
                    sku: item.sku || 'SKU',
                    variant_fingerprint: item.sku,
                    image_url: '',
                    current_cogs: item.cogs_at_time_of_order,
                    cost_history: [],
                    group_id: null,
                    group_name: null
                });
            }
        });
        
        // Demo Mode Defaults
        const demoProcessed = mockOrders.map(o => ({
            ...o, 
            overhead_cost: 0, 
            tax_amount: 0 
        }));

        setOrders(demoProcessed);
        setProducts(inferredProducts);
        if (adSpend.length === 0) setAdSpend(getAdSpend());
        setError(null);
        setLoading(false);
    }, 800);
  };

  const handleUpdateProducts = async (updatedProducts: Product[]) => {
    // 1. Optimistic Update
    const updatedIds = new Set(updatedProducts.map(p => p.id));
    const newProducts = products.map(p => updatedIds.has(p.id) ? updatedProducts.find(u => u.id === p.id)! : p);
    setProducts(newProducts);

    // 2. Recalculate Orders
    const newOrders = recalculateOrderCosts(orders, newProducts);
    setOrders(newOrders);

    // 3. Persist to Database
    if (!isDemoMode && session?.user) {
        try {
            const upsertData = updatedProducts.map(p => ({
                id: p.id,
                user_id: session.user.id,
                sku: p.sku, 
                title: p.title,
                current_cogs: p.current_cogs,
                cost_history: p.cost_history,
                shopify_id: p.shopify_id,
                group_id: p.group_id,
                group_name: p.group_name
            }));

            const { error } = await supabase.from('products').upsert(upsertData);
            
            if (error) {
                console.error("Failed to save product:", error);
            }
        } catch (e) {
            console.error("DB Error:", e);
        }
    }
  };

  const handleAddAdSpend = async (entries: AdSpend[]) => {
    setAdSpend(prev => [...entries, ...prev]);

    if (!isDemoMode && session?.user) {
        try {
            const dbPayload = entries.map(entry => ({
                id: entry.id,
                user_id: session.user.id,
                date: entry.date,
                platform: entry.platform,
                amount_spent: entry.amount_spent,
                product_id: entry.product_id || null
            }));

            const { error } = await supabase.from('ad_spend').insert(dbPayload);
            if (error) console.error('Error saving ad spend:', error);
        } catch (e) { console.error("DB Error:", e); }
    }
  };

  const handleDeleteAdSpend = async (id: string) => {
    setAdSpend(prev => prev.filter(a => a.id !== id));
    if (!isDemoMode && session?.user) {
        try { await supabase.from('ad_spend').delete().eq('id', id); } catch (e) { console.error("DB Error:", e); }
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthMessage(null);

    if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setAuthMessage({ type: 'error', text: error.message });
    } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
            setAuthMessage({ type: 'error', text: error.message });
        } else {
            setAuthMessage({ 
                type: 'success', 
                text: "Account created! Please check your email to confirm your account before logging in." 
            });
            setAuthMode('login');
        }
    }
    setAuthLoading(false);
  };
  
  // Calculate missing costs
  const missingCostCount = useMemo(() => {
      return products.filter(p => p.current_cogs === 0).length;
  }, [products]);

  if (authLoading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-brand-600" size={40} /></div>;

  if (!session && !isDemoMode) {
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md border border-slate-200">
                <div className="text-center mb-6">
                    <h1 className="text-3xl font-bold text-brand-600 tracking-tight">MunafaBakhsh Karobaar</h1>
                    <p className="text-slate-500 mt-2">Profit Intelligence for Pakistan</p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-lg mb-6">
                    <button onClick={() => { setAuthMode('login'); setAuthMessage(null); }} className={`flex-1 py-2 text-sm font-medium rounded-md ${authMode === 'login' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Log In</button>
                    <button onClick={() => { setAuthMode('signup'); setAuthMessage(null); }} className={`flex-1 py-2 text-sm font-medium rounded-md ${authMode === 'signup' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Sign Up</button>
                </div>
                <form onSubmit={handleAuth} className="space-y-4">
                    <input type="email" required className="w-full px-4 py-2 border rounded-lg" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
                    <input type="password" required className="w-full px-4 py-2 border rounded-lg" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
                    {authMessage && <div className={`p-3 rounded-lg text-sm ${authMessage.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{authMessage.text}</div>}
                    <button type="submit" className="w-full bg-brand-600 text-white py-2 rounded-lg">{authMode === 'login' ? 'Log In' : 'Create Account'}</button>
                </form>
                <button onClick={() => setIsDemoMode(true)} className="w-full text-slate-500 text-sm mt-6 hover:underline">Continue as Guest</button>
            </div>
        </div>
    );
  }

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin" size={40} /></div>;

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      <Sidebar 
          currentPage={currentPage} 
          setPage={setCurrentPage} 
          inventoryAlertCount={missingCostCount} 
      />
      <main className="flex-1 ml-64 p-8">
        <div className="max-w-7xl mx-auto">
          {/* ... (Error & Config State logic same as before) ... */}
          {(isConfigured || currentPage === 'integrations') && (
              <>
                {currentPage === 'dashboard' && <Dashboard orders={orders} adSpend={adSpend} adsTaxRate={settings.adsTaxRate} />}
                {currentPage === 'orders' && <Orders orders={orders} />}
                {currentPage === 'couriers' && <Couriers orders={orders} />}
                {currentPage === 'profitability' && <Profitability orders={orders} products={products} adSpend={adSpend} adsTaxRate={settings.adsTaxRate} />}
                {currentPage === 'inventory' && <Inventory products={products} onUpdateProducts={handleUpdateProducts} />}
                {currentPage === 'marketing' && <Marketing adSpend={adSpend} products={products} onAddAdSpend={handleAddAdSpend} onDeleteAdSpend={handleDeleteAdSpend} />}
                {currentPage === 'integrations' && <Integrations onConfigUpdate={() => setRefreshTrigger(p => p + 1)} />}
                {currentPage === 'settings' && <Settings />}
              </>
          )}
          {!isConfigured && currentPage !== 'integrations' && (
             <div className="bg-white p-8 rounded-xl border border-slate-200 text-center py-16">
                <Loader2 size={32} className="mx-auto text-slate-400 mb-4" />
                <h2 className="text-xl font-bold">Connect Courier</h2>
                <button onClick={() => setCurrentPage('integrations')} className="mt-4 bg-brand-600 text-white px-6 py-2 rounded-lg">Go to Integrations</button>
             </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;