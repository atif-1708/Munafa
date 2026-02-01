
import React, { useMemo, useState } from 'react';
import { Order, Product, AdSpend, ShopifyOrder } from '../types';
import { calculateProductPerformance, formatCurrency, ProductPerformance } from '../services/calculator';
import { Package, Eye, X, Banknote, ShoppingBag, CheckCircle2, RotateCcw, Clock, Layers, ChevronDown, ChevronRight, CornerDownRight, Folder, Calendar, Target, Download, Loader2, Coins, Receipt, ArrowRight, Tag, Factory, ShoppingCart, CheckSquare } from 'lucide-react';
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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
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

    const pCent = (val: number) => totalDispatched > 0 ? `(${val.toFixed(0)}%)` : '';

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
  //    AND FILTERING: Only show items with Dispatch > 0 OR Ads > 0
  const groupedStats = useMemo(() => {
      const groups = new Map<string, GroupedProductPerformance>();
      const singles: GroupedProductPerformance[] = [];

      rawStats.forEach(stat => {
          // Filter Condition: Must have been dispatched OR have marketing spend.
          const totalDispatched = stat.units_sold + stat.units_returned + stat.units_in_transit;
          if (totalDispatched === 0 && stat.ad_spend_allocation === 0) return;

          if (stat.group_id && stat.group_name) {
              if (!groups.has(stat.group_id)) {
                  // Initialize Group Parent
                  groups.set(stat.group_id, {
                      id: stat.group_id,
                      title: stat.group_name,
                      sku: 'GROUP', // Special marker
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
              
              // Add Child
              group.variants!.push(stat);

              // Sum Up Parent Stats
              group.units_sold += stat.units_sold;
              group.units_returned += stat.units_returned;
              group.units_in_transit += stat.units_in_transit;
              group.real_order_count += stat.real_order_count; // Sum Up Real Orders
              group.gross_revenue += stat.gross_revenue;
              group.cogs_total += stat.cogs_total;
              group.gross_profit += stat.gross_profit;
              group.cash_in_stock += stat.cash_in_stock;
              group.shipping_cost_allocation += stat.shipping_cost_allocation;
              group.overhead_allocation += stat.overhead_allocation;
              group.tax_allocation += stat.tax_allocation;
              group.ad_spend_allocation += stat.ad_spend_allocation;
              group.marketing_purchases += stat.marketing_purchases;
              
              // Sum Up Shopify Stats
              group.shopify_total_orders += stat.shopify_total_orders;
              group.shopify_confirmed_orders += stat.shopify_confirmed_orders;
              group.associatedShopifyOrders = [...group.associatedShopifyOrders, ...stat.associatedShopifyOrders];

              group.net_profit += stat.net_profit;
          } else {
              singles.push(stat);
          }
      });

      // Recalculate Group Rates
      const groupList = Array.from(groups.values()).map(g => {
          const closed = g.units_sold + g.units_returned;
          g.rto_rate = closed > 0 ? (g.units_returned / closed) * 100 : 0;
          return g;
      });

      // Combine and Sort by Profit
      return [...groupList, ...singles].sort((a,b) => b.net_profit - a.net_profit);

  }, [rawStats]);

  const toggleGroup = (id: string) => {
      const newSet = new Set(expandedGroups);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setExpandedGroups(newSet);
  };

  const handleExportPDF = (dataToExport = groupedStats, reportTitle = 'Product Profitability Report') => {
    setIsExporting(true);
    try {
        const doc = new jsPDF();
        
        // Brand Header (Green) - Same as Reconciliation
        doc.setTextColor(20, 83, 45); 
        doc.setFontSize(22);
        doc.text("MunafaBakhsh Karobaar", 14, 20);
        
        doc.setTextColor(100); 
        doc.setFontSize(10);
        doc.text("eCommerce Intelligence Platform", 14, 25);

        doc.setDrawColor(200);
        doc.line(14, 30, 196, 30);

        // Report Info
        doc.setTextColor(0);
        doc.setFontSize(14);
        doc.text(`${storeName} - ${reportTitle}`, 14, 40);
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Period: ${dateRange.start} to ${dateRange.end}`, 14, 46);
        
        const tableColumn = ["Product", "Dispatched", "Delivered", "Returned", "In Transit", "Gross Profit", "Net Profit"];
        
        const tableRows: any[] = [];
        
        dataToExport.forEach(item => {
             const totalDispatched = item.units_sold + item.units_returned + item.units_in_transit;
             const p = (val: number) => totalDispatched > 0 ? `(${((val/totalDispatched)*100).toFixed(0)}%)` : '';

            const productData = [
                item.title.substring(0, 30),
                totalDispatched,
                `${item.units_sold} ${p(item.units_sold)}`,
                `${item.units_returned} ${p(item.units_returned)}`,
                `${item.units_in_transit} ${p(item.units_in_transit)}`,
                formatCurrency(item.gross_profit),
                formatCurrency(item.net_profit)
            ];
            tableRows.push(productData);
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 55,
            theme: 'grid',
            headStyles: { fillColor: [22, 163, 74] }, // Brand Green
            styles: { fontSize: 8, cellPadding: 3 },
            columnStyles: {
                0: { cellWidth: 50 }, // Product Name
                1: { halign: 'center', cellWidth: 20 },
                2: { halign: 'center' },
                3: { halign: 'center', textColor: [220, 38, 38] }, // Red RTO
                4: { halign: 'center' },
                5: { halign: 'right' },
                6: { halign: 'right', fontStyle: 'bold' }
            }
        });

        doc.save(`${reportTitle.replace(/\s/g, '_')}.pdf`);
    } catch (e) {
        console.error("PDF Error", e);
        alert("Could not generate report");
    } finally {
        setIsExporting(false);
    }
  };

  // Helper for Detail View Stats
  const getDetailStats = (p: ProductPerformance) => {
      const totalUnits = p.units_sold + p.units_returned + p.units_in_transit;
      
      // Calculate Margin available for Ads
      const marginForAds = p.gross_revenue - p.cogs_total - p.shipping_cost_allocation - p.overhead_allocation - p.tax_allocation - p.cash_in_stock;
      
      // Real Sales for Breakeven Calculation (Denominator)
      const realSalesCount = p.shopify_confirmed_orders > 0 ? p.shopify_confirmed_orders : (p.real_order_count > 0 ? p.real_order_count : 1);
      
      // Breakeven CPA = Profit Margin / Real Sales (Target CPA)
      const breakevenCpr = marginForAds / realSalesCount;

      // Platform CPA = Ad Spend / Marketing Purchases (Pixel)
      // Use Pixel Purchases for CPA calculation as requested
      const marketingPurchases = p.marketing_purchases || 0;
      const actualCpr = marketingPurchases > 0 ? p.ad_spend_allocation / marketingPurchases : 0;
      
      const pCent = (part: number, total: number) => total > 0 ? `${Math.round((part/total)*100)}%` : '0%';

      // Avg Selling Price (Revenue / Sold Units)
      const avgSellingPrice = p.units_sold > 0 ? p.gross_revenue / p.units_sold : 0;
      
      // Avg Cost Price (Total Cost (Delivered + Stock) / Total Dispatched Units)
      const totalCostVal = p.cogs_total + p.cash_in_stock; 
      const avgCostPrice = totalUnits > 0 ? totalCostVal / totalUnits : 0;

      return { totalUnits, breakevenCpr, actualCpr, pCent, avgSellingPrice, avgCostPrice, realSalesCount, marketingPurchases };
  };

  const handleDetailExport = (product: GroupedProductPerformance) => {
    setIsExporting(true);
    try {
        const doc = new jsPDF();
        
        // Brand Header
        doc.setTextColor(20, 83, 45); 
        doc.setFontSize(18);
        doc.text("MunafaBakhsh Karobaar", 14, 15);
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text("Product Performance Report", 14, 20);

        doc.setDrawColor(200);
        doc.line(14, 25, 196, 25);

        // Product Title Header
        doc.setTextColor(0);
        doc.setFontSize(14);
        doc.text(`${storeName} - ${product.title}`, 14, 35);
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Period: ${dateRange.start} to ${dateRange.end} | SKU: ${product.sku}`, 14, 41);

        const { totalUnits, breakevenCpr, actualCpr, pCent, avgSellingPrice, avgCostPrice, realSalesCount, marketingPurchases } = getDetailStats(product);

        // 1. KPI Summary
        autoTable(doc, {
            startY: 50,
            head: [['Metric', 'Value', 'Note']],
            body: [
                ['Net Profit', formatCurrency(product.net_profit), `${product.gross_revenue > 0 ? ((product.net_profit / product.gross_revenue) * 100).toFixed(0) : 0}% Margin`],
                ['Gross Profit', formatCurrency(product.gross_profit), 'Before Cash Stuck'],
                ['Total Revenue', formatCurrency(product.gross_revenue), `${product.units_sold} Units Sold`],
                ['Avg Selling Price', formatDecimal(avgSellingPrice), 'Per Sold Unit'],
                ['Avg Cost Price', formatDecimal(avgCostPrice), 'Weighted Avg of Dispatched'],
                ['Return on Investment', `${product.cogs_total + product.shipping_cost_allocation + product.ad_spend_allocation > 0 ? ((product.net_profit / (product.cogs_total + product.shipping_cost_allocation + product.ad_spend_allocation)) * 100).toFixed(0) : 0}%`, 'Profit / Total Costs']
            ],
            theme: 'striped',
            headStyles: { fillColor: [22, 163, 74] },
            columnStyles: { 0: { fontStyle: 'bold' }, 1: { fontStyle: 'bold' } }
        });

        // 2. Order Funnel
        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 10,
            head: [['Order Status', 'Count', 'Percentage']],
            body: [
                ['Total Dispatched', totalUnits, '100%'],
                ['Delivered', product.units_sold, pCent(product.units_sold, totalUnits)],
                ['Returned', product.units_returned, pCent(product.units_returned, totalUnits)],
                ['In Transit', product.units_in_transit, pCent(product.units_in_transit, totalUnits)]
            ],
            theme: 'grid',
            headStyles: { fillColor: [30, 41, 59] }, // Slate 800
        });

        // 3. Marketing
        const getCpaStatus = () => {
             if (product.ad_spend_allocation > 0 && actualCpr === 0) return 'No Sales (Critical)';
             return actualCpr > breakevenCpr ? 'Over Budget' : 'Profitable';
        };

        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 10,
            head: [['Marketing Metric', 'Value', 'Status']],
            body: [
                ['Total Ad Spend', formatCurrency(product.ad_spend_allocation), 'Includes Ad Tax'],
                ['Pixel Purchases', marketingPurchases, `Source: Ad Platforms`],
                ['Platform CPA (Pixel)', formatDecimal(actualCpr), getCpaStatus()],
                ['Breakeven CPA', formatDecimal(breakevenCpr), 'Max Allowable (Based on Real Sales)']
            ],
            theme: 'grid',
            headStyles: { fillColor: [124, 58, 237] }, // Purple
        });

        // 4. Expense Breakdown
        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 10,
            head: [['Expense Category', 'Amount']],
            body: [
                ['COGS (Product Cost)', formatCurrency(product.cogs_total)],
                ['Shipping & Packaging', formatCurrency(product.shipping_cost_allocation)],
                ['Marketing Ads (Incl. Tax)', formatCurrency(product.ad_spend_allocation)],
                ['Fixed Overhead', formatCurrency(product.overhead_allocation)],
                ['Courier/Sales Tax', formatCurrency(product.tax_allocation)],
                ['Cash Stuck (Asset)', formatCurrency(product.cash_in_stock)]
            ],
            theme: 'plain',
            columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
            didParseCell: function(data) {
                if (data.row.index === 5) data.cell.styles.textColor = [79, 70, 229]; // Indigo for Cash Stuck
            }
        });

        doc.save(`${product.title.replace(/\s/g, '_')}_Detail_Report.pdf`);
    } catch (e) {
        console.error(e);
        alert("Error generating detail PDF");
    } finally {
        setIsExporting(false);
    }
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

        {/* --- Details Modal --- */}
        {selectedProduct && (() => {
            const { totalUnits, breakevenCpr, actualCpr, pCent, avgSellingPrice, avgCostPrice, realSalesCount, marketingPurchases } = getDetailStats(selectedProduct);
            return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900 leading-tight mb-1">{selectedProduct.title}</h3>
                                <p className="text-sm text-slate-500 font-mono">{selectedProduct.sku !== 'GROUP' ? selectedProduct.sku : 'Product Group'}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => handleDetailExport(selectedProduct as GroupedProductPerformance)}
                                    className="flex items-center gap-1.5 bg-white text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50"
                                >
                                    <Download size={14} /> Download PDF
                                </button>
                                <button onClick={() => setSelectedProduct(null)} className="text-slate-400 hover:text-slate-600">
                                    <X size={24} />
                                </button>
                            </div>
                        </div>
                        
                        <div className="p-6 overflow-y-auto space-y-6">
                            
                            {/* 1. KPI Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex flex-col justify-between">
                                    <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1">
                                        <Banknote size={14}/> Net Profit
                                    </p>
                                    <p className="text-2xl font-bold text-emerald-800 mt-2">{formatCurrency(selectedProduct.net_profit)}</p>
                                    <div className="text-xs font-medium text-emerald-600 mt-1">
                                        {selectedProduct.gross_revenue > 0 ? ((selectedProduct.net_profit / selectedProduct.gross_revenue) * 100).toFixed(0) : 0}% Margin
                                    </div>
                                </div>
                                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex flex-col justify-between">
                                    <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide flex items-center gap-1">
                                        <Coins size={14}/> Gross Profit
                                    </p>
                                    <p className="text-2xl font-bold text-indigo-800 mt-2">{formatCurrency(selectedProduct.gross_profit)}</p>
                                    <div className="text-xs font-medium text-indigo-600 mt-1">Before Cash Stuck</div>
                                </div>
                                <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 flex flex-col justify-between">
                                    <p className="text-xs font-bold text-purple-700 uppercase tracking-wide flex items-center gap-1">
                                        <Target size={14}/> Ad Spend
                                    </p>
                                    <p className="text-2xl font-bold text-purple-800 mt-2">{formatCurrency(selectedProduct.ad_spend_allocation)}</p>
                                    <div className="text-xs font-medium text-purple-600 mt-1">
                                        {marketingPurchases} Pixel Purchases
                                    </div>
                                </div>
                            </div>

                            {/* 1.5 Unit Economics */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-bold text-slate-500 uppercase">Avg Selling Price</p>
                                        <p className="text-xl font-bold text-slate-800 mt-1">{formatDecimal(avgSellingPrice)}</p>
                                    </div>
                                    <div className="bg-slate-100 p-2 rounded-lg text-slate-500">
                                        <Tag size={20} />
                                    </div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-bold text-slate-500 uppercase">Avg Cost Price</p>
                                        <p className="text-xl font-bold text-slate-800 mt-1">{formatDecimal(avgCostPrice)}</p>
                                    </div>
                                    <div className="bg-slate-100 p-2 rounded-lg text-slate-500">
                                        <Factory size={20} />
                                    </div>
                                </div>
                            </div>

                             {/* 1.6 Shopify Source of Truth */}
                             <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
                                    <p className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                                        <ShoppingCart size={14}/> Total Shopify Orders
                                    </p>
                                    <p className="text-2xl font-bold text-slate-800 mt-2">{selectedProduct.shopify_total_orders}</p>
                                    <div className="text-xs font-medium text-slate-500 mt-1">Raw Demand</div>
                                </div>
                                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex flex-col justify-between">
                                    <p className="text-xs font-bold text-blue-700 uppercase flex items-center gap-1">
                                        <CheckSquare size={14}/> Confirmed Orders
                                    </p>
                                    <p className="text-2xl font-bold text-blue-800 mt-2">{selectedProduct.shopify_confirmed_orders}</p>
                                    <div className="text-xs font-medium text-blue-600 mt-1">
                                         {selectedProduct.shopify_total_orders > 0 
                                            ? `${Math.round((selectedProduct.shopify_confirmed_orders / selectedProduct.shopify_total_orders) * 100)}% Fulfillment Rate` 
                                            : '0% Fulfillment Rate'}
                                    </div>
                                </div>
                            </div>

                            {/* 2. Order Funnel Section */}
                            <div>
                                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                                    <ShoppingBag size={18} className="text-slate-500"/> Order Status
                                </h4>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-center">
                                        <div className="text-xs text-slate-500 font-bold uppercase">Total</div>
                                        <div className="text-lg font-bold text-slate-800">{totalUnits}</div>
                                    </div>
                                    <div className="bg-green-50 p-3 rounded-lg border border-green-100 text-center">
                                        <div className="text-xs text-green-700 font-bold uppercase">Delivered</div>
                                        <div className="text-lg font-bold text-green-800">{selectedProduct.units_sold}</div>
                                        <div className="text-[10px] text-green-600">{pCent(selectedProduct.units_sold, totalUnits)}</div>
                                    </div>
                                    <div className="bg-red-50 p-3 rounded-lg border border-red-100 text-center">
                                        <div className="text-xs text-red-700 font-bold uppercase">Returned</div>
                                        <div className="text-lg font-bold text-red-800">{selectedProduct.units_returned}</div>
                                        <div className="text-[10px] text-red-600">{pCent(selectedProduct.units_returned, totalUnits)}</div>
                                    </div>
                                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-center">
                                        <div className="text-xs text-blue-700 font-bold uppercase">In Transit</div>
                                        <div className="text-lg font-bold text-blue-800">{selectedProduct.units_in_transit}</div>
                                        <div className="text-[10px] text-blue-600">{pCent(selectedProduct.units_in_transit, totalUnits)}</div>
                                    </div>
                                </div>
                            </div>

                            {/* 3. Marketing Efficiency (CPR Breakdown) */}
                            <div>
                                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                                    <Target size={18} className="text-slate-500"/> Marketing Efficiency
                                </h4>
                                <div className="flex gap-4">
                                    <div className="flex-1 border border-slate-200 rounded-lg p-3 flex justify-between items-center">
                                        <div>
                                            <p className="text-xs text-slate-500 font-medium">Platform CPA (Pixel)</p>
                                            <p className="text-xl font-bold text-slate-800">{formatDecimal(actualCpr)}</p>
                                        </div>
                                        <div className={`text-xs font-bold px-2 py-1 rounded ${actualCpr > breakevenCpr ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                            {selectedProduct.ad_spend_allocation > 0 && actualCpr === 0 ? 'No Sales (Critical)' : actualCpr > breakevenCpr ? 'Over Budget' : 'Profitable'}
                                        </div>
                                    </div>
                                    <div className="flex-1 border border-slate-200 rounded-lg p-3">
                                        <p className="text-xs text-slate-500 font-medium">Breakeven CPA (Target)</p>
                                        <p className="text-xl font-bold text-slate-600">{formatDecimal(breakevenCpr)}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 mt-3">
                                    <div className="bg-slate-50 rounded-lg p-2 flex justify-between px-3 items-center">
                                        <span className="text-xs text-slate-500 font-bold uppercase">Pixel Purchases</span>
                                        <span className="text-sm font-bold text-slate-800">{marketingPurchases} Events</span>
                                    </div>
                                    <div className="bg-slate-50 rounded-lg p-2 flex justify-between px-3 items-center">
                                        <span className="text-xs text-slate-500 font-bold uppercase">Real Sales</span>
                                        <span className="text-sm font-bold text-slate-800">{realSalesCount} Confirmed</span>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-400 mt-2">
                                    * <strong>Platform CPA</strong> uses Pixel Purchases. <strong>Breakeven CPA</strong> is based on Profit Margin divided by Real Confirmed Sales.
                                </p>
                            </div>

                            {/* 4. Expense Breakdown */}
                            <div className="border-t border-slate-100 pt-4">
                                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                                    <Receipt size={18} className="text-slate-500"/> Expense Breakdown
                                </h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                                        <span className="text-slate-600">Product Cost (COGS)</span>
                                        <span className="font-medium text-slate-900">- {formatCurrency(selectedProduct.cogs_total)}</span>
                                    </div>
                                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                                        <span className="text-slate-600">Shipping & Packaging</span>
                                        <span className="font-medium text-slate-900">- {formatCurrency(selectedProduct.shipping_cost_allocation)}</span>
                                    </div>
                                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                                        <span className="text-slate-600">Marketing Ads (Incl. Tax)</span>
                                        <span className="font-medium text-slate-900">- {formatCurrency(selectedProduct.ad_spend_allocation)}</span>
                                    </div>
                                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                                        <span className="text-slate-600">Fixed Overhead</span>
                                        <span className="font-medium text-slate-900">- {formatCurrency(selectedProduct.overhead_allocation)}</span>
                                    </div>
                                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                                        <span className="text-slate-600">Courier/Sales Tax</span>
                                        <span className="font-medium text-slate-900">- {formatCurrency(selectedProduct.tax_allocation)}</span>
                                    </div>
                                    
                                    <div className="mt-4 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                                        <div className="flex justify-between items-center text-indigo-700 font-bold">
                                            <span className="flex items-center gap-2"><Clock size={16}/> Cash Stuck (Inventory)</span>
                                            <span>{formatCurrency(selectedProduct.cash_in_stock)}</span>
                                        </div>
                                        <p className="text-[11px] text-indigo-600/70 mt-1 leading-snug">
                                            Cost of inventory in <strong>Returned</strong> or <strong>RTO Initiated</strong> state. This stock is considered temporarily unsellable.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* 5. Shopify Order Source List (NEW) */}
                            <div className="border-t border-slate-100 pt-4">
                                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                                    <ShoppingBag size={18} className="text-slate-500"/> Shopify Order Source
                                </h4>
                                <div className="overflow-x-auto rounded-lg border border-slate-200">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="px-3 py-2 font-semibold text-slate-600">Order</th>
                                                <th className="px-3 py-2 font-semibold text-slate-600">Date</th>
                                                <th className="px-3 py-2 font-semibold text-slate-600">Customer</th>
                                                <th className="px-3 py-2 font-semibold text-slate-600">Fulfillment</th>
                                                <th className="px-3 py-2 font-semibold text-slate-600">Payment</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {selectedProduct.associatedShopifyOrders.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="px-3 py-4 text-center text-slate-400 italic">
                                                        No mapped Shopify orders found.
                                                    </td>
                                                </tr>
                                            ) : selectedProduct.associatedShopifyOrders.map((o) => {
                                                const isFulfilled = o.fulfillment_status === 'fulfilled' || o.fulfillment_status === 'partial';
                                                return (
                                                    <tr key={o.id} className="hover:bg-slate-50">
                                                        <td className="px-3 py-2 font-medium text-indigo-600">{o.name}</td>
                                                        <td className="px-3 py-2 text-slate-600">{new Date(o.created_at).toLocaleDateString()}</td>
                                                        <td className="px-3 py-2 text-slate-800">
                                                            {o.customer ? `${o.customer.first_name} (${o.customer.city || '?'})` : 'Unknown'}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isFulfilled ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                                {o.fulfillment_status ? o.fulfillment_status.toUpperCase() : 'UNFULFILLED'}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${o.financial_status === 'paid' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                                                {o.financial_status.toUpperCase()}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
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
