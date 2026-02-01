
import React, { useMemo, useState } from 'react';
import { Order, Product, AdSpend, ShopifyOrder } from '../types';
import { calculateProductPerformance, formatCurrency, ProductPerformance } from '../services/calculator';
import { Package, Eye, X, Layers, ChevronDown, ChevronRight, CornerDownRight, Calendar, Download, Loader2, TrendingUp, TrendingDown, DollarSign, Truck, ShoppingBag, AlertCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ProfitabilityProps {
  orders: Order[];
  shopifyOrders?: ShopifyOrder[];
  products: Product[];
  adSpend?: AdSpend[];
  adsTaxRate?: number;
  storeName?: string;
}

// Extend interface locally for view logic
interface GroupedProductPerformance extends ProductPerformance {
    variants?: ProductPerformance[];
}

interface ProfitabilityRowProps {
    item: GroupedProductPerformance;
    expandedGroups: Set<string>;
    toggleGroup: (id: string) => void;
    onViewDetails: (item: ProductPerformance) => void;
    isChild?: boolean;
}

const formatPercent = (count: number, total: number) => {
    if (total === 0) return '0%';
    return `${((count / total) * 100).toFixed(0)}%`;
};

// --- Extracted Row Component ---
const ProfitabilityRow: React.FC<ProfitabilityRowProps> = ({ 
    item, 
    expandedGroups, 
    toggleGroup, 
    onViewDetails, 
    isChild = false 
}) => {
    const isProfitable = item.net_profit > 0;
    const isGroup = item.sku === 'GROUP';
    const isExpanded = isGroup && expandedGroups.has(item.id);

    const totalDispatched = item.units_sold + item.units_returned + item.units_in_transit;
    
    // Percentage Helpers
    const deliveredRate = totalDispatched > 0 ? (item.units_sold / totalDispatched) * 100 : 0;
    const returnRate = totalDispatched > 0 ? (item.units_returned / totalDispatched) * 100 : 0;
    const transitRate = totalDispatched > 0 ? (item.units_in_transit / totalDispatched) * 100 : 0;
    
    // Background logic
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
                {/* 1. Product Name */}
                <td className="pl-3 pr-2 py-3 w-[25%] max-w-[200px]">
                    <div className="flex items-center gap-2" style={{ paddingLeft: isChild ? '16px' : '0px' }}>
                        {/* Icon / Indent */}
                        <div className="shrink-0 flex items-center justify-center w-5">
                            {isChild ? (
                                <CornerDownRight size={14} className="text-slate-400" />
                            ) : isGroup ? (
                                <button className="text-slate-400 hover:text-indigo-600 transition-colors">
                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                            ) : (
                                <div className="hidden sm:flex w-6 h-6 rounded bg-slate-100 border border-slate-200 items-center justify-center text-slate-500">
                                    <Package size={12} />
                                </div>
                            )}
                        </div>

                        {/* Title Only - No SKU */}
                        <div className="overflow-hidden min-w-0">
                            <div className={`truncate font-medium leading-tight ${isGroup ? 'text-indigo-900' : 'text-slate-700'}`} title={item.title}>
                                {item.title}
                            </div>
                            {item.sku === 'GROUP' && (
                                <div className="text-[10px] text-indigo-500 font-bold uppercase tracking-wide flex items-center gap-1 mt-0.5">
                                    <Layers size={8} /> Group ({item.variants?.length || 0})
                                </div>
                            )}
                        </div>
                    </div>
                </td>
                
                {/* 2. Dispatched */}
                 <td className="px-1 py-3 text-center tabular-nums bg-purple-50/30">
                    <span className={`font-medium ${totalDispatched > 0 ? 'text-purple-600' : 'text-slate-300'}`}>
                        {totalDispatched}
                    </span>
                </td>

                {/* 3. Delivered */}
                <td className="px-1 py-3 text-center tabular-nums bg-green-50/30">
                     <div className="flex flex-col items-center">
                        <span className={`font-bold ${item.units_sold > 0 ? 'text-green-600' : 'text-slate-300'}`}>{item.units_sold}</span>
                        {item.units_sold > 0 && <span className="text-[10px] text-green-600/70">{deliveredRate.toFixed(0)}%</span>}
                     </div>
                </td>

                {/* 4. Returned */}
                <td className="px-1 py-3 text-center tabular-nums bg-red-50/30">
                    <div className="flex flex-col items-center">
                        <span className={`font-bold ${item.units_returned > 0 ? 'text-red-600' : 'text-slate-300'}`}>{item.units_returned}</span>
                        {item.units_returned > 0 && <span className="text-[10px] text-red-600/70">{returnRate.toFixed(0)}%</span>}
                     </div>
                </td>

                 {/* 5. In Transit */}
                 <td className="px-1 py-3 text-center tabular-nums bg-blue-50/30">
                    <div className="flex flex-col items-center">
                        <span className={`font-medium ${item.units_in_transit > 0 ? 'text-blue-600' : 'text-slate-300'}`}>{item.units_in_transit}</span>
                        {item.units_in_transit > 0 && <span className="text-[10px] text-blue-600/70">{transitRate.toFixed(0)}%</span>}
                     </div>
                </td>

                {/* 6. Gross Profit */}
                 <td className="px-1 py-3 text-right tabular-nums hidden md:table-cell">
                    <span className={`font-medium ${item.gross_profit > 0 ? 'text-indigo-600' : 'text-slate-400'}`}>
                        {formatCurrency(item.gross_profit)}
                    </span>
                </td>

                {/* 7. Net Profit */}
                <td className="px-2 py-3 text-right">
                    <div className={`font-bold ${isProfitable ? 'text-green-700' : 'text-red-600'} tabular-nums`}>
                        {formatCurrency(item.net_profit)}
                    </div>
                    {item.net_profit !== 0 && (
                        <div className={`text-[10px] ${item.net_profit > 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {item.gross_revenue > 0 ? ((item.net_profit / item.gross_revenue) * 100).toFixed(0) : 0}% Margin
                        </div>
                    )}
                </td>

                 {/* 8. Actions */}
                 <td className="px-2 py-3 text-right">
                     <button 
                        onClick={(e) => { e.stopPropagation(); onViewDetails(item); }}
                        className="p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 transition-colors"
                     >
                        <Eye size={16} />
                     </button>
                 </td>
            </tr>
            
            {/* Render Children (Variants) if Expanded */}
            {isExpanded && item.variants && item.variants.map((variant) => (
                <ProfitabilityRow 
                    key={variant.id} 
                    item={variant} 
                    expandedGroups={expandedGroups}
                    toggleGroup={toggleGroup}
                    onViewDetails={onViewDetails}
                    isChild={true}
                />
            ))}
        </>
    );
};


const Profitability: React.FC<ProfitabilityProps> = ({ orders, shopifyOrders = [], products, adSpend = [], adsTaxRate = 0, storeName = 'My Store' }) => {
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 60);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  });

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedProduct, setSelectedProduct] = useState<ProductPerformance | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // 1. Filter Orders/Ads by Date
  const filteredData = useMemo(() => {
    const start = new Date(dateRange.start);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateRange.end);
    end.setHours(23, 59, 59, 999);

    return {
      orders: orders.filter(o => {
        const d = new Date(o.created_at);
        return d >= start && d <= end;
      }),
      shopifyOrders: shopifyOrders.filter(o => {
          const d = new Date(o.created_at);
          return d >= start && d <= end;
      }),
      adSpend: adSpend.filter(a => {
        const d = new Date(a.date);
        return d >= start && d <= end;
      })
    };
  }, [orders, shopifyOrders, adSpend, dateRange]);

  // 2. Calculate Stats
  const rawStats = useMemo(() => 
      calculateProductPerformance(filteredData.orders, products, filteredData.adSpend, adsTaxRate, filteredData.shopifyOrders), 
  [filteredData, products, adsTaxRate]);

  // 3. Group Logic (Aggregating Variants into Groups)
  const groupedStats = useMemo(() => {
      const groups = new Map<string, GroupedProductPerformance>();
      const singles: GroupedProductPerformance[] = [];

      rawStats.forEach(stat => {
          const totalDispatched = stat.units_sold + stat.units_returned + stat.units_in_transit;
          if (totalDispatched === 0 && stat.ad_spend_allocation === 0) return;

          if (stat.group_id && stat.group_name) {
              if (!groups.has(stat.group_id)) {
                  groups.set(stat.group_id, {
                      id: stat.group_id,
                      title: stat.group_name,
                      sku: 'GROUP', 
                      units_sold: 0,
                      units_returned: 0,
                      units_in_transit: 0,
                      real_order_count: 0,
                      gross_revenue: 0,
                      cogs_total: 0,
                      gross_profit: 0,
                      cash_in_stock: 0,
                      shipping_cost_allocation: 0,
                      overhead_allocation: 0,
                      tax_allocation: 0,
                      ad_spend_allocation: 0,
                      marketing_purchases: 0,
                      shopify_total_orders: 0,
                      shopify_confirmed_orders: 0,
                      associatedShopifyOrders: [],
                      net_profit: 0,
                      rto_rate: 0,
                      variants: []
                  });
              }
              const group = groups.get(stat.group_id)!;
              
              group.variants!.push(stat);

              group.units_sold += stat.units_sold;
              group.units_returned += stat.units_returned;
              group.units_in_transit += stat.units_in_transit;
              group.real_order_count += stat.real_order_count;
              group.gross_revenue += stat.gross_revenue;
              group.cogs_total += stat.cogs_total;
              group.gross_profit += stat.gross_profit;
              group.cash_in_stock += stat.cash_in_stock;
              group.shipping_cost_allocation += stat.shipping_cost_allocation;
              group.overhead_allocation += stat.overhead_allocation;
              group.tax_allocation += stat.tax_allocation;
              group.ad_spend_allocation += stat.ad_spend_allocation;
              group.marketing_purchases += stat.marketing_purchases;
              
              group.shopify_total_orders += stat.shopify_total_orders;
              group.shopify_confirmed_orders += stat.shopify_confirmed_orders;
              group.associatedShopifyOrders = [...group.associatedShopifyOrders, ...stat.associatedShopifyOrders];

              group.net_profit += stat.net_profit;
          } else {
              singles.push(stat);
          }
      });

      const groupList = Array.from(groups.values()).map(g => {
          const closed = g.units_sold + g.units_returned;
          g.rto_rate = closed > 0 ? (g.units_returned / closed) * 100 : 0;
          return g;
      });

      return [...groupList, ...singles].sort((a,b) => b.net_profit - a.net_profit);

  }, [rawStats]);

  const toggleGroup = (id: string) => {
      const newSet = new Set(expandedGroups);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setExpandedGroups(newSet);
  };

  const handleExportPDF = () => {
    setIsExporting(true);
    setTimeout(() => { setIsExporting(false); alert("Export feature coming soon for table."); }, 1000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Product Profitability</h2>
                <p className="text-slate-500 text-sm">SKU-level financial breakdown (Net Profit & Margins).</p>
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

            <button 
                onClick={() => handleExportPDF()}
                disabled={isExporting}
                className="flex items-center gap-2 bg-white text-slate-700 border border-slate-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm"
            >
              {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Export Report
            </button>
        </div>

        {/* --- Main Table --- */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[900px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                        <th className="pl-3 pr-2 py-3 font-semibold text-slate-700 w-[25%]">Product Name</th>
                        <th className="px-1 py-3 font-semibold text-slate-700 text-center text-purple-600 bg-purple-50/50">Dispatched</th>
                        <th className="px-1 py-3 font-semibold text-slate-700 text-center text-green-600 bg-green-50/50">Delivered</th>
                        <th className="px-1 py-3 font-semibold text-slate-700 text-center text-red-600 bg-red-50/50">Returned</th>
                        <th className="px-1 py-3 font-semibold text-slate-700 text-center text-blue-600 bg-blue-50/50">In Transit</th>
                        <th className="px-1 py-3 font-semibold text-slate-700 text-right">Gross Profit</th>
                        <th className="px-2 py-3 font-semibold text-slate-700 text-right">Net Profit</th>
                        <th className="px-2 py-3 w-10"></th>
                    </tr>
                </thead>
                <tbody>
                    {groupedStats.length > 0 ? groupedStats.map((item) => (
                        <ProfitabilityRow 
                            key={item.id} 
                            item={item} 
                            expandedGroups={expandedGroups}
                            toggleGroup={toggleGroup}
                            onViewDetails={setSelectedProduct}
                        />
                    )) : (
                        <tr>
                            <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                                No active products found (with dispatched orders or marketing spend) in this date range.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>

        {/* --- STANDARD DETAIL MODAL (REVERTED) --- */}
        {selectedProduct && (() => {
            const totalDispatched = selectedProduct.units_sold + selectedProduct.units_returned + selectedProduct.units_in_transit;
            const isProfitable = selectedProduct.net_profit > 0;
            const profitMargin = selectedProduct.gross_revenue > 0 ? (selectedProduct.net_profit / selectedProduct.gross_revenue) * 100 : 0;
            const expenses = selectedProduct.cogs_total + selectedProduct.shipping_cost_allocation + selectedProduct.ad_spend_allocation + selectedProduct.overhead_allocation + selectedProduct.tax_allocation;
            
            // Format dates
            const startD = new Date(dateRange.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            const endD = new Date(dateRange.end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

            return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all border border-slate-200">
                        {/* Header */}
                        <div className="bg-slate-900 px-6 py-4 flex justify-between items-start">
                            <div>
                                <h3 className="text-lg font-bold text-white">{selectedProduct.title}</h3>
                                <p className="text-slate-400 text-xs mt-1 font-medium">{startD} — {endD}</p>
                            </div>
                            <button 
                                onClick={() => setSelectedProduct(null)} 
                                className="text-slate-400 hover:text-white transition-colors bg-slate-800 p-1.5 rounded-lg"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6">
                            {/* Top Stats Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                                <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                                    <div className="flex items-center gap-2 mb-1">
                                        <ShoppingBag size={16} className="text-purple-600" />
                                        <span className="text-xs font-bold text-purple-700 uppercase">Dispatched</span>
                                    </div>
                                    <p className="text-xl font-bold text-slate-900">{totalDispatched}</p>
                                </div>
                                <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Truck size={16} className="text-green-600" />
                                        <span className="text-xs font-bold text-green-700 uppercase">Delivered</span>
                                    </div>
                                    <p className="text-xl font-bold text-slate-900">{selectedProduct.units_sold}</p>
                                    <p className="text-xs text-green-600 font-medium">{formatPercent(selectedProduct.units_sold, totalDispatched)} Rate</p>
                                </div>
                                <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                                    <div className="flex items-center gap-2 mb-1">
                                        <AlertCircle size={16} className="text-red-600" />
                                        <span className="text-xs font-bold text-red-700 uppercase">Returned</span>
                                    </div>
                                    <p className="text-xl font-bold text-slate-900">{selectedProduct.units_returned}</p>
                                    <p className="text-xs text-red-600 font-medium">{formatPercent(selectedProduct.units_returned, totalDispatched)} Rate</p>
                                </div>
                                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Package size={16} className="text-blue-600" />
                                        <span className="text-xs font-bold text-blue-700 uppercase">In Transit</span>
                                    </div>
                                    <p className="text-xl font-bold text-slate-900">{selectedProduct.units_in_transit}</p>
                                </div>
                            </div>

                            {/* Financial Breakdown Section */}
                            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4 border-b border-slate-100 pb-2 flex justify-between items-center">
                                <span>Financial Breakdown</span>
                                <span className="text-xs normal-case text-slate-400 font-normal">Cash Basis (Realized)</span>
                            </h4>
                            
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between items-center py-1">
                                    <span className="font-medium text-slate-600 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Gross Revenue
                                    </span>
                                    <span className="font-bold text-emerald-700 text-base">+ {formatCurrency(selectedProduct.gross_revenue)}</span>
                                </div>
                                <div className="flex justify-between items-center py-1">
                                    <span className="font-medium text-slate-600 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-slate-400"></div> COGS (Dispatched)
                                    </span>
                                    <span className="font-medium text-red-600">- {formatCurrency(selectedProduct.cogs_total)}</span>
                                </div>
                                <div className="flex justify-between items-center py-1">
                                    <span className="font-medium text-slate-600 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-orange-400"></div> Shipping & Packaging
                                    </span>
                                    <span className="font-medium text-red-600">- {formatCurrency(selectedProduct.shipping_cost_allocation)}</span>
                                </div>
                                <div className="flex justify-between items-center py-1">
                                    <span className="font-medium text-slate-600 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-pink-500"></div> Ad Spend
                                    </span>
                                    <span className="font-medium text-red-600">- {formatCurrency(selectedProduct.ad_spend_allocation)}</span>
                                </div>
                                {(selectedProduct.overhead_allocation > 0 || selectedProduct.tax_allocation > 0) && (
                                    <div className="flex justify-between items-center py-1">
                                        <span className="font-medium text-slate-600 flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-gray-400"></div> Overhead & Tax
                                        </span>
                                        <span className="font-medium text-red-600">- {formatCurrency(selectedProduct.overhead_allocation + selectedProduct.tax_allocation)}</span>
                                    </div>
                                )}
                            </div>

                            {/* Profit Result */}
                            <div className={`mt-6 p-5 rounded-xl flex justify-between items-center border ${isProfitable ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                                <div>
                                    <p className={`text-xs font-bold uppercase tracking-wider ${isProfitable ? 'text-emerald-600' : 'text-red-600'}`}>
                                        Net Profit
                                    </p>
                                    <div className="flex items-baseline gap-2">
                                        <h3 className={`text-3xl font-extrabold ${isProfitable ? 'text-emerald-700' : 'text-red-700'}`}>
                                            {formatCurrency(selectedProduct.net_profit)}
                                        </h3>
                                        {isProfitable ? <TrendingUp size={20} className="text-emerald-600" /> : <TrendingDown size={20} className="text-red-600" />}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-bold text-slate-700">{profitMargin.toFixed(1)}%</p>
                                    <p className="text-xs text-slate-500 uppercase">Margin</p>
                                    {selectedProduct.cash_in_stock > 0 && (
                                        <p className="text-[10px] text-orange-600 mt-1 font-medium">+ {formatCurrency(selectedProduct.cash_in_stock)} Stuck in Stock</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        })()}
    </div>
  );
};

export default Profitability;
