
import React, { useMemo, useState } from 'react';
import { Order, ShopifyOrder, Product, OrderStatus } from '../types';
import { Search, Download, Package, AlertCircle, CheckCircle2, Truck, XCircle, Clock, ArrowRight } from 'lucide-react';
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

    shopifyOrders.forEach(order => {
        // Normalize key
        const orderKey = order.name.replace('#', '').trim();
        const courierOrder = courierMap.get(orderKey);

        const isCancelled = order.cancel_reason !== null;
        const isFulfilled = order.fulfillment_status === 'fulfilled';
        const isPending = !isCancelled && !isFulfilled; // Roughly "Unfulfilled"

        // Courier Status Flags
        let isDispatched = false;
        let isDelivered = false;
        let isRto = false;

        if (courierOrder) {
            // If it exists in courier and isn't just 'Booked' or 'Cancelled', we consider it dispatched/handed over
            if (courierOrder.status !== OrderStatus.PENDING && courierOrder.status !== OrderStatus.CANCELLED) {
                isDispatched = true;
            }
            if (courierOrder.status === OrderStatus.DELIVERED) isDelivered = true;
            if (courierOrder.status === OrderStatus.RETURNED || courierOrder.status === OrderStatus.RTO_INITIATED) isRto = true;
        }

        order.line_items.forEach(item => {
            const key = item.sku || item.title; // Grouping Key

            if (!stats.has(key)) {
                stats.set(key, {
                    id: String(item.variant_id),
                    title: item.title,
                    sku: item.sku || 'N/A',
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
            const qty = item.quantity;

            stat.total_ordered += qty;

            if (isCancelled) {
                stat.cancelled += qty;
            } else {
                if (isPending) stat.pending_fulfillment += qty;
                if (isFulfilled) stat.fulfilled += qty;

                // Courier Metrics (Only apply if valid order)
                if (isDispatched) stat.dispatched += qty;
                if (isDelivered) stat.delivered += qty;
                if (isRto) stat.rto += qty;
            }
        });
    });

    return Array.from(stats.values()).sort((a,b) => b.total_ordered - a.total_ordered);
  }, [shopifyOrders, courierOrders]);

  // 2. Filter
  const filteredStats = useMemo(() => {
      return productStats.filter(p => 
          p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
          p.sku.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [productStats, searchTerm]);

  const handleExport = () => {
    const doc = new jsPDF();
    doc.text(`${storeName} - Product Performance`, 14, 15);
    
    const rows = filteredStats.map(r => [
        r.title,
        r.sku,
        r.total_ordered,
        r.pending_fulfillment,
        r.fulfilled,
        r.dispatched,
        r.delivered,
        r.rto
    ]);

    autoTable(doc, {
        head: [['Product', 'SKU', 'Total', 'Pending', 'Fulfilled', 'Dispatched', 'Delivered', 'RTO']],
        body: rows,
        startY: 25,
        styles: { fontSize: 8 }
    });
    doc.save('Shopify_Product_Stats.pdf');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold text-slate-900">Shopify Product Stats</h2>
           <p className="text-slate-500 text-sm">Inventory flow analysis: From Order to Delivery.</p>
        </div>
        <div className="flex gap-2">
            <div className="relative">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Search Product..." 
                    className="pl-10 pr-4 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 w-64"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <button onClick={handleExport} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                <Download size={16} /> Export
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase text-xs font-bold tracking-wider">
                <tr>
                    <th className="px-6 py-4 w-[25%]">Product Details</th>
                    <th className="px-4 py-4 text-center text-slate-500">Total</th>
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
                    <tr><td colSpan={9} className="px-6 py-12 text-center text-slate-400">No products found.</td></tr>
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
                            <span className={`inline-block font-medium ${item.pending_fulfillment > 0 ? 'text-orange-600' : 'text-slate-300'}`}>
                                {item.pending_fulfillment}
                            </span>
                        </td>
                        <td className="px-4 py-4 text-center bg-blue-50/30">
                             <span className={`inline-block font-medium ${item.fulfilled > 0 ? 'text-blue-600' : 'text-slate-300'}`}>
                                {item.fulfilled}
                            </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                            <span className={`inline-block ${item.cancelled > 0 ? 'text-red-400 font-medium' : 'text-slate-200'}`}>
                                {item.cancelled}
                            </span>
                        </td>

                        {/* Spacer/Arrow */}
                        <td className="px-1 py-4 text-center text-slate-300">
                            <ArrowRight size={14} />
                        </td>

                        {/* Courier Stats */}
                         <td className="px-4 py-4 text-center bg-purple-50/30">
                            <span className={`inline-block font-medium ${item.dispatched > 0 ? 'text-purple-600' : 'text-slate-300'}`}>
                                {item.dispatched}
                            </span>
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