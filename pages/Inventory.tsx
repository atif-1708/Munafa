import React, { useState, useMemo } from 'react';
import { Product } from '../types';
import { formatCurrency } from '../services/calculator';
import { PackageSearch, History, Edit2, Plus, Save, X, Trash2, Package, Layers, CheckSquare, Square, ChevronDown, ChevronRight, CornerDownRight, Folder, FolderPlus } from 'lucide-react';

interface InventoryProps {
  products: Product[];
  onUpdateProducts: (products: Product[]) => void;
}

const Inventory: React.FC<InventoryProps> = ({ products, onUpdateProducts }) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  
  // Group Logic State
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  // Group Creation/Edit State
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupAction, setGroupAction] = useState<'create' | 'existing'>('create');
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');

  const filteredProducts = products.filter(p => 
    p.title.toLowerCase().includes(search.toLowerCase()) || 
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

  // Organize Data into Groups and Singles
  const inventoryTree = useMemo(() => {
      const groups = new Map<string, { id: string, name: string, items: Product[] }>();
      const singles: Product[] = [];

      filteredProducts.forEach(p => {
          if (p.group_id && p.group_name) {
              if (!groups.has(p.group_id)) {
                  groups.set(p.group_id, { id: p.group_id, name: p.group_name, items: [] });
              }
              groups.get(p.group_id)!.items.push(p);
          } else {
              singles.push(p);
          }
      });
      return { groups: Array.from(groups.values()), singles };
  }, [filteredProducts]);

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
        newSet.delete(id);
    } else {
        newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleGroupSelection = (groupId: string, variants: Product[], e: React.MouseEvent) => {
    e.stopPropagation();
    // Check if all variants in this group are currently selected
    const allSelected = variants.every(v => selectedIds.has(v.id));
    const newSet = new Set(selectedIds);
    
    variants.forEach(v => {
        if (allSelected) {
            newSet.delete(v.id);
        } else {
            newSet.add(v.id);
        }
    });
    setSelectedIds(newSet);
  };

  const toggleGroupExpand = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const newSet = new Set(expandedGroups);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setExpandedGroups(newSet);
  };

  const handleSaveCost = (newCost: number) => {
    if (!selectedProduct) return;
    const updated = { ...selectedProduct, current_cogs: newCost };
    onUpdateProducts([updated]);
    setSelectedProduct(updated);
  };

  const handleAddHistory = (date: string, cost: number) => {
    if (!selectedProduct) return;
    const newHistory = [...selectedProduct.cost_history, { date, cogs: cost }];
    newHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const updated = { ...selectedProduct, cost_history: newHistory };
    onUpdateProducts([updated]);
    setSelectedProduct(updated);
  };

  const handleDeleteHistory = (index: number) => {
    if (!selectedProduct) return;
    const newHistory = [...selectedProduct.cost_history];
    newHistory.splice(index, 1);
    const updated = { ...selectedProduct, cost_history: newHistory };
    onUpdateProducts([updated]);
    setSelectedProduct(updated);
  };

  const handleApplyGroup = () => {
    if (selectedIds.size === 0) return;

    let targetId = '';
    let targetName = '';

    if (groupAction === 'create') {
        if (!newGroupName.trim()) return;
        targetId = crypto.randomUUID();
        targetName = newGroupName;
    } else {
        if (!selectedGroupId) return;
        const group = inventoryTree.groups.find(g => g.id === selectedGroupId);
        if (!group) return;
        targetId = group.id;
        targetName = group.name;
    }

    const updates: Product[] = [];
    products.forEach(p => {
        if (selectedIds.has(p.id)) {
            updates.push({ ...p, group_id: targetId, group_name: targetName });
        }
    });

    onUpdateProducts(updates);
    setSelectedIds(new Set());
    setIsGroupModalOpen(false);
    setNewGroupName('');
    setSelectedGroupId('');
    setGroupAction('create');
  };

  const handleUngroup = (product: Product) => {
      onUpdateProducts([{...product, group_id: null, group_name: null}]);
      if(selectedProduct?.id === product.id) {
          setSelectedProduct({...product, group_id: null, group_name: null});
      }
  };

  const openGroupModal = () => {
      // If groups exist, default to existing if convenient, but let's stick to 'create' default
      // or check if we want smart defaults. 'create' is safer.
      if (inventoryTree.groups.length > 0) {
          setGroupAction('existing');
          setSelectedGroupId(inventoryTree.groups[0].id);
      } else {
          setGroupAction('create');
      }
      setIsGroupModalOpen(true);
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Inventory & Cost Manager</h2>
          <p className="text-slate-500 text-sm">Manage SKU costs and group variants for unified tracking.</p>
        </div>
        <div className="flex items-center gap-3">
             {selectedIds.size > 0 && (
                 <button 
                    onClick={openGroupModal}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors"
                 >
                     <Layers size={16} /> Group Selected ({selectedIds.size})
                 </button>
             )}
             <div className="relative">
                 <input 
                    type="text" 
                    placeholder="Search Item..." 
                    className="pl-4 pr-10 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                 />
                 <PackageSearch className="absolute right-3 top-2.5 text-slate-400" size={18} />
             </div>
        </div>
      </div>

      <div className="flex gap-6">
        {/* List View */}
        <div className={`transition-all duration-300 ${selectedProduct ? 'w-2/3' : 'w-full'}`}>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4 w-12">
                                <span className="sr-only">Select</span>
                            </th>
                            <th className="px-6 py-4 font-semibold text-slate-700">Product Item</th>
                            <th className="px-6 py-4 font-semibold text-slate-700">Status</th>
                            <th className="px-6 py-4 font-semibold text-slate-700 text-right">Current Cost</th>
                            <th className="px-6 py-4 font-semibold text-slate-700 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {/* 1. Render Groups */}
                        {inventoryTree.groups.map(group => {
                            const isExpanded = expandedGroups.has(group.id);
                            const allSelected = group.items.every(item => selectedIds.has(item.id));
                            const someSelected = group.items.some(item => selectedIds.has(item.id));

                            return (
                                <React.Fragment key={group.id}>
                                    {/* Group Header Row */}
                                    <tr 
                                        className="hover:bg-slate-50 cursor-pointer bg-slate-50/50"
                                        onClick={(e) => toggleGroupExpand(group.id, e)}
                                    >
                                        <td className="px-6 py-4" onClick={(e) => toggleGroupSelection(group.id, group.items, e)}>
                                            {allSelected ? (
                                                <CheckSquare className="text-indigo-600 cursor-pointer" size={18} />
                                            ) : someSelected ? (
                                                <div className="w-[18px] h-[18px] bg-indigo-100 border border-indigo-600 rounded flex items-center justify-center">
                                                    <div className="w-2 h-2 bg-indigo-600 rounded-sm"></div>
                                                </div>
                                            ) : (
                                                <Square className="text-slate-300 cursor-pointer hover:text-slate-500" size={18} />
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <button className="text-slate-400 hover:text-indigo-600 transition-colors">
                                                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                                </button>
                                                <div className="w-8 h-8 rounded bg-white border border-slate-200 flex items-center justify-center text-indigo-500 shadow-sm">
                                                    <Folder size={16} />
                                                </div>
                                                <div>
                                                    <span className="font-bold text-slate-800">{group.name}</span>
                                                    <div className="text-xs text-slate-400">{group.items.length} Variants</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                             <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold uppercase tracking-wider">
                                                 Collection
                                             </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-400 text-right font-medium text-xs italic">
                                            Varies
                                        </td>
                                        <td className="px-6 py-4 text-center"></td>
                                    </tr>
                                    
                                    {/* Expanded Variants */}
                                    {isExpanded && group.items.map(p => (
                                        <tr 
                                            key={p.id} 
                                            className={`hover:bg-slate-50 cursor-pointer ${selectedProduct?.id === p.id ? 'bg-blue-50' : 'bg-white'}`} 
                                            onClick={(e) => { e.stopPropagation(); setSelectedProduct(p); }}
                                        >
                                            <td className="px-6 py-4" onClick={(e) => toggleSelect(p.id, e)}>
                                                <div className="pl-6"> {/* Indent Checkbox */}
                                                    {selectedIds.has(p.id) ? (
                                                        <CheckSquare className="text-brand-600 cursor-pointer" size={18} />
                                                    ) : (
                                                        <Square className="text-slate-300 cursor-pointer hover:text-slate-500" size={18} />
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3 pl-8"> {/* Indent Content */}
                                                    <CornerDownRight size={16} className="text-slate-300" />
                                                    <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                                                        <Package size={16} />
                                                    </div>
                                                    <div>
                                                        <span className="font-medium text-slate-900">{p.title}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {/* Empty Status for Child */}
                                            </td>
                                            <td className="px-6 py-4 text-slate-900 text-right font-medium">{formatCurrency(p.current_cogs)}</td>
                                            <td className="px-6 py-4 text-center">
                                                <button className="text-brand-600 hover:text-brand-700 font-medium text-xs flex items-center justify-center gap-1 w-full">
                                                    <Edit2 size={14} /> Manage
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            );
                        })}

                        {/* 2. Render Singles */}
                        {inventoryTree.singles.map(p => (
                            <tr key={p.id} className={`hover:bg-slate-50 cursor-pointer ${selectedProduct?.id === p.id ? 'bg-blue-50' : ''}`} onClick={() => setSelectedProduct(p)}>
                                <td className="px-6 py-4" onClick={(e) => toggleSelect(p.id, e)}>
                                    {selectedIds.has(p.id) ? (
                                        <CheckSquare className="text-brand-600 cursor-pointer" size={18} />
                                    ) : (
                                        <Square className="text-slate-300 cursor-pointer hover:text-slate-500" size={18} />
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                                            <Package size={16} />
                                        </div>
                                        <div>
                                            <span className="font-medium text-slate-900">{p.title}</span>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-slate-400 text-xs">-</span>
                                </td>
                                <td className="px-6 py-4 text-slate-900 text-right font-medium">{formatCurrency(p.current_cogs)}</td>
                                <td className="px-6 py-4 text-center">
                                    <button className="text-brand-600 hover:text-brand-700 font-medium text-xs flex items-center justify-center gap-1 w-full">
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

                    {selectedProduct.group_id && (
                        <div className="mb-6 p-3 bg-indigo-50 rounded-lg flex justify-between items-center">
                             <div className="flex items-center gap-2 text-indigo-700 text-sm font-medium">
                                 <Layers size={16} />
                                 Part of: {selectedProduct.group_name}
                             </div>
                             <button 
                                onClick={() => handleUngroup(selectedProduct)}
                                className="text-xs text-red-500 hover:text-red-700 hover:underline"
                             >
                                Ungroup
                             </button>
                        </div>
                    )}

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

      {/* Group Modal */}
      {isGroupModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Manage Product Group</h3>
                  <p className="text-sm text-slate-500 mb-6">
                      Assign {selectedIds.size} selected items to a group.
                  </p>
                  
                  {/* Action Toggle */}
                  <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
                      <button 
                          onClick={() => setGroupAction('existing')}
                          disabled={inventoryTree.groups.length === 0}
                          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
                              groupAction === 'existing' 
                                ? 'bg-white text-indigo-600 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-700 disabled:opacity-50'
                          }`}
                      >
                          Add to Existing
                      </button>
                      <button 
                          onClick={() => setGroupAction('create')}
                          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
                              groupAction === 'create' 
                                ? 'bg-white text-indigo-600 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-700'
                          }`}
                      >
                          Create New
                      </button>
                  </div>

                  {groupAction === 'create' ? (
                      <div className="mb-6">
                        <label className="block text-xs font-medium text-slate-700 mb-1">New Group Name</label>
                        <input 
                            autoFocus
                            type="text" 
                            placeholder="e.g. Summer Polo Collection"
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                        />
                      </div>
                  ) : (
                      <div className="mb-6">
                        <label className="block text-xs font-medium text-slate-700 mb-1">Select Existing Group</label>
                        {inventoryTree.groups.length > 0 ? (
                            <select 
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white"
                                value={selectedGroupId}
                                onChange={(e) => setSelectedGroupId(e.target.value)}
                            >
                                {inventoryTree.groups.map(g => (
                                    <option key={g.id} value={g.id}>{g.name} ({g.items.length} items)</option>
                                ))}
                            </select>
                        ) : (
                            <p className="text-sm text-red-500 italic">No existing groups found.</p>
                        )}
                      </div>
                  )}

                  <div className="flex gap-3">
                      <button 
                        onClick={() => setIsGroupModalOpen(false)} 
                        className="flex-1 px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={handleApplyGroup} 
                        className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
                      >
                        {groupAction === 'create' ? 'Create Group' : 'Update Group'}
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Inventory;