import React, { useMemo, useState } from 'react';
import { Order, Product, AdSpend } from '../types';
import { calculateProductPerformance, formatCurrency, ProductPerformance } from '../services/calculator';
import { Package, Eye, X, Banknote, ShoppingBag, CheckCircle2, RotateCcw, Clock, Layers, LayoutGrid, ChevronDown, ChevronRight, CornerDownRight } from 'lucide-react';

interface ProfitabilityProps {
  orders: Order[];
  products: Product[];
  adSpend?: AdSpend[];
}

// Extend interface locally for view logic
interface GroupedProductPerformance extends ProductPerformance {
    variants?: ProductPerformance[];
}

// --- Extracted Row Component to prevent re-render issues ---
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

    return (
        <>
            <tr 
                className={`
                    ${isChild ? 'bg-slate-50/50 hover:bg-slate-100' : 'hover:bg-slate-50 cursor-pointer'} 
                    ${isGroup ? 'bg-white font-semibold' : ''}
                    transition-colors border-b border-slate-100
                `}
                onClick={(e) => {
                    if (isGroup) {
                        e.preventDefault();
                        toggleGroup(item.id);
                    }
                }}
            >
                {/* 1. Product */}
                <td className="px-6 py-4 max-w-xs">
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
                                <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-400">
                                    <Package size={16} />
                                </div>
                            )}
                        </div>

                        {/* Title & Info */}
                        <div className="overflow-hidden">
                            <div className={`truncate ${isGroup ? 'text-indigo-900' : 'text-slate-900'}`} title={item.title}>
                                {item.title}
                            </div>
                            {item.sku === 'GROUP' && (
                                <div className="text-xs text-slate-500 truncate font-mono flex items-center gap-1">
                                    <span className="text-indigo-500 font-bold text-[10px] uppercase tracking-wide">
                                        Collection ({item.variants?.length || 0} items)
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </td>

                {/* 2. Delivered (with %) */}
                <td className="px-6 py-4 text-center">
                    <div className="font-medium text-green-700">{item.units_sold}</div>
                    <div className="text-[10px] text-slate-400">
                        {deliveredRate.toFixed(0)}%
                    </div>
                </td>

                {/* 3. Returned (with %) */}
                <td className="px-6 py-4 text-center">
                    <div className={`font-medium ${item.rto_rate > 20 ? 'text-red-600' : 'text-slate-700'}`}>
                         {item.units_returned}
                    </div>
                    <div className="text-[10px] text-slate-400">
                        {item.rto_rate.toFixed(1)}%
                    </div>
                </td>

                {/* 4. Revenue */}
                <td className="px-6 py-4 text-right font-medium text-slate-700">{formatCurrency(item.gross_revenue)}</td>

                {/* 5. COGS */}
                <td className="px-6 py-4 text-right text-slate-500">{formatCurrency(item.cogs_total)}</td>

                {/* 6. Cash Stuck */}
                <td className="px-6 py-4 text-right">
                    <span className="text-indigo-600 font-medium">{formatCurrency(item.cash_in_stock)}</span>
                </td>

                {/* 7. Ad Spend */}
                <td className="px-6 py-4 text-right text-purple-600">
                    {formatCurrency(item.ad_spend_allocation)}
                </td>

                {/* 8. Gross Profit */}
                <td className="px-6 py-4 text-right font-medium text-slate-700">{formatCurrency(item.gross_profit)}</td>

                {/* 9. Net Profit */}
                <td className="px-6 py-4 text-right">
                    <div className={`font-bold ${isProfitable ? 'text-green-700' : 'text-red-600'}`}>
                        {formatCurrency(item.net_profit)}
                    </div>
                    {item.gross_revenue > 0 && (
                        <div className="text-xs text-slate-400">
                            {((item.net_profit / item.gross_revenue) * 100).toFixed(0)}% Margin
                        </div>
                    )}
                </td>

                {/* 10. Action */}
                <td className="px-6 py-4 text-center">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onViewDetails(item); }}
                        className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-brand-600 transition-colors"
                        title="View Details"
                    >
                        <Eye size={18} />
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
                    id: item.group_id, // CRITICAL: Use Group ID as the Row ID
                    title: item.group_name,
                    sku: 'GROUP', 
                    // Zero out initial counters to sum up
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
                    variants: [] // Initialize container
                };
            }
            const g = groups[item.group_id];
            g.variants?.push(item);

            g.units_sold += item.units_sold;
            g.units_returned += item.units_returned;
            g.units_in_transit += item.units_in_transit;
            g.gross_revenue += item.gross_revenue;
            g.cogs_total += item.cogs_total;
            g.gross_profit += item.gross_profit; // Sums revenue - cogs - direct ads
            g.cash_in_stock += item.cash_in_stock;
            g.shipping_cost_allocation += item.shipping_cost_allocation;
            g.ad_spend_allocation += item.ad_spend_allocation; // Sums variant-specific ads
        } else {
            standalones.push(item);
        }
    });

    // 2. Add Group-Level Ad Spend
    Object.keys(groups).forEach(groupId => {
        const groupLevelAds = adSpend
            .filter(a => a.product_id === groupId)
            .reduce((sum, a) => sum + a.amount_spent, 0);
        
        const g = groups[groupId];
        g.ad_spend_allocation += groupLevelAds;
        
        // Recalculate Profits for Group
        // Gross Profit (Rev - COGS - All Ads)
        g.gross_profit = g.gross_revenue - g.cogs_total - g.ad_spend_allocation;
        // Net Profit (Rev - COGS - StockInTransit - Ship - Ads)
        g.net_profit = g.gross_revenue - g.cogs_total - g.cash_in_stock - g.shipping_cost_allocation - g.ad_spend_allocation;

        // Recalc RTO
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
    <div className="space-y-6 relative">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Deep Profit Analysis</h2>
          <p className="text-slate-500 text-sm">Real Net Profit per Product / Group</p>
        </div>
        {/* Buttons Removed */}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700">Product</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-center">Delivered</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-center">Returned</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-right">Revenue</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-right">COGS</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-right">Cash Stuck</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-right">Ad Spend</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-right">Gross Profit</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-right">Net Profit</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((item) => (
                  <ProfitabilityRow 
                    key={item.id} 
                    item={item} 
                    expandedGroups={expandedGroups}
                    toggleGroup={toggleGroup}
                    onViewDetails={setSelectedItem}
                  />
              ))}
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
                        <div className="w-12 h-12 bg-white rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 shadow-sm">
                            <Package size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-900">{selectedItem.title}</h3>
                            <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                                {selectedItem.sku !== 'GROUP' && (
                                    <span className="font-mono bg-slate-200 px-2 py-0.5 rounded text-xs text-slate-700">{selectedItem.sku}</span>
                                )}
                                <span>•</span>
                                <span>{selectedItem.units_sold + selectedItem.units_returned + selectedItem.units_in_transit} Total Dispatched</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={() => setSelectedItem(null)} className="text-slate-400 hover:text-slate-600 p-1">
                        <X size={24} />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 p-6">
                    {/* KPI Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                        <div className={`p-4 rounded-xl border ${selectedItem.net_profit > 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                            <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${selectedItem.net_profit > 0 ? 'text-green-600' : 'text-red-600'}`}>Net Profit</p>
                            <h4 className={`text-2xl font-bold ${selectedItem.net_profit > 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(selectedItem.net_profit)}</h4>
                        </div>
                        <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Profit Margin</p>
                            <h4 className="text-2xl font-bold text-slate-800">
                                {selectedItem.gross_revenue > 0 ? ((selectedItem.net_profit / selectedItem.gross_revenue) * 100).toFixed(1) : 0}%
                            </h4>
                        </div>
                        <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Sales</p>
                            <h4 className="text-2xl font-bold text-slate-800">{formatCurrency(selectedItem.gross_revenue)}</h4>
                        </div>
                        <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">RTO Rate</p>
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
                        <div>
                            <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <Banknote size={18} className="text-slate-500" /> Financial Breakdown
                            </h4>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                                    <span className="text-sm text-slate-600">Gross Revenue</span>
                                    <span className="font-semibold text-slate-900">{formatCurrency(selectedItem.gross_revenue)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                                    <span className="text-sm text-slate-600">COGS (Realized Sold)</span>
                                    <span className="font-semibold text-slate-900">-{formatCurrency(selectedItem.cogs_total)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                                    <div className="flex flex-col">
                                        <span className="text-sm text-slate-600">Ad Spend Allocation</span>
                                        {selectedItem.sku === 'GROUP' && <span className="text-[10px] text-slate-400">Includes shared group ads</span>}
                                    </div>
                                    <span className="font-semibold text-purple-600">-{formatCurrency(selectedItem.ad_spend_allocation)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-100">
                                    <span className="text-sm font-medium text-green-800">Gross Profit</span>
                                    <span className="font-bold text-green-700">{formatCurrency(selectedItem.gross_profit)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                                    <span className="text-sm text-slate-600">Shipping & Packaging</span>
                                    <span className="font-semibold text-red-500">-{formatCurrency(selectedItem.shipping_cost_allocation)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-indigo-800">Cash in Stock (In Transit/RTO)</span>
                                        <span className="text-[10px] text-indigo-500">Asset Value currently in network</span>
                                    </div>
                                    <span className="font-bold text-indigo-700">-{formatCurrency(selectedItem.cash_in_stock)}</span>
                                </div>
                                <div className="border-t border-slate-200 pt-3 flex justify-between items-center px-3">
                                    <span className="font-bold text-slate-900">Net Profit</span>
                                    <span className={`font-bold ${selectedItem.net_profit > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {formatCurrency(selectedItem.net_profit)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Order Statistics (Replaced Recent Orders) */}
                        <div>
                            <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <ShoppingBag size={18} className="text-slate-500" /> Order Lifecycle
                            </h4>
                            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
                                 <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-500">Total Dispatched</p>
                                        <p className="text-2xl font-bold text-slate-900">
                                            {selectedItem.units_sold + selectedItem.units_returned + selectedItem.units_in_transit}
                                        </p>
                                    </div>
                                    <div className="h-10 w-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">
                                        <Package size={20} />
                                    </div>
                                 </div>
                                 
                                 <div className="h-px bg-slate-100"></div>

                                 <div className="space-y-4">
                                     {/* Delivered */}
                                     <div>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="flex items-center gap-2 text-slate-600">
                                                <CheckCircle2 size={14} className="text-green-600" /> Delivered
                                            </span>
                                            <span className="font-medium">{selectedItem.units_sold}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                            <div className="bg-green-500 h-2" style={{width: `${(selectedItem.units_sold / (selectedItem.units_sold + selectedItem.units_returned + selectedItem.units_in_transit || 1)) * 100}%`}}></div>
                                        </div>
                                     </div>

                                     {/* In Transit */}
                                     <div>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="flex items-center gap-2 text-slate-600">
                                                <Clock size={14} className="text-blue-600" /> In Transit
                                            </span>
                                            <span className="font-medium">{selectedItem.units_in_transit}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                            <div className="bg-blue-500 h-2" style={{width: `${(selectedItem.units_in_transit / (selectedItem.units_sold + selectedItem.units_returned + selectedItem.units_in_transit || 1)) * 100}%`}}></div>
                                        </div>
                                     </div>

                                     {/* Returned */}
                                     <div>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="flex items-center gap-2 text-slate-600">
                                                <RotateCcw size={14} className="text-red-600" /> Returned (RTO)
                                            </span>
                                            <span className="font-medium">{selectedItem.units_returned}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                            <div className="bg-red-500 h-2" style={{width: `${(selectedItem.units_returned / (selectedItem.units_sold + selectedItem.units_returned + selectedItem.units_in_transit || 1)) * 100}%`}}></div>
                                        </div>
                                     </div>
                                 </div>
                            </div>
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