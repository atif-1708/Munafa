import React, { useState, useMemo } from 'react';
import { AdSpend, Product } from '../types';
import { formatCurrency } from '../services/calculator';
import { BarChart3, Plus, Trash2, Layers } from 'lucide-react';

interface MarketingProps {
  adSpend: AdSpend[];
  products: Product[];
  onAddAdSpend: (ad: AdSpend) => void;
  onDeleteAdSpend: (id: string) => void;
}

const Marketing: React.FC<MarketingProps> = ({ adSpend, products, onAddAdSpend, onDeleteAdSpend }) => {
  const [newAd, setNewAd] = useState<{
      date: string, 
      platform: 'Facebook' | 'TikTok' | 'Google', 
      amount: string, 
      product_id: string
  }>({
      date: new Date().toISOString().split('T')[0],
      platform: 'Facebook',
      amount: '',
      product_id: ''
  });

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

    const entry: AdSpend = {
        id: generateUUID(),
        date: newAd.date,
        platform: newAd.platform,
        amount_spent: parseFloat(newAd.amount),
        product_id: newAd.product_id || undefined
    };

    onAddAdSpend(entry);
    setNewAd(prev => ({ ...prev, amount: '' }));
  };

  const sortedAds = [...adSpend].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Marketing & Ad Spend</h2>
          <p className="text-slate-500 text-sm">Track daily spend and attribute it to products or groups.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Form */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Plus size={18} className="text-brand-600" />
                Add Daily Spend
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
                    <input 
                        type="date" 
                        required
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                        value={newAd.date}
                        onChange={e => setNewAd({...newAd, date: e.target.value})}
                    />
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
                    <label className="block text-xs font-medium text-slate-700 mb-1">Amount (PKR)</label>
                    <input 
                        type="number" 
                        required
                        placeholder="0.00"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                        value={newAd.amount}
                        onChange={e => setNewAd({...newAd, amount: e.target.value})}
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Attributed To (Optional)</label>
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
                    <p className="text-xs text-slate-400 mt-1">Select a Group to aggregate costs for all variants.</p>
                </div>
                <button type="submit" className="w-full bg-slate-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">
                    Add Expense
                </button>
            </form>
        </div>

        {/* List */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                 <h3 className="font-bold text-slate-700 text-sm">Recent Expenses</h3>
             </div>
             <div className="max-h-[500px] overflow-y-auto">
                 <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                        <tr>
                            <th className="px-6 py-3 font-semibold text-slate-700">Date</th>
                            <th className="px-6 py-3 font-semibold text-slate-700">Platform</th>
                            <th className="px-6 py-3 font-semibold text-slate-700">Attribution</th>
                            <th className="px-6 py-3 font-semibold text-slate-700">Amount</th>
                            <th className="px-6 py-3 font-semibold text-slate-700">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {sortedAds.length === 0 && (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">No ad spend recorded yet.</td></tr>
                        )}
                        {sortedAds.map(ad => {
                            const product = products.find(p => p.id === ad.product_id);
                            const group = groups.find(g => g.id === ad.product_id);
                            
                            return (
                                <tr key={ad.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-3 text-slate-600">{ad.date}</td>
                                    <td className="px-6 py-3">
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                            ad.platform === 'Facebook' ? 'bg-blue-100 text-blue-700' :
                                            ad.platform === 'TikTok' ? 'bg-gray-800 text-white' : 'bg-green-100 text-green-700'
                                        }`}>
                                            {ad.platform}
                                        </span>
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
  );
};

export default Marketing;