
import React, { useState, useMemo, useEffect } from 'react';
import { AdSpend, Product, MarketingConfig, CampaignMapping } from '../types';
import { formatCurrency } from '../services/calculator';
import { FacebookService } from '../services/facebook';
import { supabase } from '../services/supabase';
import { BarChart3, Plus, Trash2, Layers, Calendar, DollarSign, CalendarRange, RefreshCw, Facebook, AlertTriangle, Link, ArrowRight, X, CheckCircle2 } from 'lucide-react';

interface MarketingProps {
  adSpend: AdSpend[];
  products: Product[];
  onAddAdSpend: (ads: AdSpend[]) => void;
  onDeleteAdSpend: (id: string) => void;
}

const Marketing: React.FC<MarketingProps> = ({ adSpend, products, onAddAdSpend, onDeleteAdSpend }) => {
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
  const [unmappedCampaigns, setUnmappedCampaigns] = useState<Set<string>>(new Set());
  const [showMappingModal, setShowMappingModal] = useState(false);

  useEffect(() => {
      const loadConfig = async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if(session?.user) {
              const { data } = await supabase.from('marketing_configs').select('*').eq('user_id', session.user.id).eq('platform', 'Facebook').single();
              if(data) setFbConfig(data);
              
              const { data: mapData } = await supabase.from('campaign_mappings').select('*').eq('user_id', session.user.id);
              if(mapData) setMappings(mapData);
          }
      };
      loadConfig();
  }, []);

  // Check for unmapped campaigns in current adSpend data
  useEffect(() => {
      const unmapped = new Set<string>();
      adSpend.forEach(ad => {
          if (ad.campaign_id && !ad.product_id) {
              unmapped.add(ad.campaign_id);
          }
      });
      setUnmappedCampaigns(unmapped);
  }, [adSpend]);

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

  const handleSyncFacebook = async () => {
      if (!fbConfig || !fbConfig.is_active || !fbConfig.ad_account_id) return;
      setIsSyncing(true);
      try {
          const svc = new FacebookService();
          // Sync last 30 days
          const start = new Date();
          start.setDate(start.getDate() - 30);
          const end = new Date();
          const fetchedAds = await svc.fetchInsights(fbConfig, start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
          
          // Apply existing mappings before saving
          const mappedAds = fetchedAds.map(ad => {
              const mapping = mappings.find(m => m.campaign_id === ad.campaign_id);
              return {
                  ...ad,
                  product_id: mapping?.product_id || undefined
              };
          });

          onAddAdSpend(mappedAds); // This adds to state and DB
      } catch (e) {
          console.error(e);
          alert("Sync Failed. Check console.");
      } finally {
          setIsSyncing(false);
      }
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

      // 2. Update Local State
      setMappings(prev => {
          const filtered = prev.filter(m => m.campaign_id !== campaignId);
          return [...filtered, mapping];
      });

      // 3. Update Existing AdSpend in DB
      await supabase.from('ad_spend')
        .update({ product_id: productId || null })
        .eq('user_id', session.user.id)
        .eq('campaign_id', campaignId);
      
      // 4. Trigger Reload of Ad Spend (Optimistic Update for now)
      // We manually update local adSpend to reflect change immediately
      // Note: In real app, we might just refetch adSpend from parent, but let's do optimistic
      // This part requires `onAddAdSpend` to support updates, but `onAddAdSpend` appends.
      // So effectively we need to reload the page or trigger a re-fetch.
      // For now, let's just alert user or refresh.
      window.location.reload(); 
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
  
  // Helper for UI calculation
  const calculateDailyPreview = () => {
     if (!newAd.startDate || !newAd.endDate || !newAd.amount) return null;
     const start = new Date(newAd.startDate);
     const end = new Date(newAd.endDate);
     if (end < start) return null;
     const diffTime = Math.abs(end.getTime() - start.getTime());
     const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
     return days > 1 ? (parseFloat(newAd.amount) / days) : null;
  };

  const dailyPreview = calculateDailyPreview();

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Marketing & Ad Spend</h2>
          <p className="text-slate-500 text-sm">Track daily spend and attribute it to products or groups.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            {fbConfig && fbConfig.is_active && (
                <button 
                    onClick={handleSyncFacebook}
                    disabled={isSyncing}
                    className="flex items-center gap-2 bg-[#1877F2] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#166fe5] disabled:opacity-50 shadow-sm"
                >
                    {isSyncing ? <RefreshCw className="animate-spin" size={16} /> : <Facebook size={16} />}
                    {isSyncing ? 'Syncing...' : 'Sync Facebook'}
                </button>
            )}

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
      </div>

      {unmappedCampaigns.size > 0 && (
          <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                  <AlertTriangle className="text-orange-600" size={24} />
                  <div>
                      <h4 className="font-bold text-orange-900">Unmapped Campaigns Detected</h4>
                      <p className="text-sm text-orange-700">We found {unmappedCampaigns.size} campaigns with no product attribution.</p>
                  </div>
              </div>
              <button 
                onClick={() => setShowMappingModal(true)}
                className="bg-orange-100 text-orange-800 px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-200 transition-colors"
              >
                  Map Campaigns
              </button>
          </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                     <h3 className="font-bold text-slate-700 text-sm">Recent Expenses</h3>
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
                                                {ad.campaign_name && <span className="text-[10px] text-slate-400 mt-1 truncate max-w-[150px]">{ad.campaign_name}</span>}
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

      {/* Mapping Modal */}
      {showMappingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-slate-900">Map Unlinked Campaigns</h3>
                    <button onClick={() => setShowMappingModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                     {Array.from(unmappedCampaigns).map(campaignId => {
                         const ad = adSpend.find(a => a.campaign_id === campaignId);
                         return (
                             <div key={campaignId} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border border-slate-200 rounded-lg bg-slate-50">
                                 <div>
                                     <div className="font-bold text-slate-800">{ad?.campaign_name || 'Unknown Campaign'}</div>
                                     <div className="text-xs text-slate-400 font-mono mt-1">ID: {campaignId}</div>
                                 </div>
                                 <select 
                                    className="w-full sm:w-64 px-3 py-2 border rounded-lg text-sm bg-white"
                                    onChange={(e) => {
                                        if (e.target.value !== 'ignore') {
                                            saveMapping(campaignId, ad?.campaign_name || '', e.target.value);
                                        }
                                    }}
                                    defaultValue="default"
                                 >
                                     <option value="default" disabled>Select Product to Map</option>
                                     <option value="">General Store Spend</option>
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
                         )
                     })}
                     {unmappedCampaigns.size === 0 && (
                         <div className="text-center py-8 text-slate-500">
                             <CheckCircle2 size={48} className="mx-auto text-green-500 mb-2" />
                             <p>All campaigns are mapped!</p>
                         </div>
                     )}
                </div>
            </div>
          </div>
      )}
    </div>
  );
};

export default Marketing;
