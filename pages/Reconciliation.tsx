
import React, { useMemo, useState } from 'react';
import { Order, ShopifyOrder, Product, OrderStatus, AdSpend } from '../types';
import { calculateProductPerformance, formatCurrency, ProductPerformance } from '../services/calculator';
import { Search, Download, Package, ArrowRight, Calendar, Link, CheckCircle2, X, Eye, Banknote, Target, Tag, Factory, ShoppingCart, CheckSquare, ShoppingBag, Receipt, Clock, Coins } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ReconciliationProps {
  shopifyOrders: ShopifyOrder[];
  courierOrders: Order[];
  products: Product[];
  storeName?: string;
  onMapProduct?: (shopifyTitle: string, systemProductId: string) => void;
  // New props for detailed calculation
  adSpend?: AdSpend[];
  adsTaxRate?: number;
}

interface ProductStat {
  id: string; // This might be shopify variant ID or generic
  title: string;
  sku: string;
  total_ordered: number;
  pending_fulfillment: number;
  fulfilled: number;
  cancelled: number;
  dispatched: number;
  delivered: number;
  rto: number;
  
  // Mapping info
  mappedToSystemId?: string;
  mappedToSystemTitle?: string;
}

const formatDecimal = (amount: number): string => {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const Reconciliation: React.FC<ReconciliationProps> = ({ shopifyOrders, courierOrders, products, storeName = 'My Store', onMapProduct, adSpend = [], adsTaxRate = 0 }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Mapping Modal State
  const [mappingModal, setMappingModal] = useState<{ isOpen: boolean, shopifyTitle: string } | null>(null);
  const [selectedSystemProduct, setSelectedSystemProduct] = useState('');

  // Details Modal State
  const [selectedItemStats, setSelectedItemStats] = useState<ProductPerformance | null>(null);

  // Default to Last 60 Days
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 60);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  });

  // 1. Build Product Statistics
  const productStats = useMemo(() => {
    const stats = new Map<string, ProductStat>();
    
    // Create a lookup map for Courier Orders (by Shopify Order Number)
    const courierMap = new Map<string, Order>();
    courierOrders.forEach(co => {
        const key = co.shopify_order_number.replace('#', '').trim();
        courierMap.set(key, co);
    });

    const start = new Date(dateRange.start);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateRange.end);
    end.setHours(23, 59, 59, 999);

    const uniqueOrders = new Map<number, ShopifyOrder>();
    shopifyOrders.forEach(order => {
        const orderDate = new Date(order.created_at);
        if (orderDate >= start && orderDate <= end) {
            if (!uniqueOrders.has(order.id)) {
                uniqueOrders.set(order.id, order);
            }
        }
    });

    uniqueOrders.forEach(order => {
        const orderKey = order.name.replace('#', '').trim();
        const courierOrder = courierMap.get(orderKey);

        const isCancelled = order.cancel_reason !== null;
        const isFulfilled = order.fulfillment_status === 'fulfilled'; 
        const isPending = !isCancelled && !isFulfilled;

        let isDispatched = false;
        let isDelivered = false;
        let isRto = false;

        if (courierOrder) {
            if (courierOrder.status !== OrderStatus.PENDING && 
                courierOrder.status !== OrderStatus.BOOKED && 
                courierOrder.status !== OrderStatus.CANCELLED) {
                isDispatched = true;
            }
            if (courierOrder.status === OrderStatus.DELIVERED) isDelivered = true;
            if (courierOrder.status === OrderStatus.RETURNED || courierOrder.status === OrderStatus.RTO_INITIATED) isRto = true;
        }

        if (order.line_items.length > 0) {
            const item = order.line_items[0];
            const key = item.title; 

            if (!stats.has(key)) {
                // Determine if mapped
                // Check if this title exists in any product's aliases or is a title match
                const matchedProduct = products.find(p => 
                    (p.aliases && p.aliases.includes(item.title)) || p.title === item.title
                );

                stats.set(key, {
                    id: String(item.variant_id),
                    title: item.title,
                    sku: 'VARIOUS',
                    total_ordered: 0,
                    pending_fulfillment: 0,
                    fulfilled: 0,
                    cancelled: 0,
                    dispatched: 0,
                    delivered: 0,
                    rto: 0,
                    mappedToSystemId: matchedProduct?.id,
                    mappedToSystemTitle: matchedProduct?.title
                });
            }

            const stat = stats.get(key)!;
            stat.total_ordered += 1;

            if (isCancelled) {
                stat.cancelled += 1;
            } else {
                if (isPending) stat.pending_fulfillment += 1;
                if (isFulfilled) stat.fulfilled += 1;
                if (isDispatched) stat.dispatched += 1;
                if (isDelivered) stat.delivered += 1;
                if (isRto) stat.rto += 1;
            }
        }
    });

    return Array.from(stats.values()).sort((a,b) => b.total_ordered - a.total_ordered);
  }, [shopifyOrders, courierOrders, dateRange, products]);

  const filteredStats = useMemo(() => {
      return productStats.filter(p => 
          p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
          p.sku.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [productStats, searchTerm]);

  const handleExport = () => {
    const doc = new jsPDF();
    doc.setTextColor(20, 83, 45);
    doc.setFontSize(22);
    doc.text("MunafaBakhsh Karobaar", 14, 20);
    
    doc.setTextColor(100);
    doc.setFontSize(10);
    doc.text("eCommerce Intelligence Platform", 14, 25);
    doc.setDrawColor(200);
    doc.line(14, 30, 196, 30);
    doc.setTextColor(0);
    doc.setFontSize(14);
    doc.text(`${storeName} - Product Performance Report`, 14, 40);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Period: ${dateRange.start} to ${dateRange.end}`, 14, 46);
    
    const rows = filteredStats.map(r => {
        const total = r.total_ordered;
        const disp = r.dispatched;
        const p = (val: number, base: number) => base > 0 ? `(${Math.round((val/base)*100)}%)` : '';
        return [
            r.title,
            r.total_ordered,
            `${r.pending_fulfillment} ${p(r.pending_fulfillment, total)}`,
            `${r.fulfilled} ${p(r.fulfilled, total)}`,
            `${r.dispatched} ${p(r.dispatched, total)}`,
            `${r.delivered} ${p(r.delivered, disp)}`, 
            `${r.rto} ${p(r.rto, disp)}` 
        ];
    });

    autoTable(doc, {
        head: [['Product', 'Total Orders', 'Pending', 'Fulfilled', 'Dispatched', 'Delivered', 'RTO']],
        body: rows,
        startY: 55,
        theme: 'grid',
        headStyles: { fillColor: [22, 163, 74] },
        styles: { fontSize: 8, cellPadding: 3 },
    });
    doc.save('Reconciliation_Report.pdf');
  };

  const openMapping = (shopifyTitle: string) => {
      setMappingModal({ isOpen: true, shopifyTitle });
      setSelectedSystemProduct('');
  };

  const saveMapping = () => {
      if(mappingModal && selectedSystemProduct && onMapProduct) {
          onMapProduct(mappingModal.shopifyTitle, selectedSystemProduct);
          setMappingModal(null);
          setSelectedSystemProduct('');
      }
  };

  const handleViewDetails = (shopifyTitle: string, mappedSystemId?: string) => {
    // 1. Determine Product Definition to use for calculation
    let targetProduct: Product;

    if (mappedSystemId) {
        // If mapped, use the REAL system product. 
        // calculateProductPerformance will aggregate EVERYTHING linked to this product (aliases, etc)
        const found = products.find(p => p.id === mappedSystemId);
        if (found) targetProduct = found;
        else targetProduct = { id: 'temp', title: shopifyTitle, sku: 'UNMAPPED', shopify_id: '', image_url: '', cost_history: [], current_cogs: 0, aliases: [shopifyTitle] };
    } else {
        // If unmapped, create a DUMMY product with the Shopify Title as an Alias.
        // This forces calculateProductPerformance to fuzzy match courier orders to this title.
        targetProduct = {
            id: 'temp-' + Math.random(), // Random ID to prevent collision
            title: shopifyTitle,
            sku: 'UNMAPPED',
            shopify_id: '',
            image_url: '',
            cost_history: [],
            current_cogs: 0,
            aliases: [shopifyTitle] // CRITICAL: This allows the calculator to find it.
        };
    }

    // 2. Filter data for calculator
    // We pass ALL courier orders, but a SINGLE product array. 
    // This tells the calculator: "Only look for this product in the orders".
    const stats = calculateProductPerformance(
        courierOrders, 
        [targetProduct], 
        adSpend, // Pass global ad spend to allow mapping lookup if needed
        adsTaxRate, 
        shopifyOrders
    );
    
    if (stats.length > 0) {
        setSelectedItemStats(stats[0]);
    } else {
        // Should not happen, but fallback
        alert("No data found for this item context.");
    }
  };

  // Helper for Modal Logic (Duplicated from Profitability to ensure self-contained component)
  const getDetailStats = (p: ProductPerformance) => {
      const totalUnits = p.units_sold + p.units_returned + p.units_in_transit;
      const marginForAds = p.gross_revenue - p.cogs_total - p.shipping_cost_allocation - p.overhead_allocation - p.tax_allocation - p.cash_in_stock;
      const realSalesCount = p.shopify_confirmed_orders > 0 ? p.shopify_confirmed_orders : (p.real_order_count > 0 ? p.real_order_count : 1);
      const breakevenCpr = marginForAds / realSalesCount;
      const marketingPurchases = p.marketing_purchases || 0;
      const actualCpr = marketingPurchases > 0 ? p.ad_spend_allocation / marketingPurchases : 0;
      const pCent = (part: number, total: number) => total > 0 ? `${Math.round((part/total)*100)}%` : '0%';
      const avgSellingPrice = p.units_sold > 0 ? p.gross_revenue / p.units_sold : 0;
      const totalCostVal = p.cogs_total + p.cash_in_stock; 
      const avgCostPrice = totalUnits > 0 ? totalCostVal / totalUnits : 0;

      return { totalUnits, breakevenCpr, actualCpr, pCent, avgSellingPrice, avgCostPrice, realSalesCount, marketingPurchases };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h2 className="text-2xl font-bold text-slate-900">Shopify Product Stats</h2>
           <p className="text-slate-500 text-sm">Inventory flow analysis (Main Item Only, Order Counts).</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
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

            <div className="relative">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Search Product..." 
                    className="pl-10 pr-4 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 w-full sm:w-64"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <button onClick={handleExport} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 whitespace-nowrap">
                <Download size={16} /> Export PDF
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase text-xs font-bold tracking-wider">
                <tr>
                    <th className="px-6 py-4 w-[25%]">Product (First Item)</th>
                    <th className="px-4 py-4 w-[20%]">Linked Product</th>
                    <th className="px-4 py-4 text-center text-slate-500">Total</th>
                    <th className="px-4 py-4 text-center text-orange-600 bg-orange-50/50">Pending</th>
                    <th className="px-4 py-4 text-center text-blue-600 bg-blue-50/50">Fulfilled</th>
                    <th className="px-1 py-4 w-6"></th> 
                    <th className="px-4 py-4 text-center text-purple-600 bg-purple-50/50">Dispatched</th>
                    <th className="px-4 py-4 text-center text-green-600 bg-green-50/50">Delivered</th>
                    <th className="px-4 py-4 text-center text-red-600 bg-red-50/50">RTO</th>
                    <th className="px-4 py-4 text-center">Action</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {filteredStats.length === 0 ? (
                    <tr><td colSpan={10} className="px-6 py-12 text-center text-slate-400">No products found in this date range.</td></tr>
                ) : filteredStats.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                                    <Package size={18} />
                                </div>
                                <div className="min-w-0">
                                    <div className="font-medium text-slate-900 truncate max-w-[200px]" title={item.title}>{item.title}</div>
                                </div>
                            </div>
                        </td>

                        {/* Mapped Product Column */}
                        <td className="px-4 py-4">
                            {item.mappedToSystemTitle ? (
                                <div className="flex items-center justify-between group">
                                    <div className="flex items-center gap-1.5 text-green-700">
                                        <CheckCircle2 size={14} className="shrink-0" />
                                        <span className="truncate max-w-[120px] text-xs font-bold" title={item.mappedToSystemTitle}>
                                            {item.mappedToSystemTitle}
                                        </span>
                                    </div>
                                    <button 
                                        onClick={() => openMapping(item.title)}
                                        className="text-slate-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Edit Link"
                                    >
                                        <Link size={14} />
                                    </button>
                                </div>
                            ) : (
                                <button 
                                    onClick={() => openMapping(item.title)}
                                    className="flex items-center gap-1.5 text-slate-400 hover:text-indigo-600 transition-colors text-xs font-medium border border-dashed border-slate-300 rounded px-2 py-1 hover:border-indigo-300 hover:bg-indigo-50"
                                >
                                    <Link size={12} /> Link to Inventory
                                </button>
                            )}
                        </td>

                        <td className="px-4 py-4 text-center font-bold text-slate-800">
                            {item.total_ordered}
                        </td>
                        <td className="px-4 py-4 text-center bg-orange-50/30">
                            <span className={`font-medium ${item.pending_fulfillment > 0 ? 'text-orange-600' : 'text-slate-300'}`}>
                                {item.pending_fulfillment}
                            </span>
                        </td>
                        <td className="px-4 py-4 text-center bg-blue-50/30">
                            <span className={`font-medium ${item.fulfilled > 0 ? 'text-blue-600' : 'text-slate-300'}`}>
                                {item.fulfilled}
                            </span>
                        </td>

                        <td className="px-1 py-4 text-center text-slate-300">
                            <ArrowRight size={14} />
                        </td>

                         <td className="px-4 py-4 text-center bg-purple-50/30">
                            <span className={`font-medium ${item.dispatched > 0 ? 'text-purple-600' : 'text-slate-300'}`}>
                                {item.dispatched}
                            </span>
                        </td>
                         <td className="px-4 py-4 text-center bg-green-50/30">
                            <span className={`font-bold ${item.delivered > 0 ? 'text-green-600' : 'text-slate-300'}`}>
                                {item.delivered}
                            </span>
                        </td>
                         <td className="px-4 py-4 text-center bg-red-50/30">
                             <span className={`font-bold ${item.rto > 0 ? 'text-red-600' : 'text-slate-300'}`}>
                                {item.rto}
                            </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                            <button 
                                onClick={() => handleViewDetails(item.title, item.mappedToSystemId)}
                                className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-indigo-600 transition-colors"
                                title="View Profitability Analysis"
                            >
                                <Eye size={18} />
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      {/* Mapping Modal */}
      {mappingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                  <div className="flex justify-between items-start mb-4">
                      <h3 className="text-lg font-bold text-slate-900">Map Product</h3>
                      <button onClick={() => setMappingModal(null)} className="text-slate-400 hover:text-slate-600">
                          <X size={20} />
                      </button>
                  </div>
                  
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-6">
                      <p className="text-xs text-slate-500 uppercase font-bold mb-1">Shopify Item Title</p>
                      <p className="font-medium text-slate-900">{mappingModal.shopifyTitle}</p>
                  </div>

                  <div className="mb-6">
                      <label className="block text-sm font-medium text-slate-700 mb-2">Link to System Product</label>
                      <select 
                          className="w-full px-4 py-2.5 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                          value={selectedSystemProduct}
                          onChange={(e) => setSelectedSystemProduct(e.target.value)}
                      >
                          <option value="">-- Select Master Product --</option>
                          {products.map(p => (
                              <option key={p.id} value={p.id}>
                                  {p.title} {p.sku ? `(${p.sku})` : ''}
                              </option>
                          ))}
                      </select>
                      <p className="text-xs text-slate-400 mt-2">
                          All orders for "{mappingModal.shopifyTitle}" will be calculated under the selected product in Profitability reports.
                      </p>
                  </div>

                  <div className="flex gap-3">
                      <button 
                        onClick={() => setMappingModal(null)}
                        className="flex-1 py-2.5 bg-white border border-slate-300 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50"
                      >
                          Cancel
                      </button>
                      <button 
                        onClick={saveMapping}
                        disabled={!selectedSystemProduct}
                        className="flex-1 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 disabled:opacity-50"
                      >
                          Save Mapping
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* View Detail Modal */}
      {selectedItemStats && (() => {
            const { totalUnits, breakevenCpr, actualCpr, pCent, avgSellingPrice, avgCostPrice, realSalesCount, marketingPurchases } = getDetailStats(selectedItemStats);
            const isUnmapped = selectedItemStats.sku === 'UNMAPPED' || selectedItemStats.cogs_total === 0;

            return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900 leading-tight mb-1">{selectedItemStats.title}</h3>
                                <p className="text-sm text-slate-500 font-mono flex items-center gap-2">
                                    {selectedItemStats.sku !== 'UNMAPPED' ? selectedItemStats.sku : <span className="text-orange-600 bg-orange-100 px-1.5 rounded text-xs font-bold">UNMAPPED ITEM</span>}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setSelectedItemStats(null)} className="text-slate-400 hover:text-slate-600">
                                    <X size={24} />
                                </button>
                            </div>
                        </div>
                        
                        <div className="p-6 overflow-y-auto space-y-6">
                            
                            {isUnmapped && (
                                <div className="p-4 bg-yellow-50 text-yellow-800 rounded-xl border border-yellow-200 text-sm flex items-start gap-2">
                                    <Target size={18} className="shrink-0 mt-0.5" />
                                    <div>
                                        <strong>Cost Data Missing:</strong> This item is not linked to an inventory product with a cost (COGS). 
                                        Profit margins shown below are likely artificially high (100%).
                                        <br/>
                                        <button 
                                            onClick={() => { setSelectedItemStats(null); openMapping(selectedItemStats.title); }}
                                            className="underline font-bold mt-1"
                                        >
                                            Link to Inventory now to fix calculation
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* 1. KPI Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex flex-col justify-between">
                                    <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1">
                                        <Banknote size={14}/> Net Profit
                                    </p>
                                    <p className="text-2xl font-bold text-emerald-800 mt-2">{formatCurrency(selectedItemStats.net_profit)}</p>
                                    <div className="text-xs font-medium text-emerald-600 mt-1">
                                        {selectedItemStats.gross_revenue > 0 ? ((selectedItemStats.net_profit / selectedItemStats.gross_revenue) * 100).toFixed(0) : 0}% Margin
                                    </div>
                                </div>
                                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex flex-col justify-between">
                                    <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide flex items-center gap-1">
                                        <Coins size={14}/> Gross Profit
                                    </p>
                                    <p className="text-2xl font-bold text-indigo-800 mt-2">{formatCurrency(selectedItemStats.gross_profit)}</p>
                                    <div className="text-xs font-medium text-indigo-600 mt-1">Before Cash Stuck</div>
                                </div>
                                <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 flex flex-col justify-between">
                                    <p className="text-xs font-bold text-purple-700 uppercase tracking-wide flex items-center gap-1">
                                        <Target size={14}/> Ad Spend
                                    </p>
                                    <p className="text-2xl font-bold text-purple-800 mt-2">{formatCurrency(selectedItemStats.ad_spend_allocation)}</p>
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
                                    <p className="text-2xl font-bold text-slate-800 mt-2">{selectedItemStats.shopify_total_orders}</p>
                                    <div className="text-xs font-medium text-slate-500 mt-1">Raw Demand</div>
                                </div>
                                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex flex-col justify-between">
                                    <p className="text-xs font-bold text-blue-700 uppercase flex items-center gap-1">
                                        <CheckSquare size={14}/> Confirmed Orders
                                    </p>
                                    <p className="text-2xl font-bold text-blue-800 mt-2">{selectedItemStats.shopify_confirmed_orders}</p>
                                    <div className="text-xs font-medium text-blue-600 mt-1">
                                         {selectedItemStats.shopify_total_orders > 0 
                                            ? `${Math.round((selectedItemStats.shopify_confirmed_orders / selectedItemStats.shopify_total_orders) * 100)}% Fulfillment Rate` 
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
                                        <div className="text-lg font-bold text-green-800">{selectedItemStats.units_sold}</div>
                                        <div className="text-[10px] text-green-600">{pCent(selectedItemStats.units_sold, totalUnits)}</div>
                                    </div>
                                    <div className="bg-red-50 p-3 rounded-lg border border-red-100 text-center">
                                        <div className="text-xs text-red-700 font-bold uppercase">Returned</div>
                                        <div className="text-lg font-bold text-red-800">{selectedItemStats.units_returned}</div>
                                        <div className="text-[10px] text-red-600">{pCent(selectedItemStats.units_returned, totalUnits)}</div>
                                    </div>
                                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-center">
                                        <div className="text-xs text-blue-700 font-bold uppercase">In Transit</div>
                                        <div className="text-lg font-bold text-blue-800">{selectedItemStats.units_in_transit}</div>
                                        <div className="text-[10px] text-blue-600">{pCent(selectedItemStats.units_in_transit, totalUnits)}</div>
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
                                            {selectedItemStats.ad_spend_allocation > 0 && actualCpr === 0 ? 'No Sales (Critical)' : actualCpr > breakevenCpr ? 'Over Budget' : 'Profitable'}
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
                                        <span className="font-medium text-slate-900">- {formatCurrency(selectedItemStats.cogs_total)}</span>
                                    </div>
                                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                                        <span className="text-slate-600">Shipping & Packaging</span>
                                        <span className="font-medium text-slate-900">- {formatCurrency(selectedItemStats.shipping_cost_allocation)}</span>
                                    </div>
                                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                                        <span className="text-slate-600">Marketing Ads (Incl. Tax)</span>
                                        <span className="font-medium text-slate-900">- {formatCurrency(selectedItemStats.ad_spend_allocation)}</span>
                                    </div>
                                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                                        <span className="text-slate-600">Fixed Overhead</span>
                                        <span className="font-medium text-slate-900">- {formatCurrency(selectedItemStats.overhead_allocation)}</span>
                                    </div>
                                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                                        <span className="text-slate-600">Courier/Sales Tax</span>
                                        <span className="font-medium text-slate-900">- {formatCurrency(selectedItemStats.tax_allocation)}</span>
                                    </div>
                                    
                                    <div className="mt-4 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                                        <div className="flex justify-between items-center text-indigo-700 font-bold">
                                            <span className="flex items-center gap-2"><Clock size={16}/> Cash Stuck (Inventory)</span>
                                            <span>{formatCurrency(selectedItemStats.cash_in_stock)}</span>
                                        </div>
                                        <p className="text-[11px] text-indigo-600/70 mt-1 leading-snug">
                                            Cost of inventory in <strong>Returned</strong> or <strong>RTO Initiated</strong> state. This stock is considered temporarily unsellable.
                                        </p>
                                    </div>
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

export default Reconciliation;
