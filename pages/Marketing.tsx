
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AdSpend, Product, MarketingConfig, CampaignMapping, Order } from '../types';
import { formatCurrency } from '../services/calculator';
import { FacebookService } from '../services/facebook';
import { TikTokService } from '../services/tiktok';
import { supabase } from '../services/supabase';
import { BarChart3, Plus, Trash2, Layers, Calendar, DollarSign, CalendarRange, RefreshCw, Facebook, AlertTriangle, Link, ArrowRight, X, CheckCircle2, LayoutGrid, ListFilter, Zap, Settings, ShoppingBag, Target } from 'lucide-react';

interface MarketingProps {
  adSpend: AdSpend[];
  products: Product[];
  orders: Order[]; // New prop for filtering active products
  onAddAdSpend: (ads: AdSpend[]) => void;
  onDeleteAdSpend: (id: string) => void;
  onSyncAdSpend?: (platform: string, start: string, end: string, ads: AdSpend[]) => void;
  onNavigate?: (page: string) => void;
}

const Marketing: React.FC<MarketingProps> = ({ adSpend, products, orders, onAddAdSpend, onDeleteAdSpend, onSyncAdSpend, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'facebook' | 'tiktok'>('overview');
  
  const [newAd, setNewAd] = useState<{
      startDate: string,
      endDate: string,
      platform: 'Facebook' | 'TikTok' | 'Google', 
      amount: string, 
      product_id: string
  }>({
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      platform: 'Facebook',
      amount: '',
      product_id: ''
  });

  // Default to Last 60 Days
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 60);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  });

  // State for Integrations
  const [fbConfig, setFbConfig] = useState<MarketingConfig | null>(null);
  const [tiktokConfig, setTiktokConfig] = useState<MarketingConfig | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number>(278); // Default PKR Rate for TikTok USD

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [mappings, setMappings] = useState<CampaignMapping[]>([]);
  const hasLoadedConfig = useRef(false);

  // Load Config
  useEffect(() => {
      const loadConfig = async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if(session?.user) {
              const { data: fbData } = await supabase.from('marketing_configs').select('*').eq('user_id', session.user.id).eq('platform', 'Facebook').single();
              if(fbData) setFbConfig(fbData);

              const { data: tkData } = await supabase.from('marketing_configs').select('*').eq('user_id', session.user.id).eq('platform', 'TikTok').single();
              if(tkData) setTiktokConfig(tkData);
              
              const { data: mapData } = await supabase.from('campaign_mappings').select('*').eq('user_id', session.user.id);
              if(mapData) setMappings(mapData);
              hasLoadedConfig.current = true;
          }
      };
      loadConfig();
  }, []);

  // --- AUTO-SYNC LOGIC ---
  useEffect(() => {
      if (hasLoadedConfig.current && onSyncAdSpend) {
          const timer = setTimeout(() => {
              if (activeTab === 'facebook' && fbConfig?.is_active) {
                  fetchAndSyncFacebookData();
              } else if (activeTab === 'tiktok' && tiktokConfig?.is_active) {
                  // Wait for user to trigger sync explicitly usually for rate change? 
                  // No, let's auto-sync if configured, using default rate or updated rate
                  fetchAndSyncTikTokData();
              }
          }, 500);
          return () => clearTimeout(timer);
      }
  }, [activeTab, dateRange, fbConfig, tiktokConfig, mappings, exchangeRate]); // Add exchangeRate dependency to re-sync when rate changes

  const fetchAndSyncFacebookData = async () => {
      if (!fbConfig || !fbConfig.is_active || !fbConfig.ad_account_id) return;
      if (!onSyncAdSpend) return;

      setIsSyncing(true);
      setSyncError(null);
      
      try {
          const svc = new FacebookService();
          const start = dateRange.start;
          const end = dateRange.end;
          
          const fetchedAds = await svc.fetchInsights(fbConfig, start, end);
          
          const newEntries: AdSpend[] = fetchedAds.map(fetched => {
              const mapping = mappings.find(m => m.campaign_id === fetched.campaign_id);
              return {
                  ...fetched,
                  product_id: mapping?.product_id || undefined
              };
          });

          // SYNC: Replace data for this range
          onSyncAdSpend('Facebook', start, end, newEntries);

      } catch (e: any) {
          console.error(e);
          setSyncError(e.message || "Failed to fetch Facebook data");
      } finally {
          setIsSyncing(false);
      }
  };

  const fetchAndSyncTikTokData = async () => {
      if (!tiktokConfig || !tiktokConfig.is_active || !tiktokConfig.ad_account_id) return;
      if (!onSyncAdSpend) return;

      setIsSyncing(true);
      setSyncError(null);
      
      try {
          const svc = new TikTokService();
          const start = dateRange.start;
          const end = dateRange.end;
          
          const fetchedAds = await svc.fetchInsights(tiktokConfig, start, end, exchangeRate);
          
          const newEntries: AdSpend[] = fetchedAds.map(fetched => {
              const mapping = mappings.find(m => m.campaign_id === fetched.campaign_id);
              return {
                  ...fetched,
                  product_id: mapping?.product_id || undefined
              };
          });

          onSyncAdSpend('TikTok', start, end, newEntries);

      } catch (e: any) {
          console.error(e);
          setSyncError(e.message || "Failed to fetch TikTok data");
      } finally {
          setIsSyncing(false);
      }
  };

  // Calculate active items in the date range for dropdown filtering
  const activeItemKeys = useMemo(() => {
      const start = new Date(dateRange.start);
      start.setHours(0,0,0,0);
      const end = new Date(dateRange.end);
      end.setHours(23,59,59,999);

      const keys = new Set<string>();
      orders.forEach(o => {
          const d = new Date(o.created_at);
          if (d >= start && d <= end) {
              o.items.forEach(i => {
                  if (i.variant_fingerprint) keys.add(i.variant_fingerprint);
                  if (i.sku) keys.add(i.sku);
                  if (i.product_id) keys.add(i.product_id);
              });
          }
      });
      return keys;
  }, [orders, dateRange]);

  // Extract unique groups (Filtered by activity)
  const groups = useMemo(() => {
      const uniqueGroups = new Map();
      products.forEach(p => {
          const isActive = activeItemKeys.has(p.variant_fingerprint || '') || activeItemKeys.has(p.sku) || activeItemKeys.has(p.id);
          
          if (isActive && p.group_id && p.group_name) {
              uniqueGroups.set(p.group_id, p.group_name);
          }
      });
      return Array.from(uniqueGroups.entries()).map(([id, name]) => ({ id, name }));
  }, [products, activeItemKeys]);

  // Filter standalone products (Filtered by activity)
  const standaloneProducts = useMemo(() => {
      return products.filter(p => {
          if (p.group_id) return false;
          const isActive = activeItemKeys.has(p.variant_fingerprint || '') || activeItemKeys.has(p.sku) || activeItemKeys.has(p.id);
          return isActive;
      });
  }, [products, activeItemKeys]);

  const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAd.amount) return;

    const start = new Date(newAd.startDate);
    const end = new Date(newAd.endDate);
    
    // Safety check
    if (end < start) {
        alert("End date cannot be before start date");
        return;
    }

    const diffTime = Math.abs(end.getTime() - start.getTime());
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Inclusive of start day
    
    const totalAmount = parseFloat(newAd.amount);
    const dailyAmount = totalAmount / days;
    
    const entries: AdSpend[] = [];
    
    for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        entries.push({
            id: generateUUID(),
            date: d.toISOString().split('T')[0],
            platform: newAd.platform,
            amount_spent: dailyAmount,
            product_id: newAd.product_id || undefined
        });
    }

    onAddAdSpend(entries);
    // Reset amount but keep dates/platform for easier consecutive entry
    setNewAd(prev => ({ ...prev, amount: '' }));
  };

  const saveMapping = async (campaignId: string, campaignName: string, productId: string, platform: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if(!session?.user) return;

      const mapping: CampaignMapping = {
          campaign_id: campaignId,
          campaign_name: campaignName,
          product_id: productId || null,
          platform: platform
      };

      // 1. Save to DB
      await supabase.from('campaign_mappings').upsert({
          user_id: session.user.id,
          ...mapping
      });

      // 2. Update Local State (Will trigger re-sync in useEffect due to dependency)
      setMappings(prev => {
          const filtered = prev.filter(m => m.campaign_id !== campaignId);
          return [...filtered, mapping];
      });
  };

  const filteredAds = useMemo(() => {
    const start = new Date(dateRange.start);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateRange.end);
    end.setHours(23, 59, 59, 999);

    return adSpend.filter(a => {
        const d = new Date(a.date);
        return d >= start && d <= end;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [adSpend, dateRange]);

  const totalPeriodSpend = useMemo(() => filteredAds.reduce((sum, ad) => sum + ad.amount_spent, 0), [filteredAds]);
  
  // Aggregate Campaigns for current view
  const aggregateCampaigns = (platform: 'Facebook' | 'TikTok') => {
      const stats = new Map<string, { id: string, name: string, spend: number, purchases: number, productId: string | undefined }>();
      
      filteredAds.forEach(ad => {
          if (ad.platform === platform && ad.campaign_id) {
              if (!stats.has(ad.campaign_id)) {
                  stats.set(ad.campaign_id, {
                      id: ad.campaign_id,
                      name: ad.campaign_name || 'Unknown',
                      spend: 0,
                      purchases: 0,
                      productId: ad.product_id
                  });
              }
              const c = stats.get(ad.campaign_id)!;
              c.spend += ad.amount_spent;
              c.purchases += (ad.purchases || 0);
          }
      });
      return Array.from(stats.values()).sort((a,b) => b.spend - a.spend);
  };

  const facebookCampaigns = useMemo(() => aggregateCampaigns('Facebook'), [filteredAds]);
  const tiktokCampaigns = useMemo(() => aggregateCampaigns('TikTok'), [filteredAds]);

  const unmappedFbCount = facebookCampaigns.filter(c => !c.productId).length;
  const unmappedTkCount = tiktokCampaigns.filter(c => !c.productId).length;

  // Helper for UI calculation
  const dailyPreview = useMemo(() => {
     if (!newAd.startDate || !newAd.endDate || !newAd.amount) return null;
     const start = new Date(newAd.startDate);
     const end = new Date(newAd.endDate);
     if (end < start) return null;
     const diffTime = Math.abs(end.getTime() - start.getTime());
     const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
     return days > 1 ? (parseFloat(newAd.amount) / days) : null;
  }, [newAd]);

  const renderProductOptions = () => (
      <>
          <option value="">-- General Store Spend --</option>
          {groups.length > 0 && (
              <optgroup label="Active Product Groups">
                  {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name} (Group)</option>
                  ))}
              </optgroup>
          )}
          {standaloneProducts.length > 0 && (
              <optgroup label="Active Individual Variants">
                  {standaloneProducts.map(p => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
              </optgroup>
          )}
      </>
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Marketing Intelligence</h2>
          <p className="text-slate-500 text-sm">Track daily ad spend and attribute costs to products.</p>
        </div>
        
        {/* Date Filter (Global for Tab) */}
        <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm">
            <Calendar size={16} className="text-slate-500" />
            <input 
            type="date" 
            value={dateRange.start}
            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            className="text-sm text-slate-700 bg-transparent border-none focus:ring-0 outline-none w-28 font-medium cursor-pointer"
            />
            <span className="text-slate-400">to</span>
            <input 
            type="date" 
            value={dateRange.end}
            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            className="text-sm text-slate-700 bg-transparent border-none focus:ring-0 outline-none w-28 font-medium cursor-pointer"
            />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3 text-sm font-medium flex items-center gap-2 transition-colors border-b-2 whitespace-nowrap ${activeTab === 'overview' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
              <LayoutGrid size={16} /> Overview
          </button>
          <button 
            onClick={() => setActiveTab('facebook')}
            className={`px-6 py-3 text-sm font-medium flex items-center gap-2 transition-colors border-b-2 whitespace-nowrap ${activeTab === 'facebook' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
              <Facebook size={16} /> Facebook Campaigns
              {unmappedFbCount > 0 && <span className="bg-red-100 text-red-600 px-1.5 rounded-full text-[10px] font-bold">{unmappedFbCount}</span>}
          </button>
          <button 
            onClick={() => setActiveTab('tiktok')}
            className={`px-6 py-3 text-sm font-medium flex items-center gap-2 transition-colors border-b-2 whitespace-nowrap ${activeTab === 'tiktok' ? 'border-slate-800 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
              {/* TikTok Icon */}
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
              </svg>
              TikTok Ads
              {unmappedTkCount > 0 && <span className="bg-red-100 text-red-600 px-1.5 rounded-full text-[10px] font-bold">{unmappedTkCount}</span>}
          </button>
      </div>

      {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-left-2 duration-300">
            {/* Input Form */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
                <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Plus size={18} className="text-brand-600" />
                    Manual Entry
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">From Date</label>
                            <input 
                                type="date" 
                                required
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                                value={newAd.startDate}
                                onChange={e => {
                                    const newStart = e.target.value;
                                    const currentEnd = newAd.endDate;
                                    setNewAd({
                                        ...newAd, 
                                        startDate: newStart, 
                                        endDate: currentEnd < newStart ? newStart : currentEnd
                                    });
                                }}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">To Date</label>
                            <input 
                                type="date" 
                                required
                                min={newAd.startDate}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                                value={newAd.endDate}
                                onChange={e => setNewAd({...newAd, endDate: e.target.value})}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Platform</label>
                        <select 
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                            value={newAd.platform}
                            onChange={e => setNewAd({...newAd, platform: e.target.value as any})}
                        >
                            <option value="Facebook">Facebook / Instagram</option>
                            <option value="TikTok">TikTok Ads</option>
                            <option value="Google">Google Ads</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Total Amount (PKR)</label>
                        <input 
                            type="number" 
                            required
                            placeholder="0.00"
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                            value={newAd.amount}
                            onChange={e => setNewAd({...newAd, amount: e.target.value})}
                        />
                        {dailyPreview && (
                            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 bg-slate-50 p-1.5 rounded">
                                <CalendarRange size={12} />
                                Splitting into <strong>{formatCurrency(dailyPreview)}</strong> / day
                            </p>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Attributed To</label>
                        <select 
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                            value={newAd.product_id}
                            onChange={e => setNewAd({...newAd, product_id: e.target.value})}
                        >
                            {renderProductOptions()}
                        </select>
                    </div>
                    <button type="submit" className="w-full bg-slate-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">
                        Add Expense
                    </button>
                </form>
            </div>

            {/* List */}
            <div className="lg:col-span-2 space-y-4">
                {/* Total Card */}
                <div className="bg-slate-900 text-white p-5 rounded-xl shadow-md flex justify-between items-center">
                    <div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Total Period Spend</p>
                        <h3 className="text-3xl font-bold">{formatCurrency(totalPeriodSpend)}</h3>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center text-brand-500">
                        <DollarSign size={24} />
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                            <ListFilter size={16} /> Recent Expenses Log
                        </h3>
                    </div>
                    <div className="max-h-[500px] overflow-y-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                                <tr>
                                    <th className="px-6 py-3 font-semibold text-slate-700">Date</th>
                                    <th className="px-6 py-3 font-semibold text-slate-700">Source</th>
                                    <th className="px-6 py-3 font-semibold text-slate-700">Attribution</th>
                                    <th className="px-6 py-3 font-semibold text-slate-700">Amount</th>
                                    <th className="px-6 py-3 font-semibold text-slate-700">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredAds.length === 0 && (
                                    <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">No ad spend recorded for this period.</td></tr>
                                )}
                                {filteredAds.map(ad => {
                                    const product = products.find(p => p.id === ad.product_id);
                                    const group = groups.find(g => g.id === ad.product_id);
                                    
                                    return (
                                        <tr key={ad.id} className="hover:bg-slate-50">
                                            <td className="px-6 py-3 text-slate-600">{ad.date}</td>
                                            <td className="px-6 py-3">
                                                <div className="flex flex-col">
                                                    <span className={`w-fit px-2 py-0.5 rounded text-xs font-medium ${
                                                        ad.platform === 'Facebook' ? 'bg-blue-100 text-blue-700' :
                                                        ad.platform === 'TikTok' ? 'bg-gray-800 text-white' : 'bg-green-100 text-green-700'
                                                    }`}>
                                                        {ad.platform}
                                                    </span>
                                                    {ad.campaign_name && <span className="text-[10px] text-slate-400 mt-1 truncate max-w-[150px]" title={ad.campaign_name}>{ad.campaign_name}</span>}
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 text-slate-600 text-xs">
                                                {group ? (
                                                    <span className="font-bold text-indigo-700 flex items-center gap-1">
                                                        <Layers size={12} /> {group.name}
                                                    </span>
                                                ) : product ? (
                                                    <div className="truncate max-w-[150px]">{product.title}</div>
                                                ) : (
                                                    <span className="text-slate-400 italic">General</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-3 font-medium text-slate-900">{formatCurrency(ad.amount_spent)}</td>
                                            <td className="px-6 py-3">
                                                <button 
                                                    onClick={() => onDeleteAdSpend(ad.id)}
                                                    className="text-red-400 hover:text-red-600"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
          </div>
      )}

      {activeTab === 'facebook' && (
          <div className="animate-in fade-in slide-in-from-right-2 duration-300 space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-blue-50 border border-blue-100 p-6 rounded-xl">
                  <div>
                      <h3 className="text-lg font-bold text-blue-900">Facebook Integration</h3>
                      <div className="flex items-center gap-2 mt-1">
                          <p className="text-sm text-blue-700">
                              {fbConfig?.is_active ? 'Connected' : 'Not Connected'} 
                              {fbConfig?.ad_account_id && ` • Account: ${fbConfig.ad_account_id}`}
                          </p>
                          {isSyncing ? (
                              <span className="flex items-center gap-1 text-xs text-blue-600 font-bold bg-blue-100 px-2 py-0.5 rounded-full animate-pulse">
                                  <RefreshCw size={10} className="animate-spin" /> Auto-syncing...
                              </span>
                          ) : syncError ? (
                              <span className="flex items-center gap-1 text-xs text-red-700 font-bold bg-red-100 px-2 py-0.5 rounded-full">
                                  <AlertTriangle size={10} /> Sync Failed
                              </span>
                          ) : (
                              <span className="flex items-center gap-1 text-xs text-green-700 font-bold bg-green-100 px-2 py-0.5 rounded-full">
                                  <CheckCircle2 size={10} /> Up to date
                              </span>
                          )}
                      </div>
                  </div>
              </div>

              {/* Campaign Table (Reused Structure) */}
              {fbConfig?.is_active && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                      <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                          <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                              <Facebook size={16} className="text-blue-600" /> Detected Campaigns
                          </h3>
                          <span className="text-xs text-slate-500 font-medium">
                              Showing accumulated spend for selected period
                          </span>
                      </div>
                      <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-bold">
                              <tr>
                                  <th className="px-6 py-4">Campaign Name</th>
                                  <th className="px-6 py-4 text-center">Status</th>
                                  <th className="px-6 py-4 text-right">Purchases</th>
                                  <th className="px-6 py-4 text-right">CPP</th>
                                  <th className="px-6 py-4 text-right">Total Spend</th>
                                  <th className="px-6 py-4 w-[25%]">Mapped Product</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {facebookCampaigns.map(camp => {
                                  const cpp = camp.purchases > 0 ? camp.spend / camp.purchases : 0;
                                  return (
                                  <tr key={camp.id} className="hover:bg-slate-50">
                                      <td className="px-6 py-4">
                                          <div className="font-bold text-slate-800">{camp.name}</div>
                                          <div className="text-[10px] text-slate-400 font-mono mt-1">ID: {camp.id}</div>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          {camp.productId ? (
                                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                                                  <CheckCircle2 size={12} /> Mapped
                                              </span>
                                          ) : (
                                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold animate-pulse">
                                                  <AlertTriangle size={12} /> Unmapped
                                              </span>
                                          )}
                                      </td>
                                      <td className="px-6 py-4 text-right font-medium text-slate-700">
                                          <div className="flex items-center justify-end gap-1">
                                              <ShoppingBag size={14} className="text-slate-400" />
                                              {camp.purchases}
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-right font-medium text-slate-700">
                                          {cpp > 0 ? formatCurrency(cpp) : '-'}
                                      </td>
                                      <td className="px-6 py-4 text-right font-bold text-slate-900">
                                          {formatCurrency(camp.spend)}
                                      </td>
                                      <td className="px-6 py-4">
                                          <select 
                                              className={`w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 ${
                                                  camp.productId ? 'bg-white border-slate-200' : 'bg-red-50 border-red-200 text-red-800'
                                              }`}
                                              value={camp.productId || ''}
                                              onChange={(e) => saveMapping(camp.id, camp.name, e.target.value, 'Facebook')}
                                          >
                                              {renderProductOptions()}
                                          </select>
                                      </td>
                                  </tr>
                              )})}
                          </tbody>
                      </table>
                  </div>
              )}
          </div>
      )}

      {activeTab === 'tiktok' && (
          <div className="animate-in fade-in slide-in-from-right-2 duration-300 space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50 border border-slate-200 p-6 rounded-xl">
                  <div>
                      <h3 className="text-lg font-bold text-slate-900">TikTok Integration</h3>
                      <div className="flex items-center gap-2 mt-1">
                          <p className="text-sm text-slate-600">
                              {tiktokConfig?.is_active ? 'Connected' : 'Not Connected'} 
                              {tiktokConfig?.ad_account_id && ` • Advertiser: ${tiktokConfig.ad_account_id}`}
                          </p>
                          {isSyncing ? (
                              <span className="flex items-center gap-1 text-xs text-slate-600 font-bold bg-slate-200 px-2 py-0.5 rounded-full animate-pulse">
                                  <RefreshCw size={10} className="animate-spin" /> Syncing...
                              </span>
                          ) : (
                              <span className="flex items-center gap-1 text-xs text-green-700 font-bold bg-green-100 px-2 py-0.5 rounded-full">
                                  <CheckCircle2 size={10} /> Active
                              </span>
                          )}
                      </div>
                  </div>
                  
                  {/* Exchange Rate Input */}
                  <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-lg border border-slate-300 shadow-sm">
                        <div className="text-xs font-bold text-slate-500 uppercase flex flex-col items-end">
                            <span>USD to PKR</span>
                            <span className="text-[10px] font-normal text-slate-400">Rate</span>
                        </div>
                        <input 
                            type="number" 
                            className="w-20 text-right font-bold text-slate-900 outline-none border-b border-slate-200 focus:border-black"
                            value={exchangeRate}
                            onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)}
                        />
                        <button 
                            onClick={fetchAndSyncTikTokData}
                            className="ml-2 p-1.5 bg-black text-white rounded hover:bg-slate-800 transition-colors"
                            title="Apply Rate & Sync"
                        >
                            <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                        </button>
                  </div>
              </div>

              {!tiktokConfig?.is_active && (
                  <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
                      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                         <Settings size={24} className="text-slate-400" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-700">TikTok Not Connected</h3>
                      <p className="text-slate-500 mt-2">Go to <Link size={14} className="inline"/> Integrations to connect your ad account.</p>
                  </div>
              )}

              {/* TikTok Campaign Table */}
              {tiktokConfig?.is_active && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                      <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                          <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                             TikTok Campaigns
                          </h3>
                          <span className="text-xs text-slate-500 font-medium bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded border border-yellow-200">
                              Note: Ads Tax is NOT applied to TikTok spend
                          </span>
                      </div>
                      <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-bold">
                              <tr>
                                  <th className="px-6 py-4">Campaign Name</th>
                                  <th className="px-6 py-4 text-center">Status</th>
                                  <th className="px-6 py-4 text-right">Conversions</th>
                                  <th className="px-6 py-4 text-right">CPA (PKR)</th>
                                  <th className="px-6 py-4 text-right">Total Spend (PKR)</th>
                                  <th className="px-6 py-4 w-[25%]">Mapped Product</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {tiktokCampaigns.length === 0 && (
                                  <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400">No campaigns found.</td></tr>
                              )}
                              {tiktokCampaigns.map(camp => {
                                  const cpa = camp.purchases > 0 ? camp.spend / camp.purchases : 0;
                                  return (
                                  <tr key={camp.id} className="hover:bg-slate-50">
                                      <td className="px-6 py-4">
                                          <div className="font-bold text-slate-800">{camp.name}</div>
                                          <div className="text-[10px] text-slate-400 font-mono mt-1">ID: {camp.id}</div>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          {camp.productId ? (
                                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                                                  <CheckCircle2 size={12} /> Mapped
                                              </span>
                                          ) : (
                                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold animate-pulse">
                                                  <AlertTriangle size={12} /> Unmapped
                                              </span>
                                          )}
                                      </td>
                                      <td className="px-6 py-4 text-right font-medium text-slate-700">
                                          {camp.purchases}
                                      </td>
                                      <td className="px-6 py-4 text-right font-medium text-slate-700">
                                          {cpa > 0 ? formatCurrency(cpa) : '-'}
                                      </td>
                                      <td className="px-6 py-4 text-right font-bold text-slate-900">
                                          {formatCurrency(camp.spend)}
                                      </td>
                                      <td className="px-6 py-4">
                                          <select 
                                              className={`w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-black ${
                                                  camp.productId ? 'bg-white border-slate-200' : 'bg-red-50 border-red-200 text-red-800'
                                              }`}
                                              value={camp.productId || ''}
                                              onChange={(e) => saveMapping(camp.id, camp.name, e.target.value, 'TikTok')}
                                          >
                                              {renderProductOptions()}
                                          </select>
                                      </td>
                                  </tr>
                              )})}
                          </tbody>
                      </table>
                  </div>
              )}
          </div>
      )}
    </div>
  );
};

export default Marketing;
