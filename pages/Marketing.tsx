
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AdSpend, Product, MarketingConfig, CampaignMapping } from '../types';
import { formatCurrency } from '../services/calculator';
import { FacebookService } from '../services/facebook';
import { supabase } from '../services/supabase';
import { BarChart3, Plus, Trash2, Layers, Calendar, DollarSign, CalendarRange, RefreshCw, Facebook, AlertTriangle, Link, ArrowRight, X, CheckCircle2, LayoutGrid, ListFilter, Zap } from 'lucide-react';

interface MarketingProps {
  adSpend: AdSpend[];
  products: Product[];
  onAddAdSpend: (ads: AdSpend[]) => void;
  onDeleteAdSpend: (id: string) => void;
  onSyncAdSpend?: (platform: string, start: string, end: string, ads: AdSpend[]) => void;
}

const Marketing: React.FC<MarketingProps> = ({ adSpend, products, onAddAdSpend, onDeleteAdSpend, onSyncAdSpend }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'facebook'>('overview');
  
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

  // Default to Last 30 Days
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  });

  // State for Facebook Integration
  const [fbConfig, setFbConfig] = useState<MarketingConfig | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [mappings, setMappings] = useState<CampaignMapping[]>([]);
  const hasLoadedConfig = useRef(false);

  // Load Config
  useEffect(() => {
      const loadConfig = async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if(session?.user) {
              const { data } = await supabase.from('marketing_configs').select('*').eq('user_id', session.user.id).eq('platform', 'Facebook').single();
              if(data) setFbConfig(data);
              
              const { data: mapData } = await supabase.from('campaign_mappings').select('*').eq('user_id', session.user.id);
              if(mapData) setMappings(mapData);
              hasLoadedConfig.current = true;
          }
      };
      loadConfig();
  }, []);

  // --- AUTO-SYNC LOGIC ---
  useEffect(() => {
      if (activeTab === 'facebook' && fbConfig?.is_active && hasLoadedConfig.current && onSyncAdSpend) {
          // Debounce fetch to avoid flickering if user changes date quickly
          const timer = setTimeout(() => {
              fetchAndSyncFacebookData();
          }, 300);
          return () => clearTimeout(timer);
      }
  }, [activeTab, dateRange, fbConfig, mappings]); // Dependencies trigger auto-fetch

  const fetchAndSyncFacebookData = async () => {
      if (!fbConfig || !fbConfig.is_active || !fbConfig.ad_account_id) return;
      if (!onSyncAdSpend) return;

      setIsSyncing(true);
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

      } catch (e) {
          console.error(e);
      } finally {
          setIsSyncing(false);
      }
  };

  // Extract unique groups
  const groups = useMemo(() => {
      const uniqueGroups = new Map();
      products.forEach(p => {
          if (p.group_id && p.group_name) {
              uniqueGroups.set(p.group_id, p.group_name);
          }
      });
      return Array.from(uniqueGroups.entries()).map(([id, name]) => ({ id, name }));
  }, [products]);

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

  const saveMapping = async (campaignId: string, campaignName: string, productId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if(!session?.user) return;

      const mapping: CampaignMapping = {
          campaign_id: campaignId,
          campaign_name: campaignName,
          product_id: productId || null,
          platform: 'Facebook'
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
  
  // Aggregate Campaigns for Facebook Tab
  const facebookCampaigns = useMemo(() => {
      const stats = new Map<string, { id: string, name: string, spend: number, productId: string | undefined }>();
      
      filteredAds.forEach(ad => {
          if (ad.platform === 'Facebook' && ad.campaign_id) {
              if (!stats.has(ad.campaign_id)) {
                  stats.set(ad.campaign_id, {
                      id: ad.campaign_id,
                      name: ad.campaign_name || 'Unknown',
                      spend: 0,
                      productId: ad.product_id
                  });
              }
              const c = stats.get(ad.campaign_id)!;
              c.spend += ad.amount_spent;
          }
      });
      return Array.from(stats.values()).sort((a,b) => b.spend - a.spend);
  }, [filteredAds]);

  const unmappedCount = facebookCampaigns.filter(c => !c.productId).length;

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
      <div className="flex border-b border-slate-200">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3 text-sm font-medium flex items-center gap-2 transition-colors border-b-2 ${activeTab === 'overview' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
              <LayoutGrid size={16} /> Overview & Manual
          </button>
          <button 
            onClick={() => setActiveTab('facebook')}
            className={`px-6 py-3 text-sm font-medium flex items-center gap-2 transition-colors border-b-2 ${activeTab === 'facebook' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
              <Facebook size={16} /> Facebook Campaigns
              {unmappedCount > 0 && <span className="bg-red-100 text-red-600 px-1.5 rounded-full text-[10px] font-bold">{unmappedCount}</span>}
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
                            <option value="">-- General Store Spend --</option>
                            {groups.length > 0 && (
                                <optgroup label="Product Groups">
                                    {groups.map(g => (
                                        <option key={g.id} value={g.id}>{g.name} (Group)</option>
                                    ))}
                                </optgroup>
                            )}
                            <optgroup label="Individual Variants">
                                {products.map(p => (
                                    <option key={p.id} value={p.id}>{p.title}</option>
                                ))}
                            </optgroup>
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
                          ) : (
                              <span className="flex items-center gap-1 text-xs text-green-700 font-bold bg-green-100 px-2 py-0.5 rounded-full">
                                  <CheckCircle2 size={10} /> Up to date
                              </span>
                          )}
                      </div>
                  </div>
                  
                  {/* Real Time Status Badge */}
                  <div className="flex items-center gap-2 text-blue-800 bg-white/50 px-3 py-1.5 rounded-lg border border-blue-100 shadow-sm">
                      <Zap size={16} className="text-yellow-500 fill-yellow-500" />
                      <span className="text-xs font-bold uppercase tracking-wide">Live Data</span>
                  </div>
              </div>

              {!fbConfig?.is_active && (
                  <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
                      <Facebook size={48} className="mx-auto text-slate-300 mb-4" />
                      <h3 className="text-lg font-bold text-slate-700">Facebook Not Connected</h3>
                      <p className="text-slate-500 mt-2">Go to <Link size={14} className="inline"/> Integrations to connect your ad account.</p>
                  </div>
              )}

              {fbConfig?.is_active && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                      <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                          <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                              <Facebook size={16} className="text-blue-600" /> Detected Campaigns
                          </h3>
                          <span className="text-xs text-slate-500 font-medium">
                              Showing accumulated spend for {dateRange.start} to {dateRange.end}
                          </span>
                      </div>
                      <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-bold">
                              <tr>
                                  <th className="px-6 py-4">Campaign Name</th>
                                  <th className="px-6 py-4 text-center">Status</th>
                                  <th className="px-6 py-4 text-right">Total Spend</th>
                                  <th className="px-6 py-4 w-[35%]">Mapped Product</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {facebookCampaigns.length === 0 && (
                                  <tr>
                                      <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                          {isSyncing ? 'Fetching campaigns...' : 'No campaigns found in this period.'}
                                      </td>
                                  </tr>
                              )}
                              {facebookCampaigns.map(camp => (
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
                                      <td className="px-6 py-4 text-right font-bold text-slate-900">
                                          {formatCurrency(camp.spend)}
                                      </td>
                                      <td className="px-6 py-4">
                                          <select 
                                              className={`w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 ${
                                                  camp.productId ? 'bg-white border-slate-200' : 'bg-red-50 border-red-200 text-red-800'
                                              }`}
                                              value={camp.productId || ''}
                                              onChange={(e) => saveMapping(camp.id, camp.name, e.target.value)}
                                          >
                                              <option value="">-- General Store Spend --</option>
                                              {groups.length > 0 && (
                                                  <optgroup label="Product Groups">
                                                      {groups.map(g => (
                                                          <option key={g.id} value={g.id}>{g.name} (Group)</option>
                                                      ))}
                                                  </optgroup>
                                              )}
                                              <optgroup label="Individual Variants">
                                                  {products.map(p => (
                                                      <option key={p.id} value={p.id}>{p.title}</option>
                                                  ))}
                                              </optgroup>
                                          </select>
                                      </td>
                                  </tr>
                              ))}
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
