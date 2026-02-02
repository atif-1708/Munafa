
import React, { useState, useMemo, useEffect } from 'react';
import { Product, Order, ShopifyOrder } from '../types';
import { formatCurrency } from '../services/calculator';
import { PackageSearch, History, Edit2, Plus, X, Trash2, Package, Layers, CheckSquare, Square, ChevronDown, ChevronRight, CornerDownRight, Folder, Calendar, Link as LinkIcon, Sparkles, Check, Settings, AlertCircle } from 'lucide-react';

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
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [ignoredSuggestionKeys, setIgnoredSuggestionKeys] = useState<Set<string>>(new Set());
  
  // Group Creation/Edit State
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupAction, setGroupAction] = useState<'create' | 'existing'>('create');
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // --- SYNC EFFECT: Keep selected items fresh when main products list updates ---
  useEffect(() => {
      if (selectedProduct) {
          const fresh = products.find(p => p.id === selectedProduct.id);
          if (fresh && fresh !== selectedProduct) {
              setSelectedProduct(fresh);
          }
      }
      if (selectedGroup) {
          // Re-fetch group items from fresh products list to ensure consistency
          const freshItems = products.filter(p => p.group_id === selectedGroup.id);
          // Only update if group still exists and has items
          if (freshItems.length > 0) {
              setSelectedGroup(prev => prev ? { ...prev, items: freshItems } : null);
          }
      }
  }, [products, selectedProduct, selectedGroup]); 

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
          if (search) {
             const term = search.toLowerCase();
             return p.title.toLowerCase().includes(term) || 
                    p.sku.toLowerCase().includes(term);
          }
          
          // 3. Date Active Filter (Only applied when NOT searching)
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

  // --- IMPROVED Auto-Suggestion Logic (Token Matching) ---
  const suggestions = useMemo(() => {
      const singles = [...inventoryTree.singles].sort((a, b) => a.title.localeCompare(b.title));
      const results: { key: string, name: string, items: Product[] }[] = [];
      const usedIds = new Set<string>();

      // Tokenize function
      const getTokens = (str: string) => {
          return str.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(t => t.length > 2 && !['pcs', 'pack', 'set', 'with', 'for', 'and'].includes(t));
      };

      for (let i = 0; i < singles.length; i++) {
          if (usedIds.has(singles[i].id)) continue;

          const current = singles[i];
          const tokensA = getTokens(current.title);
          if (tokensA.length === 0) continue;

          // Start a cluster with current item
          const cluster: Product[] = [current];
          
          // Compare with all subsequent items
          for (let j = i + 1; j < singles.length; j++) {
              if (usedIds.has(singles[j].id)) continue;
              
              const next = singles[j];
              const tokensB = getTokens(next.title);
              
              // Find intersection of tokens (must share starting tokens to be a group usually)
              let match = false;
              
              if (tokensA.length >= 2 && tokensB.length >= 2) {
                  if (tokensA[0] === tokensB[0] && tokensA[1] === tokensB[1]) match = true;
              } else if (tokensA.length > 0 && tokensB.length > 0) {
                  if (tokensA[0] === tokensB[0]) match = true;
              }

              if (match) {
                  cluster.push(next);
                  usedIds.add(next.id); // Mark as used for inner loop
              }
          }

          if (cluster.length >= 2) {
              // Generate Group Name from common prefix
              const tokensFirst = getTokens(cluster[0].title);
              const tokensSecond = getTokens(cluster[1].title);
              let commonTokens = [];
              for(let k=0; k<Math.min(tokensFirst.length, tokensSecond.length); k++) {
                  if(tokensFirst[k] === tokensSecond[k]) commonTokens.push(tokensFirst[k]);
                  else break;
              }
              
              let groupName = commonTokens.join(' ').replace(/\b\w/g, l => l.toUpperCase());
              if (groupName.length < 3) groupName = cluster[0].title.split(' ').slice(0, 3).join(' ');

              const key = cluster.map(c => c.id).sort().join('-');
              
              if (!ignoredSuggestionKeys.has(key)) {
                  results.push({ key, name: groupName, items: cluster });
              }
              cluster.forEach(c => usedIds.add(c.id));
          }
      }
      return results;
  }, [inventoryTree.singles, ignoredSuggestionKeys]);

  // Calculate unmapped titles for the alias dropdown
  const unmappedShopifyTitles = useMemo(() => {
    const usedAliases = new Set<string>();
    products.forEach(p => {
        if (p.aliases) {
            p.aliases.forEach(a => usedAliases.add(a));
        }
    });

    const uniqueTitles = new Set<string>();
    shopifyOrders.forEach(o => {
        if (o.line_items && Array.isArray(o.line_items)) {
            o.line_items.forEach(item => {
                if (item.title) {
                    uniqueTitles.add(item.title);
                }
            });
        }
    });

    return Array.from(uniqueTitles).filter(t => !usedAliases.has(t)).sort();
  }, [products, shopifyOrders]); 

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
          setSaveError("Failed to save changes.");
      } finally {
          setIsSaving(false);
      }
  };

  const handleSaveCost = async (newCost: number) => {
    if (selectedProduct) {
        // Update single product
        const updated = { ...selectedProduct, current_cogs: newCost };
        await handleUpdateAndSave([updated]);
    } else if (selectedGroup) {
        // Update entire group (Batch)
        const updatedItems = selectedGroup.items.map(item => ({
            ...item,
            current_cogs: newCost
        }));
        await handleUpdateAndSave(updatedItems);
    }
  };

  const handleAddHistory = async (date: string, cost: number) => {
    const target = selectedProduct || (selectedGroup ? selectedGroup.items[0] : null);
    if (!target) return;

    // For groups, we only update the 'lead' item for history to avoid complexity,
    // OR we could update all. For simplicity, let's update all in group to keep them in sync.
    const targets = selectedGroup ? selectedGroup.items : [target];
    
    const updates = targets.map(p => {
        const newHistory = [...(p.cost_history || []), { date, cogs: cost }];
        newHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return { ...p, cost_history: newHistory };
    });

    if (selectedProduct) setSelectedProduct(updates[0]); // Optimistic update for single view
    await handleUpdateAndSave(updates);
  };

  const handleDeleteHistory = async (index: number) => {
    const target = selectedProduct || (selectedGroup ? selectedGroup.items[0] : null);
    if (!target) return;

    // Similar logic: apply to all if group
    const targets = selectedGroup ? selectedGroup.items : [target];
    
    const updates = targets.map(p => {
        const newHistory = [...p.cost_history];
        newHistory.splice(index, 1);
        return { ...p, cost_history: newHistory };
    });

    if (selectedProduct) setSelectedProduct(updates[0]);
    await handleUpdateAndSave(updates);
  };

  const handleAddAlias = async (alias: string) => {
    const targetProduct = selectedProduct || (selectedGroup && selectedGroup.items[0]);
    if (!targetProduct) return;

    // 1. Remove this alias from any OTHER product that might have it (Claim it)
    const cleanupUpdates: Product[] = [];
    products.forEach(p => {
        if (p.id !== targetProduct.id && p.aliases && p.aliases.includes(alias)) {
            cleanupUpdates.push({ ...p, aliases: p.aliases.filter(a => a !== alias) });
        }
    });

    // 2. Add to Target (If group, add to first item only as the group 'key')
    const currentAliases = targetProduct.aliases || [];
    if (!currentAliases.includes(alias)) {
        const updatedTarget = { ...targetProduct, aliases: [...currentAliases, alias] };
        cleanupUpdates.push(updatedTarget);
    }

    if (cleanupUpdates.length > 0) {
        await handleUpdateAndSave(cleanupUpdates);
    }
  };

  const handleRemoveAlias = async (alias: string) => {
    const targetProduct = selectedProduct || (selectedGroup && selectedGroup.items[0]);
    if (!targetProduct) return;

    const currentAliases = targetProduct.aliases || [];
    const updatedTarget = { ...targetProduct, aliases: currentAliases.filter(a => a !== alias) };
    
    await handleUpdateAndSave([updatedTarget]);
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
  };

  // Determine what is currently being edited
  const editTarget = selectedProduct || (selectedGroup ? selectedGroup.items[0] : null);
  const isGroupEdit = !!selectedGroup;

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Inventory & Costing</h2>
          <p className="text-slate-500 text-sm">Manage Product Costs (COGS) and Grouping for accurate profit analysis.</p>
        </div>
        
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

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative w-full sm:w-96">
              <input 
                type="text" 
                placeholder="Search products by title..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <PackageSearch className="absolute left-3 top-2.5 text-slate-400" size={18} />
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
             {suggestions.length > 0 && (
                 <button 
                    onClick={() => setShowSuggestions(!showSuggestions)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${showSuggestions ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                 >
                     <Sparkles size={16} />
                     {suggestions.length} Suggestions
                 </button>
             )}
             
             {selectedIds.size > 0 && (
                 <button 
                    onClick={() => setIsGroupModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold shadow-md hover:bg-slate-800 transition-colors"
                 >
                     <Layers size={16} /> Group Selected ({selectedIds.size})
                 </button>
             )}
          </div>
      </div>

      {/* Suggestions Panel */}
      {showSuggestions && suggestions.length > 0 && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 animate-in fade-in slide-in-from-top-2">
              <h4 className="text-sm font-bold text-indigo-900 mb-3 flex items-center gap-2">
                  <Sparkles size={16} /> Smart Grouping Suggestions
              </h4>
              <div className="flex overflow-x-auto gap-4 pb-2">
                  {suggestions.map(s => (
                      <div key={s.key} className="bg-white p-3 rounded-lg border border-indigo-100 shadow-sm min-w-[250px] flex-shrink-0">
                          <div className="flex justify-between items-start mb-2">
                              <span className="font-bold text-slate-800 text-sm">{s.name}</span>
                              <div className="flex gap-1">
                                  <button 
                                    onClick={() => {
                                        const newSet = new Set(selectedIds);
                                        s.items.forEach(i => newSet.add(i.id));
                                        setSelectedIds(newSet);
                                        setNewGroupName(s.name);
                                        setGroupAction('create');
                                        setIsGroupModalOpen(true);
                                        // Remove from suggestions locally by ignoring key
                                        setIgnoredSuggestionKeys(prev => new Set(prev).add(s.key));
                                    }}
                                    className="p-1 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200" title="Apply"
                                  >
                                      <Check size={14} />
                                  </button>
                                  <button 
                                     onClick={() => setIgnoredSuggestionKeys(prev => new Set(prev).add(s.key))}
                                     className="p-1 bg-slate-100 text-slate-400 rounded hover:bg-slate-200" title="Ignore"
                                  >
                                      <X size={14} />
                                  </button>
                              </div>
                          </div>
                          <div className="space-y-1">
                              {s.items.map(item => (
                                  <div key={item.id} className="text-xs text-slate-500 truncate pl-2 border-l-2 border-indigo-200">
                                      {item.title}
                                  </div>
                              ))}
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* Main Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                      <th className="px-4 py-3 w-10">
                         {/* Header Checkbox logic could be complex, omitting for simplicity or adding Select All Visible */}
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Product / Group</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Current Cost (COGS)</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">Actions</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                  {inventoryTree.groups.map(group => {
                      const isExpanded = expandedGroups.has(group.id);
                      const allSelected = group.items.every(i => selectedIds.has(i.id));
                      const someSelected = group.items.some(i => selectedIds.has(i.id));
                      
                      return (
                          <React.Fragment key={group.id}>
                              <tr className="bg-slate-50/50 hover:bg-slate-50 cursor-pointer" onClick={(e) => toggleGroupExpand(group.id, e)}>
                                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                      <button onClick={(e) => toggleGroupSelection(group.id, group.items, e)} className="text-slate-400 hover:text-indigo-600">
                                          {allSelected ? <CheckSquare size={18} className="text-indigo-600" /> : someSelected ? <CheckSquare size={18} className="text-indigo-400 opacity-50" /> : <Square size={18} />}
                                      </button>
                                  </td>
                                  <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                          {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                                          <Folder size={16} className="text-indigo-500" />
                                          <span className="font-bold text-slate-800">{group.name}</span>
                                          <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-xs">{group.items.length}</span>
                                      </div>
                                  </td>
                                  <td className="px-4 py-3 text-slate-400">-</td>
                                  <td className="px-4 py-3 text-right">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setSelectedGroup(group); }}
                                        className="text-indigo-600 hover:text-indigo-800 text-xs font-medium px-2 py-1 bg-indigo-50 rounded border border-indigo-100"
                                      >
                                          Edit Group
                                      </button>
                                  </td>
                              </tr>
                              {isExpanded && group.items.map(item => (
                                  <tr key={item.id} className="hover:bg-slate-50">
                                      <td className="px-4 py-3 pl-8">
                                          <button onClick={(e) => toggleSelect(item.id, e)} className="text-slate-400 hover:text-brand-600">
                                              {selectedIds.has(item.id) ? <CheckSquare size={16} className="text-brand-600" /> : <Square size={16} />}
                                          </button>
                                      </td>
                                      <td className="px-4 py-3">
                                          <div className="flex items-center gap-2 pl-6 border-l-2 border-slate-100 ml-3">
                                              <span className="truncate max-w-[300px]" title={item.title}>{item.title}</span>
                                          </div>
                                      </td>
                                      <td className="px-4 py-3">
                                          {item.current_cogs === 0 ? (
                                              <span className="text-red-500 font-bold flex items-center gap-1"><AlertCircle size={12}/> Set Cost</span>
                                          ) : (
                                              <span className="font-medium text-slate-700">{formatCurrency(item.current_cogs)}</span>
                                          )}
                                      </td>
                                      <td className="px-4 py-3 text-right">
                                          <button onClick={() => setSelectedProduct(item)} className="p-1.5 hover:bg-slate-200 rounded text-slate-500">
                                              <Edit2 size={14} />
                                          </button>
                                      </td>
                                  </tr>
                              ))}
                          </React.Fragment>
                      );
                  })}
                  
                  {inventoryTree.singles.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                              <button onClick={(e) => toggleSelect(item.id, e)} className="text-slate-400 hover:text-brand-600">
                                  {selectedIds.has(item.id) ? <CheckSquare size={18} className="text-brand-600" /> : <Square size={18} />}
                              </button>
                          </td>
                          <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                  <Package size={16} className="text-slate-400" />
                                  <span className="truncate max-w-[300px] font-medium text-slate-700" title={item.title}>{item.title}</span>
                              </div>
                          </td>
                          <td className="px-4 py-3">
                              {item.current_cogs === 0 ? (
                                  <span className="text-red-500 font-bold flex items-center gap-1 text-xs px-2 py-1 bg-red-50 rounded-full w-fit"><AlertCircle size={12}/> Missing Cost</span>
                              ) : (
                                  <span className="font-medium text-slate-700">{formatCurrency(item.current_cogs)}</span>
                              )}
                          </td>
                          <td className="px-4 py-3 text-right">
                              <button onClick={() => setSelectedProduct(item)} className="p-1.5 hover:bg-slate-200 rounded text-slate-500 transition-colors">
                                  <Edit2 size={16} />
                              </button>
                          </td>
                      </tr>
                  ))}
                  
                  {inventoryTree.groups.length === 0 && inventoryTree.singles.length === 0 && (
                      <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400">No products found matching filters.</td></tr>
                  )}
              </tbody>
          </table>
      </div>

      {/* Shared Detail / Edit Modal (For Product or Group) */}
      {(selectedProduct || selectedGroup) && editTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
                  <div className={`p-6 border-b border-slate-200 flex justify-between items-start ${isGroupEdit ? 'bg-indigo-50' : 'bg-white'}`}>
                      <div>
                          <div className="flex items-center gap-2 mb-1">
                              {isGroupEdit ? <Folder size={20} className="text-indigo-600"/> : <Package size={20} className="text-slate-600"/>}
                              <h3 className="text-xl font-bold text-slate-900">
                                  {isGroupEdit ? selectedGroup?.name : selectedProduct?.title}
                              </h3>
                          </div>
                          <p className="text-sm text-slate-500 font-mono">
                              {isGroupEdit ? `${selectedGroup?.items.length} Variants in Group` : selectedProduct?.sku}
                          </p>
                      </div>
                      <button onClick={() => { setSelectedProduct(null); setSelectedGroup(null); }} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
                  </div>
                  
                  <div className="p-6 space-y-8">
                      {/* Cost Section */}
                      <section>
                          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4 flex items-center gap-2">
                              <DollarSignIcon /> Cost of Goods Sold (COGS)
                          </h4>
                          <div className="flex items-end gap-4 mb-4">
                              <div className="flex-1">
                                  <label className="block text-xs font-medium text-slate-600 mb-1">
                                      {isGroupEdit ? 'Batch Set Cost (All Variants)' : 'Current Unit Cost (PKR)'}
                                  </label>
                                  <input 
                                    type="number" 
                                    className="w-full px-4 py-2 border rounded-lg text-lg font-bold text-slate-900 focus:ring-2 focus:ring-brand-500 outline-none"
                                    value={editTarget.current_cogs || ''}
                                    onChange={(e) => handleSaveCost(parseFloat(e.target.value) || 0)}
                                  />
                              </div>
                              <div className="text-xs text-slate-500 pb-3 max-w-[200px]">
                                  This cost applies to all orders unless a historical cost is defined below.
                              </div>
                          </div>

                          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                              <div className="flex justify-between items-center mb-3">
                                  <span className="text-xs font-bold text-slate-600 flex items-center gap-1"><History size={12}/> Cost History</span>
                                  <span className="text-[10px] text-slate-400">For older orders</span>
                              </div>
                              <div className="space-y-2 mb-3">
                                  {editTarget.cost_history?.map((h, idx) => (
                                      <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border border-slate-100 text-sm">
                                          <span className="text-slate-600">Effective from <strong>{h.date}</strong></span>
                                          <div className="flex items-center gap-3">
                                              <span className="font-mono font-medium">{formatCurrency(h.cogs)}</span>
                                              <button onClick={() => handleDeleteHistory(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
                                          </div>
                                      </div>
                                  ))}
                                  {(!editTarget.cost_history || editTarget.cost_history.length === 0) && (
                                      <p className="text-xs text-slate-400 italic">No history. Current cost applies to all past dates.</p>
                                  )}
                              </div>
                              
                              <form 
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    const form = e.target as HTMLFormElement;
                                    const d = (form.elements.namedItem('hDate') as HTMLInputElement).value;
                                    const c = parseFloat((form.elements.namedItem('hCost') as HTMLInputElement).value);
                                    if(d && c) {
                                        handleAddHistory(d, c);
                                        form.reset();
                                    }
                                }}
                                className="flex gap-2 items-center"
                              >
                                  <input name="hDate" type="date" required className="px-2 py-1 border rounded text-xs" />
                                  <input name="hCost" type="number" required placeholder="Cost" className="px-2 py-1 border rounded text-xs w-20" />
                                  <button type="submit" className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-xs font-bold">Add</button>
                              </form>
                          </div>
                      </section>

                      {/* Alias Section */}
                      <section>
                          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4 flex items-center gap-2">
                              <LinkIcon size={16} /> Shopify Mapping (Aliases)
                          </h4>
                          <p className="text-xs text-slate-500 mb-3">
                              {isGroupEdit 
                                ? 'Link Shopify titles to this GROUP. All matching orders will be grouped under this name.' 
                                : 'Link this product to different titles used in Shopify orders (e.g. bundles or renamed items).'}
                          </p>
                          
                          <div className="flex flex-wrap gap-2 mb-4">
                              {editTarget.aliases?.map(alias => (
                                  <span key={alias} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 border border-blue-100">
                                      {alias}
                                      <button onClick={() => handleRemoveAlias(alias)} className="hover:text-blue-900"><X size={12} /></button>
                                  </span>
                              ))}
                          </div>

                          <div className="flex gap-2">
                              <select 
                                className="flex-1 px-3 py-2 border rounded-lg text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-brand-500"
                                value={selectedAliasToAdd}
                                onChange={(e) => setSelectedAliasToAdd(e.target.value)}
                              >
                                  <option value="">Select unmapped Shopify title...</option>
                                  {unmappedShopifyTitles.map(t => (
                                      <option key={t} value={t}>{t}</option>
                                  ))}
                              </select>
                              <button 
                                onClick={() => { 
                                    if (selectedAliasToAdd) {
                                        handleAddAlias(selectedAliasToAdd);
                                        setSelectedAliasToAdd('');
                                    }
                                }}
                                disabled={!selectedAliasToAdd}
                                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold disabled:opacity-50"
                              >
                                  Link
                              </button>
                          </div>
                      </section>
                  </div>
                  
                  <div className="p-6 border-t border-slate-200 bg-slate-50 rounded-b-xl flex justify-end">
                      <button onClick={() => { setSelectedProduct(null); setSelectedGroup(null); }} className="px-6 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-100">Done</button>
                  </div>
              </div>
          </div>
      )}

      {/* Group Creation Modal */}
      {isGroupModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
               <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                   <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2"><Layers size={20} /> Group Selected Items</h3>
                   
                   <div className="space-y-4 mb-6">
                       <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                           <input 
                            type="radio" 
                            name="groupAction" 
                            checked={groupAction === 'create'} 
                            onChange={() => setGroupAction('create')}
                            className="text-brand-600 focus:ring-brand-500"
                           />
                           <div>
                               <span className="block font-bold text-sm text-slate-800">Create New Group</span>
                               <span className="text-xs text-slate-500">Combine selected items into a new variant group</span>
                           </div>
                       </label>
                       
                       {groupAction === 'create' && (
                           <div className="ml-8">
                               <input 
                                type="text" 
                                placeholder="Group Name (e.g. Cotton T-Shirt)" 
                                className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
                                value={newGroupName}
                                onChange={(e) => setNewGroupName(e.target.value)}
                                autoFocus
                               />
                           </div>
                       )}

                       <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                           <input 
                            type="radio" 
                            name="groupAction" 
                            checked={groupAction === 'existing'} 
                            onChange={() => setGroupAction('existing')}
                            className="text-brand-600 focus:ring-brand-500"
                           />
                           <div>
                               <span className="block font-bold text-sm text-slate-800">Add to Existing Group</span>
                               <span className="text-xs text-slate-500">Merge with an already created group</span>
                           </div>
                       </label>

                       {groupAction === 'existing' && (
                           <div className="ml-8">
                               <select 
                                className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
                                value={selectedGroupId}
                                onChange={(e) => setSelectedGroupId(e.target.value)}
                               >
                                   <option value="">Select Group...</option>
                                   {inventoryTree.groups.map(g => (
                                       <option key={g.id} value={g.id}>{g.name}</option>
                                   ))}
                               </select>
                           </div>
                       )}
                   </div>

                   <div className="flex justify-end gap-3">
                       <button onClick={() => setIsGroupModalOpen(false)} className="px-4 py-2 text-slate-500 hover:text-slate-800 font-medium text-sm">Cancel</button>
                       <button 
                        onClick={handleApplyGroup} 
                        disabled={isSaving || (groupAction === 'create' && !newGroupName) || (groupAction === 'existing' && !selectedGroupId)}
                        className="px-6 py-2 bg-brand-600 text-white rounded-lg font-bold text-sm hover:bg-brand-700 disabled:opacity-50"
                       >
                           {isSaving ? 'Saving...' : 'Apply Grouping'}
                       </button>
                   </div>
               </div>
          </div>
      )}
    </div>
  );
};

// Simple Icon Component
const DollarSignIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
);

export default Inventory;
