
import React, { useMemo, useState } from 'react';
import { Order, ShopifyOrder, Product, OrderStatus } from '../types';
import { Search, Download, Package, AlertCircle, CheckCircle2, Truck, XCircle, Clock, ArrowRight, Calendar } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ReconciliationProps {
  shopifyOrders: ShopifyOrder[];
  courierOrders: Order[];
  products: Product[];
  storeName?: string;
}

interface ProductStat {
  id: string;
  title: string;
  sku: string;
  total_ordered: number;
  pending_fulfillment: number;
  fulfilled: number;
  cancelled: number;
  dispatched: number;
  delivered: number;
  rto: number;
}

const Reconciliation: React.FC<ReconciliationProps> = ({ shopifyOrders, courierOrders, storeName = 'My Store' }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
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
        // Normalize keys: "#1001" -> "1001"
        const key = co.shopify_order_number.replace('#', '').trim();
        courierMap.set(key, co);
    });

    const start = new Date(dateRange.start);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateRange.end);
    end.setHours(23, 59, 59, 999);

    // DEDUPLICATION: Ensure each Shopify Order ID is processed exactly ONCE
    const uniqueOrders = new Map<number, ShopifyOrder>();
    shopifyOrders.forEach(order => {
        const orderDate = new Date(order.created_at);
        if (orderDate >= start && orderDate <= end) {
            if (!uniqueOrders.has(order.id)) {
                uniqueOrders.set(order.id, order);
            }
        }
    });

    // Iterate over UNIQUE orders only
    uniqueOrders.forEach(order => {
        // Normalize key
        const orderKey = order.name.replace('#', '').trim();
        const courierOrder = courierMap.get(orderKey);

        const isCancelled = order.cancel_reason !== null;
        const isFulfilled = order.fulfillment_status === 'fulfilled'; // strict check for 'fulfilled'
        const isPending = !isCancelled && !isFulfilled; // Roughly "Unfulfilled" or "Partial"

        // Courier Status Flags
        let isDispatched = false;
        let isDelivered = false;
        let isRto = false;

        if (courierOrder) {
            // If it exists in courier and isn't just 'Booked' or 'Cancelled' or 'Pending', we consider it dispatched/handed over
            if (courierOrder.status !== OrderStatus.PENDING && 
                courierOrder.status !== OrderStatus.BOOKED && 
                courierOrder.status !== OrderStatus.CANCELLED) {
                isDispatched = true;
            }
            if (courierOrder.status === OrderStatus.DELIVERED) isDelivered = true;
            if (courierOrder.status === OrderStatus.RETURNED || courierOrder.status === OrderStatus.RTO_INITIATED) isRto = true;
        }

        // Logic: ONLY count the first item in the order as requested to assign the Order to a primary product
        if (order.line_items.length > 0) {
            const item = order.line_items[0];
            const key = item.title; // Grouping Key: TITLE ONLY

            if (!stats.has(key)) {
                stats.set(key, {
                    id: String(item.variant_id),
                    title: item.title,
                    sku: 'VARIOUS', // Merged
                    total_ordered: 0,
                    pending_fulfillment: 0,
                    fulfilled: 0,
                    cancelled: 0,
                    dispatched: 0,
                    delivered: 0,
                    rto: 0
                });
            }

            const stat = stats.get(key)!;
            
            // STRICTLY COUNT 1 PER ORDER (Not Quantity)
            stat.total_ordered += 1;

            if (isCancelled) {
                stat.cancelled += 1;
            } else {
                if (isPending) stat.pending_fulfillment += 1;
                if (isFulfilled) stat.fulfilled += 1;

                // Courier Metrics (Only apply if valid order)
                if (isDispatched) stat.dispatched += 1;
                if (isDelivered) stat.delivered += 1;
                if (isRto) stat.rto += 1;
            }
        }
    });

    return Array.from(stats.values()).sort((a,b) => b.total_ordered - a.total_ordered);
  }, [shopifyOrders, courierOrders, dateRange]);

  // 2. Filter by Search
  const filteredStats = useMemo(() => {
      return productStats.filter(p => 
          p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
          p.sku.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [productStats, searchTerm]);

  const handleExport = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setTextColor(20, 83, 45); // Brand Green color (approximate)
    doc.setFontSize(22);
    doc.text("MunafaBakhsh Karobaar", 14, 20);
    
    doc.setTextColor(100); // Grey
    doc.setFontSize(10);
    doc.text("eCommerce Intelligence Platform", 14, 25);

    doc.setDrawColor(200);
    doc.line(14, 30, 196, 30);

    // Report Info
    doc.setTextColor(0);
    doc.setFontSize(14);
    doc.text(`${storeName} - Product Performance Report`, 14, 40);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Period: ${dateRange.start} to ${dateRange.end}`, 14, 46);
    
    const rows = filteredStats.map(r => {
        const total = r.total_ordered;
        const disp = r.dispatched;
        
        // Helper for %
        const p = (val: number, base: number) => base > 0 ? `(${Math.round((val/base)*100)}%)` : '';

        return [
            r.title,
            r.total_ordered,
            `${r.pending_fulfillment} ${p(r.pending_fulfillment, total)}`,
            `${r.fulfilled} ${p(r.fulfilled, total)}`,
            `${r.dispatched} ${p(r.dispatched, total)}`,
            `${r.delivered} ${p(r.delivered, disp)}`, // Rel to dispatched
            `${r.rto} ${p(r.rto, disp)}` // Rel to dispatched
        ];
    });

    autoTable(doc, {
        head: [['Product', 'Total Orders', 'Pending', 'Fulfilled', 'Dispatched', 'Delivered', 'RTO']],
        body: rows,
        startY: 55,
        theme: 'grid',
        headStyles: { fillColor: [22, 163, 74] }, // Brand Green
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: {
            0: { cellWidth: 60 }, // Product Name
            1: { halign: 'center' },
            2: { halign: 'center' },
            3: { halign: 'center' },
            4: { halign: 'center' },
            5: { halign: 'center' },
            6: { halign: 'center', textColor: [220, 38, 38] } // Red for RTO
        }
    });
    doc.save('Reconciliation_Report.pdf');
  };

  const getPercentage = (val: number, total: number) => {
      if (total === 0) return '';
      return `${Math.round((val / total) * 100)}%`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h2 className="text-2xl font-bold text-slate-900">Shopify Product Stats</h2>
           <p className="text-slate-500 text-sm">Inventory flow analysis (Main Item Only, Order Counts).</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
             {/* Date Filter */}
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
                    <th className="px-6 py-4 w-[30%]">Product (First Item)</th>
                    <th className="px-4 py-4 text-center text-slate-500">Total Orders</th>
                    <th className="px-4 py-4 text-center text-orange-600 bg-orange-50/50">Pending</th>
                    <th className="px-4 py-4 text-center text-blue-600 bg-blue-50/50">Fulfilled</th>
                    <th className="px-4 py-4 text-center text-red-400">Cancelled</th>
                    <th className="px-1 py-4 w-6"></th> {/* Arrow */}
                    <th className="px-4 py-4 text-center text-purple-600 bg-purple-50/50">Dispatched</th>
                    <th className="px-4 py-4 text-center text-green-600 bg-green-50/50">Delivered</th>
                    <th className="px-4 py-4 text-center text-red-600 bg-red-50/50">RTO</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {filteredStats.length === 0 ? (
                    <tr><td colSpan={9} className="px-6 py-12 text-center text-slate-400">No products found in this date range.</td></tr>
                ) : filteredStats.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                                    <Package size={18} />
                                </div>
                                <div className="min-w-0">
                                    <div className="font-medium text-slate-900 truncate max-w-[250px]" title={item.title}>{item.title}</div>
                                    <div className="text-xs text-slate-400 font-mono">{item.sku}</div>
                                </div>
                            </div>
                        </td>

                        {/* Shopify Stats */}
                        <td className="px-4 py-4 text-center font-bold text-slate-800">
                            {item.total_ordered}
                        </td>
                        <td className="px-4 py-4 text-center bg-orange-50/30">
                            <div className="flex flex-col items-center">
                                <span className={`font-medium ${item.pending_fulfillment > 0 ? 'text-orange-600' : 'text-slate-300'}`}>
                                    {item.pending_fulfillment}
                                </span>
                                {item.pending_fulfillment > 0 && <span className="text-[10px] text-orange-600/70">{getPercentage(item.pending_fulfillment, item.total_ordered)}</span>}
                            </div>
                        </td>
                        <td className="px-4 py-4 text-center bg-blue-50/30">
                             <div className="flex flex-col items-center">
                                 <span className={`font-medium ${item.fulfilled > 0 ? 'text-blue-600' : 'text-slate-300'}`}>
                                    {item.fulfilled}
                                </span>
                                {item.fulfilled > 0 && <span className="text-[10px] text-blue-600/70">{getPercentage(item.fulfilled, item.total_ordered)}</span>}
                             </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                            <div className="flex flex-col items-center">
                                <span className={`font-medium ${item.cancelled > 0 ? 'text-red-400' : 'text-slate-200'}`}>
                                    {item.cancelled}
                                </span>
                                {item.cancelled > 0 && <span className="text-[10px] text-red-400/70">{getPercentage(item.cancelled, item.total_ordered)}</span>}
                            </div>
                        </td>

                        {/* Spacer/Arrow */}
                        <td className="px-1 py-4 text-center text-slate-300">
                            <ArrowRight size={14} />
                        </td>

                        {/* Courier Stats */}
                         <td className="px-4 py-4 text-center bg-purple-50/30">
                            <div className="flex flex-col items-center">
                                <span className={`font-medium ${item.dispatched > 0 ? 'text-purple-600' : 'text-slate-300'}`}>
                                    {item.dispatched}
                                </span>
                                {item.dispatched > 0 && <span className="text-[10px] text-purple-600/70">{getPercentage(item.dispatched, item.total_ordered)}</span>}
                            </div>
                        </td>
                         <td className="px-4 py-4 text-center bg-green-50/30">
                            <div className="flex flex-col items-center">
                                <span className={`font-bold ${item.delivered > 0 ? 'text-green-600' : 'text-slate-300'}`}>
                                    {item.delivered}
                                </span>
                                {item.dispatched > 0 && (
                                    <span className="text-[10px] text-green-600/70">
                                        {Math.round((item.delivered / item.dispatched) * 100)}%
                                    </span>
                                )}
                            </div>
                        </td>
                         <td className="px-4 py-4 text-center bg-red-50/30">
                             <div className="flex flex-col items-center">
                                <span className={`font-bold ${item.rto > 0 ? 'text-red-600' : 'text-slate-300'}`}>
                                    {item.rto}
                                </span>
                                {item.dispatched > 0 && item.rto > 0 && (
                                    <span className="text-[10px] text-red-400">
                                        {Math.round((item.rto / item.dispatched) * 100)}%
                                    </span>
                                )}
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>
    </div>
  );
};

export default Reconciliation;
