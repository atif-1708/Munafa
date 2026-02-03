
import React, { useState, useMemo } from 'react';
import { Order, OrderStatus, ShopifyOrder } from '../types';
import { formatCurrency } from '../services/calculator';
import { Radio, Database, CheckCircle2, Search, FileQuestion, AlertTriangle } from 'lucide-react';

interface TcsDebugProps {
  orders: Order[];
  shopifyOrders: ShopifyOrder[];
}

const TcsDebug: React.FC<TcsDebugProps> = ({ orders = [], shopifyOrders = [] }) => {
  const [viewMode, setViewMode] = useState<'matched' | 'raw'>('raw');
  const [searchTerm, setSearchTerm] = useState('');

  // SAFEGUARD: Ensure arrays exist
  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeShopifyOrders = Array.isArray(shopifyOrders) ? shopifyOrders : [];

  // 1. Orders successfully tracked by App.tsx logic
  const trackingOrders = useMemo(() => 
    safeOrders.filter(o => o.data_source === 'tracking'), 
  [safeOrders]);

  // 2. Filter Raw Orders for search
  const filteredRawOrders = useMemo(() => {
      if (!searchTerm) return safeShopifyOrders;
      const lowerTerm = searchTerm.toLowerCase();
      return safeShopifyOrders.filter(o => 
          (o.name || '').toLowerCase().includes(lowerTerm) ||
          (o.tags && o.tags.toLowerCase().includes(lowerTerm))
      );
  }, [safeShopifyOrders, searchTerm]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Health Check */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                  <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                      <Radio className="text-red-600" /> TCS Monitor
                  </h2>
                  <p className="text-slate-500 text-sm mt-1">
                      Raw Data Inspector & Tracking Status
                  </p>
              </div>
              <div className="flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
                  <div className="text-center">
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Fetched</p>
                      <p className={`text-xl font-bold ${safeShopifyOrders.length === 0 ? 'text-red-600' : 'text-slate-900'}`}>
                          {safeShopifyOrders.length}
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

      {safeShopifyOrders.length === 0 && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg flex items-center gap-3 text-red-800">
              <AlertTriangle size={24} />
              <div>
                  <h3 className="font-bold">No Data Available</h3>
                  <p className="text-sm">Shopify did not return any orders. Please check Integrations page.</p>
              </div>
          </div>
      )}

      {/* --- VIEW: ALL RAW ORDERS --- */}
      {viewMode === 'raw' && safeShopifyOrders.length > 0 && (
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
                              <th className="px-4 py-3">Date</th>
                              <th className="px-4 py-3">Fulfillment</th>
                              <th className="px-4 py-3">Tags</th>
                              <th className="px-4 py-3">Analysis</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {filteredRawOrders.slice(0, 100).map(o => {
                              // SAFE GUARDED ACCESSORS
                              const name = o.name || 'Unknown';
                              const date = o.created_at ? new Date(o.created_at).toLocaleDateString() : 'No Date';
                              const hasTcsTag = (o.tags || '').toLowerCase().includes('tcs');
                              const fulfillment = o.fulfillments && o.fulfillments.length > 0 ? o.fulfillments[0] : null;
                              const company = fulfillment?.tracking_company || 'None';
                              const trackNo = fulfillment?.tracking_number || 'None';
                              
                              let analysis = "Ignored";
                              let color = "text-slate-400";

                              if (o.fulfillment_status !== 'fulfilled' && o.fulfillment_status !== 'partial') {
                                  analysis = "Unfulfilled";
                              } else if (hasTcsTag) {
                                  analysis = "Match: Tag";
                                  color = "text-green-600 font-bold";
                              } else if (company.toLowerCase().includes('tcs')) {
                                  analysis = "Match: Company";
                                  color = "text-green-600 font-bold";
                              } else if (trackNo && /^\d{9,16}$/.test(trackNo.replace(/[^0-9]/g,''))) {
                                  analysis = "Match: Format";
                                  color = "text-blue-600 font-bold";
                              } else {
                                  analysis = "No Match";
                              }

                              return (
                                  <tr key={o.id} className="hover:bg-slate-50">
                                      <td className="px-4 py-3 font-bold text-slate-800">{name}</td>
                                      <td className="px-4 py-3 text-slate-500">{date}</td>
                                      <td className="px-4 py-3">
                                          {fulfillment ? (
                                              <div className="flex flex-col gap-1">
                                                  <span className="font-bold">Co: {company}</span>
                                                  <span>#: {trackNo}</span>
                                              </div>
                                          ) : <span className="text-red-400">No Fulfillment</span>}
                                      </td>
                                      <td className="px-4 py-3 max-w-[150px] truncate" title={o.tags}>
                                          {o.tags || '-'}
                                      </td>
                                      <td className={`px-4 py-3 ${color}`}>
                                          {analysis}
                                      </td>
                                  </tr>
                              );
                          })}
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
                                  <span className="bg-slate-100 px-2 py-1 rounded text-xs">{o.status}</span>
                              </td>
                              <td className="px-6 py-4 font-medium">
                                  {formatCurrency(o.cod_amount)}
                              </td>
                          </tr>
                      )) : (
                          <tr>
                              <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                  No matched orders found.
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

export default TcsDebug;
