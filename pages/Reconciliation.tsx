
import React, { useMemo, useState } from 'react';
import { Order, ShopifyOrder, Product, OrderStatus } from '../types';
import { Search, Download, Package, ArrowRight, Calendar, Link, CheckCircle2, X, Layers, AlertCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ReconciliationProps {
  shopifyOrders: ShopifyOrder[];
  courierOrders: Order[];
  products: Product[];
  storeName?: string;
  onMapProduct?: (shopifyTitle: string, systemProductId: string) => void;
}

interface ProductStat {
  id: string; // Group ID or Shopify Title
  title: string;
  isGroup: boolean;
  total_ordered: number;
  pending_fulfillment: number;
  fulfilled: number;
  cancelled: number;
  dispatched: number;
  delivered: number;
  rto: number;
  
  // Mapping info
  mappedToSystemTitle?: string;
}

const Reconciliation: React.FC<ReconciliationProps> = ({ shopifyOrders, courierOrders, products, storeName = 'My Store', onMapProduct }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Mapping Modal State
  const [mappingModal, setMappingModal] = useState<{ isOpen: boolean, shopifyTitle: string } | null>(null);
  const [selectedSystemProduct, setSelectedSystemProduct] = useState('');

  // Default to Last 60 Days
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 60);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  });

  // 1. Build Product Statistics (With Grouping)
  const productStats = useMemo(() => {
    const stats = new Map<string, ProductStat>();
    
    // Create a lookup map for Courier Orders (by Shopify Order Number)
    const courierMap = new Map<string, Order>();
    courierOrders.forEach(co => {
        const key = co.shopify_order_number.replace('#', '').trim();
        courierMap.set(key, co);
    });

    const start = new Date(dateRange.start);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateRange.end);
    end.setHours(23, 59, 59, 999);

    const uniqueOrders = new Map<number, ShopifyOrder>();
    shopifyOrders.forEach(order => {
        const orderDate = new Date(order.created_at);
        if (orderDate >= start && orderDate <= end) {
            if (!uniqueOrders.has(order.id)) {
                uniqueOrders.set(order.id, order);
            }
        }
    });

    uniqueOrders.forEach(order => {
        const orderKey = order.name.replace('#', '').trim();
        const courierOrder = courierMap.get(orderKey);

        const isCancelled = order.cancel_reason !== null;
        const isFulfilled = order.fulfillment_status === 'fulfilled'; 
        const isPending = !isCancelled && !isFulfilled;

        let isDispatched = false;
        let isDelivered = false;
        let isRto = false;

        if (courierOrder) {
            if (courierOrder.status !== OrderStatus.PENDING && 
                courierOrder.status !== OrderStatus.BOOKED && 
                courierOrder.status !== OrderStatus.CANCELLED) {
                isDispatched = true;
            }
            if (courierOrder.status === OrderStatus.DELIVERED) isDelivered = true;
            if (courierOrder.status === OrderStatus.RETURNED || courierOrder.status === OrderStatus.RTO_INITIATED) isRto = true;
        }

        if (order.line_items.length > 0) {
            const item = order.line_items[0]; // Primary Item strategy
            
            // Determine Aggregation Key
            // Check if this title is linked to a System Product
            const matchedProduct = products.find(p => 
                (p.aliases && p.aliases.includes(item.title)) || p.title === item.title
            );

            let key = item.title;
            let title = item.title;
            let isGroup = false;
            let mappedTitle = matchedProduct?.title;

            // GROUPING LOGIC: If linked product belongs to a group, aggregate under Group ID
            if (matchedProduct && matchedProduct.group_id) {
                key = matchedProduct.group_id; 
                title = matchedProduct.group_name || matchedProduct.title;
                isGroup = true;
                mappedTitle = matchedProduct.group_name || 'Group';
            }

            if (!stats.has(key)) {
                stats.set(key, {
                    id: key,
                    title: title,
                    isGroup: isGroup,
                    total_ordered: 0,
                    pending_fulfillment: 0,
                    fulfilled: 0,
                    cancelled: 0,
                    dispatched: 0,
                    delivered: 0,
                    rto: 0,
                    mappedToSystemTitle: mappedTitle
                });
            }

            const stat = stats.get(key)!;
            stat.total_ordered += 1;

            if (isCancelled) {
                stat.cancelled += 1;
            } else {
                if (isPending) stat.pending_fulfillment += 1;
                if (isFulfilled) stat.fulfilled += 1;
                if (isDispatched) stat.dispatched += 1;
                if (isDelivered) stat.delivered += 1;
                if (isRto) stat.rto += 1;
            }
        }
    });

    return Array.from(stats.values()).sort((a,b) => b.total_ordered - a.total_ordered);
  }, [shopifyOrders, courierOrders, dateRange, products]);

  const filteredStats = useMemo(() => {
      return productStats.filter(p => 
          p.title.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [productStats, searchTerm]);

  const handleExport = () => {
    const doc = new jsPDF();
    doc.setTextColor(20, 83, 45);
    doc.setFontSize(22);
    doc.text("MunafaBakhsh Karobaar", 14, 20);
    
    doc.setTextColor(100);
    doc.setFontSize(10);
    doc.text("eCommerce Intelligence Platform", 14, 25);
    doc.setDrawColor(200);
    doc.line(14, 30, 196, 30);
    doc.setTextColor(0);
    doc.setFontSize(14);
    doc.text(`${storeName} - Product Performance Report`, 14, 40);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Period: ${dateRange.start} to ${dateRange.end}`, 14, 46);
    
    const rows = filteredStats.map(r => {
        const total = r.total_ordered;
        const disp = r.dispatched;
        const p = (val: number, base: number) => base > 0 ? `(${Math.round((val/base)*100)}%)` : '';
        return [
            r.title,
            r.total_ordered,
            `${r.pending_fulfillment} ${p(r.pending_fulfillment, total)}`,
            `${r.fulfilled} ${p(r.fulfilled, total)}`,
            `${r.dispatched} ${p(r.dispatched, total)}`,
            `${r.delivered} ${p(r.delivered, disp)}`, 
            `${r.rto} ${p(r.rto, disp)}` 
        ];
    });

    autoTable(doc, {
        head: [['Product', 'Total Orders', 'Pending', 'Fulfilled', 'Dispatched', 'Delivered', 'RTO']],
        body: rows,
        startY: 55,
        theme: 'grid',
        headStyles: { fillColor: [22, 163, 74] },
        styles: { fontSize: 8, cellPadding: 3 },
    });
    doc.save('Reconciliation_Report.pdf');
  };

  const openMapping = (shopifyTitle: string) => {
      setMappingModal({ isOpen: true, shopifyTitle });
      setSelectedSystemProduct('');
  };

  const saveMapping = () => {
      if(mappingModal && selectedSystemProduct && onMapProduct) {
          onMapProduct(mappingModal.shopifyTitle, selectedSystemProduct);
          setMappingModal(null);
          setSelectedSystemProduct('');
      }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h2 className="text-2xl font-bold text-slate-900">Shopify Product Stats</h2>
           <p className="text-slate-500 text-sm">Inventory flow analysis (Groups & Mapped Items).</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
             <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm">
                <Calendar size={16} className="text-slate-500" />
                <input 
                  type="date" 
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="text-sm text-slate-700 bg-transparent border-none focus:ring-0 outline-none w-28 font-medium cursor-pointer"
                />
                <span className="text-slate-400">to</span>
                <input 
                  type="date" 
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="text-sm text-slate-700 bg-transparent border-none focus:ring-0 outline-none w-28 font-medium cursor-pointer"
                />
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Search Product..." 
                    className="pl-10 pr-4 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 w-full sm:w-64"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <button onClick={handleExport} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 whitespace-nowrap">
                <Download size={16} /> Export PDF
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase text-xs font-bold tracking-wider">
                <tr>
                    <th className="px-6 py-4 w-[25%]">Product / Group</th>
                    <th className="px-4 py-4 w-[20%]">Linked Inventory</th>
                    <th className="px-4 py-4 text-center text-slate-500">Total</th>
                    <th className="px-4 py-4 text-center text-orange-600 bg-orange-50/50">Pending</th>
                    <th className="px-4 py-4 text-center text-blue-600 bg-blue-50/50">Fulfilled</th>
                    <th className="px-1 py-4 w-6"></th> 
                    <th className="px-4 py-4 text-center text-purple-600 bg-purple-50/50">Dispatched</th>
                    <th className="px-4 py-4 text-center text-green-600 bg-green-50/50">Delivered</th>
                    <th className="px-4 py-4 text-center text-red-600 bg-red-50/50">RTO</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {filteredStats.length === 0 ? (
                    <tr><td colSpan={9} className="px-6 py-12 text-center text-slate-400">No products found in this date range.</td></tr>
                ) : filteredStats.map((item, idx) => (
                    <tr key={idx} className={`hover:bg-slate-50 transition-colors ${item.isGroup ? 'bg-indigo-50/30' : ''}`}>
                        <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded flex items-center justify-center shrink-0 ${item.isGroup ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                                    {item.isGroup ? <Layers size={18} /> : <Package size={18} />}
                                </div>
                                <div className="min-w-0">
                                    <div className={`font-bold truncate max-w-[200px] ${item.isGroup ? 'text-indigo-900' : 'text-slate-900'}`} title={item.title}>
                                        {item.title}
                                    </div>
                                    {item.isGroup && <div className="text-[10px] text-indigo-500 font-bold uppercase tracking-wide">Product Group</div>}
                                </div>
                            </div>
                        </td>

                        {/* Mapped Product Column */}
                        <td className="px-4 py-4">
                            {item.isGroup ? (
                                <div className="flex items-center gap-1.5 text-indigo-700 bg-indigo-100/50 px-2 py-1 rounded w-fit">
                                    <CheckCircle2 size={14} className="shrink-0" />
                                    <span className="text-xs font-bold">Group Configured</span>
                                </div>
                            ) : item.mappedToSystemTitle ? (
                                <div className="flex items-center justify-between group">
                                    <div className="flex items-center gap-1.5 text-green-700">
                                        <CheckCircle2 size={14} className="shrink-0" />
                                        <span className="truncate max-w-[120px] text-xs font-bold" title={item.mappedToSystemTitle}>
                                            {item.mappedToSystemTitle}
                                        </span>
                                    </div>
                                    <button 
                                        onClick={() => openMapping(item.title)}
                                        className="text-slate-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Edit Link"
                                    >
                                        <Link size={14} />
                                    </button>
                                </div>
                            ) : (
                                <button 
                                    onClick={() => openMapping(item.title)}
                                    className="flex items-center gap-1.5 text-slate-400 hover:text-indigo-600 transition-colors text-xs font-medium border border-dashed border-slate-300 rounded px-2 py-1 hover:border-indigo-300 hover:bg-indigo-50"
                                >
                                    <Link size={12} /> Link to Inventory
                                </button>
                            )}
                        </td>

                        <td className="px-4 py-4 text-center font-bold text-slate-800">
                            {item.total_ordered}
                        </td>
                        <td className="px-4 py-4 text-center bg-orange-50/30">
                            <span className={`font-medium ${item.pending_fulfillment > 0 ? 'text-orange-600' : 'text-slate-300'}`}>
                                {item.pending_fulfillment}
                            </span>
                        </td>
                        <td className="px-4 py-4 text-center bg-blue-50/30">
                            <span className={`font-medium ${item.fulfilled > 0 ? 'text-blue-600' : 'text-slate-300'}`}>
                                {item.fulfilled}
                            </span>
                        </td>

                        <td className="px-1 py-4 text-center text-slate-300">
                            <ArrowRight size={14} />
                        </td>

                         <td className="px-4 py-4 text-center bg-purple-50/30">
                            <span className={`font-medium ${item.dispatched > 0 ? 'text-purple-600' : 'text-slate-300'}`}>
                                {item.dispatched}
                            </span>
                        </td>
                         <td className="px-4 py-4 text-center bg-green-50/30">
                            <span className={`font-bold ${item.delivered > 0 ? 'text-green-600' : 'text-slate-300'}`}>
                                {item.delivered}
                            </span>
                        </td>
                         <td className="px-4 py-4 text-center bg-red-50/30">
                             <span className={`font-bold ${item.rto > 0 ? 'text-red-600' : 'text-slate-300'}`}>
                                {item.rto}
                            </span>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      {/* Mapping Modal */}
      {mappingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                  <div className="flex justify-between items-start mb-4">
                      <h3 className="text-lg font-bold text-slate-900">Map Product</h3>
                      <button onClick={() => setMappingModal(null)} className="text-slate-400 hover:text-slate-600">
                          <X size={20} />
                      </button>
                  </div>
                  
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-6">
                      <p className="text-xs text-slate-500 uppercase font-bold mb-1">Shopify Item Title</p>
                      <p className="font-medium text-slate-900">{mappingModal.shopifyTitle}</p>
                  </div>

                  <div className="mb-6">
                      <label className="block text-sm font-medium text-slate-700 mb-2">Link to System Product</label>
                      <select 
                          className="w-full px-4 py-2.5 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                          value={selectedSystemProduct}
                          onChange={(e) => setSelectedSystemProduct(e.target.value)}
                      >
                          <option value="">-- Select Master Product --</option>
                          {products.map(p => (
                              <option key={p.id} value={p.id}>
                                  {p.title} {p.sku ? `(${p.sku})` : ''}
                              </option>
                          ))}
                      </select>
                      <p className="text-xs text-slate-400 mt-2 flex items-start gap-2">
                          <AlertCircle size={14} className="shrink-0 mt-0.5" />
                          If you link this to a product inside a Group, it will be aggregated into that group's stats automatically.
                      </p>
                  </div>

                  <div className="flex gap-3">
                      <button 
                        onClick={() => setMappingModal(null)}
                        className="flex-1 py-2.5 bg-white border border-slate-300 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50"
                      >
                          Cancel
                      </button>
                      <button 
                        onClick={saveMapping}
                        disabled={!selectedSystemProduct}
                        className="flex-1 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 disabled:opacity-50"
                      >
                          Save Mapping
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Reconciliation;
