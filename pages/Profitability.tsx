import React, { useMemo, useState } from 'react';
import { Order, Product, AdSpend } from '../types';
import { calculateProductPerformance, formatCurrency, ProductPerformance } from '../services/calculator';
import { Package, Eye, X, Banknote, ShoppingBag, CheckCircle2, RotateCcw, Clock, Layers, ChevronDown, ChevronRight, CornerDownRight, ArrowUpRight, TrendingUp, AlertCircle } from 'lucide-react';

interface ProfitabilityProps {
  orders: Order[];
  products: Product[];
  adSpend?: AdSpend[];
}

// Extend interface locally for view logic
interface GroupedProductPerformance extends ProductPerformance {
    variants?: ProductPerformance[];
}

// --- Extracted Row Component ---
const ProfitabilityRow = ({ 
    item, 
    expandedGroups, 
    toggleGroup, 
    onViewDetails, 
    isChild = false 
}: { 
    item: GroupedProductPerformance, 
    expandedGroups: Set<string>, 
    toggleGroup: (id: string) => void,
    onViewDetails: (item: ProductPerformance) => void,
    isChild?: boolean
}) => {
    const isProfitable = item.net_profit > 0;
    const isGroup = item.sku === 'GROUP';
    const isExpanded = isGroup && expandedGroups.has(item.id);

    const totalDispatched = item.units_sold + item.units_returned + item.units_in_transit;
    const deliveredRate = totalDispatched > 0 ? (item.units_sold / totalDispatched) * 100 : 0;
    
    // Background logic: Groups are white, Children are slate-50 to differentiate hierarchy
    const bgClass = isChild ? 'bg-slate-50' : 'bg-white';
    const hoverClass = isChild ? 'hover:bg-slate-100' : 'hover:bg-gray-50';

    return (
        <>
            <tr 
                className={`
                    ${bgClass} ${hoverClass}
                    transition-colors border-b border-slate-100 group
                `}
                onClick={(e) => {
                    if (isGroup) {
                        e.preventDefault();
                        toggleGroup(item.id);
                    }
                }}
            >
                {/* 1. Product (Sticky Left - Optional, typically Name is sticky but we'll stick to just right for now to save space on mobile) */}
                <td className="px-6 py-4 min-w-[280px]">
                    <div className="flex items-center gap-3" style={{ paddingLeft: isChild ? '24px' : '0px' }}>
                        {/* Icon / Indent */}
                        <div className="shrink-0 flex items-center justify-center w-8">
                            {isChild ? (
                                <CornerDownRight size={16} className="text-slate-400" />
                            ) : isGroup ? (
                                <button className="text-slate-400 hover:text-indigo-600 transition-colors">
                                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                </button>
                            ) : (
                                <div className="w-8 h-8 rounded bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500">
                                    <Package size={16} />
                                </div>
                            )}
                        </div>

                        {/* Title & Info */}
                        <div className="overflow-hidden">
                            <div className={`truncate font-medium ${isGroup ? 'text-indigo-900 text-base' : 'text-slate-900 text-sm'}`} title={item.title}>
                                {item.title}
                            </div>
                            {item.sku === 'GROUP' ? (
                                <div className="text-xs text-indigo-500 font-bold uppercase tracking-wide flex items-center gap-1 mt-0.5">
                                    <Layers size={10} /> Collection ({item.variants?.length || 0})
                                </div>
                            ) : (
                                <div className="text-xs text-slate-400 font-mono mt-0.5">{item.sku}</div>
                            )}
                        </div>
                    </div>
                </td>

                {/* 2. Delivered */}
                <td className="px-6 py-4 text-center tabular-nums">
                    <div className="font-medium text-slate-700">{item.units_sold}</div>
                    <div className={`text-[10px] font-medium ${deliveredRate < 70 ? 'text-orange-500' : 'text-green-600'}`}>
                        {deliveredRate.toFixed(0)}% Del.
                    </div>
                </td>

                {/* 3. Returned */}
                <td className="px-6 py-4 text-center tabular-nums">
                    <div className={`font-medium ${item.units_returned > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                         {item.units_returned}
                    </div>
                    {item.rto_rate > 0 && (
                        <div className={`text-[10px] font-medium ${item.rto_rate > 15 ? 'text-red-600' : 'text-slate-400'}`}>
                            {item.rto_rate.toFixed(1)}% RTO
                        </div>
                    )}
                </td>

                {/* 4. Revenue */}
                <td className="px-6 py-4 text-right font-medium text-slate-700 tabular-nums bg-slate-50/30">
                    {formatCurrency(item.gross_revenue)}
                </td>

                {/* 5. COGS */}
                <td className="px-6 py-4 text-right text-slate-500 tabular-nums">
                    {formatCurrency(item.cogs_total)}
                </td>

                {/* 6. Cash Stuck (Stock in Network) */}
                <td className="px-6 py-4 text-right tabular-nums">
                    <span className={`${item.cash_in_stock > 0 ? 'text-indigo-600 font-medium' : 'text-slate-300'}`}>
                        {formatCurrency(item.cash_in_stock)}
                    </span>
                </td>

                {/* 7. Ad Spend */}
                <td className="px-6 py-4 text-right text-purple-600 tabular-nums">
                    {item.ad_spend_allocation > 0 ? formatCurrency(item.ad_spend_allocation) : <span className="text-slate-300">-</span>}
                </td>

                {/* 8. Gross Profit */}
                <td className="px-6 py-4 text-right font-medium text-slate-700 tabular-nums bg-slate-50/30">
                    {formatCurrency(item.gross_profit)}
                </td>

                {/* 9. Net Profit */}
                <td className="px-6 py-4 text-right tabular-nums">
                    <div className={`font-bold text-base ${isProfitable ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatCurrency(item.net_profit)}
                    </div>
                    {item.gross_revenue > 0 && (
                        <div className={`text-[10px] font-medium ${isProfitable ? 'text-emerald-500' : 'text-red-400'}`}>
                            {((item.net_profit / item.gross_revenue) * 100).toFixed(0)}% Margin
                        </div>
                    )}
                </td>

                {/* 10. Action - Sticky Right */}
                <td className={`px-4 py-4 text-center sticky right-0 z-10 border-l border-slate-100 shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.05)] ${bgClass}`}>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onViewDetails(item); }}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-brand-600 hover:border-brand-200 hover:bg-brand-50 transition-all shadow-sm bg-white mx-auto"
                        title="View Full Analysis"
                    >
                        <ArrowUpRight size={16} />
                    </button>
                </td>
            </tr>
            {isExpanded && item.variants && item.variants.map(child => (
                <ProfitabilityRow 
                    key={child.id} 
                    item={child} 
                    expandedGroups={expandedGroups}
                    toggleGroup={toggleGroup}
                    onViewDetails={onViewDetails}
                    isChild={true}
                />
            ))}
        </>
    );
};

const Profitability: React.FC<ProfitabilityProps> = ({ orders, products, adSpend = [] }) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<ProductPerformance | null>(null);

  const variantData = useMemo(() => calculateProductPerformance(orders, products, adSpend), [orders, products, adSpend]);

  // Group Aggregation Logic
  const data = useMemo(() => {
    const groups: Record<string, GroupedProductPerformance> = {};
    const standalones: GroupedProductPerformance[] = [];

    // 1. Aggregate Variants
    variantData.forEach(item => {
        if (item.group_id && item.group_name) {
            if (!groups[item.group_id]) {
                groups[item.group_id] = {
                    ...item,
                    id: item.group_id,
                    title: item.group_name,
                    sku: 'GROUP', 
                    units_sold: 0,
                    units_returned: 0,
                    units_in_transit: 0,
                    gross_revenue: 0,
                    cogs_total: 0,
                    gross_profit: 0,
                    cash_in_stock: 0,
                    shipping_cost_allocation: 0,
                    ad_spend_allocation: 0,
                    net_profit: 0,
                    rto_rate: 0,
                    variants: [] 
                };
            }
            const g = groups[item.group_id];
            g.variants?.push(item);

            g.units_sold += item.units_sold;
            g.units_returned += item.units_returned;
            g.units_in_transit += item.units_in_transit;
            g.gross_revenue += item.gross_revenue;
            g.cogs_total += item.cogs_total;
            g.gross_profit += item.gross_profit;
            g.cash_in_stock += item.cash_in_stock;
            g.shipping_cost_allocation += item.shipping_cost_allocation;
            g.ad_spend_allocation += item.ad_spend_allocation; 
        } else {
            standalones.push(item);
        }
    });

    // 2. Add Group-Level Ad Spend & Final Calculations
    Object.keys(groups).forEach(groupId => {
        const groupLevelAds = adSpend
            .filter(a => a.product_id === groupId)
            .reduce((sum, a) => sum + a.amount_spent, 0);
        
        const g = groups[groupId];
        g.ad_spend_allocation += groupLevelAds;
        
        g.gross_profit = g.gross_revenue - g.cogs_total - g.ad_spend_allocation;
        g.net_profit = g.gross_revenue - g.cogs_total - g.cash_in_stock - g.shipping_cost_allocation - g.ad_spend_allocation;

        const closed = g.units_sold + g.units_returned;
        g.rto_rate = closed > 0 ? (g.units_returned / closed) * 100 : 0;
    });

    return [...Object.values(groups), ...standalones].sort((a, b) => b.net_profit - a.net_profit);

  }, [variantData, adSpend]);

  const toggleGroup = (id: string) => {
      const newSet = new Set(expandedGroups);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setExpandedGroups(newSet);
  };

  return (
    <div className="space-y-6 relative h-full">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Profitability Matrix</h2>
          <p className="text-slate-500 text-sm mt-1">Deep dive into unit economics per SKU and Group.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        {/* Scroll Container */}
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent pb-2">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700 text-xs uppercase tracking-wider min-w-[280px]">Product / Group</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-xs uppercase tracking-wider text-center min-w-[100px]">Delivered</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-xs uppercase tracking-wider text-center min-w-[100px]">Returned</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-xs uppercase tracking-wider text-right min-w-[120px]">Revenue</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-xs uppercase tracking-wider text-right min-w-[120px]">COGS</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-xs uppercase tracking-wider text-right min-w-[120px]">Cash Stuck</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-xs uppercase tracking-wider text-right min-w-[120px]">Ads</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-xs uppercase tracking-wider text-right min-w-[120px]">Gross Profit</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-xs uppercase tracking-wider text-right min-w-[140px]">Net Profit</th>
                
                {/* Sticky Header for Action Column */}
                <th className="px-4 py-4 font-semibold text-slate-700 text-xs uppercase tracking-wider text-center sticky right-0 bg-slate-50 z-10 border-l border-slate-200 shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.05)] w-[80px]">
                    View
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.length === 0 ? (
                  <tr>
                      <td colSpan={10} className="px-6 py-12 text-center text-slate-400 italic">
                          No order data available to analyze yet.
                      </td>
                  </tr>
              ) : (
                  data.map((item) => (
                      <ProfitabilityRow 
                        key={item.id} 
                        item={item} 
                        expandedGroups={expandedGroups}
                        toggleGroup={toggleGroup}
                        onViewDetails={setSelectedItem}
                      />
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                    <div className="flex gap-4">
                        <div className="w-12 h-12 bg-white rounded-lg border border-slate-200 flex items-center justify-center text-indigo-600 shadow-sm">
                            <TrendingUp size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-900">{selectedItem.title}</h3>
                            <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                                {selectedItem.sku !== 'GROUP' ? (
                                    <span className="font-mono bg-slate-200 px-2 py-0.5 rounded text-xs text-slate-700 border border-slate-300">
                                        {selectedItem.sku}
                                    </span>
                                ) : (
                                    <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs font-bold border border-indigo-200">
                                        PRODUCT COLLECTION
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <button onClick={() => setSelectedItem(null)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 p-6 bg-slate-50/50">
                    {/* KPI Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                        <div className={`p-5 rounded-xl border shadow-sm ${selectedItem.net_profit > 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                            <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${selectedItem.net_profit > 0 ? 'text-emerald-700' : 'text-red-700'}`}>Net Profit</p>
                            <h4 className={`text-2xl font-bold ${selectedItem.net_profit > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(selectedItem.net_profit)}</h4>
                        </div>
                        <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Profit Margin</p>
                            <h4 className="text-2xl font-bold text-slate-800">
                                {selectedItem.gross_revenue > 0 ? ((selectedItem.net_profit / selectedItem.gross_revenue) * 100).toFixed(1) : 0}%
                            </h4>
                        </div>
                        <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Total Sales</p>
                            <h4 className="text-2xl font-bold text-slate-800">{formatCurrency(selectedItem.gross_revenue)}</h4>
                        </div>
                        <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">RTO Rate</p>
                            <div className="flex items-baseline gap-2">
                                <h4 className={`text-2xl font-bold ${selectedItem.rto_rate > 20 ? 'text-red-600' : 'text-slate-800'}`}>
                                    {selectedItem.rto_rate.toFixed(1)}%
                                </h4>
                                <span className="text-xs text-slate-400">({selectedItem.units_returned} units)</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Cost Breakdown */}
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                            <h4 className="font-bold text-slate-900 mb-6 flex items-center gap-2 pb-4 border-b border-slate-100">
                                <Banknote size={18} className="text-indigo-600" /> Unit Economics Breakdown
                            </h4>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium text-slate-600">Gross Revenue</span>
                                    <span className="font-bold text-slate-900">{formatCurrency(selectedItem.gross_revenue)}</span>
                                </div>
                                <div className="flex justify-between items-center text-red-500">
                                    <span className="text-sm flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-400"></span> COGS (Sold)</span>
                                    <span className="font-medium">-{formatCurrency(selectedItem.cogs_total)}</span>
                                </div>
                                <div className="flex justify-between items-center text-purple-600">
                                    <div className="flex flex-col">
                                        <span className="text-sm flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span> Ad Spend</span>
                                    </div>
                                    <span className="font-medium">-{formatCurrency(selectedItem.ad_spend_allocation)}</span>
                                </div>
                                
                                <div className="my-2 border-t border-dashed border-slate-200"></div>
                                
                                <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg">
                                    <span className="text-sm font-bold text-slate-700">Gross Profit</span>
                                    <span className="font-bold text-slate-800">{formatCurrency(selectedItem.gross_profit)}</span>
                                </div>

                                <div className="flex justify-between items-center text-orange-600 mt-2">
                                    <span className="text-sm flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span> Shipping & Packaging</span>
                                    <span className="font-medium">-{formatCurrency(selectedItem.shipping_cost_allocation)}</span>
                                </div>
                                <div className="flex justify-between items-center text-indigo-600">
                                    <div className="flex flex-col">
                                        <span className="text-sm flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span> Cash Stuck (Stock)</span>
                                    </div>
                                    <span className="font-medium">-{formatCurrency(selectedItem.cash_in_stock)}</span>
                                </div>

                                <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center">
                                    <span className="font-bold text-lg text-slate-900">Net Profit</span>
                                    <span className={`font-bold text-lg ${selectedItem.net_profit > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {formatCurrency(selectedItem.net_profit)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Order Statistics */}
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit">
                            <h4 className="font-bold text-slate-900 mb-6 flex items-center gap-2 pb-4 border-b border-slate-100">
                                <ShoppingBag size={18} className="text-indigo-600" /> Order Flow
                            </h4>
                            
                             <div className="mb-8 text-center">
                                <p className="text-sm text-slate-500 mb-1">Total Units Dispatched</p>
                                <p className="text-4xl font-bold text-slate-900 tracking-tight">
                                    {selectedItem.units_sold + selectedItem.units_returned + selectedItem.units_in_transit}
                                </p>
                             </div>

                             <div className="space-y-6">
                                 {/* Delivered */}
                                 <div>
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className="flex items-center gap-2 text-slate-700 font-medium">
                                            <CheckCircle2 size={16} className="text-emerald-500" /> Delivered
                                        </span>
                                        <span className="font-bold text-emerald-700">{selectedItem.units_sold}</span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                                        <div className="bg-emerald-500 h-2.5" style={{width: `${(selectedItem.units_sold / (selectedItem.units_sold + selectedItem.units_returned + selectedItem.units_in_transit || 1)) * 100}%`}}></div>
                                    </div>
                                 </div>

                                 {/* In Transit */}
                                 <div>
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className="flex items-center gap-2 text-slate-700 font-medium">
                                            <Clock size={16} className="text-blue-500" /> In Transit
                                        </span>
                                        <span className="font-bold text-blue-700">{selectedItem.units_in_transit}</span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                                        <div className="bg-blue-500 h-2.5" style={{width: `${(selectedItem.units_in_transit / (selectedItem.units_sold + selectedItem.units_returned + selectedItem.units_in_transit || 1)) * 100}%`}}></div>
                                    </div>
                                 </div>

                                 {/* Returned */}
                                 <div>
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className="flex items-center gap-2 text-slate-700 font-medium">
                                            <RotateCcw size={16} className="text-red-500" /> Returned (RTO)
                                        </span>
                                        <span className="font-bold text-red-700">{selectedItem.units_returned}</span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                                        <div className="bg-red-500 h-2.5" style={{width: `${(selectedItem.units_returned / (selectedItem.units_sold + selectedItem.units_returned + selectedItem.units_in_transit || 1)) * 100}%`}}></div>
                                    </div>
                                 </div>
                             </div>

                             {selectedItem.rto_rate > 25 && (
                                 <div className="mt-8 bg-red-50 p-4 rounded-lg border border-red-100 flex gap-3">
                                     <AlertCircle className="text-red-600 shrink-0" size={20} />
                                     <div>
                                         <h5 className="font-bold text-red-800 text-sm">High RTO Alert</h5>
                                         <p className="text-xs text-red-700 mt-1">This item has an abnormal return rate. Consider checking product quality or targeting.</p>
                                     </div>
                                 </div>
                             )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Profitability;