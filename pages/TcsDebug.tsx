
import React, { useState, useMemo } from 'react';
import { Order, ShopifyOrder, OrderStatus, IntegrationConfig } from '../types';
import { TcsAdapter } from '../services/couriers/tcs';
import { Radio, Database, CheckCircle2, Search, AlertTriangle, Filter, Package, RefreshCw, Loader2, PlayCircle, Terminal, Key } from 'lucide-react';

interface TcsDebugProps {
  orders: Order[];
  shopifyOrders: ShopifyOrder[];
  onTrackOrder?: (order: Order) => Promise<OrderStatus>;
  tcsConfig?: IntegrationConfig;
}

const TcsDebug: React.FC<TcsDebugProps> = ({ orders = [], shopifyOrders = [], onTrackOrder, tcsConfig }) => {
  const [viewMode, setViewMode] = useState<'matched' | 'raw'>('raw');
  const [searchTerm, setSearchTerm] = useState('');
  const [trackingIds, setTrackingIds] = useState<Set<string>>(new Set());
  
  // Manual Tracking State
  const [manualCn, setManualCn] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [manualResult, setManualResult] = useState<any>(null);
  const [isManualTracking, setIsManualTracking] = useState(false);

  // Bulk Scan State
  const [isBulkScanning, setIsBulkScanning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState('');
  const [stopSignal, setStopSignal] = useState(false);
  
  const [showOnlyTcsCandidates, setShowOnlyTcsCandidates] = useState(false);

  // SAFEGUARD: Ensure inputs are arrays to prevent crashes
  const safeOrders = useMemo(() => Array.isArray(orders) ? orders : [], [orders]);
  const safeShopifyOrders = useMemo(() => Array.isArray(shopifyOrders) ? shopifyOrders : [], [shopifyOrders]);

  const trackingOrders = useMemo(() => 
    safeOrders.filter(o => o.data_source === 'tracking'), 
  [safeOrders]);

  // --- MANUAL TRACKING LOGIC ---
  const handleManualTrace = async () => {
      if (!manualCn.trim()) {
          alert("Please enter a Tracking Number (CN)");
          return;
      }

      setIsManualTracking(true);
      setManualResult(null);

      try {
          const adapter = new TcsAdapter();
          // Use manual token if provided, otherwise fallback to saved config
          const configToUse = manualToken.trim() 
              ? { api_token: manualToken.trim(), is_active: true, provider_id: 'TCS', id: 'temp' } as IntegrationConfig
              : tcsConfig;

          if (!configToUse || !configToUse.api_token) {
              throw new Error("No API Token found. Please enter one manually or configure it in Settings > Integrations.");
          }

          const result = await adapter.track(manualCn.trim(), configToUse);
          setManualResult({
              status: result.status,
              raw: result.raw_status_text,
              timestamp: result.courier_timestamp,
              full_data: "Success"
          });

      } catch (e: any) {
          console.error("Manual Track Error", e);
          setManualResult({
              status: "ERROR",
              raw: e.message || "Unknown Error",
              full_data: e.toString()
          });
      } finally {
          setIsManualTracking(false);
      }
  };

  const handleTrackClick = async (order: Order) => {
      if (!onTrackOrder || trackingIds.has(order.id)) return;
      
      const newSet = new Set(trackingIds);
      newSet.add(order.id);
      setTrackingIds(newSet);

      try {
          await onTrackOrder(order);
      } catch (e) {
          console.error("Tracking Failed", e);
      } finally {
          const finishedSet = new Set(trackingIds);
          finishedSet.delete(order.id);
          setTrackingIds(finishedSet);
      }
  };

  const handleBulkScan = async () => {
      if (!onTrackOrder) return;
      setStopSignal(false);
      
      const activeOrders = trackingOrders.filter(o => 
          o.status !== OrderStatus.DELIVERED && 
          o.status !== OrderStatus.RETURNED &&
          o.status !== OrderStatus.CANCELLED
      );

      if (activeOrders.length === 0) {
          alert("No active orders (In Transit/Pending) to track.");
          return;
      }

      if (!window.confirm(`Start scanning ${activeOrders.length} active orders?`)) return;

      setIsBulkScanning(true);
      let count = 0;

      for (const order of activeOrders) {
          if (stopSignal) break;
          
          count++;
          setBulkProgress(`${count}/${activeOrders.length}`);
          
          const newSet = new Set(trackingIds);
          newSet.add(order.id);
          setTrackingIds(newSet);

          try {
              await onTrackOrder(order);
          } catch (e) {
              console.error("Bulk track failed for", order.id);
          } finally {
              // Wait briefly to avoid rate limits
              await new Promise(r => setTimeout(r, 800)); 
          }
      }

      setIsBulkScanning(false);
      setBulkProgress('');
      setTrackingIds(new Set()); 
  };

  const isTcsCandidate = (o: ShopifyOrder) => {
      if (!o) return false;
      const tags = o.tags ? String(o.tags).toLowerCase() : '';
      const hasTcsTag = tags.includes('tcs');
      
      const fulfillments = Array.isArray(o.fulfillments) ? o.fulfillments : [];
      const fulfillment = fulfillments.length > 0 ? fulfillments[0] : null;
      
      const company = fulfillment?.tracking_company ? String(fulfillment.tracking_company).toLowerCase() : '';
      const trackNo = fulfillment?.tracking_number ? String(fulfillment.tracking_number) : '';
      
      const cleanTrackNo = trackNo.replace(/[^0-9]/g,'');
      const isFormatMatch = cleanTrackNo.length >= 9 && cleanTrackNo.length <= 16;
      const isOtherCourier = company.includes('trax') || company.includes('leopard') || company.includes('postex') || company.includes('mnp') || company.includes('callcourier');

      return hasTcsTag || company.includes('tcs') || (isFormatMatch && !isOtherCourier);
  };

  const filteredRawOrders = useMemo(() => {
      let data = safeShopifyOrders;
      if (showOnlyTcsCandidates) {
          data = data.filter(isTcsCandidate);
      }
      if (searchTerm) {
          const lowerTerm = searchTerm.toLowerCase();
          data = data.filter(o => {
              if (!o) return false;
              const name = (o.name || '').toLowerCase();
              const tags = (o.tags || '').toLowerCase();
              const items = Array.isArray(o.line_items) ? o.line_items : [];
              const hasItemMatch = items.some(i => i && i.title && i.title.toLowerCase().includes(lowerTerm));
              return name.includes(lowerTerm) || tags.includes(lowerTerm) || hasItemMatch;
          });
      }
      return data;
  }, [safeShopifyOrders, searchTerm, showOnlyTcsCandidates]);

  return (
    <div className="space-y-6 pb-12">
      {/* MANUAL TRACKING LAB (NEW) */}
      <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-800 p-6 text-white">
          <div className="flex items-center gap-3 mb-4">
              <Terminal size={24} className="text-brand-500" />
              <div>
                  <h3 className="font-bold text-lg">Manual Tracking Lab</h3>
                  <p className="text-xs text-slate-400">Test specific CN numbers and credentials directly.</p>
              </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-4">
                  <label className="block text-xs font-bold text-slate-400 mb-1">Tracking Number (CN)</label>
                  <input 
                      type="text" 
                      placeholder="e.g. 779412326902" 
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-brand-500 outline-none font-mono"
                      value={manualCn}
                      onChange={(e) => setManualCn(e.target.value)}
                  />
              </div>
              <div className="md:col-span-5">
                  <label className="block text-xs font-bold text-slate-400 mb-1 flex items-center gap-1">
                      <Key size={12} /> Override Token (Optional)
                  </label>
                  <input 
                      type="text" 
                      placeholder={tcsConfig?.api_token ? "Using Saved Token (Default)" : "Enter Token Here"} 
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm placeholder:text-slate-600"
                      value={manualToken}
                      onChange={(e) => setManualToken(e.target.value)}
                  />
              </div>
              <div className="md:col-span-3">
                  <button 
                      onClick={handleManualTrace}
                      disabled={isManualTracking}
                      className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                      {isManualTracking ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                      Track Shipment
                  </button>
              </div>
          </div>

          {/* RESULT DISPLAY */}
          {manualResult && (
              <div className={`mt-4 p-4 rounded-lg border font-mono text-sm ${manualResult.status === 'ERROR' ? 'bg-red-900/20 border-red-900/50 text-red-200' : 'bg-green-900/20 border-green-900/50 text-green-200'}`}>
                  <div className="flex justify-between items-start">
                      <div>
                          <p className="font-bold mb-1">Status: {manualResult.status}</p>
                          <p>Message: {manualResult.raw}</p>
                      </div>
                      {manualResult.timestamp && <span className="text-xs opacity-60">{new Date(manualResult.timestamp).toLocaleString()}</span>}
                  </div>
              </div>
          )}
      </div>

      {/* Main List Area */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                  <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                      <Radio className="text-red-600" /> TCS Monitor
                  </h2>
                  <p className="text-slate-500 text-sm mt-1">
                      Inspect imported orders and batch update statuses.
                  </p>
              </div>
              <div className="flex items-center gap-4">
                  {viewMode === 'matched' && (
                      <button
                          onClick={isBulkScanning ? () => setStopSignal(true) : handleBulkScan}
                          disabled={isBulkScanning && stopSignal}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-sm ${
                              isBulkScanning 
                                  ? 'bg-red-50 text-red-600 border border-red-200' 
                                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                          }`}
                      >
                          {isBulkScanning ? (
                              <>
                                  <Loader2 size={16} className="animate-spin" />
                                  Scanning {bulkProgress}... (Stop)
                              </>
                          ) : (
                              <>
                                  <PlayCircle size={16} />
                                  Scan All Pending
                              </>
                          )}
                      </button>
                  )}
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
                              if (!o) return null;
                              const id = o.id || idx;
                              const name = o.name || 'Unknown';
                              let date = 'N/A';
                              try { date = o.created_at ? new Date(o.created_at).toLocaleDateString() : 'N/A'; } catch (e) { }
                              
                              const tags = o.tags || '';
                              const fulfillments = Array.isArray(o.fulfillments) ? o.fulfillments : [];
                              const fulfillment = fulfillments.length > 0 ? fulfillments[0] : null;
                              
                              return (
                                  <tr key={id} className="hover:bg-slate-50">
                                      <td className="px-4 py-3 font-bold text-slate-800 align-top">{name}</td>
                                      <td className="px-4 py-3 text-slate-500 align-top">{date}</td>
                                      <td className="px-4 py-3 text-slate-600 align-top truncate max-w-[200px]">
                                          {(o.line_items || []).map(i => i?.title).join(', ')}
                                      </td>
                                      <td className="px-4 py-3 align-top">
                                          {fulfillment ? (
                                              <div className="flex flex-col gap-1">
                                                  <span className="font-bold truncate max-w-[100px]">{fulfillment.tracking_company || 'None'}</span>
                                                  <span className="truncate max-w-[100px]">{fulfillment.tracking_number || 'None'}</span>
                                              </div>
                                          ) : <span className="text-red-400">No Fulfillment</span>}
                                      </td>
                                      <td className="px-4 py-3 max-w-[100px] align-top truncate">{tags || '-'}</td>
                                      <td className="px-4 py-3 align-top text-slate-500">
                                          {isTcsCandidate(o) ? <span className="text-green-600 font-bold">Match</span> : 'Ignore'}
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
                          <th className="px-6 py-4 w-[35%]">Items</th>
                          <th className="px-6 py-4">Tracking Number</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4">Live Check</th>
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
                                  <div className="flex flex-col items-start gap-1">
                                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                                          o.status === OrderStatus.DELIVERED ? 'bg-green-100 text-green-700' :
                                          o.status === OrderStatus.RETURNED || o.status === OrderStatus.RTO_INITIATED ? 'bg-red-100 text-red-700' :
                                          'bg-blue-50 text-blue-700'
                                      }`}>
                                          {o.status.replace('_', ' ')}
                                      </span>
                                      
                                      {o.courier_raw_status ? (
                                          <span className="text-[10px] text-slate-500 font-medium block max-w-[180px] leading-tight">
                                              {o.courier_raw_status}
                                          </span>
                                      ) : (
                                          <span className="text-[10px] text-slate-300 italic">
                                              Pending Check...
                                          </span>
                                      )}
                                  </div>
                              </td>
                              <td className="px-6 py-4 align-top">
                                  <button 
                                    onClick={() => handleTrackClick(o)}
                                    disabled={trackingIds.has(o.id) || isBulkScanning}
                                    className="p-1.5 bg-slate-100 text-slate-600 rounded hover:bg-blue-100 hover:text-blue-600 transition-colors disabled:opacity-50"
                                    title="Check Live Status"
                                  >
                                      {trackingIds.has(o.id) || isBulkScanning ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                  </button>
                              </td>
                          </tr>
                      )) : (
                          <tr>
                              <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
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
