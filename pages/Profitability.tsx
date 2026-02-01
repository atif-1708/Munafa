
import React, { useMemo, useState } from 'react';
import { Order, Product, AdSpend, ShopifyOrder } from '../types';
import { calculateProductPerformance, formatCurrency, ProductPerformance } from '../services/calculator';
import { Package, Eye, X, Layers, ChevronDown, ChevronRight, CornerDownRight, Calendar, Download, Loader2 } from 'lucide-react';
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

// New helper for 2 decimal places
const formatDecimal = (amount: number): string => {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0,
  }).format(amount);
};

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

  // Helper for Detail View Stats
  const getDetailStats = (p: ProductPerformance) => {
      // 1. Core Counts
      const totalDispatched = p.units_sold + p.units_returned + p.units_in_transit;
      
      // 2. Financials
      // Net Sales (Received Cash) = Gross Revenue (COD Collected) - Tax - Shipping - Overhead - Marketing
      // BUT for "Margin to spend on ads" (Break Even CPR), we usually calculate:
      // (Selling Price - COGS - Shipping - Overhead) = Contribution Margin
      
      const revenue = p.gross_revenue;
      const cogs = p.cogs_total;
      const shipping = p.shipping_cost_allocation;
      const overhead = p.overhead_allocation;
      const tax = p.tax_allocation;
      const marketing = p.ad_spend_allocation;
      
      // Total Investment = Money that left the bank to make these sales happen
      // COGS + Shipping + Overhead + Tax + Marketing
      const totalInvestment = cogs + shipping + overhead + tax + marketing;

      // 3. Logic for "Booked" vs "Pending"
      // Shopify Total = All imported orders
      // Confirmed = Fulfilled in Shopify (Likely sent to courier)
      // Pending = Unfulfilled in Shopify
      const confirmed = p.shopify_confirmed_orders; 
      
      // "Booked Order" in P&L typically means "Processed but not yet Dispatched/Picked up"
      // or "Ready to Ship". 
      // In this system: Confirmed (Shopify) - Dispatched (Courier) = Booked/Ready
      const bookedOrders = Math.max(0, confirmed - totalDispatched);

      // Average Selling Price (ASP) based on delivered units
      const avgSellingPrice = p.units_sold > 0 ? (revenue / p.units_sold) : 0;

      // Break Even CPR: How much profit per order before ads?
      // (Revenue - COGS - Shipping - Overhead) / Orders
      // We use delivered revenue projection for this
      const deliveredCount = p.units_sold || 1;
      const profitBeforeAds = revenue - cogs - shipping - overhead - tax;
      
      // Real CPR
      // Marketing Spend / Total Confirmed Orders (assuming ads drive confirmed orders)
      const realCpr = confirmed > 0 ? marketing / confirmed : 0;
      
      // Break Even CPR (Max allowable ad spend per order to break even)
      // Unit Economics: Selling Price - Unit COGS - Unit Ship - Unit Overhead
      const unitPrice = avgSellingPrice;
      const unitCogs = totalDispatched > 0 ? cogs / totalDispatched : 0;
      const unitShip = totalDispatched > 0 ? shipping / totalDispatched : 0;
      
      const breakEvenCpr = Math.max(0, unitPrice - unitCogs - unitShip - (overhead/deliveredCount));

      return { totalDispatched, breakEvenCpr, avgSellingPrice, totalInvestment, bookedOrders, revenue, cogs, shipping, overhead, tax, marketing };
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

        {/* --- CUSTOM SPREADSHEET DETAIL MODAL --- */}
        {selectedProduct && (() => {
            const { totalDispatched, breakEvenCpr, avgSellingPrice, totalInvestment, bookedOrders, revenue, cogs, shipping, overhead, tax, marketing } = getDetailStats(selectedProduct);
            
            // Format dates
            const startD = new Date(dateRange.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            const endD = new Date(dateRange.end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

            const pendingOrders = selectedProduct.shopify_total_orders - selectedProduct.shopify_confirmed_orders;
            const cancelOrders = selectedProduct.shopify_total_orders > 0 ? Math.max(0, selectedProduct.shopify_total_orders - selectedProduct.shopify_confirmed_orders - pendingOrders) : 0; 

            return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white shadow-2xl w-full max-w-lg overflow-hidden border border-slate-900 rounded-sm">
                        
                        {/* HEADER: RED */}
                        <div className="bg-[#cc0000] text-white p-3 text-center relative border-b border-red-800">
                            <h3 className="text-lg font-bold uppercase tracking-wide leading-tight px-6">{selectedProduct.title}</h3>
                            <button 
                                onClick={() => setSelectedProduct(null)} 
                                className="absolute top-3 right-3 text-white/80 hover:text-white"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        
                        {/* DATE ROW */}
                        <div className="bg-white py-1.5 text-center border-b border-slate-300">
                            <p className="text-sm font-bold text-slate-800">{startD} to {endD}</p>
                        </div>

                        {/* TABLE CONTENT */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                                <tbody>
                                    {/* SECTION 1: INVESTMENT & BREAKEVEN */}
                                    <tr className="bg-gray-200 border-b border-slate-300">
                                        <td className="py-1 px-3 font-bold text-slate-800 border-r border-slate-300">Cost Breakdown</td>
                                        <td className="py-1 px-3 font-bold text-slate-800 text-center border-r border-slate-300">Qty</td>
                                        <td className="py-1 px-3 font-bold text-slate-800 text-right border-r border-slate-300">Amount</td>
                                        <td className="py-1 px-3 font-bold text-slate-800 text-center">%</td>
                                    </tr>
                                    <tr className="bg-[#3b82f6] text-white border-b border-slate-300">
                                        <td className="py-1 px-3 font-bold border-r border-blue-400">Total Investment</td>
                                        <td className="py-1 px-3 text-center font-bold border-r border-blue-400">{totalDispatched}</td>
                                        <td className="py-1 px-3 text-right font-bold border-r border-blue-400">{formatDecimal(totalInvestment)}</td>
                                        <td className="py-1 px-3 text-center font-bold">100%</td>
                                    </tr>
                                    <tr className="bg-[#cc0000] text-white border-b border-slate-300">
                                        <td className="py-1 px-3 font-bold border-r border-red-800">Target Break Even CPR</td>
                                        <td className="py-1 px-3 text-center font-bold border-r border-red-800">-</td>
                                        <td className="py-1 px-3 text-right font-bold border-r border-red-800">{formatDecimal(breakEvenCpr)}</td>
                                        <td className="py-1 px-3 text-center"></td>
                                    </tr>

                                    {/* SPACER */}
                                    <tr className="h-2 bg-white"><td colSpan={4}></td></tr>

                                    {/* SECTION 2: ORDERS (GREEN) */}
                                    <tr className="bg-[#dcfce7] border-b border-green-200">
                                        <td className="py-1 px-3 font-medium text-slate-800 border-r border-green-200">Total Placed Orders</td>
                                        <td className="py-1 px-3 text-center font-bold text-slate-800 border-r border-green-200">{selectedProduct.shopify_total_orders}</td>
                                        <td className="py-1 px-3 text-right text-slate-800 border-r border-green-200"></td>
                                        <td className="py-1 px-3 text-center"></td>
                                    </tr>
                                    <tr className="bg-[#bbf7d0] border-b border-green-200">
                                        <td className="py-1 px-3 font-medium text-slate-800 border-r border-green-200">Confirmed & Processed</td>
                                        <td className="py-1 px-3 text-center font-bold text-slate-800 border-r border-green-200">{selectedProduct.shopify_confirmed_orders}</td>
                                        <td className="py-1 px-3 border-r border-green-200"></td>
                                        <td className="py-1 px-3 text-center font-bold bg-[#fcd34d] border border-orange-200">
                                            {formatPercent(selectedProduct.shopify_confirmed_orders, selectedProduct.shopify_total_orders)}
                                        </td>
                                    </tr>
                                    <tr className="bg-[#dcfce7] border-b border-green-200">
                                        <td className="py-1 px-3 font-medium text-slate-800 border-r border-green-200">Cancelled/Fake</td>
                                        <td className="py-1 px-3 text-center font-medium text-slate-800 border-r border-green-200">{cancelOrders}</td>
                                        <td className="py-1 px-3 border-r border-green-200"></td>
                                        <td className="py-1 px-3 text-center bg-[#fcd34d] font-bold border border-orange-200">
                                            {formatPercent(cancelOrders, selectedProduct.shopify_total_orders)}
                                        </td>
                                    </tr>
                                    
                                    {/* SECTION 3: LOGISTICS (ORANGE/YELLOW/RED) */}
                                    {/* Booked = Confirmed but not yet counted in Dispatch (or marked as booked status) */}
                                    <tr className="bg-[#f59e0b] text-white border-b border-orange-600">
                                        <td className="py-1 px-3 font-bold border-r border-orange-600">Ready to Ship (Booked)</td>
                                        <td className="py-1 px-3 text-center font-bold border-r border-orange-600">{bookedOrders}</td>
                                        <td className="py-1 px-3 text-right font-bold border-r border-orange-600">-</td>
                                        <td className="py-1 px-3 text-center font-bold bg-[#fbbf24] text-slate-900">
                                            {formatPercent(bookedOrders, selectedProduct.shopify_confirmed_orders)}
                                        </td>
                                    </tr>
                                    <tr className="bg-slate-200 border-b border-slate-300">
                                        <td className="py-1 px-3 font-bold text-slate-800 border-r border-slate-300">Dispatched Orders</td>
                                        <td className="py-1 px-3 text-center font-bold border-r border-slate-300">{totalDispatched}</td>
                                        <td className="py-1 px-3 text-right font-bold border-r border-slate-300">-</td>
                                        <td className="py-1 px-3"></td>
                                    </tr>
                                    <tr className="bg-slate-100 border-b border-slate-300">
                                        <td className="py-1 px-3 font-medium text-slate-800 border-r border-slate-300">Delivered Successfully</td>
                                        <td className="py-1 px-3 text-center font-bold border-r border-slate-300">{selectedProduct.units_sold}</td>
                                        <td className="py-1 px-3 text-right font-medium border-r border-slate-300">{formatDecimal(revenue)}</td>
                                        <td className="py-1 px-3 text-center font-bold bg-[#ffff00] border border-slate-300">
                                            {formatPercent(selectedProduct.units_sold, totalDispatched)}
                                        </td>
                                    </tr>
                                    <tr className="bg-slate-100 border-b border-slate-300">
                                        <td className="py-1 px-3 font-medium text-slate-800 border-r border-slate-300">In Transit</td>
                                        <td className="py-1 px-3 text-center font-bold bg-[#cc0000] text-white border-r border-slate-300">{selectedProduct.units_in_transit}</td>
                                        <td className="py-1 px-3 text-right font-medium border-r border-slate-300">
                                            {/* Estimated value stuck in transit */}
                                            {formatDecimal(selectedProduct.units_in_transit * (revenue / (selectedProduct.units_sold || 1)))}
                                        </td>
                                        <td className="py-1 px-3 text-center bg-slate-200 font-medium">
                                            {formatPercent(selectedProduct.units_in_transit, totalDispatched)}
                                        </td>
                                    </tr>
                                    <tr className="bg-slate-100 border-b border-slate-300">
                                        <td className="py-1 px-3 font-medium text-slate-800 border-r border-slate-300">Returned (RTO)</td>
                                        <td className="py-1 px-3 text-center font-bold bg-[#cc0000] text-white border-r border-slate-300">{selectedProduct.units_returned}</td>
                                        <td className="py-1 px-3 text-right font-medium border-r border-slate-300">-</td>
                                        <td className="py-1 px-3 text-center font-bold bg-[#ffff00] border border-slate-300">
                                            {formatPercent(selectedProduct.units_returned, totalDispatched)}
                                        </td>
                                    </tr>

                                    {/* SECTION 4: EXPENSES (PURPLE) */}
                                    <tr className="bg-white border-b border-slate-300">
                                        <td className="py-1 px-3 font-bold text-slate-900 border-r border-slate-300">Expense Breakdown</td>
                                        <td colSpan={3} className="py-1 px-3 font-bold"></td>
                                    </tr>
                                    <tr className="bg-[#e9d5ff] border-b border-purple-200">
                                        <td className="py-1 px-3 text-slate-800 border-r border-purple-200">COGS (Dispatched Units)</td>
                                        <td className="py-1 px-3 text-center border-r border-purple-200">{totalDispatched}</td>
                                        <td className="py-1 px-3 text-right font-medium border-r border-purple-200">{formatDecimal(cogs)}</td>
                                        <td className="py-1 px-3"></td>
                                    </tr>
                                    <tr className="bg-[#e9d5ff] border-b border-purple-200">
                                        <td className="py-1 px-3 text-slate-800 border-r border-purple-200">Shipping (Fwd + RTO)</td>
                                        <td className="py-1 px-3 text-center border-r border-purple-200"></td>
                                        <td className="py-1 px-3 text-right font-medium border-r border-purple-200">{formatDecimal(shipping)}</td>
                                        <td className="py-1 px-3 bg-[#cc0000] text-white text-[10px] text-center font-bold">Paid</td>
                                    </tr>
                                    <tr className="bg-[#e9d5ff] border-b border-purple-200">
                                        <td className="py-1 px-3 text-slate-800 border-r border-purple-200">Marketing & Ads</td>
                                        <td className="py-1 px-3 text-center border-r border-purple-200"></td>
                                        <td className="py-1 px-3 text-right font-medium border-r border-purple-200">{formatDecimal(marketing)}</td>
                                        <td className="py-1 px-3"></td>
                                    </tr>
                                    <tr className="bg-[#e9d5ff] border-b border-purple-200">
                                        <td className="py-1 px-3 text-slate-800 border-r border-purple-200">Overhead & Tax</td>
                                        <td className="py-1 px-3 text-center border-r border-purple-200"></td>
                                        <td className="py-1 px-3 text-right font-medium border-r border-purple-200">{formatDecimal(overhead + tax)}</td>
                                        <td className="py-1 px-3"></td>
                                    </tr>
                                    <tr className="bg-[#d8b4fe] border-b border-purple-300 font-bold">
                                        <td className="py-1 px-3 text-slate-900 border-r border-purple-300">Total Expense</td>
                                        <td className="py-1 px-3 text-center border-r border-purple-300"></td>
                                        <td className="py-1 px-3 text-right border-r border-purple-300">{formatDecimal(cogs + shipping + marketing + overhead + tax)}</td>
                                        <td className="py-1 px-3 bg-[#cc0000]"></td>
                                    </tr>

                                    {/* SPACER */}
                                    <tr className="h-2 bg-white"><td colSpan={4}></td></tr>

                                    {/* SECTION 5: PROFIT (BOTTOM) */}
                                    <tr className="bg-[#bbf7d0] border-b border-green-200">
                                        <td className="py-1 px-3 font-bold text-slate-900 border-r border-green-300">Gross Profit (Pre-Ad)</td>
                                        <td className="py-1 px-3 text-center font-bold border-r border-green-300">{selectedProduct.units_sold}</td>
                                        <td className="py-1 px-3 text-right font-bold border-r border-green-300">{formatDecimal(selectedProduct.gross_profit + marketing)}</td>
                                        <td className="py-1 px-3"></td>
                                    </tr>
                                    <tr className="bg-[#fef3c7] border-b border-orange-100">
                                        <td className="py-1 px-3 font-bold text-slate-900 border-r border-orange-200">Cash Stuck (RTO Stock)</td>
                                        <td className="py-1 px-3 text-center font-bold border-r border-orange-200">{selectedProduct.units_returned}</td>
                                        <td className="py-1 px-3 text-right font-bold border-r border-orange-200">{formatDecimal(selectedProduct.cash_in_stock)}</td>
                                        <td className="py-1 px-3"></td>
                                    </tr>
                                    <tr className="bg-[#86efac] border-t-2 border-green-500">
                                        <td className="py-2 px-3 font-extrabold text-slate-900 border-r border-green-400">Net Profit (Cash Hand)</td>
                                        <td className="py-2 px-3 text-center font-bold border-r border-green-400"></td>
                                        <td className="py-2 px-3 text-right font-extrabold text-slate-900 border-r border-green-400">{formatDecimal(selectedProduct.net_profit)}</td>
                                        <td className="py-2 px-3 text-center font-bold text-green-900">
                                            {totalInvestment > 0 ? ((selectedProduct.net_profit / totalInvestment) * 100).toFixed(0) : 0}% ROI
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            );
        })()}
    </div>
  );
};

export default Profitability;
