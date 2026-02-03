
import React, { useState } from 'react';
import { Order, OrderStatus, ShopifyOrder } from '../types';
import { formatCurrency } from '../services/calculator';
import { Radio, AlertCircle, Database, CheckCircle2, XCircle, Search, ArrowRight, RefreshCw, FileQuestion } from 'lucide-react';

interface TcsDebugProps {
  orders: Order[];
  shopifyOrders: ShopifyOrder[];
}

const TcsDebug: React.FC<TcsDebugProps> = ({ orders, shopifyOrders }) => {
  const [viewMode, setViewMode] = useState<'matched' | 'raw'>('raw');
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Orders successfully tracked by App.tsx logic
  const trackingOrders = orders.filter(o => o.data_source === 'tracking');

  // 2. Filter Raw Orders for search
  const filteredRawOrders = shopifyOrders.filter(o => 
      o.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.tags && o.tags.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Health Check */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                  <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                      <Radio className="text-red-600" /> TCS Integration Monitor
                  </h2>
                  <p className="text-slate-500 text-sm mt-1">
                      Diagnose why orders are appearing (or missing) from the tracker.
                  </p>
              </div>
              <div className="flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
                  <div className="text-center">
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Fetched</p>
                      <p className={`text-xl font-bold ${shopifyOrders.length === 0 ? 'text-red-600' : 'text-slate-900'}`}>
                          {shopifyOrders.length}
                      </p>
                  </div>
                  <div className="w-px h-8 bg-slate-200"></div>
                  <div className="text-center">
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Matched TCS</p>
                      <p className="text-xl font-bold text-blue-600">
                          {trackingOrders.length}
                      </p>
                  </div>
              </div>
          </div>

          {shopifyOrders.length === 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3 text-red-800 mb-4">
                  <AlertCircle className="shrink-0" />
                  <div>
                      <h4 className="font-bold text-sm">No Data Received from Shopify</h4>
                      <p className="text-xs mt-1">
                          The app has fetched <strong>0 orders</strong>. This means the connection to Shopify is active but returning empty lists, or the connection failed silently.
                      </p>
                      <ul className="list-disc list-inside text-xs mt-2 space-y-1">
                          <li>Check <strong>Integrations</strong> page: Is the Access Token valid?</li>
                          <li>Are there orders in the last <strong>120 days</strong>?</li>
                          <li>Does the token have <code>read_orders</code> permission?</li>
                      </ul>
                  </div>
              </div>
          )}

          {/* View Toggles */}
          <div className="flex gap-2 border-b border-slate-200">
              <button 
                  onClick={() => setViewMode('raw')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                      viewMode === 'raw' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
              >
                  <Database size={16} /> All Fetched Orders (Raw)
              </button>
              <button 
                  onClick={() => setViewMode('matched')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                      viewMode === 'matched' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
              >
                  <CheckCircle2 size={16} /> Matched TCS Orders
              </button>
          </div>
      </div>

      {/* --- VIEW: ALL RAW ORDERS --- */}
      {viewMode === 'raw' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                      <FileQuestion size={16} />
                      <span>Showing all data from Shopify API (Unfiltered)</span>
                  </div>
                  <div className="relative">
                      <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                      <input 
                          type="text" 
                          placeholder="Search Order # or Tags..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-9 pr-4 py-2 border rounded-lg text-xs w-64 focus:ring-2 focus:ring-slate-500 outline-none"
                      />
                  </div>
              </div>
              <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-100 text-slate-500 uppercase font-bold border-b border-slate-200">
                          <tr>
                              <th className="px-4 py-3">Order</th>
                              <th className="px-4 py-3">Created At</th>
                              <th className="px-4 py-3">Fulfillment</th>
                              <th className="px-4 py-3">Tags</th>
                              <th className="px-4 py-3">Tracking Data</th>
                              <th className="px-4 py-3">System Analysis</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {filteredRawOrders.slice(0, 100).map(o => {
                              const hasTcsTag = (o.tags || '').toLowerCase().includes('tcs');
                              const fulfillment = o.fulfillments?.[0];
                              const company = fulfillment?.tracking_company?.toLowerCase() || '';
                              const trackNo = fulfillment?.tracking_number || '';
                              
                              let analysis = "Ignored";
                              let color = "text-slate-400";

                              if (o.fulfillment_status !== 'fulfilled' && o.fulfillment_status !== 'partial') {
                                  analysis = "Status not Fulfilled";
                              } else if (hasTcsTag) {
                                  analysis = "Candidate (Tag Match)";
                                  color = "text-green-600 font-bold";
                              } else if (company.includes('tcs')) {
                                  analysis = "Candidate (Company Match)";
                                  color = "text-green-600 font-bold";
                              } else if (trackNo && /^\d{9,16}$/.test(trackNo)) {
                                  analysis = "Candidate (Format Match)";
                                  color = "text-blue-600 font-bold";
                              } else {
                                  analysis = "No Match Criteria";
                              }

                              return (
                                  <tr key={o.id} className="hover:bg-slate-50">
                                      <td className="px-4 py-3 font-bold text-slate-800">{o.name}</td>
                                      <td className="px-4 py-3 text-slate-500">{new Date(o.created_at).toLocaleDateString()}</td>
                                      <td className="px-4 py-3">
                                          <span className={`px-2 py-1 rounded ${
                                              o.fulfillment_status === 'fulfilled' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                          }`}>
                                              {o.fulfillment_status || 'Unfulfilled'}
                                          </span>
                                      </td>
                                      <td className="px-4 py-3">
                                          {o.tags ? (
                                              <span className="bg-slate-100 px-2 py-1 rounded break-words max-w-[150px] block">
                                                  {o.tags}
                                              </span>
                                          ) : <span className="text-slate-300">-</span>}
                                      </td>
                                      <td className="px-4 py-3">
                                          {fulfillment ? (
                                              <div className="flex flex-col gap-1">
                                                  <span className="font-bold">Co: {fulfillment.tracking_company || 'N/A'}</span>
                                                  <span>#: {fulfillment.tracking_number || 'N/A'}</span>
                                              </div>
                                          ) : <span className="text-red-400">No Fulfillment Obj</span>}
                                      </td>
                                      <td className={`px-4 py-3 ${color}`}>
                                          {analysis}
                                      </td>
                                  </tr>
                              );
                          })}
                          {filteredRawOrders.length === 0 && (
                              <tr>
                                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                      {shopifyOrders.length === 0 ? "No orders fetched from Shopify API." : "No orders match search."}
                                  </td>
                              </tr>
                          )}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {/* --- VIEW: MATCHED ORDERS --- */}
      {viewMode === 'matched' && (
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
                                  No orders currently matched. Check the Raw Data Inspector tab to see why.
                              </td>
                          </tr>
                      )}
                  </tbody>
              </table>
          </div>
      )}
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
