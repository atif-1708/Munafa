import React, { useState } from 'react';
import { Product } from '../types';
import { formatCurrency } from '../services/calculator';
import { PackageSearch, History, Edit2, Plus, Save, X, Trash2 } from 'lucide-react';

interface InventoryProps {
  products: Product[];
  onUpdateProduct: (product: Product) => void;
}

const Inventory: React.FC<InventoryProps> = ({ products, onUpdateProduct }) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [search, setSearch] = useState('');

  const filteredProducts = products.filter(p => 
    p.title.toLowerCase().includes(search.toLowerCase()) || 
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const handleSaveCost = (newCost: number) => {
    if (!selectedProduct) return;
    
    // Update default cost
    const updated = { ...selectedProduct, current_cogs: newCost };
    onUpdateProduct(updated);
    setSelectedProduct(updated);
  };

  const handleAddHistory = (date: string, cost: number) => {
    if (!selectedProduct) return;

    const newHistory = [...selectedProduct.cost_history, { date, cogs: cost }];
    // Sort logic handled in getCostAtDate, but good to keep tidy here
    newHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const updated = { ...selectedProduct, cost_history: newHistory };
    onUpdateProduct(updated);
    setSelectedProduct(updated);
  };

  const handleDeleteHistory = (index: number) => {
    if (!selectedProduct) return;

    const newHistory = [...selectedProduct.cost_history];
    newHistory.splice(index, 1);
    
    const updated = { ...selectedProduct, cost_history: newHistory };
    onUpdateProduct(updated);
    setSelectedProduct(updated);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Inventory & Cost Manager</h2>
          <p className="text-slate-500 text-sm">Manage SKU costs and date-based cost history for accurate profit calculation.</p>
        </div>
        <div className="relative">
             <input 
                type="text" 
                placeholder="Search SKU..." 
                className="pl-4 pr-10 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                value={search}
                onChange={e => setSearch(e.target.value)}
             />
             <PackageSearch className="absolute right-3 top-2.5 text-slate-400" size={18} />
        </div>
      </div>

      <div className="flex gap-6">
        {/* List View */}
        <div className={`transition-all duration-300 ${selectedProduct ? 'w-2/3' : 'w-full'}`}>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4 font-semibold text-slate-700">Product</th>
                            <th className="px-6 py-4 font-semibold text-slate-700">SKU</th>
                            <th className="px-6 py-4 font-semibold text-slate-700">Current Cost</th>
                            <th className="px-6 py-4 font-semibold text-slate-700">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredProducts.map(p => (
                            <tr key={p.id} className={`hover:bg-slate-50 cursor-pointer ${selectedProduct?.id === p.id ? 'bg-blue-50' : ''}`} onClick={() => setSelectedProduct(p)}>
                                <td className="px-6 py-4 font-medium text-slate-900">{p.title}</td>
                                <td className="px-6 py-4 text-slate-500 font-mono">{p.sku}</td>
                                <td className="px-6 py-4 text-slate-900">{formatCurrency(p.current_cogs)}</td>
                                <td className="px-6 py-4">
                                    <button className="text-brand-600 hover:text-brand-700 font-medium text-xs flex items-center gap-1">
                                        <Edit2 size={14} /> Manage
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* Detail/Edit View */}
        {selectedProduct && (
            <div className="w-1/3 space-y-6">
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 relative">
                    <button 
                        onClick={() => setSelectedProduct(null)}
                        className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
                    >
                        <X size={20} />
                    </button>
                    
                    <h3 className="text-lg font-bold text-slate-900 mb-1">{selectedProduct.title}</h3>
                    <p className="text-sm text-slate-500 font-mono mb-6">{selectedProduct.sku}</p>

                    <div className="mb-8">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                            Default Cost Price (COGS)
                        </label>
                        <div className="flex gap-2">
                            <input 
                                type="number" 
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                                defaultValue={selectedProduct.current_cogs}
                                onBlur={(e) => handleSaveCost(parseFloat(e.target.value) || 0)}
                            />
                        </div>
                        <p className="text-xs text-slate-400 mt-2">
                            This cost is applied to all orders unless a specific date rule exists below.
                        </p>
                    </div>

                    <div className="border-t border-slate-100 pt-6">
                        <div className="flex items-center justify-between mb-4">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-2">
                                <History size={14} /> Cost History
                            </label>
                        </div>
                        
                        {/* Add History Form */}
                        <form 
                            onSubmit={(e) => {
                                e.preventDefault();
                                const form = e.target as HTMLFormElement;
                                const date = (form.elements.namedItem('date') as HTMLInputElement).value;
                                const cost = (form.elements.namedItem('cost') as HTMLInputElement).value;
                                if(date && cost) {
                                    handleAddHistory(date, parseFloat(cost));
                                    form.reset();
                                }
                            }}
                            className="flex gap-2 mb-4"
                        >
                            <input name="date" type="date" className="w-32 px-2 py-1.5 border rounded text-sm" required />
                            <input name="cost" type="number" placeholder="Cost" className="flex-1 px-2 py-1.5 border rounded text-sm" required />
                            <button type="submit" className="p-2 bg-slate-900 text-white rounded hover:bg-slate-800">
                                <Plus size={16} />
                            </button>
                        </form>

                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                            {selectedProduct.cost_history.length === 0 && (
                                <p className="text-xs text-slate-400 italic text-center py-4">No history rules added.</p>
                            )}
                            {selectedProduct.cost_history.map((h, idx) => (
                                <div key={idx} className="flex justify-between items-center text-sm p-2 bg-slate-50 rounded border border-slate-100 group">
                                    <div className="flex gap-4">
                                        <span className="text-slate-600">From {h.date}</span>
                                        <span className="font-bold text-slate-900">{formatCurrency(h.cogs)}</span>
                                    </div>
                                    <button 
                                        onClick={() => handleDeleteHistory(idx)}
                                        className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Remove Rule"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default Inventory;