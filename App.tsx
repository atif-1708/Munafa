import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Couriers from './pages/Couriers';
import Profitability from './pages/Profitability';
import Integrations from './pages/Integrations';
import Settings from './pages/Settings';
import { PostExAdapter } from './services/couriers/postex';
import { Order, Product, AdSpend, CourierName, IntegrationConfig, OrderStatus } from './types';
import { Loader2, AlertTriangle, LogIn, UserPlus, ShieldCheck, RefreshCw, Box } from 'lucide-react';
import { supabase, getCurrentUser } from './services/supabase';
import { COURIER_RATES, PACKAGING_COST_AVG } from './constants';
import { getOrders } from './services/mockData';

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
        let settings = { rates: COURIER_RATES, packagingCost: PACKAGING_COST_AVG };
        
        if (!isDemoMode) {
            const { data: settingsData } = await supabase
                .from('app_settings')
                .select('*')
                .eq('user_id', user.id)
                .single();
            
            if (settingsData) {
                settings = { 
                    rates: settingsData.courier_rates || COURIER_RATES, 
                    packagingCost: settingsData.packaging_cost || PACKAGING_COST_AVG 
                };
            }
        } else {
            const localSettings = localStorage.getItem('munafa_settings');
            if (localSettings) {
                const parsed = JSON.parse(localSettings);
                settings = {
                    rates: parsed.rates || COURIER_RATES,
                    packagingCost: parsed.packagingCost || PACKAGING_COST_AVG
                };
            }
        }

        // B. Fetch Integrations
        let postExConfig: IntegrationConfig | undefined;
        let anyActiveConfig = false;

        if (!isDemoMode) {
            const { data: configData } = await supabase
                .from('integration_configs')
                .select('*')
                .eq('user_id', user.id);
            
            if (configData && configData.length > 0) {
                 anyActiveConfig = configData.some(c => c.is_active);
                 postExConfig = configData.find(c => c.courier === CourierName.POSTEX && c.is_active);
            }
        } else {
            const localConfigs = localStorage.getItem('munafa_api_configs');
            if (localConfigs) {
                const configs = JSON.parse(localConfigs);
                const values = Object.values(configs) as IntegrationConfig[];
                anyActiveConfig = values.some(c => c.is_active);
                postExConfig = configs[CourierName.POSTEX];
            }
        }

        if (!anyActiveConfig) {
            setLoading(false);
            setIsConfigured(false);
            return;
        }

        setIsConfigured(true);

        // C. Fetch Live Orders from PostEx (if active)
        if (postExConfig && postExConfig.is_active) {
            const postExAdapter = new PostExAdapter();
            const rawOrders = await postExAdapter.fetchRecentOrders(postExConfig);

            const processedOrders = rawOrders.map(order => {
                const rateCard = settings.rates[order.courier] || settings.rates[CourierName.POSTEX];
                const isRto = order.status === OrderStatus.RETURNED || order.status === OrderStatus.RTO_INITIATED;
                
                return {
                    ...order,
                    packaging_cost: settings.packagingCost,
                    courier_fee: rateCard.forward,
                    rto_penalty: isRto ? rateCard.rto : 0
                };
            });

            setOrders(processedOrders);
            
            // Mock Products
            const inferredProducts: Product[] = processedOrders.map(o => ({
                id: o.items[0].product_id,
                shopify_id: 'unknown',
                title: o.items[0].product_name,
                sku: 'SYNCED-SKU',
                image_url: '',
                current_cogs: o.items[0].cogs_at_time_of_order,
                cost_history: []
            }));
            setProducts(inferredProducts);
        } else {
            setOrders([]); // Or handle other couriers
        }

      } catch (err: any) {
        console.error("Data Sync Error", err);
        setError("Failed to sync data. " + (err.message || ""));
        // Even if sync fails, if we had a config, we are 'configured'
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
        setOrders(mockOrders);
        const inferredProducts: Product[] = mockOrders.map(o => ({
            id: o.items[0].product_id,
            shopify_id: 'unknown',
            title: o.items[0].product_name,
            sku: 'SYNCED-SKU',
            image_url: '',
            current_cogs: o.items[0].cogs_at_time_of_order,
            cost_history: []
        }));
        setProducts(inferredProducts);
        setError(null);
        setLoading(false);
    }, 800);
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

  // --- Render Logic ---

  if (authLoading) {
    return (
        <div className="h-screen w-full flex items-center justify-center bg-slate-50">
            <Loader2 className="animate-spin text-brand-600" size={40} />
        </div>
    );
  }

  if (!session && !isDemoMode) {
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md border border-slate-200">
                <div className="text-center mb-6">
                    <h1 className="text-3xl font-bold text-brand-600">Munafa</h1>
                    <p className="text-slate-500 mt-2">Profit Intelligence for Pakistan</p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-lg mb-6">
                    <button 
                        onClick={() => { setAuthMode('login'); setAuthMessage(null); }}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${authMode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Log In
                    </button>
                    <button 
                        onClick={() => { setAuthMode('signup'); setAuthMessage(null); }}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${authMode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Sign Up
                    </button>
                </div>
                <form onSubmit={handleAuth} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                        <input 
                            type="email" 
                            required
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                        <input 
                            type="password" 
                            required
                            minLength={6}
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                        />
                    </div>
                    {authMessage && (
                        <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${authMessage.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                            {authMessage.type === 'error' ? <AlertTriangle size={16} className="mt-0.5" /> : <ShieldCheck size={16} className="mt-0.5" />}
                            <span>{authMessage.text}</span>
                        </div>
                    )}
                    <button type="submit" className="w-full bg-brand-600 text-white py-2 rounded-lg font-medium hover:bg-brand-700 flex justify-center items-center gap-2">
                        {authMode === 'login' ? <LogIn size={18} /> : <UserPlus size={18} />}
                        {authMode === 'login' ? 'Log In' : 'Create Account'}
                    </button>
                </form>
                <div className="mt-6 pt-6 border-t border-slate-100">
                    <button 
                        onClick={() => setIsDemoMode(true)}
                        className="w-full text-slate-500 text-sm hover:text-slate-700 font-medium"
                    >
                        Continue as Guest (Local Storage Mode)
                    </button>
                </div>
            </div>
        </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-brand-600" size={40} />
            <p className="text-slate-500 font-medium">Syncing Orders & Financials...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      <Sidebar currentPage={currentPage} setPage={setCurrentPage} />
      
      <main className="flex-1 ml-64 p-8">
        <div className="max-w-7xl mx-auto">
          {isDemoMode && (
             <div className="mb-6 bg-blue-50 border border-blue-200 text-blue-700 p-3 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                    <AlertTriangle size={16} />
                    <span><strong>Guest Mode:</strong> Settings are saved to your browser only. Log in to sync across devices.</span>
                </div>
                <button 
                    onClick={() => setIsDemoMode(false)}
                    className="text-xs font-bold underline hover:text-blue-900"
                >
                    Log In Now
                </button>
             </div>
          )}

          {error && (
             <div className="mb-6 bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="shrink-0 mt-0.5" size={18} />
                    <div>
                        <h3 className="font-bold text-sm">Sync Failed</h3>
                        <p className="text-sm opacity-90">{error}</p>
                    </div>
                </div>
                <button 
                    onClick={loadDemoData}
                    className="shrink-0 bg-white border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors flex items-center gap-2"
                >
                    <Box size={16} />
                    Load Demo Data
                </button>
             </div>
          )}

          {!isConfigured && currentPage !== 'integrations' && (
            <div className="bg-white p-8 rounded-xl border border-slate-200 text-center py-16">
                <div className="inline-flex p-4 rounded-full bg-slate-100 text-slate-400 mb-4">
                    <Loader2 size={32} />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Connect Your Courier</h2>
                <p className="text-slate-500 max-w-md mx-auto mb-6">
                    To calculate real profit, please connect your courier account. 
                    {isDemoMode ? 'Keys will be saved locally.' : 'Keys will be encrypted in Supabase.'}
                </p>
                <div className="flex justify-center gap-3">
                    <button 
                        onClick={() => setCurrentPage('integrations')}
                        className="bg-brand-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-brand-700 transition-colors"
                    >
                        Go to Integrations
                    </button>
                    <button
                        onClick={() => setRefreshTrigger(prev => prev + 1)} 
                        className="bg-white border text-slate-600 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 transition-colors flex items-center gap-2"
                    >
                        <RefreshCw size={16} /> Check Again
                    </button>
                </div>
            </div>
          )}

          {(isConfigured || currentPage === 'integrations') && (
              <>
                {currentPage === 'dashboard' && <Dashboard orders={orders} adSpend={adSpend} />}
                {currentPage === 'orders' && <Orders orders={orders} />}
                {currentPage === 'couriers' && <Couriers orders={orders} />}
                {currentPage === 'profitability' && <Profitability orders={orders} products={products} />}
                {currentPage === 'integrations' && <Integrations onConfigUpdate={() => setRefreshTrigger(p => p + 1)} />}
                {currentPage === 'settings' && <Settings />}
                {currentPage === 'marketing' && (
                    <div className="flex flex-col items-center justify-center h-96 text-slate-400">
                        <p className="text-xl font-medium">Marketing Module</p>
                        <p className="text-sm">Ad integration coming soon.</p>
                    </div>
                )}
              </>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;