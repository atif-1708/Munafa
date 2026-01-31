
import React, { useMemo, useState } from 'react';
import { Order, AdSpend, DashboardMetrics, OrderStatus, ShopifyOrder } from '../types';
import { calculateMetrics, formatCurrency } from '../services/calculator';
import KPICard from '../components/KPICard';
import ProfitChart from '../components/ProfitChart';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { 
  Wallet, TrendingDown, PackageCheck, AlertTriangle, 
  Banknote, ArrowRightLeft, Calendar, Package, Truck, CheckCircle, ShoppingBasket, Hourglass, Clock, BarChart3, ClipboardList, Clipboard, Filter, Receipt, FileText, ShoppingCart, CheckSquare, XCircle, Download, Loader2
} from 'lucide-react';

interface DashboardProps {
  orders: Order[];
  shopifyOrders?: ShopifyOrder[];
  adSpend: AdSpend[];
  adsTaxRate?: number;
  storeName?: string;
}

const Dashboard: React.FC<DashboardProps> = ({ orders, shopifyOrders = [], adSpend, adsTaxRate = 0, storeName = 'My Store' }) => {
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

  const [isExporting, setIsExporting] = useState(false);

  // Filter Data based on Range
  const filteredData = useMemo(() => {
    const start = new Date(dateRange.start);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateRange.end);
    end.setHours(23, 59, 59, 999);

    return {
      orders: orders.filter(o => {
        const d = new Date(o.created_at);
        return d >= start && d <= end;
      }),
      shopifyOrders: shopifyOrders.filter(o => {
          const d = new Date(o.created_at);
          return d >= start && d <= end;
      }),
      adSpend: adSpend.filter(a => {
        const d = new Date(a.date);
        return d >= start && d <= end;
      })
    };
  }, [orders, shopifyOrders, adSpend, dateRange]);

  const metrics: DashboardMetrics = useMemo(() => calculateMetrics(filteredData.orders, filteredData.adSpend, adsTaxRate), [filteredData, adsTaxRate]);

  // Shopify Order Flow Metrics (Based on Raw Shopify Data)
  const shopifyMetrics = useMemo(() => {
      // 1. Deduplicate Orders by ID to ensure we count Orders, not lines/items.
      const uniqueOrdersMap = new Map<number, ShopifyOrder>();
      filteredData.shopifyOrders.forEach(o => {
          if (!uniqueOrdersMap.has(o.id)) {
              uniqueOrdersMap.set(o.id, o);
          }
      });
      
      const orders = Array.from(uniqueOrdersMap.values());
      const total = orders.length;
      
      let pending = 0;
      let cancelled = 0;
      let confirmed = 0;

      orders.forEach(o => {
          const isCancelled = o.cancel_reason !== null;
          // In Shopify: fulfilled = confirmed/processed. null = unfulfilled/pending.
          const isFulfilled = o.fulfillment_status === 'fulfilled' || o.fulfillment_status === 'partial';
          
          if (isCancelled) {
              cancelled++;
          } else if (isFulfilled) {
              confirmed++;
          } else {
              // Not cancelled, Not fulfilled -> Pending Action
              pending++;
          }
      });

      return { total, pending, cancelled, confirmed };
  }, [filteredData.shopifyOrders]);

  // Transform data for chart based on selected range
  const chartData = useMemo(() => {
    const days: Record<string, { date: string, revenue: number, profit: number, expense: number }> = {};
    
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];

    // Initialize all days in range to ensure continuity in chart
    const current = new Date(start);
    while (current <= end) {
      const key = current.toISOString().split('T')[0];
      days[key] = { 
        date: current.toLocaleDateString('en-US', {month: 'short', day: 'numeric'}), 
        revenue: 0, profit: 0, expense: 0 
      };
      current.setDate(current.getDate() + 1);
    }

    filteredData.orders.forEach(o => {
        const key = o.created_at.split('T')[0];
        if (days[key]) {
             const isDelivered = o.status === OrderStatus.DELIVERED;
             const isDispatched = o.status !== OrderStatus.PENDING && o.status !== OrderStatus.BOOKED && o.status !== OrderStatus.CANCELLED;
             
             if (isDelivered) {
                 days[key].revenue += o.cod_amount;
             }
             
             if (isDispatched) {
                 const shipping = o.courier_fee + o.packaging_cost + o.rto_penalty + o.overhead_cost;
                 const cogs = o.items.reduce((sum, item) => sum + (item.cogs_at_time_of_order * item.quantity), 0);
                 const tax = o.tax_amount || 0;
                 
                 const totalOrderExpense = shipping + cogs + tax;

                 days[key].expense += totalOrderExpense;
                 
                 if (isDelivered) {
                     days[key].profit += (o.cod_amount - totalOrderExpense); 
                 } else {
                     days[key].profit -= totalOrderExpense;
                 }
             }
        }
    });
    
    // Add Ad Spend & Tax to expenses/profit
    // Note: Ad spend doesn't have an exact timestamp usually, just date.
    filteredData.adSpend.forEach(ad => {
         const key = ad.date;
         if (days[key]) {
             // NEW LOGIC: Only apply tax if platform is NOT TikTok
             const taxAmount = ad.platform === 'TikTok' ? 0 : ad.amount_spent * (adsTaxRate/100);
             const amountWithTax = ad.amount_spent + taxAmount;
             
             days[key].expense += amountWithTax;
             days[key].profit -= amountWithTax;
         }
    });

    return Object.values(days);
  }, [filteredData, dateRange, adsTaxRate]);

  const calculatePercentage = (count: number, total: number = shopifyMetrics.total) => {
      if (total === 0) return '0%';
      return `${((count / total) * 100).toFixed(1)}%`;
  };

  const calculateOpsPercentage = (count: number, total: number = metrics.dispatched_orders) => {
    if (total === 0) return '0%';
    return `${((count / total) * 100).toFixed(1)}%`;
  };

  const handleExportPDF = async () => {
    const element = document.getElementById('dashboard-content');
    if (!element) return;
    
    setIsExporting(true);
    try {
      // Allow any state updates to flush
      await new Promise(r => setTimeout(r, 100));

      const canvas = await html2canvas(element, {
        scale: 2, 
        useCORS: true,
        logging: false,
        backgroundColor: '#f8fafc',
        ignoreElements: (el) => el.classList.contains('no-print') // Ignore filter controls if marked
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      
      // Calculate height to fit width
      const pdfImgHeight = (imgHeight * pdfWidth) / imgWidth;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfImgHeight);
      
      const fileName = `${storeName.replace(/\s+/g, '_')}_Executive_Dashboard_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
    } catch (e) {
      console.error("PDF Export Error", e);
      alert("Failed to generate PDF report.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div id="dashboard-content" className="space-y-8 pb-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Executive Dashboard</h2>
          <p className="text-slate-500 text-sm mt-1">Snapshot of your business performance & financial health.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 no-print">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
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
            <button 
                onClick={handleExportPDF}
                disabled={isExporting}
                className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-70"
            >
              {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {isExporting ? 'Generating...' : 'Export PDF'}
            </button>
        </div>
      </div>

      {/* Section 1: Financial Health */}
      <div>
        <div className="flex items-center gap-2 mb-4">
            <div className="h-6 w-1 bg-brand-600 rounded-full"></div>
            <h3 className="text-lg font-bold text-slate-800">Financial Performance (Cash Basis)</h3>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            <KPICard 
              title="Delivered Revenue" 
              value={formatCurrency(metrics.gross_revenue)} 
              subValue="Realized Cash"
              icon={Banknote} 
              color="blue"
            />
            <KPICard 
              title="Total COGS" 
              value={formatCurrency(metrics.total_cogs)} 
              subValue="Dispatched Products Cost"
              icon={ShoppingBasket} 
              color="slate"
            />
            <KPICard 
              title="Shipping Spend" 
              value={formatCurrency(metrics.total_shipping_expense)} 
              subValue="Couriers + Packaging"
              icon={Truck} 
              color="orange"
            />
            <KPICard 
              title="Marketing Spend" 
              value={formatCurrency(metrics.total_ad_spend)} 
              subValue={`Incl. ${formatCurrency(metrics.total_ads_tax)} Tax`}
              icon={BarChart3} 
              color="pink"
            />
             <KPICard 
              title="Courier Tax & Fees" 
              value={formatCurrency(metrics.total_courier_tax)} 
              subValue="Deducted from Sales"
              icon={Receipt} 
              color="red"
            />
             <KPICard 
              title="Overhead Costs" 
              value={formatCurrency(metrics.total_overhead_cost)} 
              subValue="Fixed Ops Cost"
              icon={FileText} 
              color="yellow"
            />
             <KPICard 
              title="Gross Profit" 
              value={formatCurrency(metrics.gross_profit)} 
              subValue="After Ad Spend"
              icon={Wallet} 
              color="indigo"
            />
            <KPICard 
              title="Net Profit" 
              value={formatCurrency(metrics.net_profit)} 
              subValue={`Real Cash Profit (${metrics.roi.toFixed(1)}% ROI)`}
              icon={Wallet} 
              color="emerald"
            />
        </div>
      </div>

      {/* Section 1.5: Shopify Order Flow */}
      <div>
        <div className="flex items-center gap-2 mb-4 mt-8">
            <div className="h-6 w-1 bg-teal-600 rounded-full"></div>
            <h3 className="text-lg font-bold text-slate-800">Shopify Order Flow</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <KPICard 
              title="Total Orders" 
              value={shopifyMetrics.total.toString()} 
              subValue="Imported Volume"
              icon={ShoppingCart} 
              color="slate"
            />
            <KPICard 
              title="Confirmed" 
              value={shopifyMetrics.confirmed.toString()} 
              subValue={`${calculatePercentage(shopifyMetrics.confirmed)} Fulfilled`}
              icon={CheckSquare} 
              color="blue"
            />
            <KPICard 
              title="Pending" 
              value={shopifyMetrics.pending.toString()} 
              subValue={`${calculatePercentage(shopifyMetrics.pending)} Unfulfilled`}
              icon={Clock} 
              color="yellow"
            />
             <KPICard 
              title="Cancelled" 
              value={shopifyMetrics.cancelled.toString()} 
              subValue={`${calculatePercentage(shopifyMetrics.cancelled)} Rate`}
              icon={XCircle} 
              color="red"
            />
        </div>
      </div>

      {/* Section 2: Operational Health */}
      <div>
        <div className="flex items-center gap-2 mb-4 mt-8">
            <div className="h-6 w-1 bg-indigo-600 rounded-full"></div>
            <h3 className="text-lg font-bold text-slate-800">Order Operations</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5">
            <KPICard 
              title="Dispatched Orders" 
              value={metrics.dispatched_orders.toString()} 
              subValue="Left Warehouse"
              icon={Package} 
              color="slate"
            />
            <KPICard 
              title="Delivered" 
              value={metrics.delivered_orders.toString()} 
              subValue={`${calculateOpsPercentage(metrics.delivered_orders)} Success`}
              icon={CheckCircle} 
              color="green"
            />
             <KPICard 
              title="In Transit" 
              value={metrics.in_transit_orders.toString()} 
              subValue={`${calculateOpsPercentage(metrics.in_transit_orders)} Active`}
              icon={Clock} 
              color="blue"
            />
            <KPICard 
              title="Returned (RTO)" 
              value={metrics.rto_orders.toString()} 
              subValue={`${metrics.rto_rate.toFixed(1)}% Loss Rate`}
              icon={ArrowRightLeft} 
              trend="down"
              color="red"
            />
             <KPICard 
              title="Booked" 
              value={metrics.booked_orders.toString()} 
              subValue="Ready to Ship"
              icon={Clipboard} 
              color="indigo"
            />
            <KPICard 
              title="Unbooked" 
              value={metrics.unbooked_orders.toString()} 
              subValue="Action Required"
              icon={ClipboardList} 
              color="yellow"
            />
        </div>
      </div>

      {/* Section 3: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-6">
             <h3 className="text-lg font-bold text-slate-800">Profitability Trend</h3>
             <div className="flex items-center gap-2">
                 <div className="flex items-center gap-1 text-xs text-slate-500"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Revenue</div>
                 <div className="flex items-center gap-1 text-xs text-slate-500"><span className="w-2 h-2 rounded-full bg-emerald-700"></span> Profit</div>
                 <div className="flex items-center gap-1 text-xs text-slate-500"><span className="w-2 h-2 rounded-full bg-red-500"></span> Expense</div>
             </div>
          </div>
          <div className="flex-1 min-h-[300px]">
            {chartData.length > 0 ? (
                <ProfitChart data={chartData} />
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <BarChart3 size={32} className="mb-2 opacity-50" />
                    <p>No data available for the selected range.</p>
                </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Cost Breakdown</h3>
          <div className="space-y-6">
            <CostBar label="COGS (Dispatched)" amount={metrics.total_cogs} total={metrics.gross_revenue} color="bg-slate-600" />
            <CostBar label="Shipping (Fwd + RTO)" amount={metrics.total_shipping_expense} total={metrics.gross_revenue} color="bg-orange-500" />
            <CostBar label="Marketing Ads (+Tax)" amount={metrics.total_ad_spend} total={metrics.gross_revenue} color="bg-pink-500" />
            
            {(metrics.total_overhead_cost > 0 || metrics.total_courier_tax > 0) && (
                <>
                    <CostBar label="Fixed Overhead" amount={metrics.total_overhead_cost} total={metrics.gross_revenue} color="bg-indigo-400" />
                    <CostBar label="Courier/Sales Tax" amount={metrics.total_courier_tax} total={metrics.gross_revenue} color="bg-red-400" />
                </>
            )}

            <div className="my-4 border-t border-dashed border-slate-200"></div>

            <CostBar label="Inventory In Transit" amount={metrics.cash_in_transit_stock} total={metrics.total_cogs} color="bg-purple-500" />
          </div>
          
          {metrics.rto_orders > 0 && (
            <div className="mt-8 p-4 bg-red-50 rounded-lg border border-red-100 shadow-sm">
                <div className="flex items-center gap-2 text-red-700 mb-1">
                    <AlertTriangle size={18} />
                    <span className="font-bold text-sm">RTO Impact Alert</span>
                </div>
                <p className="text-xs text-red-600 leading-relaxed">
                    RTOs have cost you approximately <strong>{formatCurrency(metrics.rto_orders * 250)}</strong> in shipping fees alone this period. This does not include ad spend wasted on these orders.
                </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const CostBar = ({ label, amount, total, color }: { label: string, amount: number, total: number, color: string }) => {
    // Avoid division by zero. If total is 0, use amount as base if it exists, else 1.
    const displayTotal = total > 0 ? total : (amount > 0 ? amount * 1.5 : 1); 
    const percent = Math.min((amount / displayTotal) * 100, 100);
    
    return (
        <div>
            <div className="flex justify-between items-end mb-2">
                <span className="text-sm font-medium text-slate-600">{label}</span>
                <span className="font-bold text-slate-900">{formatCurrency(amount)}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${percent}%` }}></div>
            </div>
        </div>
    )
}

export default Dashboard;
