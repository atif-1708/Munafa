import React, { useMemo, useState } from 'react';
import { Order, ShopifyOrder, Product, OrderStatus } from '../types';
import { Package, ArrowRight, CheckCircle2, Truck, ClipboardCheck, AlertCircle, ChevronDown, ChevronRight, Calendar, User, Search } from 'lucide-react';

interface ReconciliationProps {
  shopifyOrders: ShopifyOrder[];
  courierOrders: Order[];
  products: Product[];
}

// Helper interface for the drill-down data
interface OrderDetail {
    orderNumber: string;
    date: string;
    customer: string;
    quantity: number;
    status: string; // Combined status (Courier or Internal)
    courierName: string;
    tracking: string;
    isMissed: boolean;
}

const Reconciliation: React.FC<ReconciliationProps> = ({ shopifyOrders, courierOrders, products }) => {
  const [expandedFingerprint, setExpandedFingerprint] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Build Reconciliation Stats
  const stats = useMemo(() => {
    // Map for fast lookup of courier orders
    const courierMap = new Map<string, Order>();
    courierOrders.forEach(o => {
        const key = o.shopify_order_number.replace('#', '').trim();
        courierMap.set(key, o);
    });

    const productStats = new Map<string, {
        fingerprint: string;
        name: string;
        sku: string;
        img: string;
        shopifyDemand: number; 
        confirmed: number; 
        dispatched: number;
        delivered: number;
        rto: number;
        // The list of specific orders for this item
        details: OrderDetail[];
    }>();

    const getFingerprint = (text: string) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');

    shopifyOrders.forEach(so => {
        const isCancelled = so.cancel_reason !== null;
        
        const key = so.name.replace('#', '').trim();
        const courierOrder = courierMap.get(key);
        
        // "Confirmed" = Has Courier Data OR is Cancelled (Processed)
        // Definition: "fulfilled, Cancelled, and delivered".
        // Effectively, anything NOT "Missed/Unbooked".
        const hasCourierData = courierOrder !== undefined;
        const isConfirmed = hasCourierData || isCancelled;

        // Dispatched = Has courier data AND is moving (not just booked/pending/cancelled in courier)
        const isDispatched = hasCourierData && 
                             courierOrder!.status !== OrderStatus.BOOKED && 
                             courierOrder!.status !== OrderStatus.PENDING &&
                             courierOrder!.status !== OrderStatus.CANCELLED;
                             
        const isDelivered = courierOrder?.status === OrderStatus.DELIVERED;
        const isRto = courierOrder?.status === OrderStatus.RETURNED || courierOrder?.status === OrderStatus.RTO_INITIATED;

        so.line_items.forEach(item => {
            const fingerprint = getFingerprint(item.title);
            
            if (!productStats.has(fingerprint)) {
                const productDef = products.find(p => p.variant_fingerprint === fingerprint || p.sku === item.sku);
                
                productStats.set(fingerprint, {
                    fingerprint,
                    name: item.title,
                    sku: item.sku || 'N/A',
                    img: productDef?.image_url || '',
                    shopifyDemand: 0,
                    confirmed: 0,
                    dispatched: 0,
                    delivered: 0,
                    rto: 0,
                    details: []
                });
            }

            const pStat = productStats.get(fingerprint)!;

            // Include ALL orders in Demand to calculate accurate Confirmation Rate
            pStat.shopifyDemand += item.quantity;

            if (isConfirmed) pStat.confirmed += item.quantity;
            if (isDispatched) pStat.dispatched += item.quantity;
            if (isDelivered) pStat.delivered += item.quantity;
            if (isRto) pStat.rto += item.quantity;

            // Determine display status for the drill-down
            let displayStatus = 'PENDING';
            let isMissed = false;

            if (isCancelled) {
                displayStatus = 'CANCELLED';
            } else if (courierOrder) {
                displayStatus = courierOrder.status;
            } else {
                // Exists in Shopify, Not Cancelled, No Courier Data
                displayStatus = 'MISSED / UNBOOKED';
                isMissed = true;
            }

            // Push specific order detail
            pStat.details.push({
                orderNumber: so.name,
                date: so.created_at,
                customer: so.customer ? `${so.customer.first_name} (${so.customer.city})` : 'Guest',
                quantity: item.quantity,
                status: displayStatus,
                courierName: courierOrder ? courierOrder.courier : '-',
                tracking: courierOrder ? courierOrder.tracking_number : '-',
                isMissed: isMissed
            });
        });
    });

    // Filter by search term if exists
    let results = Array.from(productStats.values());
    if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        results = results.filter(p => p.name.toLowerCase().includes(lower) || p.sku.toLowerCase().includes(lower));
    }

    return results.sort((a,b) => b.shopifyDemand - a.shopifyDemand);
  }, [shopifyOrders, courierOrders, products, searchTerm]);

  const toggleRow = (fingerprint: string) => {
      if (expandedFingerprint === fingerprint) setExpandedFingerprint(null);
      else setExpandedFingerprint(fingerprint);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Reconciliation</h2>
                <p className="text-slate-500 text-sm">Compare Shopify demand vs Courier fulfillment per product.</p>
            </div>
            <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Search Product..." 
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
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
                        <th className="w-10"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {stats.map((p, idx) => {
                        const confirmRate = p.shopifyDemand > 0 ? (p.confirmed / p.shopifyDemand) * 100 : 0;
                        const isLeakage = confirmRate < 95;
                        const isExpanded = expandedFingerprint === p.fingerprint;

                        return (
                            <React.Fragment key={p.fingerprint}>
                                <tr 
                                    className={`cursor-pointer transition-colors ${isExpanded ? 'bg-slate-50 border-b-0' : 'hover:bg-slate-50 border-b border-slate-100'}`}
                                    onClick={() => toggleRow(p.fingerprint)}
                                >
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
                                    
                                    <td className="px-4 py-4 text-center bg-slate-50/50 font-semibold text-slate-800 border-x border-slate-100">
                                        {p.shopifyDemand}
                                    </td>

                                    <td className="px-4 py-4 text-center">
                                        <div className="flex flex-col items-center">
                                            <div className={`font-semibold ${isLeakage ? 'text-red-600' : 'text-blue-600'}`}>
                                                {p.confirmed}
                                            </div>
                                            {p.shopifyDemand > 0 && (
                                                <div className={`text-[10px] font-bold mt-0.5 ${isLeakage ? 'text-red-500' : 'text-green-600'}`}>
                                                    {confirmRate.toFixed(0)}%
                                                </div>
                                            )}
                                        </div>
                                        {isLeakage && (
                                            <div className="text-[10px] text-red-500 flex items-center justify-center gap-1 mt-1">
                                                <AlertCircle size={10} /> {p.shopifyDemand - p.confirmed} Missed
                                            </div>
                                        )}
                                    </td>

                                    <td className="px-4 py-4 text-center bg-slate-50/50 border-x border-slate-100 font-semibold text-indigo-600">
                                        {p.dispatched}
                                    </td>

                                    <td className="px-4 py-4 text-center">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">
                                            {p.delivered}
                                        </span>
                                    </td>

                                    <td className="px-4 py-4 text-center text-slate-400">
                                        {p.rto > 0 ? (
                                            <span className="text-red-600 font-medium">{p.rto}</span>
                                        ) : '-'}
                                    </td>
                                    
                                    <td className="pr-4 text-slate-400">
                                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                    </td>
                                </tr>

                                {/* Expanded Details Row */}
                                {isExpanded && (
                                    <tr className="bg-slate-50">
                                        <td colSpan={7} className="px-4 py-4 md:px-12">
                                            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                                                <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex justify-between items-center">
                                                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Order Breakdown</span>
                                                    <span className="text-xs text-slate-400">{p.details.length} Records</span>
                                                </div>
                                                <table className="w-full text-xs text-left">
                                                    <thead className="bg-slate-50 text-slate-500 font-medium">
                                                        <tr>
                                                            <th className="px-4 py-2">Order #</th>
                                                            <th className="px-4 py-2">Date</th>
                                                            <th className="px-4 py-2">Customer</th>
                                                            <th className="px-4 py-2 text-center">Qty</th>
                                                            <th className="px-4 py-2">Logistics</th>
                                                            <th className="px-4 py-2">Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {p.details
                                                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                                            .map((order, oid) => (
                                                            <tr key={oid} className="hover:bg-slate-50">
                                                                <td className="px-4 py-2 font-bold text-slate-800">{order.orderNumber}</td>
                                                                <td className="px-4 py-2 text-slate-500">
                                                                    <div className="flex items-center gap-1">
                                                                        <Calendar size={12} />
                                                                        {new Date(order.date).toLocaleDateString()}
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-2 text-slate-600">
                                                                    <div className="flex items-center gap-1">
                                                                        <User size={12} />
                                                                        {order.customer}
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-2 text-center font-bold">{order.quantity}</td>
                                                                <td className="px-4 py-2">
                                                                    {order.courierName !== '-' ? (
                                                                        <div>
                                                                            <span className="font-semibold text-slate-700">{order.courierName}</span>
                                                                            <div className="text-[10px] text-slate-400">{order.tracking}</div>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-slate-300">-</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-2">
                                                                    <StatusBadge status={order.status} isMissed={order.isMissed} />
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                    {stats.length === 0 && (
                        <tr>
                            <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                                No data available for reconciliation.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
  );
};

const StatusBadge = ({ status, isMissed }: { status: string, isMissed: boolean }) => {
    if (isMissed) {
        return <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold">MISSED / UNBOOKED</span>;
    }
    if (status === 'CANCELLED') {
        return <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[10px] font-bold line-through">CANCELLED</span>;
    }
    
    // Normal Courier Statuses
    const styles: Record<string, string> = {
        'DELIVERED': 'bg-green-100 text-green-700',
        'RETURNED': 'bg-red-100 text-red-700',
        'RTO_INITIATED': 'bg-orange-100 text-orange-700',
        'IN_TRANSIT': 'bg-blue-100 text-blue-700',
        'BOOKED': 'bg-indigo-50 text-indigo-600',
        'PENDING': 'bg-yellow-50 text-yellow-600'
    };
    
    const className = styles[status] || 'bg-gray-100 text-gray-600';
    return <span className={`${className} px-2 py-0.5 rounded text-[10px] font-bold`}>{status.replace('_', ' ')}</span>;
};

export default Reconciliation;