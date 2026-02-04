
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
import TcsDebug from './pages/TcsDebug'; 
import Auth from './pages/Auth'; 
import { PostExAdapter } from './services/couriers/postex';
import { TcsAdapter } from './services/couriers/tcs';
import { ShopifyAdapter } from './services/shopify'; 
import { Order, Product, AdSpend, CourierName, SalesChannel, CourierConfig, OrderStatus, ShopifyOrder, IntegrationConfig, PaymentStatus } from './types';
import { Loader2, AlertTriangle, X, Info } from 'lucide-react';
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
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);

  const [currentPage, setCurrentPage] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  
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

  // Integration Configs Cache (for manual tracking)
  const [configs, setConfigs] = useState<{ tcs?: IntegrationConfig, postex?: IntegrationConfig }>({});

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
                currentProducts.find(p => p.id === item.product_id) ||
                currentProducts.find(p => p.aliases && p.aliases.includes(item.product_name)); // Improved Aliasing
            
            let correctCogs = item.cogs_at_time_of_order;
            
            if (productDef) {
                correctCogs = getCostAtDate(productDef, order.created_at);
            }

            return { 
                ...item, 
                cogs_at_time_of_order: correctCogs,
                product_id: productDef ? productDef.id : item.product_id 
            };
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
      setInfoMessage(null);

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
                    variant_fingerprint: p.sku, 
                    image_url: p.image_url || '',
                    current_cogs: p.current_cogs,
                    cost_history: p.cost_history || [],
                    group_id: p.group_id,
                    group_name: p.group_name,
                    aliases: p.aliases || [] 
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
             const { data: salesData } = await supabase.from('sales_channels').select('*').eq('user_id', user.id).eq('platform', 'Shopify').limit(1);
             if (salesData && salesData.length > 0) shopifyConfig = salesData[0];

             const { data: courierData } = await supabase.from('integration_configs').select('*').eq('user_id', user.id).eq('is_active', true);
             if (courierData) {
                postExConfig = courierData.find((c: any) => c.provider_id === CourierName.POSTEX);
                tcsConfig = courierData.find((c: any) => c.provider_id === CourierName.TCS);
                setConfigs({ tcs: tcsConfig, postex: postExConfig });
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

        // E. Fetch Shopify Data 
        let rawShopifyOrders: ShopifyOrder[] = [];
        if (shopifyConfig) {
            try {
                const shopifyAdapter = new ShopifyAdapter();
                rawShopifyOrders = await shopifyAdapter.fetchOrders(shopifyConfig);
                setShopifyOrders(rawShopifyOrders);
            } catch (e: any) {
                console.error("Shopify Sync Error:", e);
                setError("Shopify Sync Failed: " + e.message);
            }
        } else {
            setShopifyOrders([]);
        }

        // F. Fetch Live Orders from Couriers (List-Based APIs)
        let fetchedOrders: Order[] = [];
        let infoMsgs: string[] = [];

        // 1. PostEx
        if (postExConfig) {
            try {
                const postExAdapter = new PostExAdapter();
                const pxOrders = await postExAdapter.fetchRecentOrders(postExConfig);
                fetchedOrders = [...fetchedOrders, ...pxOrders];
                if (pxOrders.length === 0) infoMsgs.push("PostEx connected but returned 0 orders in last 60 days.");
            } catch (e: any) {
                console.error("PostEx Sync Error:", e);
                setError((prev) => (prev ? prev + " | " : "") + "PostEx Failed: " + e.message);
            }
        }

        // 2. TCS (Settlement API Only)
        let tcsFoundOrders = false;
        if (tcsConfig) {
            try {
                const tcsAdapter = new TcsAdapter();
                const tcsOrders = await tcsAdapter.fetchRecentOrders(tcsConfig);
                fetchedOrders = [...fetchedOrders, ...tcsOrders];
                if (tcsOrders.length > 0) tcsFoundOrders = true;
            } catch (e: any) {
                console.error("TCS Sync Error:", e);
                console.warn("TCS Settlement API Failed: " + e.message);
            }
        }

        // G. Backfill TCS Orders from Shopify (ROBUST: Works without TCS Token & Checks Tags)
        if (rawShopifyOrders.length > 0) {
             // 1. Define window (Last 120 Days to match fetch)
             const cutoffDate = new Date();
             cutoffDate.setDate(cutoffDate.getDate() - 120);

             const existingRefNos = new Set(fetchedOrders.map(o => String(o.shopify_order_number || '').replace('#','')));
             
             // 2. Filter Candidates from Shopify
             const candidates = rawShopifyOrders.filter(s => {
                 if (!s) return false;

                 // Date Check
                 const d = new Date(s.created_at);
                 if (d < cutoffDate) return false;

                 // Duplication Check
                 const safeName = String(s.name || '').replace('#','');
                 const isUnmapped = !existingRefNos.has(safeName);
                 const isFulfilled = s.fulfillment_status === 'fulfilled' || s.fulfillment_status === 'partial';
                 
                 // --- Robust TCS Detection Logic ---
                 // A. Check Tags (Include even if unfulfilled if tagged TCS)
                 const tags = (s.tags || '').toLowerCase();
                 const hasTcsTag = tags.includes('tcs');

                 if (isUnmapped && hasTcsTag) return true;

                 // If already fulfilled but not mapped, check if it's TCS fulfillment
                 if (isUnmapped && isFulfilled) {
                     return s.fulfillments?.some(f => {
                         const company = f.tracking_company ? String(f.tracking_company).toLowerCase() : '';
                         const num = (f.tracking_number ? String(f.tracking_number) : '').replace(/[^a-zA-Z0-9]/g, '');
                         
                         // Negative check: Not other common couriers
                         const isOther = company.includes('trax') || company.includes('leopard') || company.includes('postex') || company.includes('mnp') || company.includes('callcourier');
                         
                         if (isOther) return false;

                         // Positive check: Name includes TCS OR Number format is 9-16 digits (TCS standard)
                         return company.includes('tcs') || /^\d{9,16}$/.test(num);
                     });
                 }
                 return false;
             });

             if (candidates.length > 0) {
                 const tcsBatchCount = candidates.length;
                 console.log(`[TCS Backfill] Found ${tcsBatchCount} candidates from last 120 days.`);
                 infoMsgs.push(`Found ${tcsBatchCount} TCS orders via Shopify tags/tracking.`);

                 // --- BATCH PROCESSING FOR TCS AUTOMATIC TRACKING ---
                 // TCS API only allows single tracking. We must process in small batches.
                 
                 const BATCH_SIZE = 5;
                 const TCS_DELAY_MS = 1000;
                 const processedTcsOrders: Order[] = [];

                 // Process in chunks
                 for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
                     const batch = candidates.slice(i, i + BATCH_SIZE);
                     
                     const batchResults = await Promise.all(batch.map(async (sOrder) => {
                         try {
                            // Find the most likely TCS fulfillment
                            const hasTcsTag = (sOrder.tags || '').toLowerCase().includes('tcs');
                            let ff = sOrder.fulfillments?.find(f => {
                                const company = f.tracking_company ? String(f.tracking_company).toLowerCase() : '';
                                const num = (f.tracking_number ? String(f.tracking_number) : '').replace(/[^a-zA-Z0-9]/g, '');
                                const isOther = company.includes('trax') || company.includes('leopard') || company.includes('postex') || company.includes('mnp') || company.includes('callcourier');
                                
                                if (hasTcsTag && !isOther && f.tracking_number) return true;
                                return !isOther && (company.includes('tcs') || /^\d{9,16}$/.test(num));
                            });

                            if (!ff && hasTcsTag && sOrder.fulfillments) {
                                ff = sOrder.fulfillments.find(f => f.tracking_number && String(f.tracking_number).length > 5);
                            }

                            // --- KEY LOGIC UPDATE: Handle Unfulfilled TCS Orders ---
                            let trackingNo = 'Pending';
                            let status = OrderStatus.PENDING;
                            let rawStatusText = 'Order Placed';
                            let orderId = String(sOrder.id);

                            if (ff && ff.tracking_number) {
                                trackingNo = ff.tracking_number;
                                orderId = ff.tracking_number; // Prefer Tracking Number as ID if available
                                status = OrderStatus.BOOKED; // Default to BOOKED until status is confirmed via Live API
                                rawStatusText = 'Booked / Pending Scan';
                                
                                // *** AUTOMATIC LIVE TRACKING ***
                                if (tcsConfig && tcsConfig.api_token) {
                                    try {
                                        const tcsAdapter = new TcsAdapter();
                                        const update = await tcsAdapter.track(trackingNo, tcsConfig);
                                        status = update.status;
                                        rawStatusText = update.raw_status_text;
                                    } catch (e) {
                                        // Silent fail - remains BOOKED
                                    }
                                }
                            } else {
                                // If unfulfilled but tagged TCS
                                rawStatusText = 'Waiting for Fulfillment';
                            }

                            const cod = parseFloat(sOrder.total_price || '0');
                            const safeItems = Array.isArray(sOrder.line_items) ? sOrder.line_items : [];
                            
                            // Use Shipping Address City if available, else Customer City
                            const customerCity = sOrder.shipping_address?.city || sOrder.customer?.city || 'Unknown';

                            const newOrder: Order = {
                                id: orderId,
                                shopify_order_number: sOrder.name || 'Unknown',
                                created_at: sOrder.created_at,
                                customer_city: customerCity,
                                courier: CourierName.TCS,
                                tracking_number: trackingNo,
                                status: status,
                                payment_status: PaymentStatus.UNPAID,
                                cod_amount: cod,
                                shipping_fee_paid_by_customer: 0,
                                courier_fee: fetchedSettings.rates[CourierName.TCS].forward,
                                rto_penalty: 0, 
                                packaging_cost: fetchedSettings.packagingCost,
                                overhead_cost: 0,
                                tax_amount: 0,
                                data_source: 'tracking', 
                                courier_raw_status: rawStatusText, // Save the auto-fetched status
                                items: safeItems.map(li => {
                                    // Extract variant name if present in title (common in some Shopify setups) OR explicitly from variant_title if we had it mapped
                                    // Note: ShopifyLineItem interface has 'title' and 'sku'.
                                    // Often title includes variant or it's separate. 
                                    // Ideally, we should concatenate title + variant_title if available in future, but current types.ts only has title.
                                    // We will stick to title, but ensure we use it fully.
                                    
                                    return {
                                        product_id: 'unknown',
                                        quantity: li.quantity,
                                        sale_price: parseFloat(li.price || '0'),
                                        product_name: li.title || 'Unknown Product',
                                        sku: li.sku || 'unknown',
                                        variant_fingerprint: li.sku || 'unknown',
                                        cogs_at_time_of_order: 0
                                    }
                                })
                            };
                            return newOrder;
                         } catch (err) {
                            return null;
                         }
                     }));

                     const validBatch = batchResults.filter((o): o is Order => o !== null);
                     processedTcsOrders.push(...validBatch);

                     // Throttle if we are actually calling the API
                     if (tcsConfig && tcsConfig.api_token && i + BATCH_SIZE < candidates.length) {
                         await new Promise(r => setTimeout(r, TCS_DELAY_MS));
                     }
                 }

                 fetchedOrders = [...fetchedOrders, ...processedTcsOrders];
             }
        }

        if(infoMsgs.length > 0) {
            setInfoMessage(infoMsgs.join(' '));
        }

        // Process discovered items from Courier Orders
        fetchedOrders.forEach(o => {
            if (!o.items) return;
            o.items.forEach(item => {
                // IMPORTANT: Generate fingerprint even if SKU is missing
                const fingerprint = item.variant_fingerprint || item.sku || 
                                    item.product_name.toLowerCase().replace(/[^a-z0-9]/g, '-');

                const exists = finalProducts.some(p => 
                    p.sku === item.sku || 
                    (p.variant_fingerprint && p.variant_fingerprint === fingerprint) ||
                    (p.aliases && p.aliases.includes(item.product_name)) ||
                    p.title === item.product_name // Direct title match fallback
                );

                if (!exists && !seenFingerprints.has(fingerprint)) {
                    seenFingerprints.add(fingerprint);
                    const uniqueId = (item.product_id && item.product_id !== 'unknown') ? item.product_id : fingerprint;
                    finalProducts.push({
                        id: uniqueId,
                        shopify_id: 'unknown',
                        title: item.product_name,
                        sku: item.sku !== 'unknown' ? item.sku : fingerprint, 
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
                const productDef = finalProducts.find(p => (p.variant_fingerprint && p.variant_fingerprint === item.variant_fingerprint) || p.sku === item.sku || p.title === item.product_name || (p.aliases && p.aliases.includes(item.product_name)));
                const historicalCogs = productDef ? getCostAtDate(productDef, order.created_at) : 0;
                
                return { 
                    ...item, 
                    cogs_at_time_of_order: historicalCogs,
                    // LINKING FIX: Ensure product_id is set to the valid one from our list, not 'unknown'
                    product_id: productDef ? productDef.id : item.product_id 
                };
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
          if (error) {
              console.error("Failed to save product updates:", error);
              setError(`Database Save Failed: ${error.message}`);
          }
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

  // --- MANUAL LIVE TRACKING ---
  const handleManualTrack = async (order: Order): Promise<OrderStatus> => {
      try {
          let updatedStatus = order.status;
          let rawStatus = order.courier_raw_status;
          
          if (order.courier === CourierName.TCS && configs.tcs) {
              const adapter = new TcsAdapter();
              const result = await adapter.track(order.tracking_number, configs.tcs);
              updatedStatus = result.status;
              rawStatus = result.raw_status_text;
          } else if (order.courier === CourierName.POSTEX && configs.postex) {
              const adapter = new PostExAdapter();
              const result = await adapter.track(order.tracking_number, configs.postex);
              updatedStatus = result.status;
              rawStatus = result.raw_status_text;
          }

          // Update Local State if status changed
          if (updatedStatus !== order.status || rawStatus !== order.courier_raw_status) {
              setOrders(prev => prev.map(o => o.id === order.id ? { 
                  ...o, 
                  status: updatedStatus,
                  courier_raw_status: rawStatus // Updated: Save Raw Status for UI display
              } : o));
          }
          return updatedStatus;
      } catch (e) {
          console.error("Manual Track Error", e);
          throw e;
      }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthSubmitting(true);
    setAuthMessage(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setIsAuthSubmitting(false);
    if (error) setAuthMessage({type: 'error', text: error.message});
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthSubmitting(true);
    setAuthMessage(null);
    const { data, error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: { data: { store_name: 'My Store' } }
    });
    setIsAuthSubmitting(false);
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
        <Auth 
            authMode={authMode}
            setAuthMode={setAuthMode}
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            handleLogin={handleLogin}
            handleSignup={handleSignup}
            handleDemoMode={handleDemoMode}
            authMessage={authMessage}
            loading={isAuthSubmitting}
        />
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

        {infoMessage && (
            <div className="mb-6 bg-blue-50 border border-blue-200 p-4 rounded-xl flex gap-3 text-blue-800">
                <Info className="shrink-0" />
                <div>
                    <h4 className="font-bold">Sync Info</h4>
                    <p className="text-sm">{infoMessage}</p>
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
                {currentPage === 'orders' && <Orders orders={orders} onTrackOrder={handleManualTrack} />}
                {currentPage === 'couriers' && <Couriers orders={orders} />}
                {/* Updated to pass tcsConfig for manual tracking */}
                {currentPage === 'tcs-debug' && <TcsDebug orders={orders} shopifyOrders={shopifyOrders} onTrackOrder={handleManualTrack} tcsConfig={configs.tcs} />}
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
