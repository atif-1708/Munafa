import React, { useMemo } from 'react';
import { Order, ShopifyOrder, Product, OrderStatus } from '../types';
import { AlertCircle, CheckCircle2, PackageX, TrendingUp, Search, ArrowRight, AlertTriangle, Package, Truck, RotateCcw } from 'lucide-react';
import { formatCurrency } from '../services/calculator';

interface ReconciliationProps {
  shopifyOrders: ShopifyOrder[];
  courierOrders: Order[];
  products: Product[];
}

const Reconciliation: React.FC<ReconciliationProps> = ({ shopifyOrders, courierOrders, products }) => {
  // 1. Build Reconciliation Stats
  const stats = useMemo(() => {
    let totalShopify = 0;
    let totalCancelled = 0;
    let totalDispatched = 0;
    
    // Map for fast lookup of courier orders by Order #
    // Normalize: Remove # and whitespace
    const courierMap = new Map<string, Order>();
    courierOrders.forEach(o => {
        const key = o.shopify_order_number.replace('#', '').trim();
        courierMap.set(key, o);
    });

    const missedOrders: ShopifyOrder[] = [];
    const productStats = new Map<string, {
        name: string,
        sku: string,
        img: string,
        demand: number, 
        dispatched: number, 
        cancelled: number,
        delivered: number,
        returned: number,
        in_transit: number
    }>();

    // Helper to generate fingerprint
    const getFingerprint = (text: string) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');

    // Process Shopify Orders (Source of Truth for Demand)
    shopifyOrders.forEach(so => {
        const key = so.name.replace('#', '').trim();
        const courierOrder = courierMap.get(key);
        
        totalShopify++;
        
        const isCancelled = so.cancel_reason !== null;
        if (isCancelled) totalCancelled++;

        // Check Dispatch Status
        const isDispatched = courierOrder !== undefined; // If it exists in courier list, it was booked/shipped
        
        if (isDispatched) totalDispatched++;
        else if (!isCancelled) missedOrders.push(so);

        // Product Level Aggregation
        so.line_items.forEach(item => {
            const fingerprint = getFingerprint(item.title); // Use title matching
            
            if (!productStats.has(fingerprint)) {
                // Try to find image from products list
                const productDef = products.find(p => p.variant_fingerprint === fingerprint || p.sku === item.sku);
                
                productStats.set(fingerprint, {
                    name: item.title,
                    sku: item.sku || 'N/A',
                    img: productDef?.image_url || '',
                    demand: 0,
                    dispatched: 0,
                    cancelled: 0,
                    delivered: 0,
                    returned: 0,
                    in_transit: 0
                });
            }

            const pStat = productStats.get(fingerprint)!;
            pStat.demand += item.quantity;
            
            if (isCancelled) {
                pStat.cancelled += item.quantity;
            } else if (isDispatched) {
                // We assume if order is dispatched, all items in it were dispatched (simple logic)
                pStat.dispatched += item.quantity; 

                // Detailed Status Breakdown from Courier Order
                if (courierOrder) {
                    if (courierOrder.status === OrderStatus.DELIVERED) {
                        pStat.delivered += item.quantity;
                    } else if (courierOrder.status === OrderStatus.RETURNED || courierOrder.status === OrderStatus.RTO_INITIATED) {
                        pStat.returned += item.quantity;
                    } else {
                        // Covers IN_TRANSIT, BOOKED, PENDING (if considered dispatched)
                        pStat.in_transit += item.quantity;
                    }
                }
            }
        });
    });

    return {
        totalShopify,
        totalCancelled,
        totalDispatched,
        dispatchRate: (totalShopify - totalCancelled) > 0 
            ? (totalDispatched / (totalShopify - totalCancelled)) * 100 
            : 0,
        missedOrders,
        productStats: Array.from(productStats.values()).sort((a,b) => b.demand - a.demand)
    };
  }, [shopifyOrders, courierOrders, products]);

  return (
    <div className="space-y-8">
        <div className="flex justify-between items-center">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Demand & Dispatch Reconciliation</h2>
                <p className="text-slate-500 text-sm">Compare Shopify Orders (Demand) vs Courier Bookings (Fulfillment).</p>
            </div>
            <div className="flex gap-4">
                <div className="text-right">
                    <p className="text-xs text-slate-500 font-bold uppercase">Last 60 Days</p>
                    <p className="text-xs text-slate-400">Shopify Data</p>
                </div>
            </div>
        </div>

        {/* Funnel KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
             <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                 <p className="text-xs font-bold text-slate-500 uppercase">Total Demand (Orders)</p>
                 <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.totalShopify}</h3>
                 <p className="text-xs text-slate-400 mt-1">Placed on Shopify</p>
             </div>
             <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                 <p className="text-xs font-bold text-slate-500 uppercase">Valid Demand</p>
                 <h3 className="text-2xl font-bold text-blue-600 mt-1">{stats.totalShopify - stats.totalCancelled}</h3>
                 <p className="text-xs text-slate-400 mt-1">Excluding {stats.totalCancelled} Cancellations</p>
             </div>
             <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                 <p className="text-xs font-bold text-slate-500 uppercase">Successfully Dispatched</p>
                 <h3 className="text-2xl font-bold text-emerald-600 mt-1">{stats.totalDispatched}</h3>
                 <p className="text-xs text-slate-400 mt-1">Found in Courier Portal</p>
             </div>
             <div className={`p-5 rounded-xl border shadow-sm ${stats.dispatchRate < 90 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                 <p className={`text-xs font-bold uppercase ${stats.dispatchRate < 90 ? 'text-red-600' : 'text-green-600'}`}>Confirmation / Dispatch %</p>
                 <h3 className={`text-2xl font-bold mt-1 ${stats.dispatchRate < 90 ? 'text-red-700' : 'text-green-700'}`}>
                     {stats.dispatchRate.toFixed(1)}%
                 </h3>
                 <p className={`text-xs mt-1 ${stats.dispatchRate < 90 ? 'text-red-600' : 'text-green-600'}`}>
                     {stats.dispatchRate < 90 ? 'High Leakage detected!' : 'Healthy Operations'}
                 </p>
             </div>
        </div>

        {/* Missed Orders Alert */}
        {stats.missedOrders.length > 0 && (
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-6">
                <div className="flex items-start gap-4">
                    <div className="bg-orange-100 p-2 rounded-full text-orange-600">
                        <AlertTriangle size={24} />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-orange-900">
                            {stats.missedOrders.length} Potential Missed Orders
                        </h3>
                        <p className="text-sm text-orange-800 mt-1">
                            These orders are <strong>active in Shopify</strong> (not cancelled) but were <strong>NOT found</strong> in your courier portal. 
                            You may have forgotten to book them, or the integration failed.
                        </p>
                        
                        <div className="mt-4 bg-white rounded-lg border border-orange-200 overflow-hidden max-h-60 overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-orange-50/50 text-orange-800 font-semibold">
                                    <tr>
                                        <th className="px-4 py-2">Order #</th>
                                        <th className="px-4 py-2">Date</th>
                                        <th className="px-4 py-2">Customer</th>
                                        <th className="px-4 py-2">Total</th>
                                        <th className="px-4 py-2">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.missedOrders.map(o => (
                                        <tr key={o.id} className="border-t border-orange-100">
                                            <td className="px-4 py-2 font-medium">{o.name}</td>
                                            <td className="px-4 py-2 text-slate-500">{new Date(o.created_at).toLocaleDateString()}</td>
                                            <td className="px-4 py-2 text-slate-600">{o.customer?.first_name} ({o.customer?.city})</td>
                                            <td className="px-4 py-2">{o.total_price}</td>
                                            <td className="px-4 py-2">
                                                <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded">
                                                    {o.fulfillment_status || 'Unfulfilled'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Product Level Reconciliation */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200">
                <h3 className="font-bold text-slate-800">Item-Level Status Breakdown</h3>
                <p className="text-xs text-slate-500">Track fulfillment performance per product SKU.</p>
            </div>
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                        <th className="px-6 py-4 font-semibold text-slate-700 w-[30%]">Product</th>
                        <th className="px-2 py-4 font-semibold text-slate-700 text-center">Net Demand</th>
                        <th className="px-2 py-4 font-semibold text-slate-700 text-center text-emerald-700">Dispatched</th>
                        
                        {/* Status Columns */}
                        <th className="px-2 py-4 font-semibold text-slate-700 text-center text-xs uppercase tracking-wider bg-slate-100/50 border-l border-slate-200">
                            <span className="flex items-center justify-center gap-1"><CheckCircle2 size={12} className="text-green-600" /> Deliv.</span>
                        </th>
                        <th className="px-2 py-4 font-semibold text-slate-700 text-center text-xs uppercase tracking-wider bg-slate-100/50">
                            <span className="flex items-center justify-center gap-1"><RotateCcw size={12} className="text-red-500" /> RTO</span>
                        </th>
                        <th className="px-2 py-4 font-semibold text-slate-700 text-center text-xs uppercase tracking-wider bg-slate-100/50 border-r border-slate-200">
                            <span className="flex items-center justify-center gap-1"><Truck size={12} className="text-blue-500" /> Transit</span>
                        </th>

                        <th className="px-6 py-4 font-semibold text-slate-700 text-right">Dispatch %</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {stats.productStats.map((p, idx) => {
                        const netDemand = p.demand - p.cancelled;
                        const ratio = netDemand > 0 ? (p.dispatched / netDemand) * 100 : 0;
                        const isLow = ratio < 80;

                        return (
                            <tr key={idx} className="hover:bg-slate-50">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center shrink-0">
                                            {p.img ? <img src={p.img} alt="" className="w-full h-full object-cover rounded" /> : <Package size={16} className="text-slate-400" />}
                                        </div>
                                        <div>
                                            <div className="font-medium text-slate-900 line-clamp-1" title={p.name}>{p.name}</div>
                                            <div className="text-xs text-slate-500">{p.sku}</div>
                                            {p.cancelled > 0 && <span className="text-[10px] text-red-400">({p.cancelled} cancelled)</span>}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-2 py-4 text-center font-bold text-blue-600">{netDemand}</td>
                                <td className="px-2 py-4 text-center font-bold text-emerald-600">{p.dispatched}</td>
                                
                                {/* Status Breakdown Data */}
                                <td className="px-2 py-4 text-center bg-slate-50/50 border-l border-slate-100 text-green-700 font-medium">
                                    {p.delivered}
                                </td>
                                <td className="px-2 py-4 text-center bg-slate-50/50 text-red-600 font-medium">
                                    {p.returned}
                                </td>
                                <td className="px-2 py-4 text-center bg-slate-50/50 border-r border-slate-100 text-blue-600 font-medium">
                                    {p.in_transit}
                                </td>

                                <td className="px-6 py-4 text-right">
                                    <span className={`px-2 py-1 rounded font-bold text-xs ${isLow ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                        {ratio.toFixed(0)}%
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    </div>
  );
};

export default Reconciliation;