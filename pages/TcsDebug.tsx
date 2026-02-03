
import React, { useState, useMemo } from 'react';
import { Order, ShopifyOrder, OrderStatus, IntegrationConfig } from '../types';
import { TcsAdapter } from '../services/couriers/tcs';
import { Radio, Database, CheckCircle2, Search, AlertTriangle, Filter, Package, RefreshCw, Loader2, PlayCircle, Terminal, Key, Wifi, WifiOff, Globe } from 'lucide-react';

interface TcsDebugProps {
  orders: Order[];
  shopifyOrders: ShopifyOrder[];
  onTrackOrder?: (order: Order) => Promise<OrderStatus>;
  tcsConfig?: IntegrationConfig;
}

const TcsDebug: React.FC<TcsDebugProps> = ({ orders = [], shopifyOrders = [], onTrackOrder, tcsConfig }) => {
  const [viewMode, setViewMode] = useState<'matched' | 'raw'>('raw');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Diagnostic State
  const [manualCn, setManualCn] = useState('');
  const [manualToken, setManualToken] = useState(tcsConfig?.api_token || '');
  const [diagnosticLog, setDiagnosticLog] = useState<string[]>([]);
  const [isRunningDiag, setIsRunningDiag] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'success' | 'failed'>('unknown');

  const safeOrders = useMemo(() => Array.isArray(orders) ? orders : [], [orders]);
  const safeShopifyOrders = useMemo(() => Array.isArray(shopifyOrders) ? shopifyOrders : [], [shopifyOrders]);

  const trackingOrders = useMemo(() => 
    safeOrders.filter(o => o.data_source === 'tracking'), 
  [safeOrders]);

  const log = (msg: string) => {
      const time = new Date().toLocaleTimeString();
      setDiagnosticLog(prev => [`[${time}] ${msg}`, ...prev]);
  };

  const handleTestConnection = async () => {
      setIsRunningDiag(true);
      setDiagnosticLog([]);
      setConnectionStatus('unknown');
      log("Starting Connectivity Test...");

      const tokenToUse = manualToken.trim();
      if (!tokenToUse) {
          log("ERROR: No API Token provided.");
          setIsRunningDiag(false);
          setConnectionStatus('failed');
          return;
      }

      log(`Token Length: ${tokenToUse.length} chars`);
      log("Target Endpoint: https://ociconnect.tcscourier.com/tracking/api/Tracking/GetDynamicTrackDetail");

      try {
          // 1. Direct Proxy Call Test
          log("Step 1: Sending request via Proxy...");
          
          const cleanToken = tokenToUse.replace(/^Bearer\s+/i, '').trim();
          const testCn = manualCn || '779412326902'; // Default test CN if empty
          log(`Using Test CN: ${testCn}`);

          const targetUrl = `https://ociconnect.tcscourier.com/tracking/api/Tracking/GetDynamicTrackDetail?consignee=${testCn}`;
          
          const res = await fetch(`/api/proxy?url=${encodeURIComponent(targetUrl)}`, {
              method: 'GET',
              headers: { 
                  'Accept': 'application/json',
                  'Authorization': `Bearer ${cleanToken}`
              }
          });

          log(`Response HTTP Status: ${res.status}`);
          
          const text = await res.text();
          log(`Raw Response Body (First 200 chars): ${text.substring(0, 200)}...`);

          if (!res.ok) {
              log("HTTP Error detected.");
              if (res.status === 401) log(">> 401 Unauthorized: Your Token is INVALID or EXPIRED.");
              if (res.status === 403) log(">> 403 Forbidden: Token valid but permissions denied.");
              if (res.status === 500) log(">> 500 Server Error: TCS Server issue.");
              throw new Error(`HTTP ${res.status}`);
          }

          let json;
          try {
              json = JSON.parse(text);
              log("JSON Parsed Successfully.");
          } catch (e) {
              log("ERROR: Response is not valid JSON.");
              throw new Error("Invalid JSON");
          }

          // Check logical response
          if (json.message === 'Invalid access token' || json.code === '401') {
              log(">> API Message: Invalid Access Token");
              throw new Error("Token Rejected");
          }

          if (json.shipmentsummary && json.shipmentsummary.includes("No Data Found")) {
              log(">> SUCCESS: Connected to TCS, but CN not found (Expected for dummy data).");
              setConnectionStatus('success');
          } else if (json.checkpoints) {
              log(">> SUCCESS: Connected and retrieved tracking data.");
              setConnectionStatus('success');
          } else {
              log(">> WARNING: Connected but response format is unexpected.");
              setConnectionStatus('success'); // Still technically connected
          }

      } catch (e: any) {
          log(`FATAL ERROR: ${e.message}`);
          setConnectionStatus('failed');
      } finally {
          setIsRunningDiag(false);
      }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* DIAGNOSTIC PANEL */}
      <div className="bg-slate-900 rounded-xl shadow-xl border border-slate-800 overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                  <h3 className="font-bold text-xl text-white flex items-center gap-3">
                      <Terminal className="text-brand-500" /> 
                      TCS API Diagnostics
                  </h3>
                  <p className="text-slate-400 text-sm mt-1">
                      Use this tool to confirm your API Token is working before syncing orders.
                  </p>
              </div>
              <div className="flex items-center gap-3">
                  <div className={`px-4 py-2 rounded-lg flex items-center gap-2 font-bold text-sm ${
                      connectionStatus === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 
                      connectionStatus === 'failed' ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 
                      'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}>
                      {connectionStatus === 'success' ? <Wifi size={18} /> : connectionStatus === 'failed' ? <WifiOff size={18} /> : <Globe size={18} />}
                      {connectionStatus === 'success' ? 'CONNECTED' : connectionStatus === 'failed' ? 'CONNECTION FAILED' : 'NOT TESTED'}
                  </div>
              </div>
          </div>

          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left: Inputs */}
              <div className="space-y-5">
                  <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase">API Access Token</label>
                      <div className="relative">
                          <Key size={16} className="absolute left-3 top-3.5 text-slate-500" />
                          <input 
                              type="text" 
                              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-3 text-white text-sm focus:ring-2 focus:ring-brand-500 outline-none font-mono"
                              placeholder="Paste your long TCS token here..."
                              value={manualToken}
                              onChange={(e) => setManualToken(e.target.value)}
                          />
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2">
                          Note: This should be the long "Bearer" token from TCS OCI Portal.
                      </p>
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Test Tracking Number (CN)</label>
                      <div className="relative">
                          <Package size={16} className="absolute left-3 top-3.5 text-slate-500" />
                          <input 
                              type="text" 
                              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-3 text-white text-sm focus:ring-2 focus:ring-brand-500 outline-none font-mono"
                              placeholder="e.g. 779412326902"
                              value={manualCn}
                              onChange={(e) => setManualCn(e.target.value)}
                          />
                      </div>
                  </div>

                  <button 
                      onClick={handleTestConnection}
                      disabled={isRunningDiag || !manualToken}
                      className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-4 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-900/50"
                  >
                      {isRunningDiag ? <Loader2 size={20} className="animate-spin" /> : <PlayCircle size={20} />}
                      Run Connection Test
                  </button>
              </div>

              {/* Right: Logs */}
              <div className="bg-black/50 rounded-xl border border-slate-800 p-4 flex flex-col h-[300px]">
                  <div className="flex justify-between items-center mb-2 border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-slate-400 uppercase">Live Log Output</span>
                      <button onClick={() => setDiagnosticLog([])} className="text-[10px] text-slate-500 hover:text-white">Clear</button>
                  </div>
                  <div className="flex-1 overflow-y-auto font-mono text-xs space-y-1 pr-2 custom-scrollbar">
                      {diagnosticLog.length === 0 && (
                          <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                              <Terminal size={32} className="mb-2" />
                              <p>Ready to test...</p>
                          </div>
                      )}
                      {diagnosticLog.map((line, i) => (
                          <div key={i} className={`break-all ${
                              line.includes('ERROR') || line.includes('failed') ? 'text-red-400' : 
                              line.includes('SUCCESS') ? 'text-green-400' : 
                              line.includes('WARNING') ? 'text-yellow-400' : 
                              'text-slate-300'
                          }`}>
                              {line}
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      </div>

      {/* Existing Orders List (Simplified) */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm opacity-75 hover:opacity-100 transition-opacity">
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Database size={18} /> Cached Tracking Data
          </h3>
          <p className="text-sm text-slate-500 mb-4">
              Below are the TCS orders currently in your system. Use the "Sync" button on the Orders page to update them once the connection above is verified Green.
          </p>
          <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase font-bold text-slate-500">
                      <tr>
                          <th className="px-4 py-2">Tracking #</th>
                          <th className="px-4 py-2">System Status</th>
                          <th className="px-4 py-2">Raw Courier Message</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {trackingOrders.slice(0, 10).map(o => (
                          <tr key={o.id}>
                              <td className="px-4 py-2 font-mono">{o.tracking_number}</td>
                              <td className="px-4 py-2">
                                  <span className={`px-2 py-0.5 rounded text-xs ${o.status === 'DELIVERED' ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                                      {o.status}
                                  </span>
                              </td>
                              <td className="px-4 py-2 text-slate-500 text-xs truncate max-w-[200px]">
                                  {o.courier_raw_status || '-'}
                              </td>
                          </tr>
                      ))}
                      {trackingOrders.length === 0 && <tr><td colSpan={3} className="px-4 py-4 text-center text-slate-400">No TCS orders found.</td></tr>}
                  </tbody>
              </table>
          </div>
      </div>
    </div>
  );
};

export default TcsDebug;
