import React, { useState } from 'react';
import { Order, OrderStatus, PaymentStatus } from '../types';
import { formatCurrency } from '../services/calculator';
import { Filter, Search, Calendar } from 'lucide-react';

interface OrdersProps {
  orders: Order[];
}

const Orders: React.FC<OrdersProps> = ({ orders }) => {
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const filteredOrders = orders.filter(o => {
    // 1. Search Filter
    const matchesSearch = o.shopify_order_number.toLowerCase().includes(search.toLowerCase()) || 
                          o.customer_city.toLowerCase().includes(search.toLowerCase()) ||
                          o.items.some(i => i.sku?.toLowerCase().includes(search.toLowerCase()));
    if (!matchesSearch) return false;

    // 2. Date Range Filter
    if (dateRange.start) {
        const start = new Date(dateRange.start);
        start.setHours(0, 0, 0, 0);
        if (new Date(o.created_at) < start) return false;
    }
    if (dateRange.end) {
        const end = new Date(dateRange.end);
        end.setHours(23, 59, 59, 999);
        if (new Date(o.created_at) > end) return false;
    }

    // 3. Status Category Filter
    if (filter === 'ALL') return true;
    if (filter === 'UNBOOKED') return o.status === OrderStatus.PENDING;
    if (filter === 'BOOKED') return o.status === OrderStatus.BOOKED;
    if (filter === 'IN_TRANSIT') return o.status === OrderStatus.IN_TRANSIT;
    if (filter === 'DELIVERED') return o.status === OrderStatus.DELIVERED;
    if (filter === 'RETURNED') return o.status === OrderStatus.RETURNED || o.status === OrderStatus.RTO_INITIATED;
    
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <h2 className="text-2xl font-bold text-slate-900">Order Management</h2>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
          {/* Date Filters */}
          <div className="flex items-center gap-2 bg-white px-3 py-2 border rounded-lg text-sm">
            <Calendar size={16} className="text-slate-400" />
            <input 
              type="date" 
              placeholder="Start"
              className="outline-none text-slate-600 bg-transparent w-32"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({...prev, start: e.target.value}))}
            />
            <span className="text-slate-300">|</span>
            <input 
              type="date" 
              placeholder="End"
              className="outline-none text-slate-600 bg-transparent w-32"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({...prev, end: e.target.value}))}
            />
          </div>

          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search Order #, City, SKU..." 
              className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg text-slate-600 hover:bg-slate-50 text-sm whitespace-nowrap">
            <Filter size={18} />
            Filter
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {['ALL', 'UNBOOKED', 'BOOKED', 'IN_TRANSIT', 'DELIVERED', 'RETURNED'].map(f => (
            <button 
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    filter === f ? 'bg-brand-600 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'
                }`}
            >
                {f === 'ALL' ? 'All Orders' : f.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
            </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700">Order & SKU</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Date</th>
                <th className="px-6 py-4 font-semibold text-slate-700">City</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Status</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Finances</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Courier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOrders.length > 0 ? filteredOrders.map((order) => {
                // Determine if charges apply
                const isCharged = order.status !== OrderStatus.PENDING && 
                                  order.status !== OrderStatus.BOOKED && 
                                  order.status !== OrderStatus.CANCELLED;

                return (
                <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{order.shopify_order_number}</div>
                    <div className="text-xs text-slate-500 font-mono mt-1">
                      {order.items.map(i => i.sku || 'No SKU').join(', ')}
                    </div>
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
                    <div className="text-xs text-slate-500 mt-0.5">
                        {!isCharged && <span className="text-slate-400">Not Charged Yet</span>}
                        {isCharged && order.status === OrderStatus.DELIVERED && (
                            <span className="text-red-500">-{formatCurrency(order.courier_fee)} (Ship)</span>
                        )}
                        {isCharged && (order.status === OrderStatus.RETURNED || order.status === OrderStatus.RTO_INITIATED) && (
                            <span className="text-red-500">-{formatCurrency(order.courier_fee + order.rto_penalty)} (Loss)</span>
                        )}
                        {isCharged && order.status === OrderStatus.IN_TRANSIT && (
                             <span className="text-slate-500">Est. Ship: -{formatCurrency(order.courier_fee)}</span>
                        )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-xs font-medium text-slate-700">
                      {order.courier}
                    </span>
                    <div className="text-xs text-slate-400 mt-1">{order.tracking_number}</div>
                  </td>
                </tr>
              )}) : (
                  <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                          No orders found matching your filters.
                      </td>
                  </tr>
              )}
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
        [OrderStatus.BOOKED]: 'bg-indigo-100 text-indigo-700',
        [OrderStatus.IN_TRANSIT]: 'bg-blue-100 text-blue-700',
        [OrderStatus.RTO_INITIATED]: 'bg-orange-100 text-orange-700',
        [OrderStatus.RETURNED]: 'bg-red-100 text-red-700',
        [OrderStatus.CANCELLED]: 'bg-gray-100 text-gray-700',
    };
    
    const label = status === OrderStatus.PENDING ? 'UNBOOKED' : status.replace('_', ' ');

    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
            {label}
        </span>
    );
};

export default Orders;