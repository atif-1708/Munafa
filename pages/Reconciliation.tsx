
import React, { useMemo, useState } from 'react';
import { Order, ShopifyOrder, Product, OrderStatus } from '../types';
import { Search, Download, CheckCircle2, AlertTriangle, XCircle, ArrowRight, Package } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ReconciliationProps {
  shopifyOrders: ShopifyOrder[];
  courierOrders: Order[];
  products: Product[];
  storeName?: string;
}

const Reconciliation: React.FC<ReconciliationProps> = ({ shopifyOrders, courierOrders, storeName = 'My Store' }) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Merge Data
  const mergedData = useMemo(() => {
    const map = new Map<string, { shopify?: ShopifyOrder; courier?: Order }>();

    // 1. Map Shopify Orders
    shopifyOrders.forEach(so => {
        const key = so.name.replace('#', '').trim();
        if (!map.has(key)) map.set(key, {});
        map.get(key)!.shopify = so;
    });

    // 2. Map Courier Orders
    courierOrders.forEach(co => {
        const key = co.shopify_order_number.replace('#', '').trim();
        if (!map.has(key)) map.set(key, {});
        map.get(key)!.courier = co;
    });

    // 3. Convert to Array
    const rows = Array.from(map.entries()).map(([key, val]) => {
        const date = val.shopify?.created_at || val.courier?.created_at || new Date().toISOString();
        
        // Status Logic
        let status = 'MATCHED';
        const sStatus = val.shopify?.fulfillment_status || 'unfulfilled';
        const cStatus = val.courier?.status;

        if (!val.shopify) status = 'ORPHAN_COURIER';
        else if (!val.courier) {
            status = val.shopify.cancel_reason ? 'CANCELLED_SHOPIFY' : 'MISSING_COURIER';
        } else {
            // Both exist
            if (cStatus === OrderStatus.DELIVERED && sStatus !== 'fulfilled') status = 'STATUS_MISMATCH';
            if ((cStatus === OrderStatus.RETURNED || cStatus === OrderStatus.RTO_INITIATED) && sStatus === 'fulfilled') status = 'RTO_MISMATCH';
            
            // Financial Check
            const sTotal = parseFloat(val.shopify.total_price);
            const cTotal = val.courier.cod_amount;
            if (Math.abs(sTotal - cTotal) > 10) status = 'PRICE_MISMATCH';
        }

        return {
            id: key,
            date,
            shopify: val.shopify,
            courier: val.courier,
            status
        };
    });

    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  }, [shopifyOrders, courierOrders]);

  const filteredRows = useMemo(() => {
      return mergedData.filter(row => {
          if (!searchTerm) return true;
          const term = searchTerm.toLowerCase();
          return row.id.includes(term) || 
                 row.shopify?.customer?.first_name?.toLowerCase().includes(term) ||
                 row.courier?.tracking_number?.toLowerCase().includes(term);
      });
  }, [mergedData, searchTerm]);

  const handleExport = () => {
    const doc = new jsPDF();
    doc.text(`${storeName} - Reconciliation`, 14, 15);
    
    const rows = filteredRows.map(r => [
        r.id,
        new Date(r.date).toLocaleDateString(),
        r.shopify ? r.shopify.financial_status : '-',
        r.courier ? r.courier.status : '-',
        r.status
    ]);

    autoTable(doc, {
        head: [['Order #', 'Date', 'Shopify Pay', 'Courier', 'Match Status']],
        body: rows,
        startY: 25
    });
    doc.save('Reconciliation.pdf');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold text-slate-900">Reconciliation</h2>
           <p className="text-slate-500 text-sm">Compare Shopify bookings with Courier reality.</p>
        </div>
        <div className="flex gap-2">
            <div className="relative">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Search Order #..." 
                    className="pl-10 pr-4 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <button onClick={handleExport} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                <Download size={16} /> Export
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
                <tr>
                    <th className="px-6 py-4">Order Details</th>
                    <th className="px-6 py-4">Shopify State</th>
                    <th className="px-6 py-4">Courier State</th>
                    <th className="px-6 py-4">Financials</th>
                    <th className="px-6 py-4">Match Analysis</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {filteredRows.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">No data found.</td></tr>
                ) : filteredRows.map(row => (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                            <div className="font-bold text-slate-900">#{row.id}</div>
                            <div className="text-xs text-slate-500">{new Date(row.date).toLocaleDateString()}</div>
                        </td>
                        
                        <td className="px-6 py-4">
                            {row.shopify ? (
                                <div>
                                    <div className={`text-xs font-bold uppercase ${row.shopify.fulfillment_status === 'fulfilled' ? 'text-green-600' : 'text-yellow-600'}`}>
                                        {row.shopify.fulfillment_status || 'Unfulfilled'}
                                    </div>
                                    <div className="text-xs text-slate-400">{row.shopify.financial_status}</div>
                                </div>
                            ) : <span className="text-slate-300">-</span>}
                        </td>

                        <td className="px-6 py-4">
                             {row.courier ? (
                                <div>
                                    <div className={`text-xs font-bold uppercase ${
                                        row.courier.status === 'DELIVERED' ? 'text-green-600' :
                                        row.courier.status.includes('RETURN') ? 'text-red-600' : 'text-blue-600'
                                    }`}>
                                        {row.courier.status.replace('_', ' ')}
                                    </div>
                                    <div className="text-xs text-slate-400">{row.courier.tracking_number}</div>
                                </div>
                            ) : <span className="text-red-400 text-xs font-bold">Not Found</span>}
                        </td>

                        <td className="px-6 py-4 font-mono text-slate-700">
                            {row.shopify?.total_price || row.courier?.cod_amount || 0}
                        </td>

                        <td className="px-6 py-4">
                            <StatusBadge status={row.status} />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>
    </div>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
    switch(status) {
        case 'MATCHED': 
            return <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-1 rounded text-xs font-bold"><CheckCircle2 size={12} /> Verified</span>;
        case 'MISSING_COURIER': 
            return <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 px-2 py-1 rounded text-xs font-bold"><AlertTriangle size={12} /> Not Shipped</span>;
        case 'ORPHAN_COURIER': 
            return <span className="inline-flex items-center gap-1 text-orange-700 bg-orange-50 px-2 py-1 rounded text-xs font-bold"><Package size={12} /> Unknown Order</span>;
        case 'CANCELLED_SHOPIFY':
             return <span className="text-slate-400 text-xs font-medium">Cancelled (Ignore)</span>;
        case 'PRICE_MISMATCH':
             return <span className="inline-flex items-center gap-1 text-yellow-700 bg-yellow-50 px-2 py-1 rounded text-xs font-bold"><AlertTriangle size={12} /> Price Diff</span>;
        default: 
            return <span className="inline-flex items-center gap-1 text-yellow-700 bg-yellow-50 px-2 py-1 rounded text-xs font-bold"><AlertTriangle size={12} /> Status Mismatch</span>;
    }
}

export default Reconciliation;
