
import React, { useMemo, useState } from 'react';
import { Order, ShopifyOrder, Product, OrderStatus } from '../types';
import { 
    AlertTriangle, CheckCircle2, Search, Download, Filter, 
    ArrowRightLeft, PackageCheck, PackageX, ExternalLink, RefreshCw 
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ReconciliationProps {
  shopifyOrders: ShopifyOrder[];
  courierOrders: Order[];
  products: Product[];
  storeName?: string;
}

type ReconStatus = 'MATCHED' | 'MISMATCH_STATUS' | 'MISSING_IN_COURIER' | 'MISSING_IN_SHOPIFY';

interface ReconItem {
    id: string; // Shopify Order Name as ID
    date: string;
    shopifyOrder: ShopifyOrder | null;
    courierOrder: Order | null;
    status: ReconStatus;
    financialMatch: boolean;
}

const Reconciliation: React.FC<ReconciliationProps> = ({ shopifyOrders, courierOrders, products, storeName = 'My Store' }) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'ISSUES' | 'MATCHED'>('ISSUES');
  const [searchTerm, setSearchTerm] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // 1. Build Reconciliation Logic
  const reconciliationData = useMemo(() => {
      const data: ReconItem[] = [];
      const courierMap = new Map<string, Order>();

      // Normalize Courier Orders for Lookup
      courierOrders.forEach(co => {
          // Normalize: Remove #, trim
          const key = co.shopify_order_number.replace('#', '').trim().toLowerCase();
          courierMap.set(key, co);
      });

      // Process Shopify Orders
      shopifyOrders.forEach(so => {
          const key = so.name.replace('#', '').trim().toLowerCase();
          const co = courierMap.get(key);
          
          let status: ReconStatus = 'MATCHED';
          let financialMatch = true;

          const isShopifyCancelled = so.cancel_reason !== null;
          const isShopifyFulfilled = so.fulfillment_status === 'fulfilled';

          if (!co) {
              // Exclude cancelled shopify orders from "Missing" alerts
              if (isShopifyCancelled) status = 'MATCHED'; // Technically matched as "No Action Needed"
              else status = 'MISSING_IN_COURIER';
              financialMatch = false;
          } else {
              // We have both
              const coIsDelivered = co.status === OrderStatus.DELIVERED;
              
              // Status Mismatch Logic
              if (coIsDelivered && !isShopifyFulfilled) status = 'MISMATCH_STATUS';
              if (co.status === OrderStatus.RETURNED && isShopifyFulfilled) status = 'MISMATCH_STATUS';

              // Financial Check
              // If Courier Delivered, did we get money? (Simulated via cod_amount check)
              if (coIsDelivered && parseFloat(so.total_price) !== co.cod_amount) {
                  financialMatch = false; 
              }
              
              // Remove from map to find "Missing in Shopify" later
              courierMap.delete(key);
          }

          data.push({
              id: so.name,
              date: so.created_at,
              shopifyOrder: so,
              courierOrder: co || null,
              status,
              financialMatch
          });
      });

      // Remaining Courier Orders (orphans)
      courierMap.forEach((co) => {
          data.push({
              id: co.shopify_order_number,
              date: co.created_at,
              shopifyOrder: null,
              courierOrder: co,
              status: 'MISSING_IN_SHOPIFY',
              financialMatch: false
          });
      });

      return data.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [shopifyOrders, courierOrders]);

  // 2. Filter Data
  const filteredData = useMemo(() => {
      let filtered = reconciliationData;

      // Tab Filter
      if (activeTab === 'ISSUES') {
          filtered = filtered.filter(i => i.status !== 'MATCHED' || !i.financialMatch);
      } else if (activeTab === 'MATCHED') {
          filtered = filtered.filter(i => i.status === 'MATCHED');
      }

      // Search Filter
      if (searchTerm) {
          const term = searchTerm.toLowerCase();
          filtered = filtered.filter(i => 
              i.id.toLowerCase().includes(term) || 
              i.courierOrder?.tracking_number.toLowerCase().includes(term) ||
              i.shopifyOrder?.customer?.city?.toLowerCase().includes(term)
          );
      }

      return filtered;
  }, [reconciliationData, activeTab, searchTerm]);

  // PDF Export
  const handleExportPDF = () => {
    setIsExporting(true);
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text(`${storeName} - Reconciliation Report`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 22);

    const rows = filteredData.map(item => [
        item.id,
        new Date(item.date).toLocaleDateString(),
        item.shopifyOrder ? item.shopifyOrder.financial_status : 'N/A',
        item.courierOrder ? item.courierOrder.status : 'N/A',
        item.status.replace(/_/g, ' '),
        item.courierOrder ? item.courierOrder.tracking_number : '-'
    ]);

    autoTable(doc, {
        head: [['Order #', 'Date', 'Shopify Pay', 'Courier Status', 'Recon Status', 'Tracking']],
        body: rows,
        startY: 28,
    });

    doc.save('Reconciliation_Report.pdf');
    setIsExporting(false);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Order Reconciliation</h2>
                <p className="text-slate-500 text-sm">Match Shopify records with Courier execution to find leaks.</p>
            </div>
            <div className="flex gap-2">
                 <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Search Order #..." 
                        className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 w-64"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button 
                    onClick={handleExportPDF}
                    disabled={isExporting}
                    className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-70"
                >
                    {isExporting ? <RefreshCw className="animate-spin" size={16}/> : <Download size={16} />} Export
                </button>
            </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                    <p className="text-xs font-bold text-slate-500 uppercase">Total Orders</p>
                    <h3 className="text-2xl font-bold text-slate-900">{reconciliationData.length}</h3>
                </div>
                <div className="bg-slate-100 p-3 rounded-lg text-slate-600"><Filter size={20}/></div>
            </div>
            <div className="bg-red-50 p-4 rounded-xl border border-red-100 shadow-sm flex items-center justify-between">
                <div>
                    <p className="text-xs font-bold text-red-600 uppercase">Missing / Issues</p>
                    <h3 className="text-2xl font-bold text-red-700">
                        {reconciliationData.filter(i => i.status !== 'MATCHED').length}
                    </h3>
                </div>
                <div className="bg-white p-3 rounded-lg text-red-500"><AlertTriangle size={20}/></div>
            </div>
            <div className="bg-green-50 p-4 rounded-xl border border-green-100 shadow-sm flex items-center justify-between">
                <div>
                    <p className="text-xs font-bold text-green-600 uppercase">Perfect Match</p>
                    <h3 className="text-2xl font-bold text-green-700">
                        {reconciliationData.filter(i => i.status === 'MATCHED').length}
                    </h3>
                </div>
                <div className="bg-white p-3 rounded-lg text-green-500"><CheckCircle2 size={20}/></div>
            </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200 flex gap-6">
            <button 
                onClick={() => setActiveTab('ISSUES')}
                className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'ISSUES' ? 'border-red-500 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
                Action Required ({reconciliationData.filter(i => i.status !== 'MATCHED').length})
            </button>
            <button 
                onClick={() => setActiveTab('MATCHED')}
                className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'MATCHED' ? 'border-green-500 text-green-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
                Matched
            </button>
            <button 
                onClick={() => setActiveTab('ALL')}
                className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'ALL' ? 'border-slate-500 text-slate-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
                All Orders
            </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                        <th className="px-6 py-4 font-semibold text-slate-700">Order Details</th>
                        <th className="px-6 py-4 font-semibold text-slate-700">Shopify Status</th>
                        <th className="px-6 py-4 font-semibold text-slate-700">Courier Status</th>
                        <th className="px-6 py-4 font-semibold text-slate-700">Recon Result</th>
                        <th className="px-6 py-4 font-semibold text-slate-700 text-right">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {filteredData.length === 0 ? (
                         <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400">No orders found.</td></tr>
                    ) : (
                        filteredData.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="font-bold text-slate-900">{item.id}</div>
                                    <div className="text-xs text-slate-500">{new Date(item.date).toLocaleDateString()}</div>
                                    {item.shopifyOrder?.line_items[0] && (
                                        <div className="text-[10px] text-slate-400 mt-1 truncate max-w-[200px]">
                                            {item.shopifyOrder.line_items[0].title}
                                        </div>
                                    )}
                                </td>
                                
                                {/* Shopify Column */}
                                <td className="px-6 py-4">
                                    {item.shopifyOrder ? (
                                        <div className="space-y-1">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                item.shopifyOrder.fulfillment_status === 'fulfilled' ? 'bg-green-100 text-green-700' : 
                                                item.shopifyOrder.cancel_reason ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                            }`}>
                                                {item.shopifyOrder.cancel_reason ? 'Cancelled' : (item.shopifyOrder.fulfillment_status || 'Unfulfilled')}
                                            </span>
                                            <div className="text-xs text-slate-500 font-medium">
                                                {item.shopifyOrder.financial_status} • {item.shopifyOrder.total_price}
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="text-slate-300 italic">Not in Shopify</span>
                                    )}
                                </td>

                                {/* Courier Column */}
                                <td className="px-6 py-4">
                                    {item.courierOrder ? (
                                        <div className="space-y-1">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                item.courierOrder.status === 'DELIVERED' ? 'bg-green-100 text-green-700' :
                                                item.courierOrder.status === 'RETURNED' ? 'bg-red-100 text-red-700' :
                                                'bg-blue-50 text-blue-600'
                                            }`}>
                                                {item.courierOrder.status.replace('_', ' ')}
                                            </span>
                                            <div className="text-xs text-slate-500 font-medium">
                                                {item.courierOrder.courier} • {item.courierOrder.tracking_number}
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="text-red-400 text-xs font-bold flex items-center gap-1">
                                            <PackageX size={14}/> Not Found
                                        </span>
                                    )}
                                </td>

                                {/* Result Column */}
                                <td className="px-6 py-4">
                                    <ReconBadge status={item.status} />
                                </td>

                                <td className="px-6 py-4 text-right">
                                    <button className="text-slate-400 hover:text-brand-600">
                                        <ExternalLink size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    </div>
  );
};

const ReconBadge = ({ status }: { status: ReconStatus }) => {
    switch(status) {
        case 'MATCHED': 
            return <div className="flex items-center gap-1 text-green-700 text-xs font-bold"><CheckCircle2 size={14}/> Verified</div>;
        case 'MISSING_IN_COURIER':
            return <div className="flex items-center gap-1 text-red-600 text-xs font-bold"><AlertTriangle size={14}/> Missing in Courier</div>;
        case 'MISSING_IN_SHOPIFY':
            return <div className="flex items-center gap-1 text-orange-600 text-xs font-bold"><ArrowRightLeft size={14}/> Orphan in Courier</div>;
        case 'MISMATCH_STATUS':
            return <div className="flex items-center gap-1 text-yellow-600 text-xs font-bold"><PackageCheck size={14}/> Status Mismatch</div>;
        default: return null;
    }
};

export default Reconciliation;
