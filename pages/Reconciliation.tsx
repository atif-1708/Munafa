import React, { useMemo, useState } from 'react';
import { Order, ShopifyOrder, Product, OrderStatus } from '../types';
import { Package, ArrowRight, CheckCircle2, Truck, ClipboardCheck, AlertCircle, ChevronDown, ChevronRight, Calendar, User, Search, XCircle, Clock } from 'lucide-react';

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
  
  // Date Range State (Default: Last 30 Days)
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  });

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
        confirmed: number; // Only Fulfilled/Booked (Has Courier Data)
        cancelled: number; // Cancelled on Shopify
        pending: number;   // Pending on Shopify (No Courier Data)
        dispatched: number;
        delivered: number;
        rto: number;
        // The list of specific orders for this item
        details: OrderDetail[];
    }>();

    const getFingerprint = (text: string) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');

    // Date Filtering Constants
    const start = new Date(dateRange.start);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateRange.end);
    end.setHours(23, 59, 59, 999);

    shopifyOrders.forEach(so => {
        // Date Filter Check
        const orderDate = new Date(so.created_at);
        if (orderDate < start || orderDate > end) return;

        const isShopifyCancelled = so.cancel_reason !== null;
        
        const key = so.name.replace('#', '').trim();
        const courierOrder = courierMap.get(key);
        const hasCourierData = courierOrder !== undefined;

        // ONLY Process the First Item (Main Item) - Ignore secondary items/gifts as per user request
        if (so.line_items.length > 0) {
            const item = so.line_items[0];
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
                    cancelled: 0,
                    pending: 0,
                    dispatched: 0,
                    delivered: 0,
                    rto: 0,
                    details: []
                });
            }

            const pStat = productStats.get(fingerprint)!;

            // 1. Demand (Count Orders, not Quantity)
            pStat.shopifyDemand += 1;

            // 2. Buckets (Mutually Exclusive for Reconciliation)
            if (isShopifyCancelled) {
                pStat.cancelled += 1;
            } else if (hasCourierData) {
                pStat.confirmed += 1;
            } else {
                pStat.pending += 1;
            }

            // 3. Logistics Flow (Subset of Confirmed/Dispatched)
            if (hasCourierData) {
                const isDispatched = courierOrder!.status !== OrderStatus.BOOKED && 
                                     courierOrder!.status !== OrderStatus.PENDING &&
                                     courierOrder!.status !== OrderStatus.CANCELLED;
                const isDelivered = courierOrder!.status === OrderStatus.DELIVERED;
                const isRto = courierOrder!.status === OrderStatus.RETURNED || courierOrder!.status === OrderStatus.RTO_INITIATED;

                if (isDispatched) pStat.dispatched += 1;
                if (isDelivered) pStat.delivered += 1;
                if (isRto) pStat.rto += 1;
            }

            // Determine display status for the drill-down
            let displayStatus = 'PENDING';
            let isMissed = false;

            if (isShopifyCancelled) {
                displayStatus = 'CANCELLED';
            } else if (courierOrder) {
                displayStatus = courierOrder.status;
            } else {
                displayStatus = 'PENDING / MISSED';
                isMissed = true;
            }

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
        }
    });

    // Filter by search term if exists
    let results = Array.from(productStats.values());
    if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        results = results.filter(p => p.name.toLowerCase().includes(lower) || p.sku.toLowerCase().includes(lower));
    }

    return results.sort((a,b) => b.shopifyDemand - a.shopifyDemand);
  }, [shopifyOrders, courierOrders, products, searchTerm, dateRange]);

  const toggleRow = (fingerprint: string) => {
      if (expandedFingerprint === fingerprint) setExpandedFingerprint(null);
      else setExpandedFingerprint(fingerprint);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Reconciliation</h2>
                <p className="text-slate-500 text-sm">Compare Shopify demand vs Courier fulfillment per product (Order Count).</p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-300 shadow-sm text-sm">
                    <Calendar size={16} className="text-slate-500" />
                    <input 
                      type="date" 
                      value={dateRange.start}
                      onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                      className="text-slate-700 bg-transparent border-none focus:ring-0 outline-none w-28 font-medium cursor-pointer"
                    />
                    <span className="text-slate-400">to</span>
                    <input 
                      type="date" 
                      value={dateRange.end}
                      onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                      className="text-slate-700 bg-transparent border-none focus:ring-0 outline-none w-28 font-medium cursor-pointer"
                    />
                </div>

                <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Search Product..." 
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 shadow-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
        </div>

        {/* Clean Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[900px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                        <th className="px-4 py-4 font-bold text-slate-700 w-[25%] uppercase tracking-wider text-xs">Product</th>
                        <th className="px-2 py-4 font-bold text-slate-700 text-center uppercase tracking-wider text-xs bg-slate-100/50">
                            Demand (Orders)
                        </th>
                        
                        {/* Breakdown Columns */}
                        <th className="px-2 py-4 font-bold text-slate-700 text-center uppercase tracking-wider text-xs bg-blue-50/30">
                             Confirmed
                        </th>
                        <th className="px-2 py-4 font-bold text-slate-700 text-center uppercase tracking-wider text-xs">
                             Cancelled
                        </th>
                        <th className="px-2 py-4 font-bold text-slate-700 text-center uppercase tracking-wider text-xs bg-red-50/30">
                             Pending
                        </th>

                        {/* Logistics Flow */}
                        <th className="px-2 py-4 font-bold text-slate-500 text-center uppercase tracking-wider text-xs border-l border-slate-100">
                             Dispatched
                        </th>
                        <th className="px-2 py-4 font-bold text-slate-500 text-center uppercase tracking-wider text-xs">
                             Delivered
                        </th>
                         <th className="px-2 py-4 font-bold text-red-600 text-center uppercase tracking-wider text-xs">
                             RTO
                        </th>
                        <th className="w-8"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {stats.map((p, idx) => {
                        const isExpanded = expandedFingerprint === p.fingerprint;
                        
                        return (
                            <React.Fragment key={p.fingerprint}>
                                <tr 
                                    className={`cursor-pointer transition-colors ${isExpanded ? 'bg-slate-50 border-b-0' : 'hover:bg-slate-50 border-b border-slate-100'}`}
                                    onClick={() => toggleRow(p.fingerprint)}
                                >
                                    <td className="px-4 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                                                {p.img ? <img src={p.img} alt="" className="w-full h-full object-cover rounded" /> : <Package size={14} className="text-slate-400" />}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-medium text-slate-900 line-clamp-1 text-sm" title={p.name}>{p.name}</div>
                                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">{p.sku}</div>
                                            </div>
                                        </div>
                                    </td>
                                    
                                    {/* Demand */}
                                    <td className="px-2 py-4 text-center bg-slate-50/50 font-bold text-slate-800 border-x border-slate-100">
                                        {p.shopifyDemand}
                                    </td>

                                    {/* Confirmed */}
                                    <td className="px-2 py-4 text-center bg-blue-50/10">
                                        <div className="flex flex-col items-center justify-center">
                                            <span className={`font-semibold ${p.confirmed > 0 ? 'text-blue-700' : 'text-slate-300'}`}>
                                                {p.confirmed}
                                            </span>
                                            {p.confirmed > 0 && (
                                                <span className="text-[10px] text-blue-400 font-medium mt-0.5">
                                                    {Math.round((p.confirmed / p.shopifyDemand) * 100)}%
                                                </span>
                                            )}
                                        </div>
                                    </td>

                                    {/* Cancelled */}
                                    <td className="px-2 py-4 text-center">
                                        <div className="flex flex-col items-center justify-center">
                                            <span className={`${p.cancelled > 0 ? 'text-slate-500 font-medium' : 'text-slate-200'}`}>
                                                {p.cancelled}
                                            </span>
                                            {p.cancelled > 0 && (
                                                <span className="text-[10px] text-slate-400 font-medium mt-0.5">
                                                    {Math.round((p.cancelled / p.shopifyDemand) * 100)}%
                                                </span>
                                            )}
                                        </div>
                                    </td>

                                    {/* Pending / Leakage */}
                                    <td className="px-2 py-4 text-center bg-red-50/10">
                                        {p.pending > 0 ? (
                                            <div className="flex flex-col items-center justify-center gap-1">
                                                <div className="flex items-center justify-center gap-1 text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded-full text-xs w-fit">
                                                    <AlertCircle size={12} /> {p.pending}
                                                </div>
                                                <span className="text-[10px] text-red-400 font-medium">
                                                    {Math.round((p.pending / p.shopifyDemand) * 100)}%
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-slate-200">-</span>
                                        )}
                                    </td>

                                    {/* Dispatched */}
                                    <td className="px-2 py-4 text-center border-l border-slate-100">
                                        <span className={`${p.dispatched > 0 ? 'text-indigo-600 font-medium' : 'text-slate-300'}`}>
                                            {p.dispatched}
                                        </span>
                                    </td>

                                    {/* Delivered */}
                                    <td className="px-2 py-4 text-center">
                                         <span className={`${p.delivered > 0 ? 'bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold' : 'text-slate-300'}`}>
                                            {p.delivered}
                                        </span>
                                    </td>

                                    {/* RTO */}
                                    <td className="px-2 py-4 text-center">
                                        <span className={`${p.rto > 0 ? 'text-red-600 font-bold' : 'text-slate-300'}`}>
                                            {p.rto > 0 ? p.rto : '-'}
                                        </span>
                                    </td>
                                    
                                    <td className="pr-4 text-slate-400">
                                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    </td>
                                </tr>

                                {/* Expanded Details Row */}
                                {isExpanded && (
                                    <tr className="bg-slate-50">
                                        <td colSpan={9} className="px-4 py-4 md:px-12">
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
                            <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                                No data available for the selected period.
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
        return <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold">PENDING / MISSED</span>;
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