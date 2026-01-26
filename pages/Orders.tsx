import React, { useState } from 'react';
import { Order, OrderStatus, PaymentStatus } from '../types';
import { formatCurrency } from '../services/calculator';
import { Filter, Search } from 'lucide-react';

interface OrdersProps {
  orders: Order[];
}

const Orders: React.FC<OrdersProps> = ({ orders }) => {
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const filteredOrders = orders.filter(o => {
    const matchesSearch = o.shopify_order_number.toLowerCase().includes(search.toLowerCase()) || 
                          o.customer_city.toLowerCase().includes(search.toLowerCase());
    if (filter === 'ALL') return matchesSearch;
    if (filter === 'RTO') return matchesSearch && (o.status === OrderStatus.RETURNED || o.status === OrderStatus.RTO_INITIATED);
    if (filter === 'PENDING_PAYMENT') return matchesSearch && o.status === OrderStatus.DELIVERED && o.payment_status === PaymentStatus.UNPAID;
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-slate-900">Order Management</h2>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search Order # or City..." 
              className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg text-slate-600 hover:bg-slate-50 text-sm">
            <Filter size={18} />
            Filter
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {['ALL', 'RTO', 'PENDING_PAYMENT'].map(f => (
            <button 
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    filter === f ? 'bg-brand-600 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'
                }`}
            >
                {f.replace('_', ' ')}
            </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700">Order</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Date</th>
                <th className="px-6 py-4 font-semibold text-slate-700">City</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Status</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Finances</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Courier</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Remittance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{order.shopify_order_number}</div>
                    <div className="text-xs text-slate-500">{order.items.length} items</div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {new Date(order.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {order.customer_city}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium">{formatCurrency(order.cod_amount)}</div>
                    <div className="text-xs text-red-500">
                        {order.status === OrderStatus.RETURNED 
                            ? `-${formatCurrency(order.courier_fee + order.rto_penalty)} (Loss)` 
                            : `-${formatCurrency(order.courier_fee)} (Ship)`}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-xs font-medium text-slate-700">
                      {order.courier}
                    </span>
                    <div className="text-xs text-slate-400 mt-1">{order.tracking_number}</div>
                  </td>
                  <td className="px-6 py-4">
                    {order.status === OrderStatus.DELIVERED ? (
                        order.payment_status === PaymentStatus.REMITTED ? (
                            <span className="text-xs font-bold text-green-600 flex items-center gap-1">
                                ● Paid
                            </span>
                        ) : (
                            <span className="text-xs font-bold text-amber-600 flex items-center gap-1">
                                ● Pending
                            </span>
                        )
                    ) : (
                        <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const StatusBadge = ({ status }: { status: OrderStatus }) => {
    const styles = {
        [OrderStatus.DELIVERED]: 'bg-green-100 text-green-700',
        [OrderStatus.PENDING]: 'bg-yellow-100 text-yellow-700',
        [OrderStatus.IN_TRANSIT]: 'bg-blue-100 text-blue-700',
        [OrderStatus.RTO_INITIATED]: 'bg-orange-100 text-orange-700',
        [OrderStatus.RETURNED]: 'bg-red-100 text-red-700',
        [OrderStatus.CANCELLED]: 'bg-gray-100 text-gray-700',
    };

    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
            {status.replace('_', ' ')}
        </span>
    );
};

export default Orders;