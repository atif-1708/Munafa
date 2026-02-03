
import React, { useState, useMemo } from 'react';
import { Order, ShopifyOrder } from '../types';
import { formatCurrency } from '../services/calculator';
import { Radio, Database, CheckCircle2, Search, AlertTriangle, Filter, Package, ChevronRight } from 'lucide-react';

interface TcsDebugProps {
  orders: Order[];
  shopifyOrders: ShopifyOrder[];
}

const TcsDebug: React.FC<TcsDebugProps> = ({ orders = [], shopifyOrders = [] }) => {
  const [viewMode, setViewMode] = useState<'matched' | 'raw'>('raw');
  const [searchTerm, setSearchTerm] = useState('');
  
  // DEFAULT TO FALSE: Show all orders immediately to ensure page is not blank
  const [showOnlyTcsCandidates, setShowOnlyTcsCandidates] = useState(false);

  // SAFEGUARD: Ensure inputs are arrays to prevent crashes
  const safeOrders = useMemo(() => Array.isArray(orders) ? orders : [], [orders]);
  const safeShopifyOrders = useMemo(() => Array.isArray(shopifyOrders) ? shopifyOrders : [], [shopifyOrders]);

  // 1. Matched Orders (Successfully tracked by App)
  const trackingOrders = useMemo(() => 
    safeOrders.filter(o => o.data_source === 'tracking'), 
  [safeOrders]);

  // Helper to safely determine if an order looks like TCS
  const isTcsCandidate = (o: ShopifyOrder) => {
      if (!o) return false;
      const tags = o.tags ? String(o.tags).toLowerCase() : '';
      const hasTcsTag = tags.includes('tcs');
      
      const fulfillments = Array.isArray(o.fulfillments) ? o.fulfillments : [];
      const fulfillment = fulfillments.length > 0 ? fulfillments[0] : null;
      
      const company = fulfillment?.tracking_company ? String(fulfillment.tracking_company).toLowerCase() : '';
      const trackNo = fulfillment?.tracking_number ? String(fulfillment.tracking_number) : '';
      
      // Check for TCS format (9-16 digits)
      const cleanTrackNo = trackNo.replace(/[^0-9]/g,'');
      const isFormatMatch = cleanTrackNo.length >= 9 && cleanTrackNo.length <= 16;
      
      // Exclude known competitors
      const isOtherCourier = company.includes('trax') || company.includes('leopard') || company.includes('postex') || company.includes('mnp') || company.includes('callcourier');

      return hasTcsTag || company.includes('tcs') || (isFormatMatch && !isOtherCourier);
  };

  // 2. Filter Raw Orders
  const filteredRawOrders = useMemo(() => {
      let data = safeShopifyOrders;

      // Filter by TCS Likelihood
      if (showOnlyTcsCandidates) {
          data = data.filter(isTcsCandidate);
      }

      // Filter by Search
      if (searchTerm) {
          const lowerTerm = searchTerm.toLowerCase();
          data = data.filter(o => {
              if (!o) return false;
              const name = (o.name || '').toLowerCase();
              const tags = (o.tags || '').toLowerCase();
              
              const items = Array.isArray(o.line_items) ? o.line_items : [];
              const hasItemMatch = items.some(i => (i.title || '').toLowerCase().includes(lowerTerm));
              
              return name.includes(lowerTerm) || tags.includes(lowerTerm) || hasItemMatch;
          });
      }
      return data;
  }, [safeShopifyOrders, searchTerm, showOnlyTcsCandidates]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Stats */}
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
                  <Database size={16} /> Raw Data Inspector
              </button>
              <button 
                  onClick={() => setViewMode('matched')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                      viewMode === 'matched' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
              >
                  <CheckCircle2 size={16} /> Matched & Tracked
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

      {/* --- VIEW: RAW ORDERS --- */}
      {viewMode === 'raw' && safeShopifyOrders.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setShowOnlyTcsCandidates(!showOnlyTcsCandidates)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${
                            showOnlyTcsCandidates 
                                ? 'bg-red-100 text-red-700 border-red-200' 
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                          <Filter size={14} />
                          {showOnlyTcsCandidates ? 'Filter: Just TCS' : 'Show All Orders'}
                      </button>
                      <span className="text-xs text-slate-500">
                          {filteredRawOrders.length} orders
                      </span>
                  </div>
                  
                  <div className="relative w-full sm:w-auto">
                      <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                      <input 
                          type="text" 
                          placeholder="Search Order # or Product..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-9 pr-4 py-2 border rounded-lg text-xs w-full sm:w-64 focus:ring-2 focus:ring-slate-500 outline-none"
                      />
                  </div>
              </div>
              <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-100 text-slate-500 uppercase font-bold border-b border-slate-200">
                          <tr>
                              <th className="px-4 py-3">Order</th>
                              <th className="px-4 py-3">Date</th>
                              <th className="px-4 py-3 w-[35%]">Items</th>
                              <th className="px-4 py-3">Tracking</th>
                              <th className="px-4 py-3">Tags</th>
                              <th className="px-4 py-3">Analysis</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {filteredRawOrders.slice(0, 100).map((o, idx) => {
                              // ULTRA-SAFE ROW RENDERING
                              if (!o) return null;

                              const id = o.id || idx;
                              const name = o.name || 'Unknown';
                              
                              let date = 'N/A';
                              try {
                                date = o.created_at ? new Date(o.created_at).toLocaleDateString() : 'N/A';
                              } catch (e) { date = 'Inv Date'; }

                              const tags = o.tags || '';
                              const hasTcsTag = tags.toLowerCase().includes('tcs');
                              
                              const fulfillments = Array.isArray(o.fulfillments) ? o.fulfillments : [];
                              const fulfillment = fulfillments.length > 0 ? fulfillments[0] : null;
                              
                              const company = fulfillment?.tracking_company || 'None';
                              const trackNo = fulfillment?.tracking_number || 'None';
                              
                              // Item Processing
                              const lineItems = Array.isArray(o.line_items) ? o.line_items : [];
                              const itemsDisplay = lineItems.map(i => {
                                  const q = i.quantity || 0;
                                  const t = i.title || 'Unknown Item';
                                  return `${q}x ${t}`;
                              }).join(', ');

                              let analysis = "Ignored";
                              let color = "text-slate-400";
                              const status = o.fulfillment_status || 'unfulfilled';

                              if (status !== 'fulfilled' && status !== 'partial') {
                                  analysis = "Unfulfilled";
                              } else if (hasTcsTag) {
                                  analysis = "Match: Tag";
                                  color = "text-green-600 font-bold";
                              } else if (String(company).toLowerCase().includes('tcs')) {
                                  analysis = "Match: Company";
                                  color = "text-green-600 font-bold";
                              } else if (trackNo && /^\d{9,16}$/.test(String(trackNo).replace(/[^0-9]/g,''))) {
                                  analysis = "Match: Format";
                                  color = "text-blue-600 font-bold";
                              } else {
                                  analysis = "No Match";
                              }

                              return (
                                  <tr key={id} className="hover:bg-slate-50">
                                      <td className="px-4 py-3 font-bold text-slate-800 align-top">{name}</td>
                                      <td className="px-4 py-3 text-slate-500 align-top">{date}</td>
                                      <td className="px-4 py-3 text-slate-600 align-top">
                                          <div className="flex items-start gap-2 max-h-20 overflow-y-auto">
                                              <Package size={14} className="mt-0.5 shrink-0 text-slate-400" />
                                              <span className="leading-tight text-[11px] break-words max-w-[200px] block">
                                                  {itemsDisplay || 'No Items'}
                                              </span>
                                          </div>
                                      </td>
                                      <td className="px-4 py-3 align-top">
                                          {fulfillment ? (
                                              <div className="flex flex-col gap-1">
                                                  <span className="font-bold truncate max-w-[100px]">{company}</span>
                                                  <span className="truncate max-w-[100px]">{trackNo}</span>
                                              </div>
                                          ) : <span className="text-red-400">No Fulfillment</span>}
                                      </td>
                                      <td className="px-4 py-3 max-w-[100px] align-top">
                                          <div className="truncate" title={tags}>{tags || '-'}</div>
                                      </td>
                                      <td className={`px-4 py-3 align-top ${color}`}>
                                          {analysis}
                                      </td>
                                  </tr>
                              );
                          })}
                          {filteredRawOrders.length === 0 && (
                              <tr>
                                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                      No orders found.
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
                          <th className="px-6 py-4 w-[35%]">Items</th>
                          <th className="px-6 py-4">Tracking Number</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4">Est. COD</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {trackingOrders.length > 0 ? trackingOrders.map((o, idx) => (
                          <tr key={o.id || idx} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 font-medium text-slate-900 align-top">
                                  {o.shopify_order_number}
                              </td>
                              <td className="px-6 py-4 text-slate-600 text-xs align-top">
                                  {(o.items || []).map(i => `${i.quantity}x ${i.product_name}`).join(', ') || 'No Items'}
                              </td>
                              <td className="px-6 py-4 text-slate-600 font-mono align-top">
                                  {o.tracking_number}
                              </td>
                              <td className="px-6 py-4 align-top">
                                  <span className="bg-slate-100 px-2 py-1 rounded text-xs">{o.status}</span>
                              </td>
                              <td className="px-6 py-4 font-medium align-top">
                                  {formatCurrency(o.cod_amount)}
                              </td>
                          </tr>
                      )) : (
                          <tr>
                              <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
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
