
import React from 'react';
import { Order, OrderStatus } from '../types';
import { formatCurrency } from '../services/calculator';
import { Radio, AlertCircle } from 'lucide-react';

interface TcsDebugProps {
  orders: Order[];
}

const TcsDebug: React.FC<TcsDebugProps> = ({ orders }) => {
  const trackingOrders = orders.filter(o => o.data_source === 'tracking');
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
          <div className="bg-red-50 p-2 rounded-lg text-red-600">
              <Radio size={24} />
          </div>
          <div>
              <h2 className="text-2xl font-bold text-slate-900">TCS Live Tracking Monitor</h2>
              <p className="text-slate-500 text-sm">
                  Orders detected via Shopify Fulfillments and tracked individually (not found in Settlement API).
              </p>
          </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex gap-3 text-blue-900">
          <AlertCircle size={20} className="shrink-0 mt-0.5" />
          <div className="text-sm">
              <strong>How this works:</strong> Since TCS doesn't provide an API list of all booked orders, we:
              <ol className="list-decimal ml-4 mt-1 space-y-1 text-blue-800">
                  <li>Scan your Shopify orders for TCS tracking numbers.</li>
                  <li>Call the TCS <code>/shipmentinfo</code> endpoint for each number found.</li>
                  <li>If the order wasn't already in the Settlement Report (Payment API), we add it here.</li>
              </ol>
          </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
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
                            No orders found via live tracking backfill yet. <br/>
                            <span className="text-xs">Ensure you have entered a valid TCS Token and have Shopify Orders with 'TCS' in the tracking company or valid formats.</span>
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
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
