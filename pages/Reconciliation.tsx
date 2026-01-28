import React, { useMemo } from 'react';
import { Order, ShopifyOrder, Product, OrderStatus } from '../types';
import { Package, ArrowRight, CheckCircle2, Truck, ClipboardCheck, AlertCircle } from 'lucide-react';

interface ReconciliationProps {
  shopifyOrders: ShopifyOrder[];
  courierOrders: Order[];
  products: Product[];
}

const Reconciliation: React.FC<ReconciliationProps> = ({ shopifyOrders, courierOrders, products }) => {
  // 1. Build Reconciliation Stats
  const stats = useMemo(() => {
    // Map for fast lookup of courier orders
    const courierMap = new Map<string, Order>();
    courierOrders.forEach(o => {
        const key = o.shopify_order_number.replace('#', '').trim();
        courierMap.set(key, o);
    });

    const productStats = new Map<string, {
        name: string,
        sku: string,
        img: string,
        shopifyDemand: number, 
        confirmed: number, 
        dispatched: number,
        delivered: number,
        rto: number
    }>();

    const getFingerprint = (text: string) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');

    shopifyOrders.forEach(so => {
        // Skip cancelled shopify orders for "Net Demand" calculation
        if (so.cancel_reason !== null) return;

        const key = so.name.replace('#', '').trim();
        const courierOrder = courierMap.get(key);
        
        // Logic Definitions:
        // 1. Confirmed: Exists in Courier System (Any status except internal pending/cancelled)
        const isConfirmed = courierOrder !== undefined && courierOrder.status !== OrderStatus.CANCELLED;
        
        // 2. Dispatched: Moving in network (Not just Booked/Label Created)
        const isDispatched = isConfirmed && 
                             courierOrder!.status !== OrderStatus.BOOKED && 
                             courierOrder!.status !== OrderStatus.PENDING;

        // 3. Delivered
        const isDelivered = courierOrder?.status === OrderStatus.DELIVERED;
        const isRto = courierOrder?.status === OrderStatus.RETURNED || courierOrder?.status === OrderStatus.RTO_INITIATED;

        so.line_items.forEach(item => {
            const fingerprint = getFingerprint(item.title);
            
            if (!productStats.has(fingerprint)) {
                const productDef = products.find(p => p.variant_fingerprint === fingerprint || p.sku === item.sku);
                
                productStats.set(fingerprint, {
                    name: item.title,
                    sku: item.sku || 'N/A',
                    img: productDef?.image_url || '',
                    shopifyDemand: 0,
                    confirmed: 0,
                    dispatched: 0,
                    delivered: 0,
                    rto: 0
                });
            }

            const pStat = productStats.get(fingerprint)!;
            pStat.shopifyDemand += item.quantity; // Net Demand (no cancelled)

            if (isConfirmed) {
                pStat.confirmed += item.quantity;
            }
            if (isDispatched) {
                pStat.dispatched += item.quantity;
            }
            if (isDelivered) {
                pStat.delivered += item.quantity;
            }
            if (isRto) {
                pStat.rto += item.quantity;
            }
        });
    });

    return Array.from(productStats.values()).sort((a,b) => b.shopifyDemand - a.shopifyDemand);
  }, [shopifyOrders, courierOrders, products]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Reconciliation</h2>
                <p className="text-slate-500 text-sm">Product-wise synchronization between Shopify and Courier.</p>
            </div>
        </div>

        {/* Clean Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                        <th className="px-6 py-4 font-bold text-slate-700 w-[35%] uppercase tracking-wider text-xs">Product</th>
                        <th className="px-4 py-4 font-bold text-slate-700 text-center uppercase tracking-wider text-xs bg-slate-100/50">
                            Shopify Orders
                        </th>
                        <th className="px-4 py-4 font-bold text-slate-700 text-center uppercase tracking-wider text-xs">
                             Confirmed
                        </th>
                        <th className="px-4 py-4 font-bold text-slate-700 text-center uppercase tracking-wider text-xs bg-slate-100/50">
                             Dispatched
                        </th>
                        <th className="px-4 py-4 font-bold text-slate-700 text-center uppercase tracking-wider text-xs">
                             Delivered
                        </th>
                         <th className="px-4 py-4 font-bold text-slate-700 text-center uppercase tracking-wider text-xs text-red-600">
                             RTO
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {stats.map((p, idx) => {
                        // Calculations for visual indicators
                        const confirmRate = p.shopifyDemand > 0 ? (p.confirmed / p.shopifyDemand) * 100 : 0;
                        const isLeakage = confirmRate < 90; // Less than 90% booked

                        return (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                                            {p.img ? <img src={p.img} alt="" className="w-full h-full object-cover rounded" /> : <Package size={16} className="text-slate-400" />}
                                        </div>
                                        <div>
                                            <div className="font-medium text-slate-900 line-clamp-1 text-sm" title={p.name}>{p.name}</div>
                                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">{p.sku}</div>
                                        </div>
                                    </div>
                                </td>
                                
                                {/* 1. Shopify Orders (Demand) */}
                                <td className="px-4 py-4 text-center bg-slate-50/50 font-semibold text-slate-800 border-x border-slate-100">
                                    {p.shopifyDemand}
                                </td>

                                {/* 2. Confirmed (Exists in Courier) */}
                                <td className="px-4 py-4 text-center">
                                    <div className={`font-semibold ${isLeakage ? 'text-red-600' : 'text-blue-600'}`}>
                                        {p.confirmed}
                                    </div>
                                    {isLeakage && (
                                        <div className="text-[10px] text-red-500 flex items-center justify-center gap-1 mt-1">
                                            <AlertCircle size={10} /> Missed
                                        </div>
                                    )}
                                </td>

                                {/* 3. Dispatched (Actually Moving) */}
                                <td className="px-4 py-4 text-center bg-slate-50/50 border-x border-slate-100">
                                    <div className="font-semibold text-indigo-600">
                                        {p.dispatched}
                                    </div>
                                </td>

                                {/* 4. Delivered */}
                                <td className="px-4 py-4 text-center">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">
                                        {p.delivered}
                                    </span>
                                </td>

                                {/* 5. RTO */}
                                <td className="px-4 py-4 text-center text-slate-400">
                                     {p.rto > 0 ? (
                                         <span className="text-red-600 font-medium">{p.rto}</span>
                                     ) : '-'}
                                </td>
                            </tr>
                        );
                    })}
                    {stats.length === 0 && (
                        <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                No data available for reconciliation. Ensure Shopify and Courier integrations are active.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
  );
};

export default Reconciliation;