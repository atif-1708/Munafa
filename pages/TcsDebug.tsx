
import React, { useMemo, useState } from 'react';
import { Order, OrderStatus, ShopifyOrder } from '../types';
import { formatCurrency } from '../services/calculator';
import { Radio, AlertCircle, Search, HelpCircle, Code, ChevronDown, ChevronUp } from 'lucide-react';

interface TcsDebugProps {
  orders: Order[];
  shopifyOrders: ShopifyOrder[];
}

const TcsDebug: React.FC<TcsDebugProps> = ({ orders, shopifyOrders }) => {
  const [showRaw, setShowRaw] = useState(false);

  // 1. Orders successfully tracked by App.tsx
  const trackingOrders = orders.filter(o => o.data_source === 'tracking');
  
  // 2. Orders that *might* be TCS but weren't picked up
  const missedOpportunities = useMemo(() => {
      const alreadyTracked = new Set(orders.map(o => o.shopify_order_number.replace('#','')));
      
      const results: { order: ShopifyOrder, reason: string }[] = [];

      // Filter last 120 days to match sync
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 120);

      shopifyOrders.forEach(s => {
          // Ignore if already synced
          if (alreadyTracked.has(s.name.replace('#',''))) return;

          // Check Tag
          const hasTcsTag = (s.tags || '').toLowerCase().includes('tcs');
          
          // Check Fulfillment
          const tcsFulfillment = s.fulfillments?.find(f => {
              const company = (f.tracking_company || '').toLowerCase();
              const num = (f.tracking_number || '').replace(/[^a-zA-Z0-9]/g, '');
              const isOther = company.includes('trax') || company.includes('leopard') || company.includes('postex');
              if (isOther) return false;
              return company.includes('tcs') || /^\d{9,16}$/.test(num);
          });

          // Candidates are those that look like TCS or are tagged TCS
          if (hasTcsTag || tcsFulfillment) {
              let reason = "Unknown";
              
              const isFulfilled = s.fulfillment_status === 'fulfilled' || s.fulfillment_status === 'partial';
              const dateOk = new Date(s.created_at) >= cutoffDate;

              if (!dateOk) {
                  reason = "Order older than 120 days (Sync Limit)";
              } else if (!isFulfilled) {
                  reason = "Order status is Unfulfilled";
              } else {
                  // It is fulfilled and in date range. Why missed?
                  if (!s.fulfillments || s.fulfillments.length === 0) {
                      reason = "No Fulfillment Object found in Shopify Data";
                  } else {
                      // Check for ANY tracking number if tagged
                      const anyTracking = s.fulfillments.find(f => f.tracking_number);
                      
                      if (!anyTracking) {
                          reason = "No Tracking Number entered in Fulfillment";
                      } else if (!tcsFulfillment && !hasTcsTag) {
                          // This shouldn't happen due to parent if, but logic check
                          reason = "Tracking Company not TCS & No Tag";
                      } else if (hasTcsTag && !tcsFulfillment) {
                          // Has Tag, but fulfillment analysis failed. 
                          // If we are here, it means App.tsx logic failed to match the fallback
                          reason = `Tagged TCS but Tracking Number '${anyTracking.tracking_number}' format rejected or Company '${anyTracking.tracking_company}' is treated as Other.`;
                      } else {
                          reason = "Pending Sync (Try refreshing or checking console)";
                      }
                  }
              }
              
              results.push({ order: s, reason });
          }
      });

      return results.sort((a,b) => new Date(b.order.created_at).getTime() - new Date(a.order.created_at).getTime());
  }, [shopifyOrders, orders]);

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center gap-3">
          <div className="bg-red-50 p-2 rounded-lg text-red-600">
              <Radio size={24} />
          </div>
          <div>
              <h2 className="text-2xl font-bold text-slate-900">TCS Live Tracking Monitor</h2>
              <p className="text-slate-500 text-sm">
                  Orders tracked individually via TCS API (bypassing Settlement Report).
              </p>
          </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex gap-3 text-blue-900">
          <AlertCircle size={20} className="shrink-0 mt-0.5" />
          <div className="text-sm">
              <strong>Status:</strong> {trackingOrders.length} orders currently being tracked live. <br/>
              <strong>Note:</strong> We scan orders from the last 120 days that are tagged <code>Shipped by TCS Courier</code> or have <code>TCS</code> in the tracking company.
          </div>
      </div>

      {/* Main Tracked Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-700 text-sm">Successfully Synced</h3>
            <span className="text-xs text-slate-500">{trackingOrders.length} Orders</span>
        </div>
        <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 uppercase text-xs font-bold text-slate-500">
                <tr>
                    <th className="px-6 py-4">Shopify Ref</th>
                    <th className="px-6 py-4">Tracking Number</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Est. COD</th>
                    <th className="px-6 py-4">Date</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {trackingOrders.length > 0 ? trackingOrders.map(o => (
                    <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900">
                            {o.shopify_order_number}
                        </td>
                        <td className="px-6 py-4 text-slate-600 font-mono">
                            {o.tracking_number}
                        </td>
                        <td className="px-6 py-4">
                            <StatusBadge status={o.status} />
                        </td>
                        <td className="px-6 py-4 font-medium">
                            {formatCurrency(o.cod_amount)}
                        </td>
                        <td className="px-6 py-4 text-slate-500">
                            {new Date(o.created_at).toLocaleDateString()}
                        </td>
                    </tr>
                )) : (
                    <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                            No orders currently found via live tracking. <br/>
                            <span className="text-xs">If you expect orders here, check the Diagnostic table below.</span>
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
      </div>

      {/* Diagnostic Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <div className="flex items-center gap-2">
                <HelpCircle size={16} className="text-orange-500" />
                <h3 className="font-bold text-slate-700 text-sm">Diagnostic: Potential Missed Orders</h3>
            </div>
            <span className="text-xs text-slate-500">{missedOpportunities.length} Candidates</span>
        </div>
        <div className="bg-orange-50 px-6 py-3 text-xs text-orange-800 border-b border-orange-100">
            These orders contain "TCS" in tags or fulfillment but are NOT being tracked. Check the "Reason Skipped" column.
        </div>
        <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 uppercase text-xs font-bold text-slate-500 sticky top-0">
                    <tr>
                        <th className="px-6 py-3">Order</th>
                        <th className="px-6 py-3">Date</th>
                        <th className="px-6 py-3">Tags</th>
                        <th className="px-6 py-3">Fulfillment Status</th>
                        <th className="px-6 py-3 text-red-600">Reason Skipped</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {missedOpportunities.length > 0 ? missedOpportunities.map(({ order, reason }) => (
                        <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-3 font-medium text-slate-900">
                                {order.name}
                            </td>
                            <td className="px-6 py-3 text-slate-600 text-xs">
                                {new Date(order.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-3">
                                {order.tags ? (
                                    <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs">
                                        {order.tags}
                                    </span>
                                ) : <span className="text-slate-300">-</span>}
                            </td>
                            <td className="px-6 py-3">
                                <span className={`text-xs font-bold px-2 py-1 rounded ${
                                    order.fulfillment_status === 'fulfilled' ? 'bg-green-100 text-green-700' : 
                                    order.fulfillment_status === 'partial' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-500'
                                }`}>
                                    {order.fulfillment_status || 'Unfulfilled'}
                                </span>
                            </td>
                            <td className="px-6 py-3 text-red-600 font-medium text-xs">
                                {reason}
                            </td>
                        </tr>
                    )) : (
                        <tr>
                            <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                                No missed orders detected. All potential TCS orders seem to be syncing correctly.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>

      {/* RAW DATA INSPECTOR */}
      <div className="border-t border-slate-200 pt-8 mt-8">
          <button 
            onClick={() => setShowRaw(!showRaw)}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-slate-800 transition-colors mx-auto"
          >
              <Code size={16} />
              {showRaw ? 'Hide Raw Data Inspector' : 'Show Raw Data Inspector'}
              {showRaw ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showRaw && (
              <div className="mt-6 bg-slate-100 p-4 rounded-xl border border-slate-300">
                  <h3 className="font-bold text-slate-900 mb-2">Raw Shopify Data Inspector (Last 20 Fulfilled Orders)</h3>
                  <p className="text-xs text-slate-500 mb-4">
                      This table shows the raw data coming from Shopify WITHOUT any filtering. Use this to verify if Tags or Tracking Company names are matching what you expect.
                  </p>
                  
                  {shopifyOrders.length === 0 ? (
                      <div className="bg-red-100 text-red-700 p-4 rounded-lg font-bold text-center border border-red-200">
                          CRITICAL: No Shopify Orders found in memory. Please check the Integrations page and ensure Shopify is connected and syncing.
                      </div>
                  ) : (
                      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
                          <table className="w-full text-left text-xs font-mono">
                              <thead className="bg-slate-200 text-slate-700 border-b border-slate-300">
                                  <tr>
                                      <th className="px-4 py-2">Order</th>
                                      <th className="px-4 py-2">Date</th>
                                      <th className="px-4 py-2">Tags (Raw)</th>
                                      <th className="px-4 py-2">Fulfillment Data</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                  {shopifyOrders
                                    .filter(o => o.fulfillment_status === 'fulfilled' || o.fulfillment_status === 'partial')
                                    .slice(0, 20)
                                    .map(o => (
                                      <tr key={o.id} className="hover:bg-slate-50">
                                          <td className="px-4 py-2 font-bold">{o.name}</td>
                                          <td className="px-4 py-2">{new Date(o.created_at).toLocaleDateString()}</td>
                                          <td className="px-4 py-2 text-blue-600 break-words max-w-xs">
                                              {o.tags ? o.tags : <span className="text-slate-300">No Tags</span>}
                                          </td>
                                          <td className="px-4 py-2 text-slate-600">
                                              {o.fulfillments && o.fulfillments.length > 0 ? (
                                                  o.fulfillments.map((f, i) => (
                                                      <div key={i} className="mb-1 p-1 bg-slate-50 rounded border border-slate-100">
                                                          <span className="block font-bold">Company: "{f.tracking_company}"</span>
                                                          <span className="block">Track #: {f.tracking_number}</span>
                                                      </div>
                                                  ))
                                              ) : (
                                                  <span className="text-red-500">Empty Fulfillments Array</span>
                                              )}
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  )}
              </div>
          )}
      </div>
    </div>
  );
};

const StatusBadge = ({ status }: { status: OrderStatus }) => {
    const styles = {
        [OrderStatus.DELIVERED]: 'bg-green-100 text-green-700',
        [OrderStatus.PENDING]: 'bg-yellow-100 text-yellow-700',
        [OrderStatus.BOOKED]: 'bg-indigo-100 text-indigo-700',
        [OrderStatus.IN_TRANSIT]: 'bg-blue-100 text-blue-700',
        [OrderStatus.RTO_INITIATED]: 'bg-orange-100 text-orange-700',
        [OrderStatus.RETURNED]: 'bg-red-100 text-red-700',
        [OrderStatus.CANCELLED]: 'bg-gray-100 text-gray-700',
    };
    
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${styles[status]}`}>
            {status.replace(/_/g, ' ')}
        </span>
    );
};

export default TcsDebug;
