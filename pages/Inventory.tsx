
import React, { useState, useMemo, useEffect } from 'react';
import { Product, Order, ShopifyOrder, OrderStatus } from '../types';
import { formatCurrency } from '../services/calculator';
import { Edit2, X, Package, Layers, CheckSquare, Square, ChevronDown, ChevronRight, Folder, Calendar, Search, History as HistoryIcon, TrendingUp, Save, Plus, Trash2, Tag, AlertCircle, Sparkles, ArrowRight } from 'lucide-react';

interface InventoryProps {
  products: Product[];
  orders: Order[]; 
  shopifyOrders: ShopifyOrder[];
  onUpdateProducts: (products: Product[]) => Promise<void>;
}

const Inventory: React.FC<InventoryProps> = ({ products, orders, shopifyOrders, onUpdateProducts }) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<{id: string, name: string, items: Product[]} | null>(null);
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [selectedAliasToAdd, setSelectedAliasToAdd] = useState('');
  
  // Cost History State (Local to Modal)
  const [newRuleDate, setNewRuleDate] = useState('');
  const [newRuleCost, setNewRuleCost] = useState('');
  
  // Group Logic State
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showAutoGroups, setShowAutoGroups] = useState(false);
  
  // Group Creation/Edit State
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupAction, setGroupAction] = useState<'create' | 'existing'>('create');
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
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

  const filteredProducts = useMemo(() => {
      return products.filter(p => {
          if (search) {
             const term = search.toLowerCase();
             return p.title.toLowerCase().includes(term) || 
                    (p.aliases && p.aliases.some(a => a.toLowerCase().includes(term)));
          }
          return true;
      });
  }, [products, search]);

  const inventoryTree = useMemo(() => {
      const groups = new Map<string, { id: string, name: string, items: Product[] }>();
      const singles: Product[] = [];

      filteredProducts.forEach(p => {
          if (p.group_id && p.group_name) {
              if (!groups.has(p.group_id)) {
                  groups.set(p.group_id, { id: p.group_id, name: p.group_name, items: [] });
              }
              const g = groups.get(p.group_id)!;
              g.items.push(p);
          } else {
              singles.push(p);
          }
      });
      
      const sortedGroups = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
      const sortedSingles = singles.sort((a, b) => a.title.localeCompare(b.title));

      return { groups: sortedGroups, singles: sortedSingles };
  }, [filteredProducts]);

  // --- Auto Group Suggestions Logic ---
  const suggestedGroups = useMemo(() => {
      if (search) return []; // Don't suggest while searching
      
      const candidates: { name: string, items: Product[] }[] = [];
      const singles = inventoryTree.singles;
      
      // Heuristic: Sort by title, look for common prefixes
      if (singles.length < 2) return [];

      let currentGroup: Product[] = [];
      let currentPrefix = '';

      // Helper to get matching prefix length
      const getCommonPrefix = (s1: string, s2: string) => {
          let i = 0;
          while(i < s1.length && i < s2.length && s1[i] === s2[i]) i++;
          return s1.substring(0, i);
      };

      for (let i = 0; i < singles.length - 1; i++) {
          const a = singles[i];
          const b = singles[i+1];
          const common = getCommonPrefix(a.title, b.title);
          
          // Clean prefix (remove trailing " -", " /", etc)
          const cleanCommon = common.replace(/[\s\-\/\|]+$/, '').trim();

          // Condition: Prefix must be substantial (>6 chars) and cover >50% of the name
          if (cleanCommon.length > 6 && cleanCommon.length > (a.title.length * 0.4)) {
              // Start or add to group
              if (currentGroup.length === 0) {
                  currentGroup = [a, b];
                  currentPrefix = cleanCommon;
              } else if (getCommonPrefix(currentPrefix, b.title).startsWith(currentPrefix)) {
                  currentGroup.push(b);
              } else {
                  // Push previous group if valid
                  if (currentGroup.length > 1) {
                      candidates.push({ name: currentPrefix, items: [...currentGroup] });
                  }
                  // Start new
                  currentGroup = [a, b];
                  currentPrefix = cleanCommon;
              }
          } else {
              // Close current group
              if (currentGroup.length > 1) {
                  candidates.push({ name: currentPrefix, items: [...currentGroup] });
              }
              currentGroup = [];
              currentPrefix = '';
          }
      }
      // Check last
      if (currentGroup.length > 1) {
          candidates.push({ name: currentPrefix, items: [...currentGroup] });
      }

      // Deduplicate items in candidates (simple pass)
      return candidates;
  }, [inventoryTree.singles, search]);

  const handleApplyAutoGroup = async (groupName: string, items: Product[]) => {
      const groupId = generateUUID();
      const updates = items.map(p => ({
          ...p,
          group_id: groupId,
          group_name: groupName
      }));
      await handleUpdateAndSave(updates);
  };

  // Determine what is currently being edited
  const editTarget = selectedProduct || (selectedGroup ? selectedGroup.items[0] : null);
  const isGroupEdit = !!selectedGroup;

  // --- Handlers ---
  const handleUpdateBaseCost = async (newCost: number) => {
    if (selectedProduct) {
        const updated = { ...selectedProduct, current_cogs: newCost };
        await handleUpdateAndSave([updated]);
    } else if (selectedGroup) {
        const updatedItems = selectedGroup.items.map(item => ({ ...item, current_cogs: newCost }));
        await handleUpdateAndSave(updatedItems);
    }
  };

  const handleAddHistoryRule = async () => {
      if (!newRuleDate || !newRuleCost || !editTarget) return;
      const cost = parseFloat(newRuleCost);
      if (isNaN(cost)) return;

      const newEntry = { date: newRuleDate, cogs: cost };

      if (selectedProduct) {
          const currentHistory = selectedProduct.cost_history || [];
          // Add new entry and sort
          const updatedHistory = [...currentHistory, newEntry].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          
          const updated = { ...selectedProduct, cost_history: updatedHistory };
          await handleUpdateAndSave([updated]);
      } else if (selectedGroup) {
          const updatedItems = selectedGroup.items.map(item => {
              const currentHistory = item.cost_history || [];
              const updatedHistory = [...currentHistory, newEntry].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
              return { ...item, cost_history: updatedHistory };
          });
          await handleUpdateAndSave(updatedItems);
      }
      
      setNewRuleDate('');
      setNewRuleCost('');
  };

  const handleDeleteHistoryRule = async (index: number) => {
      if (selectedProduct) {
          const updatedHistory = [...(selectedProduct.cost_history || [])];
          updatedHistory.splice(index, 1);
          const updated = { ...selectedProduct, cost_history: updatedHistory };
          await handleUpdateAndSave([updated]);
      } else if (selectedGroup) {
          // For groups, we remove the index from ALL items (assuming sync)
          const updatedItems = selectedGroup.items.map(item => {
              const hist = [...(item.cost_history || [])];
              if(index < hist.length) hist.splice(index, 1);
              return { ...item, cost_history: hist };
          });
          await handleUpdateAndSave(updatedItems);
      }
  };

  const handleUpdateAndSave = async (updatedProducts: Product[]) => {
      setIsSaving(true);
      try {
          await onUpdateProducts(updatedProducts);
      } catch (e: any) {
          console.error("Save failed", e);
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
          <p className="text-slate-500 text-sm">Manage product costs and view history.</p>
        </div>
      </div>

      {/* Auto Group Banner */}
      {suggestedGroups.length > 0 && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                  <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                      <Sparkles size={20} />
                  </div>
                  <div>
                      <h4 className="font-bold text-indigo-900 text-sm">Suggestions Available</h4>
                      <p className="text-xs text-indigo-700">We found {suggestedGroups.length} potential groups based on similar names.</p>
                  </div>
              </div>
              <button 
                  onClick={() => setShowAutoGroups(true)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-indigo-700 transition-colors"
              >
                  Review Suggestions
              </button>
          </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative w-full sm:w-96">
              <input type="text" placeholder="Search product name..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
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
                      <th className="px-4 py-3 w-[60%]">Product Name</th>
                      <th className="px-4 py-3 text-right">Current Cost (COGS)</th>
                      <th className="px-4 py-3 w-16 text-center">Edit</th>
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
                                  <td className="px-4 py-3 text-right">
                                      <button onClick={(e) => { e.stopPropagation(); setSelectedGroup(group); }} className="text-indigo-600 font-bold text-xs bg-indigo-50 px-2 py-1 rounded border border-indigo-100">Edit Group Cost</button>
                                  </td>
                                  <td className="px-4 py-3 text-center"></td>
                              </tr>
                              {isExpanded && group.items.map(item => {
                                  return (
                                  <tr key={item.id} className="hover:bg-slate-50">
                                      <td className="px-4 py-3 pl-8"><button onClick={(e) => toggleSelect(item.id, e)}>{selectedIds.has(item.id) ? <CheckSquare size={16} className="text-brand-600" /> : <Square size={16} className="text-slate-300" />}</button></td>
                                      <td className="px-4 py-3 pl-12">
                                          <div className="text-slate-700 text-sm font-medium">{item.title}</div>
                                      </td>
                                      <td className="px-4 py-3 text-right">
                                          {item.current_cogs === 0 ? <span className="text-red-500 font-bold text-xs">Set Cost</span> : <span className="font-medium">{formatCurrency(item.current_cogs)}</span>}
                                      </td>
                                      <td className="px-4 py-3 text-center"><button onClick={() => { setSelectedProduct(item); }} className="text-slate-400 hover:text-slate-600"><Edit2 size={16} /></button></td>
                                  </tr>
                              )})}
                          </React.Fragment>
                      );
                  })}
                  {/* SINGLES */}
                  {inventoryTree.singles.map(item => {
                      return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3"><button onClick={(e) => toggleSelect(item.id, e)}>{selectedIds.has(item.id) ? <CheckSquare size={18} className="text-brand-600" /> : <Square size={18} className="text-slate-300" />}</button></td>
                          <td className="px-4 py-3">
                              <div className="flex items-start gap-3">
                                  <div className="mt-1"><Package size={16} className="text-slate-400" /></div>
                                  <div>
                                      <div className="font-medium text-slate-700">{item.title}</div>
                                  </div>
                              </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                              {item.current_cogs === 0 ? (
                                  <span className="text-red-500 font-bold text-xs bg-red-50 px-2 py-1 rounded">No Cost Set</span>
                              ) : (
                                  <span className="font-bold text-slate-700">{formatCurrency(item.current_cogs)}</span>
                              )}
                          </td>
                          <td className="px-4 py-3 text-center">
                              <button onClick={() => { setSelectedProduct(item); }} className="p-1.5 hover:bg-slate-100 rounded text-slate-400">
                                  <Edit2 size={16} />
                              </button>
                          </td>
                      </tr>
                  )})}
                  
                  {filteredProducts.length === 0 && (
                      <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                              <p className="mb-2">No items found.</p>
                              <p className="text-xs">Import orders from Shopify or sync couriers to see items.</p>
                          </td>
                      </tr>
                  )}
              </tbody>
          </table>
      </div>

      {/* AUTO GROUP MODAL */}
      {showAutoGroups && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                  <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                      <h3 className="font-bold text-xl text-slate-900 flex items-center gap-2">
                          <Sparkles className="text-brand-600" size={20} /> Suggested Groups
                      </h3>
                      <button onClick={() => setShowAutoGroups(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                  </div>
                  <div className="p-6 overflow-y-auto flex-1 space-y-4">
                      {suggestedGroups.map((sg, idx) => (
                          <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4">
                              <div className="flex-1">
                                  <h4 className="font-bold text-slate-800">{sg.name}</h4>
                                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-2">
                                      {sg.items.map(i => (
                                          <span key={i.id} className="bg-white border px-2 py-0.5 rounded">{i.title}</span>
                                      ))}
                                  </div>
                              </div>
                              <button 
                                  onClick={() => handleApplyAutoGroup(sg.name, sg.items)}
                                  className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 flex items-center gap-2 shrink-0"
                              >
                                  Create Group <ArrowRight size={14}/>
                              </button>
                          </div>
                      ))}
                      {suggestedGroups.length === 0 && <p className="text-center text-slate-500">No suggestions found currently.</p>}
                  </div>
              </div>
          </div>
      )}

      {/* DETAIL MODAL */}
      {(selectedProduct || selectedGroup) && editTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                  {/* Modal Header */}
                  <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-start">
                      <div>
                          <div className="flex items-center gap-2 mb-1">
                              {isGroupEdit ? <Folder size={20} className="text-indigo-600"/> : <Package size={20} className="text-slate-600"/>}
                              <h3 className="text-xl font-bold text-slate-900">{isGroupEdit ? selectedGroup?.name : selectedProduct?.title}</h3>
                          </div>
                          <p className="text-sm text-slate-500 font-mono flex items-center gap-2">
                              {isGroupEdit ? `${selectedGroup?.items.length} Variants` : ''}
                          </p>
                      </div>
                      <button onClick={() => { setSelectedProduct(null); setSelectedGroup(null); }} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
                  </div>

                  {/* Modal Content */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-8">
                      {/* Section 1: Base Cost */}
                      <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-2 opacity-10"><TrendingUp size={100} className="text-brand-600"/></div>
                          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4 flex items-center gap-2 relative z-10">
                              Current General Price
                          </h4>
                          <div className="flex gap-4 items-end relative z-10">
                              <div className="flex-1">
                                  <label className="block text-xs font-medium text-slate-500 mb-1">Default Cost (PKR)</label>
                                  <div className="relative">
                                      <input 
                                        type="number" 
                                        className="w-full px-4 py-3 border rounded-lg text-xl font-bold text-slate-900 focus:ring-2 focus:ring-brand-500 outline-none" 
                                        value={editTarget.current_cogs || ''} 
                                        onChange={(e) => handleUpdateBaseCost(parseFloat(e.target.value) || 0)} 
                                        placeholder="0"
                                      />
                                      <div className="absolute right-3 top-3.5 text-slate-400 text-sm font-medium">PKR</div>
                                  </div>
                              </div>
                              <div className="pb-2 text-xs text-slate-500 max-w-[250px] leading-tight">
                                  This price is used for all orders <strong>unless</strong> a specific date rule below overrides it.
                              </div>
                          </div>
                      </section>

                      {/* Section 2: Date-Based History Rules */}
                      <section>
                          <div className="flex justify-between items-center mb-4">
                              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
                                  <HistoryIcon size={16} className="text-slate-500" /> Historical Cost Rules
                              </h4>
                          </div>
                          
                          {/* Add Rule Form */}
                          <div className="flex gap-3 items-end mb-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                              <div className="flex-1">
                                  <label className="block text-xs font-bold text-slate-500 mb-1">Start Date</label>
                                  <input 
                                      type="date" 
                                      className="w-full px-3 py-2 border rounded-lg text-sm"
                                      value={newRuleDate}
                                      onChange={(e) => setNewRuleDate(e.target.value)}
                                  />
                              </div>
                              <div className="flex-1">
                                  <label className="block text-xs font-bold text-slate-500 mb-1">Cost (PKR)</label>
                                  <input 
                                      type="number" 
                                      className="w-full px-3 py-2 border rounded-lg text-sm"
                                      placeholder="e.g. 1200"
                                      value={newRuleCost}
                                      onChange={(e) => setNewRuleCost(e.target.value)}
                                  />
                              </div>
                              <button 
                                  onClick={handleAddHistoryRule}
                                  disabled={!newRuleDate || !newRuleCost}
                                  className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2"
                              >
                                  <Plus size={16} /> Add Rule
                              </button>
                          </div>

                          {/* Rule List */}
                          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                              <table className="w-full text-left text-sm">
                                  <thead className="bg-slate-100 text-xs font-bold text-slate-500">
                                      <tr>
                                          <th className="px-4 py-2">Effective Date</th>
                                          <th className="px-4 py-2">Cost (COGS)</th>
                                          <th className="px-4 py-2 text-right">Action</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                      {editTarget.cost_history && editTarget.cost_history.length > 0 ? (
                                          // Display sorted by date descending (newest first)
                                          [...editTarget.cost_history].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((h, idx) => (
                                              <tr key={idx} className="hover:bg-slate-50">
                                                  <td className="px-4 py-2 text-slate-700">From <strong>{new Date(h.date).toLocaleDateString()}</strong></td>
                                                  <td className="px-4 py-2 font-medium text-slate-900">{formatCurrency(h.cogs)}</td>
                                                  <td className="px-4 py-2 text-right">
                                                      <button 
                                                          onClick={() => handleDeleteHistoryRule(idx)}
                                                          className="text-red-400 hover:text-red-600 p-1"
                                                      >
                                                          <Trash2 size={14} />
                                                      </button>
                                                  </td>
                                              </tr>
                                          ))
                                      ) : (
                                          <tr>
                                              <td colSpan={3} className="px-4 py-6 text-center text-slate-400 text-xs italic">
                                                  No history rules set. Uses default cost for all dates.
                                              </td>
                                          </tr>
                                      )}
                                  </tbody>
                              </table>
                          </div>
                      </section>

                      {/* Section 3: Mapping */}
                      <section className="pt-4 border-t border-slate-100">
                          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4">Shopify Aliases</h4>
                          <div className="flex flex-wrap gap-2 mb-4">
                              {editTarget.aliases?.map(alias => (
                                  <span key={alias} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 border border-blue-100">{alias} <button onClick={() => handleRemoveAlias(alias)}><X size={12}/></button></span>
                              ))}
                          </div>
                          <div className="flex gap-2">
                              <select className="flex-1 px-3 py-2 border rounded-lg text-sm bg-white" value={selectedAliasToAdd} onChange={(e) => setSelectedAliasToAdd(e.target.value)}>
                                  <option value="">Link unmapped Shopify title...</option>
                                  {unmappedShopifyTitles.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                              <button onClick={() => { if(selectedAliasToAdd) { handleAddAlias(selectedAliasToAdd); setSelectedAliasToAdd(''); }}} disabled={!selectedAliasToAdd} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition-colors">Link</button>
                          </div>
                      </section>
                  </div>
              </div>
          </div>
      )}

      {/* Group Creation Modal (Manual) */}
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
