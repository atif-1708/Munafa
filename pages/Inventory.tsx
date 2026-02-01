
import React, { useState, useMemo } from 'react';
import { Product, Order, ShopifyOrder } from '../types';
import { formatCurrency } from '../services/calculator';
import { PackageSearch, History, Edit2, Plus, X, Trash2, Package, Layers, CheckSquare, Square, ChevronDown, ChevronRight, CornerDownRight, Folder, Calendar, AlertCircle, Link as LinkIcon } from 'lucide-react';

interface InventoryProps {
  products: Product[];
  orders: Order[]; 
  shopifyOrders: ShopifyOrder[];
  onUpdateProducts: (products: Product[]) => Promise<void>;
}

const Inventory: React.FC<InventoryProps> = ({ products, orders, shopifyOrders, onUpdateProducts }) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [selectedAliasToAdd, setSelectedAliasToAdd] = useState('');
  
  // Date Filtering State
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 60);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  });

  // Group Logic State
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  // Group Creation/Edit State
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupAction, setGroupAction] = useState<'create' | 'existing'>('create');
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
      // 1. Identify active product IDs based on Date Range
      const start = new Date(dateRange.start); 
      start.setHours(0,0,0,0);
      const end = new Date(dateRange.end);
      end.setHours(23,59,59,999);
      
      const activeIds = new Set<string>();
      orders.forEach(o => {
          const d = new Date(o.created_at);
          if (d >= start && d <= end) {
              o.items.forEach(i => {
                  activeIds.add(i.product_id);
                  if (i.sku) activeIds.add(i.sku);
                  if (i.variant_fingerprint) activeIds.add(i.variant_fingerprint);
              });
          }
      });

      return products.filter(p => {
          // 2. Text Search - PRIORITY OVER DATE FILTER
          // If user searches, we search EVERYTHING (Global Search) to ensure no items are "missing"
          if (search) {
             const term = search.toLowerCase();
             return p.title.toLowerCase().includes(term) || 
                    p.sku.toLowerCase().includes(term);
          }
          
          // 3. Date Active Filter (Only applied when NOT searching)
          // Filters automatically based on date range as requested
          const fingerprint = p.variant_fingerprint || p.sku;
          const isActive = activeIds.has(p.id) || activeIds.has(p.sku) || activeIds.has(fingerprint || '');
          return isActive;
      });
  }, [products, search, dateRange, orders]);

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

  // Calculate unmapped titles for the alias dropdown
  const unmappedShopifyTitles = useMemo(() => {
    // 1. Collect all aliases currently used by OTHER products
    const usedAliases = new Set<string>();
    products.forEach(p => {
        if (p.id !== selectedProduct?.id && p.aliases) {
            p.aliases.forEach(a => usedAliases.add(a));
        }
    });

    // 2. Get unique titles from Shopify Orders
    const uniqueTitles = new Set<string>();
    shopifyOrders.forEach(o => {
        o.line_items.forEach(item => {
            uniqueTitles.add(item.title);
        });
    });

    // 3. Filter
    return Array.from(uniqueTitles).filter(t => !usedAliases.has(t) && !selectedProduct?.aliases?.includes(t)).sort();
  }, [products, shopifyOrders, selectedProduct]);

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

  const handleUpdateAndSave = async (updatedProducts: Product[]) => {
      setSaveError(null);
      setIsSaving(true);
      try {
          await onUpdateProducts(updatedProducts);
      } catch (e: any) {
          console.error("Save failed:", e);
          setSaveError("Failed to save. Please check your connection.");
      } finally {
          setIsSaving(false);
      }
  };

  const handleSaveCost = async (newCost: number) => {
    if (!selectedProduct) return;
    const updated = { ...selectedProduct, current_cogs: newCost };
    setSelectedProduct(updated); // Optimistic Update UI
    await handleUpdateAndSave([updated]);
  };

  const handleAddHistory = async (date: string, cost: number) => {
    if (!selectedProduct) return;
    const newHistory = [...selectedProduct.cost_history, { date, cogs: cost }];
    newHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const updated = { ...selectedProduct, cost_history: newHistory };
    setSelectedProduct(updated);
    await handleUpdateAndSave([updated]);
  };

  const handleDeleteHistory = async (index: number) => {
    if (!selectedProduct) return;
    const newHistory = [...selectedProduct.cost_history];
    newHistory.splice(index, 1);
    const updated = { ...selectedProduct, cost_history: newHistory };
    setSelectedProduct(updated);
    await handleUpdateAndSave([updated]);
  };

  const handleAddAlias = async (alias: string) => {
    if (!selectedProduct) return;
    const currentAliases = selectedProduct.aliases || [];
    if (currentAliases.includes(alias)) return;
    
    const updated = { ...selectedProduct, aliases: [...currentAliases, alias] };
    setSelectedProduct(updated);
    await handleUpdateAndSave([updated]);
  };

  const handleRemoveAlias = async (alias: string) => {
    if (!selectedProduct) return;
    const currentAliases = selectedProduct.aliases || [];
    const updated = { ...selectedProduct, aliases: currentAliases.filter(a => a !== alias) };
    setSelectedProduct(updated);
    await handleUpdateAndSave([updated]);
  };

  const generateUUID = () => {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
          return crypto.randomUUID();
      }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
      });
  };

  const handleApplyGroup = async () => {
    if (selectedIds.size === 0) return;

    let targetId = '';
    let targetName = '';

    if (groupAction === 'create') {
        if (!newGroupName.trim()) return;
        targetId = generateUUID();
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

    await handleUpdateAndSave(updates);
    
    setSelectedIds(new Set());
    setIsGroupModalOpen(false);
    setNewGroupName('');
    setSelectedGroupId('');
    setGroupAction('create');
  };

  const handleUngroup = async (product: Product) => {
      const updated = {...product, group_id: null, group_name: null};
      if(selectedProduct?.id === product.id) {
          setSelectedProduct(updated as Product); // Fix type mismatch manually
      }
      await handleUpdateAndSave([updated as Product]);
  };

  const openGroupModal = () => {
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Inventory & Cost Manager</h2>
          <p className="text-slate-500 text-sm">Manage SKU costs and group variants for unified tracking.</p>
        </div>
        
        <div className="flex flex-col xl:flex-row items-center gap-3 w-full md:w-auto">
             {/* Date Filter */}
             <div className="flex items-center gap-2 bg-white px-3 py-2 border rounded-lg shadow-sm w-full md:w-auto">
                <Calendar size={16} className="text-slate-500" />
                <input 
                    type="date" 
                    value={dateRange.start} 
                    onChange={e => setDateRange({...dateRange, start: e.target.value})} 
                    className="outline-none text-slate-600 bg-transparent w-28 text-xs font-medium cursor-pointer"
                />
                <span className="text-slate-300">|</span>
                <input 
                    type="date" 
                    value={dateRange.end} 
                    onChange={e => setDateRange({...dateRange, end: e.target.value})} 
                    className="outline-none text-slate-600 bg-transparent w-28 text-xs font-medium cursor-pointer"
                />
            </div>

             {/* Search */}
             <div className="relative w-full md:w-auto">
                 <input 
                    type="text" 
                    placeholder="Search Item (Overrides Date Filter)..." 
                    className="w-full pl-9 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                 />
                 <PackageSearch className="absolute left-3 top-2.5 text-slate-400" size={16} />
             </div>

             {selectedIds.size > 0 && (
                 <button 
                    onClick={openGroupModal}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors whitespace-nowrap"
                 >
                     <Layers size={16} /> Group ({selectedIds.size})
                 </button>
             )}
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
                        {inventoryTree.groups.length === 0 && inventoryTree.singles.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                    {search 
                                        ? "No products matching your search." 
                                        : "No active products found in this date range. Search to see all items."}
                                </td>
                            </tr>
                        )}
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
                    
                    {saveError && (
                        <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200 flex items-start gap-2">
                             <AlertCircle size={14} className="shrink-0 mt-0.5" />
                             <div>
                                <strong>Save Failed:</strong> {saveError}
                                <br/>Check your database permissions.
                             </div>
                        </div>
                    )}

                    <div className="mb-8">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex justify-between">
                            <span>Default Cost Price (COGS)</span>
                            {isSaving && <span className="text-brand-600 italic">Saving...</span>}
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

                    {/* Linked Shopify Items Section */}
                    <div className="border-t border-slate-100 pt-6">
                        <div className="flex items-center justify-between mb-4">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-2">
                                <LinkIcon size={14} /> Linked Store Items
                            </label>
                        </div>
                        
                        {/* List Existing */}
                        <div className="flex flex-wrap gap-2 mb-4">
                            {selectedProduct.aliases && selectedProduct.aliases.length > 0 ? (
                                selectedProduct.aliases.map(alias => (
                                    <span key={alias} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-50 text-indigo-700 text-xs border border-indigo-100">
                                        <span className="truncate max-w-[150px]" title={alias}>{alias}</span>
                                        <button onClick={() => handleRemoveAlias(alias)} className="hover:text-red-600"><X size={12} /></button>
                                    </span>
                                ))
                            ) : (
                                <span className="text-xs text-slate-400 italic">No Shopify products linked.</span>
                            )}
                        </div>

                        {/* Add New */}
                        <div className="flex gap-2">
                            <select 
                                className="flex-1 px-2 py-1.5 border rounded text-xs outline-none focus:border-indigo-500 text-slate-700 bg-white"
                                value={selectedAliasToAdd}
                                onChange={(e) => setSelectedAliasToAdd(e.target.value)}
                            >
                                <option value="">Select Unmapped Shopify Product...</option>
                                {unmappedShopifyTitles.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                            <button 
                                disabled={!selectedAliasToAdd}
                                onClick={() => { handleAddAlias(selectedAliasToAdd); setSelectedAliasToAdd(''); }}
                                className="p-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                            Sales with these titles will be attributed to this inventory item.
                        </p>
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
                        disabled={isSaving}
                        className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-70 flex items-center justify-center gap-2"
                      >
                        {isSaving ? 'Saving...' : (groupAction === 'create' ? 'Create Group' : 'Update Group')}
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Inventory;
