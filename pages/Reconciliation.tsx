
import React, { useMemo, useState } from 'react';
import { Order, ShopifyOrder, Product, OrderStatus } from '../types';
import { Search, Download, Package, ArrowRight, Calendar } from 'lucide-react';
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

  // 1. Build Product Statistics (Raw Shopify Titles)
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
            const item = order.line_items[0]; // Primary Item strategy
            
            // STRICT: Use Shopify Title directly. No Mapping.
            const key = item.title;
            const title = item.title;

            if (!stats.has(key)) {
                stats.set(key, {
                    id: key,
                    title: title,
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
  }, [shopifyOrders, courierOrders, dateRange]);

  const filteredStats = useMemo(() => {
      return productStats.filter(p => 
          p.title.toLowerCase().includes(searchTerm.toLowerCase())
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
    doc.text(`${storeName} - Shopify Product Report`, 14, 40);
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
        head: [['Shopify Product', 'Total Orders', 'Pending', 'Fulfilled', 'Dispatched', 'Delivered', 'RTO']],
        body: rows,
        startY: 55,
        theme: 'grid',
        headStyles: { fillColor: [22, 163, 74] },
        styles: { fontSize: 8, cellPadding: 3 },
    });
    doc.save('Shopify_Reconciliation_Report.pdf');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h2 className="text-2xl font-bold text-slate-900">Shopify Product Stats</h2>
           <p className="text-slate-500 text-sm">Raw performance analysis by Shopify Product Title.</p>
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
                    <th className="px-6 py-4 w-[35%]">Shopify Product</th>
                    <th className="px-4 py-4 text-center text-slate-500">Total</th>
                    <th className="px-4 py-4 text-center text-orange-600 bg-orange-50/50">Pending</th>
                    <th className="px-4 py-4 text-center text-blue-600 bg-blue-50/50">Fulfilled</th>
                    <th className="px-1 py-4 w-6"></th> 
                    <th className="px-4 py-4 text-center text-purple-600 bg-purple-50/50">Dispatched</th>
                    <th className="px-4 py-4 text-center text-green-600 bg-green-50/50">Delivered</th>
                    <th className="px-4 py-4 text-center text-red-600 bg-red-50/50">RTO</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {filteredStats.length === 0 ? (
                    <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-400">No products found in this date range.</td></tr>
                ) : filteredStats.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded flex items-center justify-center shrink-0 bg-slate-100 text-slate-400">
                                    <Package size={18} />
                                </div>
                                <div className="min-w-0">
                                    <div className="font-bold truncate max-w-[250px] text-slate-900" title={item.title}>
                                        {item.title}
                                    </div>
                                </div>
                            </div>
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
                    </tr>
                ))}
            </tbody>
        </table>
      </div>
    </div>
  );
};

export default Reconciliation;
