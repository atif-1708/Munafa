
import React, { useMemo, useState } from 'react';
import { Order, Product, AdSpend } from '../types';
import { calculateProductPerformance, formatCurrency, ProductPerformance } from '../services/calculator';
import { Package, Eye, X, Banknote, ShoppingBag, CheckCircle2, RotateCcw, Clock, Layers, ChevronDown, ChevronRight, CornerDownRight, ArrowUpRight, TrendingUp, AlertCircle, Calendar, Target, Download, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ProfitabilityProps {
  orders: Order[];
  products: Product[];
  adSpend?: AdSpend[];
  adsTaxRate?: number;
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
    const deliveredRate = totalDispatched > 0 ? (item.units_sold / totalDispatched) * 100 : 0;
    
    // Background logic
    const bgClass = isChild ? 'bg-slate-50' : 'bg-white';
    const hoverClass = isChild ? 'hover:bg-slate-100' : 'hover:bg-gray-50';

    // Calculate CPR (Cost Per Result) based on Facebook Purchases
    const fbCpr = item.marketing_purchases > 0 ? item.ad_spend_allocation / item.marketing_purchases : 0;

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
                
                {/* 2. Delivered */}
                <td className="px-1 py-3 text-center tabular-nums">
                    <div className="font-medium text-slate-700">{item.units_sold}</div>
                    <div className={`text-[10px] ${deliveredRate < 70 ? 'text-orange-500' : 'text-green-600'}`}>
                        {deliveredRate.toFixed(0)}%
                    </div>
                </td>

                {/* 3. Returned */}
                <td className="px-1 py-3 text-center tabular-nums">
                    <div className={`${item.units_returned > 0 ? 'text-slate-700 font-medium' : 'text-slate-300'}`}>
                         {item.units_returned}
                    </div>
                </td>

                {/* 4. Revenue */}
                <td className="px-1 py-3 text-right font-medium text-slate-700 tabular-nums">
                    {formatCurrency(item.gross_revenue)}
                </td>

                {/* 5. Ads */}
                <td className="px-1 py-3 text-right text-purple-600 tabular-nums">
                    {item.ad_spend_allocation > 0 ? formatCurrency(item.ad_spend_allocation) : '-'}
                </td>

                {/* 6. Ad CPR (NEW - FB CPR Only, no count) */}
                <td className="px-1 py-3 text-right tabular-nums hidden sm:table-cell">
                    {fbCpr > 0 ? (
                         <span className="font-medium text-purple-700 text-xs">{formatCurrency(fbCpr)}</span>
                    ) : (
                         <span className="text-slate-300">-</span>
                    )}
                </td>

                {/* 7. Cash Stuck */}
                <td className="px-1 py-3 text-right tabular-nums hidden md:table-cell">
                    <span className={`${item.cash_in_stock > 0 ? 'text-indigo-600 font-medium' : 'text-slate-300'}`}>
                        {item.cash_in_stock > 0 ? formatCurrency(item.cash_in_stock) : '-'}
                    </span>
                </td>

                {/* 8. Net Profit */}
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

                 {/* 9. Actions */}
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


const Profitability: React.FC<ProfitabilityProps> = ({ orders, products, adSpend = [], adsTaxRate = 0 }) => {
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
      adSpend: adSpend.filter(a => {
        const d = new Date(a.date);
        return d >= start && d <= end;
      })
    };
  }, [orders, adSpend, dateRange]);

  // 2. Calculate Stats
  const rawStats = useMemo(() => 
      calculateProductPerformance(filteredData.orders, products, filteredData.adSpend, adsTaxRate), 
  [filteredData, products, adsTaxRate]);

  // 3. Group Logic (Aggregating Variants into Groups)
  const groupedStats = useMemo(() => {
      const groups = new Map<string, GroupedProductPerformance>();
      const singles: GroupedProductPerformance[] = [];

      rawStats.forEach(stat => {
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
                      gross_revenue: 0,
                      cogs_total: 0,
                      gross_profit: 0,
                      cash_in_stock: 0,
                      shipping_cost_allocation: 0,
                      overhead_allocation: 0,
                      tax_allocation: 0,
                      ad_spend_allocation: 0,
                      marketing_purchases: 0,
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
              group.gross_revenue += stat.gross_revenue;
              group.cogs_total += stat.cogs_total;
              group.gross_profit += stat.gross_profit;
              group.cash_in_stock += stat.cash_in_stock;
              group.shipping_cost_allocation += stat.shipping_cost_allocation;
              group.overhead_allocation += stat.overhead_allocation;
              group.tax_allocation += stat.tax_allocation;
              group.ad_spend_allocation += stat.ad_spend_allocation;
              group.marketing_purchases += stat.marketing_purchases;
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

  const handleExportPDF = () => {
    setIsExporting(true);
    try {
        const doc = new jsPDF();
        
        // Header
        doc.setFontSize(18);
        doc.text("Product Profitability Report", 14, 15);
        
        doc.setFontSize(10);
        doc.text(`Period: ${dateRange.start} to ${dateRange.end}`, 14, 22);
        
        const tableColumn = ["Product / Group", "Units Sold", "Revenue", "Ad Spend", "COGS", "Shipping", "Net Profit"];
        
        const tableRows: any[] = [];
        let totalRev = 0;
        let totalProfit = 0;
        let totalAds = 0;
        
        // Flatten data for report (Groups are shown as single lines if not expanded, but let's show all items for report clarity)
        // Better Strategy for Report: Just show individual items or flatten groups? 
        // Let's flatten everything for clarity in PDF.
        const flatData = rawStats.sort((a, b) => b.net_profit - a.net_profit);

        flatData.forEach(item => {
            const productData = [
                item.title.substring(0, 35) + (item.title.length > 35 ? '...' : ''),
                item.units_sold,
                formatCurrency(item.gross_revenue),
                formatCurrency(item.ad_spend_allocation),
                formatCurrency(item.cogs_total),
                formatCurrency(item.shipping_cost_allocation),
                formatCurrency(item.net_profit)
            ];
            tableRows.push(productData);
            
            totalRev += item.gross_revenue;
            totalProfit += item.net_profit;
            totalAds += item.ad_spend_allocation;
        });

        // Add Summary Row
        tableRows.push([
            'GRAND TOTAL',
            '',
            formatCurrency(totalRev),
            formatCurrency(totalAds),
            '',
            '',
            formatCurrency(totalProfit)
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 28,
            theme: 'striped',
            headStyles: { fillColor: [30, 41, 59] }, // Slate-800
            styles: { fontSize: 8, cellPadding: 3 },
            columnStyles: {
                0: { cellWidth: 50 }, // Product Name
                2: { halign: 'right' },
                3: { halign: 'right' },
                4: { halign: 'right' },
                5: { halign: 'right' },
                6: { halign: 'right', fontStyle: 'bold' }
            },
            didParseCell: function(data) {
                // Highlight last row (Total)
                if (data.row.index === tableRows.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [240, 253, 244]; // Green-50
                }
            }
        });

        doc.save(`Profitability_Report_${dateRange.start}.pdf`);
    } catch (e) {
        console.error("PDF Error", e);
        alert("Could not generate report");
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
                onClick={handleExportPDF}
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
                        <th className="px-1 py-3 font-semibold text-slate-700 text-center">Sold</th>
                        <th className="px-1 py-3 font-semibold text-slate-700 text-center">Ret</th>
                        <th className="px-1 py-3 font-semibold text-slate-700 text-right">Revenue</th>
                        <th className="px-1 py-3 font-semibold text-slate-700 text-right">Ad Spend</th>
                        <th className="px-1 py-3 font-semibold text-slate-700 text-right hidden sm:table-cell">FB CPA</th>
                        <th className="px-1 py-3 font-semibold text-slate-700 text-right hidden md:table-cell">Stock Stuck</th>
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
                                No sales data found for this period.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>

        {/* --- Details Modal --- */}
        {selectedProduct && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                        <div>
                            <h3 className="text-xl font-bold text-slate-900 leading-tight mb-1">{selectedProduct.title}</h3>
                            <p className="text-sm text-slate-500 font-mono">{selectedProduct.sku !== 'GROUP' ? selectedProduct.sku : 'Product Group'}</p>
                        </div>
                        <button onClick={() => setSelectedProduct(null)} className="text-slate-400 hover:text-slate-600">
                            <X size={24} />
                        </button>
                    </div>
                    
                    <div className="p-6 overflow-y-auto">
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                                <p className="text-xs font-bold text-green-700 uppercase">Net Profit</p>
                                <p className="text-2xl font-bold text-green-800 mt-1">{formatCurrency(selectedProduct.net_profit)}</p>
                            </div>
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                <p className="text-xs font-bold text-blue-700 uppercase">Revenue</p>
                                <p className="text-2xl font-bold text-blue-800 mt-1">{formatCurrency(selectedProduct.gross_revenue)}</p>
                            </div>
                        </div>

                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between py-2 border-b border-slate-50">
                                <span className="text-slate-600 flex items-center gap-2"><ShoppingBag size={14}/> Units Sold</span>
                                <span className="font-bold">{selectedProduct.units_sold}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-slate-50">
                                <span className="text-slate-600 flex items-center gap-2"><RotateCcw size={14}/> Returns (RTO)</span>
                                <span className="font-bold text-red-600">{selectedProduct.units_returned}</span>
                            </div>
                            
                            <div className="pt-4 pb-2 font-bold text-slate-800">Expense Breakdown</div>
                            
                            <div className="flex justify-between py-1">
                                <span className="text-slate-500">COGS (Product Cost)</span>
                                <span>- {formatCurrency(selectedProduct.cogs_total)}</span>
                            </div>
                            <div className="flex justify-between py-1">
                                <span className="text-slate-500">Shipping & Packaging</span>
                                <span>- {formatCurrency(selectedProduct.shipping_cost_allocation)}</span>
                            </div>
                            <div className="flex justify-between py-1">
                                <span className="text-slate-500">Marketing Ads</span>
                                <span>- {formatCurrency(selectedProduct.ad_spend_allocation)}</span>
                            </div>
                            <div className="flex justify-between py-1">
                                <span className="text-slate-500">Overhead & Ops</span>
                                <span>- {formatCurrency(selectedProduct.overhead_allocation)}</span>
                            </div>
                            <div className="flex justify-between py-1">
                                <span className="text-slate-500">Taxes</span>
                                <span>- {formatCurrency(selectedProduct.tax_allocation)}</span>
                            </div>
                            
                            <div className="mt-4 pt-3 border-t border-dashed border-slate-200">
                                <div className="flex justify-between py-1 text-indigo-600 font-medium">
                                    <span className="flex items-center gap-2"><Clock size={14}/> Cash Stuck (In Transit)</span>
                                    <span>{formatCurrency(selectedProduct.cash_in_stock)}</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1">
                                    This amount is essentially "Asset in Transit". It is not deducted from Profit, but it is not yet "Cash in Hand".
                                </p>
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
