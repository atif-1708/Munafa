import React, { useMemo, useState } from 'react';
import { Order, AdSpend, DashboardMetrics, OrderStatus } from '../types';
import { calculateMetrics, formatCurrency } from '../services/calculator';
import KPICard from '../components/KPICard';
import ProfitChart from '../components/ProfitChart';
import { 
  Wallet, TrendingDown, PackageCheck, AlertTriangle, 
  Banknote, ArrowRightLeft, Calendar, Package, Truck, CheckCircle, ShoppingBasket, Hourglass, Clock, BarChart3, ClipboardList, Clipboard, Filter
} from 'lucide-react';

interface DashboardProps {
  orders: Order[];
  adSpend: AdSpend[];
}

const Dashboard: React.FC<DashboardProps> = ({ orders, adSpend }) => {
  // Default to Last 30 Days
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  });

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
      adSpend: adSpend.filter(a => {
        const d = new Date(a.date);
        return d >= start && d <= end;
      })
    };
  }, [orders, adSpend, dateRange]);

  const metrics: DashboardMetrics = useMemo(() => calculateMetrics(filteredData.orders, filteredData.adSpend), [filteredData]);

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

    return Object.values(days);
  }, [filteredData, dateRange]);

  const calculatePercentage = (count: number) => {
      if (metrics.total_orders === 0) return '0%';
      return `${((count / metrics.total_orders) * 100).toFixed(1)}%`;
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Executive Dashboard</h2>
          <p className="text-slate-500 text-sm mt-1">Snapshot of your business performance & financial health.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
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
            <button className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm">
              <Filter size={16} /> Filter
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
              subValue="Product Cost (Sold+Inv)"
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
              subValue="Ads (FB/TikTok/Google)"
              icon={BarChart3} 
              color="pink"
            />
             <KPICard 
              title="Cash Stuck in Network" 
              value={formatCurrency(metrics.cash_in_transit_stock)} 
              subValue="Inventory Dispatched"
              icon={Hourglass} 
              color="purple"
            />
             <KPICard 
              title="Gross Profit" 
              value={formatCurrency(metrics.gross_profit)} 
              subValue="Before Cash Deductions"
              icon={Wallet} 
              color="indigo"
            />
            <KPICard 
              title="Real Net Profit" 
              value={formatCurrency(metrics.net_profit)} 
              subValue={`${metrics.roi.toFixed(1)}% ROI`}
              icon={Wallet} 
              color="emerald"
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
              title="Total Orders" 
              value={metrics.total_orders.toString()} 
              subValue="All Statuses"
              icon={Package} 
              color="slate"
            />
            <KPICard 
              title="Delivered" 
              value={metrics.delivered_orders.toString()} 
              subValue={`${calculatePercentage(metrics.delivered_orders)} Success`}
              icon={CheckCircle} 
              color="green"
            />
             <KPICard 
              title="In Transit" 
              value={metrics.in_transit_orders.toString()} 
              subValue={`${calculatePercentage(metrics.in_transit_orders)} Active`}
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
            <CostBar label="Marketing Ads" amount={metrics.total_ad_spend} total={metrics.gross_revenue} color="bg-pink-500" />
            
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