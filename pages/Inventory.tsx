
import React, { useState, useMemo, useEffect } from 'react';
import { Product, Order, ShopifyOrder } from '../types';
import { formatCurrency } from '../services/calculator';
import { PackageSearch, History, Edit2, X, Trash2, Package, Layers, CheckSquare, Square, ChevronDown, ChevronRight, CornerDownRight, Folder, Calendar, Link as LinkIcon, Sparkles, Check, AlertCircle, ShoppingBag, DollarSign, Search, ListFilter } from 'lucide-react';

interface InventoryProps {
  products: Product[];
  orders: Order[]; 
  shopifyOrders: ShopifyOrder[];
  onUpdateProducts: (products: Product[]) => Promise<void>;
}

const Inventory: React.FC<InventoryProps> = ({ products, orders, shopifyOrders, onUpdateProducts }) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<{id: string, name: string, items: Product[]} | null>(null);
  const [modalTab, setModalTab] = useState<'costing' | 'history'>('costing');
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [selectedAliasToAdd, setSelectedAliasToAdd] = useState('');
  
  // Date Filtering State
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30); // Default 30 days for relevance
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  });

  // Group Logic State
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [ignoredSuggestionKeys, setIgnoredSuggestionKeys] = useState<Set<string>>(new Set());
  
  // Group Creation/Edit State
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupAction, setGroupAction] = useState<'create' | 'existing'>('create');
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // --- SYNC EFFECT ---
  useEffect(() => {
      if (selectedProduct) {
          const fresh = products.find(p => p.id === selectedProduct.id);
          if (fresh && fresh !== selectedProduct) setSelectedProduct(fresh);
      }
      if (selectedGroup) {
          const freshItems = products.filter(p => p.group_id === selectedGroup.id);
          if (freshItems.length > 0) setSelectedGroup(prev => prev ? { ...prev, items: freshItems } : null);
      }
  }, [products, selectedProduct, selectedGroup]); 

  // --- CALCULATE SALES VOLUME ---
  const salesStats = useMemo(() => {
      const stats = new Map<string, { units: number, orders: number }>();
      const start = new Date(dateRange.start); start.setHours(0,0,0,0);
      const end = new Date(dateRange.end); end.setHours(23,59,59,999);

      orders.forEach(o => {
          const d = new Date(o.created_at);
          if (d >= start && d <= end && o.status !== 'CANCELLED') {
              o.items.forEach(i => {
                  const pid = i.product_id;
                  if (!stats.has(pid)) stats.set(pid, { units: 0, orders: 0 });
                  const s = stats.get(pid)!;
                  s.units += i.quantity;
                  s.orders += 1;
              });
          }
      });
      return stats;
  }, [orders, dateRange]);

  const filteredProducts = useMemo(() => {
      return products.filter(p => {
          if (search) {
             const term = search.toLowerCase();
             return p.title.toLowerCase().includes(term) || 
                    p.sku.toLowerCase().includes(term) ||
                    (p.aliases && p.aliases.some(a => a.toLowerCase().includes(term)));
          }
          return true;
      });
  }, [products, search]);

  const inventoryTree = useMemo(() => {
      const groups = new Map<string, { id: string, name: string, items: Product[], totalSold: number }>();
      const singles: Product[] = [];

      filteredProducts.forEach(p => {
          const sold = salesStats.get(p.id)?.units || 0;

          if (p.group_id && p.group_name) {
              if (!groups.has(p.group_id)) {
                  groups.set(p.group_id, { id: p.group_id, name: p.group_name, items: [], totalSold: 0 });
              }
              const g = groups.get(p.group_id)!;
              g.items.push(p);
              g.totalSold += sold;
          } else {
              singles.push(p);
          }
      });
      
      const sortedGroups = Array.from(groups.values()).sort((a, b) => b.totalSold - a.totalSold);
      const sortedSingles = singles.sort((a, b) => {
          const soldA = salesStats.get(a.id)?.units || 0;
          const soldB = salesStats.get(b.id)?.units || 0;
          return soldB - soldA;
      });

      return { groups: sortedGroups, singles: sortedSingles };
  }, [filteredProducts, salesStats]);

  // Determine what is currently being edited
  const editTarget = selectedProduct || (selectedGroup ? selectedGroup.items[0] : null);
  const isGroupEdit = !!selectedGroup;

  // --- FETCH RELATED ORDERS FOR HISTORY ---
  const relatedOrders = useMemo(() => {
      if (!editTarget) return [];
      
      // Target IDs (Single or Group)
      const targetIds = isGroupEdit && selectedGroup 
          ? new Set(selectedGroup.items.map(i => i.id))
          : new Set([editTarget.id]);

      // Target Names (for unmapped orders)
      const targetNames = isGroupEdit && selectedGroup
          ? new Set(selectedGroup.items.map(i => i.title))
          : new Set([editTarget.title]);

      // Target Aliases
      const targetAliases = new Set(editTarget.aliases || []);

      return orders.filter(o => 
          o.items.some(item => 
              targetIds.has(item.product_id) || 
              targetNames.has(item.product_name) || 
              targetAliases.has(item.product_name)
          )
      ).sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [editTarget, selectedGroup, isGroupEdit, orders]);

  // --- Handlers ---
  const handleSaveCost = async (newCost: number) => {
    if (selectedProduct) {
        const updated = { ...selectedProduct, current_cogs: newCost };
        await handleUpdateAndSave([updated]);
    } else if (selectedGroup) {
        const updatedItems = selectedGroup.items.map(item => ({ ...item, current_cogs: newCost }));
        await handleUpdateAndSave(updatedItems);
    }
  };

  const handleUpdateAndSave = async (updatedProducts: Product[]) => {
      setSaveError(null);
      setIsSaving(true);
      try {
          await onUpdateProducts(updatedProducts);
      } catch (e: any) {
          setSaveError("Failed to save changes.");
      } finally {
          setIsSaving(false);
      }
  };

  const handleAddAlias = async (alias: string) => {
    if (!editTarget) return;
    const cleanupUpdates: Product[] = [];
    products.forEach(p => {
        if (p.id !== editTarget.id && p.aliases && p.aliases.includes(alias)) {
            cleanupUpdates.push({ ...p, aliases: p.aliases.filter(a => a !== alias) });
        }
    });
    const currentAliases = editTarget.aliases || [];
    if (!currentAliases.includes(alias)) {
        cleanupUpdates.push({ ...editTarget, aliases: [...currentAliases, alias] });
    }
    if (cleanupUpdates.length > 0) await handleUpdateAndSave(cleanupUpdates);
  };

  const handleRemoveAlias = async (alias: string) => {
    if (!editTarget) return;
    const updatedTarget = { ...editTarget, aliases: (editTarget.aliases || []).filter(a => a !== alias) };
    await handleUpdateAndSave([updatedTarget]);
  };

  const generateUUID = () => {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
      });
  };

  const handleApplyGroup = async () => {
    if (selectedIds.size === 0) return;
    let targetId = '', targetName = '';
    if (groupAction === 'create') {
        if (!newGroupName.trim()) return;
        targetId = generateUUID(); targetName = newGroupName;
    } else {
        if (!selectedGroupId) return;
        const group = inventoryTree.groups.find(g => g.id === selectedGroupId);
        if (!group) return;
        targetId = group.id; targetName = group.name;
    }
    const updates: Product[] = [];
    products.forEach(p => {
        if (selectedIds.has(p.id)) updates.push({ ...p, group_id: targetId, group_name: targetName });
    });
    await handleUpdateAndSave(updates);
    setSelectedIds(new Set()); setIsGroupModalOpen(false); setNewGroupName('');
  };

  const unmappedShopifyTitles = useMemo(() => {
    const usedAliases = new Set<string>();
    products.forEach(p => p.aliases?.forEach(a => usedAliases.add(a)));
    const uniqueTitles = new Set<string>();
    shopifyOrders.forEach(o => o.line_items?.forEach(item => uniqueTitles.add(item.title)));
    return Array.from(uniqueTitles).filter(t => !usedAliases.has(t)).sort();
  }, [products, shopifyOrders]);

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedIds);
    newSet.has(id) ? newSet.delete(id) : newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleGroupExpand = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const newSet = new Set(expandedGroups);
      newSet.has(id) ? newSet.delete(id) : newSet.add(id);
      setExpandedGroups(newSet);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Inventory Management</h2>
          <p className="text-slate-500 text-sm">Track product costs and view detailed sales history.</p>
        </div>
        
        <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm">
            <Calendar size={16} className="text-slate-500" />
            <input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="text-sm bg-transparent border-none outline-none w-28 font-medium" />
            <span className="text-slate-400">to</span>
            <input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="text-sm bg-transparent border-none outline-none w-28 font-medium" />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative w-full sm:w-96">
              <input type="text" placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
              <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          </div>
          {selectedIds.size > 0 && (
             <button onClick={() => setIsGroupModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold shadow-md hover:bg-slate-800 transition-colors">
                 <Layers size={16} /> Group Selected ({selectedIds.size})
             </button>
          )}
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-bold text-slate-500">
                  <tr>
                      <th className="px-4 py-3 w-10"></th>
                      <th className="px-4 py-3 w-[40%]">Product</th>
                      <th className="px-4 py-3 text-center">Units Sold</th>
                      <th className="px-4 py-3">Cost (COGS)</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                  {/* GROUPS */}
                  {inventoryTree.groups.map(group => {
                      const isExpanded = expandedGroups.has(group.id);
                      return (
                          <React.Fragment key={group.id}>
                              <tr className="bg-slate-50/70 hover:bg-slate-50 cursor-pointer" onClick={(e) => toggleGroupExpand(group.id, e)}>
                                  <td className="px-4 py-3"><button onClick={(e) => e.stopPropagation()}><Square size={18} className="text-slate-300" /></button></td>
                                  <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                          {isExpanded ? <ChevronDown size={16} className="text-indigo-500" /> : <ChevronRight size={16} className="text-slate-400" />}
                                          <Folder size={16} className="text-indigo-500" />
                                          <span className="font-bold text-slate-800">{group.name}</span>
                                          <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-[10px] font-bold">{group.items.length} Variants</span>
                                      </div>
                                  </td>
                                  <td className="px-4 py-3 text-center font-bold text-indigo-700">{group.totalSold}</td>
                                  <td className="px-4 py-3 text-slate-400 text-xs italic">See variants</td>
                                  <td className="px-4 py-3 text-right">
                                      <button onClick={(e) => { e.stopPropagation(); setSelectedGroup(group); setModalTab('costing'); }} className="text-indigo-600 font-bold text-xs bg-indigo-50 px-2 py-1 rounded border border-indigo-100">Edit Group</button>
                                  </td>
                              </tr>
                              {isExpanded && group.items.map(item => {
                                  const sold = salesStats.get(item.id)?.units || 0;
                                  return (
                                  <tr key={item.id} className="hover:bg-slate-50">
                                      <td className="px-4 py-3 pl-8"><button onClick={(e) => toggleSelect(item.id, e)}>{selectedIds.has(item.id) ? <CheckSquare size={16} className="text-brand-600" /> : <Square size={16} className="text-slate-300" />}</button></td>
                                      <td className="px-4 py-3 pl-12 text-slate-600 text-sm truncate max-w-[300px]">{item.title}</td>
                                      <td className="px-4 py-3 text-center font-medium">{sold}</td>
                                      <td className="px-4 py-3">{item.current_cogs === 0 ? <span className="text-red-500 font-bold text-xs bg-red-50 px-2 py-1 rounded">Set Cost</span> : formatCurrency(item.current_cogs)}</td>
                                      <td className="px-4 py-3 text-right"><button onClick={() => { setSelectedProduct(item); setModalTab('costing'); }} className="text-slate-400 hover:text-slate-600"><Edit2 size={16} /></button></td>
                                  </tr>
                              )})}
                          </React.Fragment>
                      );
                  })}
                  {/* SINGLES */}
                  {inventoryTree.singles.map(item => {
                      const sold = salesStats.get(item.id)?.units || 0;
                      return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3"><button onClick={(e) => toggleSelect(item.id, e)}>{selectedIds.has(item.id) ? <CheckSquare size={18} className="text-brand-600" /> : <Square size={18} className="text-slate-300" />}</button></td>
                          <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                  <Package size={16} className="text-slate-400" />
                                  <span className="font-medium text-slate-700 truncate max-w-[350px]">{item.title}</span>
                              </div>
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-slate-800">{sold > 0 ? sold : <span className="text-slate-300">-</span>}</td>
                          <td className="px-4 py-3">
                              {item.current_cogs === 0 ? (
                                  <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full w-fit font-bold ${sold > 0 ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-slate-100 text-slate-500'}`}>
                                      <AlertCircle size={12}/> {sold > 0 ? 'MISSING COST' : 'No Cost'}
                                  </span>
                              ) : (
                                  <span className="font-bold text-slate-700">{formatCurrency(item.current_cogs)}</span>
                              )}
                          </td>
                          <td className="px-4 py-3 text-right">
                              <button onClick={() => { setSelectedProduct(item); setModalTab('history'); }} className="mr-2 text-brand-600 hover:text-brand-700 font-bold text-xs bg-brand-50 px-3 py-1.5 rounded border border-brand-100">
                                  View Orders
                              </button>
                              <button onClick={() => { setSelectedProduct(item); setModalTab('costing'); }} className="p-1.5 hover:bg-slate-100 rounded text-slate-400">
                                  <Edit2 size={16} />
                              </button>
                          </td>
                      </tr>
                  )})}
              </tbody>
          </table>
      </div>

      {/* DETAIL MODAL (Redesigned with Tabs) */}
      {(selectedProduct || selectedGroup) && editTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
                  {/* Modal Header */}
                  <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-start">
                      <div>
                          <div className="flex items-center gap-2 mb-1">
                              {isGroupEdit ? <Folder size={20} className="text-indigo-600"/> : <Package size={20} className="text-slate-600"/>}
                              <h3 className="text-xl font-bold text-slate-900">{isGroupEdit ? selectedGroup?.name : selectedProduct?.title}</h3>
                          </div>
                          <p className="text-sm text-slate-500 font-mono">{isGroupEdit ? `${selectedGroup?.items.length} Variants` : selectedProduct?.sku}</p>
                      </div>
                      <button onClick={() => { setSelectedProduct(null); setSelectedGroup(null); }} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
                  </div>

                  {/* Modal Tabs */}
                  <div className="flex border-b border-slate-200">
                      <button 
                        onClick={() => setModalTab('costing')}
                        className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${modalTab === 'costing' ? 'border-brand-600 text-brand-600 bg-brand-50/50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
                      >
                          <div className="flex items-center justify-center gap-2"><DollarSign size={16} /> Cost & Mapping</div>
                      </button>
                      <button 
                        onClick={() => setModalTab('history')}
                        className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${modalTab === 'history' ? 'border-brand-600 text-brand-600 bg-brand-50/50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
                      >
                          <div className="flex items-center justify-center gap-2"><ShoppingBag size={16} /> Order History <span className="bg-slate-200 text-slate-700 px-1.5 rounded-full text-[10px]">{relatedOrders.length}</span></div>
                      </button>
                  </div>
                  
                  {/* Modal Content */}
                  <div className="flex-1 overflow-y-auto p-6">
                      {modalTab === 'costing' ? (
                          <div className="space-y-8">
                              <section>
                                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4">Cost of Goods Sold (COGS)</h4>
                                  <div className="flex gap-4 items-end mb-4">
                                      <div className="flex-1">
                                          <label className="block text-xs font-medium text-slate-500 mb-1">Current Unit Cost (PKR)</label>
                                          <input type="number" className="w-full px-4 py-2 border rounded-lg text-lg font-bold" value={editTarget.current_cogs || ''} onChange={(e) => handleSaveCost(parseFloat(e.target.value) || 0)} />
                                      </div>
                                      <div className="text-xs text-slate-400 pb-2">Applies to new orders.</div>
                                  </div>
                              </section>
                              <section>
                                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4">Shopify Mapping (Aliases)</h4>
                                  <div className="flex flex-wrap gap-2 mb-4">
                                      {editTarget.aliases?.map(alias => (
                                          <span key={alias} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 border border-blue-100">{alias} <button onClick={() => handleRemoveAlias(alias)}><X size={12}/></button></span>
                                      ))}
                                  </div>
                                  <div className="flex gap-2">
                                      <select className="flex-1 px-3 py-2 border rounded-lg text-sm" value={selectedAliasToAdd} onChange={(e) => setSelectedAliasToAdd(e.target.value)}>
                                          <option value="">Select unmapped title...</option>
                                          {unmappedShopifyTitles.map(t => <option key={t} value={t}>{t}</option>)}
                                      </select>
                                      <button onClick={() => { if(selectedAliasToAdd) { handleAddAlias(selectedAliasToAdd); setSelectedAliasToAdd(''); }}} disabled={!selectedAliasToAdd} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold">Link</button>
                                  </div>
                              </section>
                          </div>
                      ) : (
                          <div className="space-y-4">
                              {relatedOrders.length === 0 ? (
                                  <div className="text-center py-12 text-slate-400">
                                      <PackageSearch size={48} className="mx-auto mb-3 opacity-20" />
                                      <p>No orders found for this product in the selected period.</p>
                                  </div>
                              ) : (
                                  <table className="w-full text-left text-sm">
                                      <thead className="bg-slate-50 text-xs uppercase font-bold text-slate-500 sticky top-0">
                                          <tr>
                                              <th className="px-4 py-3">Order Date</th>
                                              <th className="px-4 py-3">Order #</th>
                                              <th className="px-4 py-3 text-center">Qty (This Item)</th>
                                              <th className="px-4 py-3">Bundled With (Other Items)</th>
                                              <th className="px-4 py-3 text-right">Status</th>
                                          </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                          {relatedOrders.map(order => {
                                              // Find relevant item(s) in this order (handle single or group items)
                                              const targetIds = isGroupEdit && selectedGroup 
                                                  ? new Set(selectedGroup.items.map(i => i.id))
                                                  : new Set([editTarget.id]);
                                                  
                                              const targetAliases = new Set(editTarget.aliases || []);

                                              const myItems = order.items.filter(i => 
                                                  targetIds.has(i.product_id) || 
                                                  (isGroupEdit ? false : i.product_name === editTarget.title) ||
                                                  targetAliases.has(i.product_name)
                                              );
                                              
                                              // Other items are anything NOT in myItems list
                                              const otherItems = order.items.filter(i => !myItems.includes(i));
                                              
                                              const qty = myItems.reduce((sum, i) => sum + i.quantity, 0);
                                              
                                              return (
                                                  <tr key={order.id} className="hover:bg-slate-50">
                                                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{new Date(order.created_at).toLocaleDateString()}</td>
                                                      <td className="px-4 py-3 font-medium text-slate-900">{order.shopify_order_number}</td>
                                                      <td className="px-4 py-3 text-center font-bold">{qty}</td>
                                                      <td className="px-4 py-3 text-slate-500 text-xs">
                                                          {otherItems.length > 0 ? (
                                                              <div className="flex flex-wrap gap-1">
                                                                  {otherItems.map((oi, idx) => (
                                                                      <span key={idx} className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 border border-slate-200">
                                                                          {oi.quantity}x {oi.product_name}
                                                                      </span>
                                                                  ))}
                                                              </div>
                                                          ) : <span className="text-slate-300 italic">Single Item Order</span>}
                                                      </td>
                                                      <td className="px-4 py-3 text-right">
                                                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                              order.status === 'DELIVERED' ? 'bg-green-100 text-green-700' :
                                                              order.status === 'RETURNED' ? 'bg-red-100 text-red-700' :
                                                              'bg-blue-50 text-blue-600'
                                                          }`}>{order.status}</span>
                                                      </td>
                                                  </tr>
                                              );
                                          })}
                                      </tbody>
                                  </table>
                              )}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Group Creation Modal (Same as before) */}
      {isGroupModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
               <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                   <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2"><Layers size={20} /> Group Selected Items</h3>
                   <div className="space-y-4 mb-6">
                       <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                           <input type="radio" name="groupAction" checked={groupAction === 'create'} onChange={() => setGroupAction('create')} />
                           <span className="font-bold text-sm text-slate-800">Create New Group</span>
                       </label>
                       {groupAction === 'create' && <input type="text" placeholder="Group Name" className="w-full px-3 py-2 border rounded-lg text-sm ml-8 w-[90%]" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />}
                       <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                           <input type="radio" name="groupAction" checked={groupAction === 'existing'} onChange={() => setGroupAction('existing')} />
                           <span className="font-bold text-sm text-slate-800">Add to Existing Group</span>
                       </label>
                       {groupAction === 'existing' && (
                           <select className="w-full px-3 py-2 border rounded-lg text-sm ml-8 w-[90%]" value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}>
                               <option value="">Select Group...</option>
                               {inventoryTree.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                           </select>
                       )}
                   </div>
                   <div className="flex justify-end gap-3">
                       <button onClick={() => setIsGroupModalOpen(false)} className="px-4 py-2 text-slate-500 hover:text-slate-800 font-medium text-sm">Cancel</button>
                       <button onClick={handleApplyGroup} disabled={isSaving || (groupAction === 'create' && !newGroupName) || (groupAction === 'existing' && !selectedGroupId)} className="px-6 py-2 bg-brand-600 text-white rounded-lg font-bold text-sm">Save</button>
                   </div>
               </div>
          </div>
      )}
    </div>
  );
};

export default Inventory;
