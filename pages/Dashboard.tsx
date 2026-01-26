import React, { useMemo, useState } from 'react';
import { Order, AdSpend, DashboardMetrics, OrderStatus } from '../types';
import { calculateMetrics, formatCurrency } from '../services/calculator';
import KPICard from '../components/KPICard';
import ProfitChart from '../components/ProfitChart';
import { 
  Wallet, TrendingDown, PackageCheck, AlertTriangle, 
  Banknote, ArrowRightLeft, Calendar, Package, Truck, CheckCircle, ShoppingBasket, Hourglass, Clock, BarChart3, ClipboardList, Clipboard
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
             // Calculate specifics for this day
             // Simplified day-by-day logic to mirror the main calc logic
             const isDelivered = o.status === OrderStatus.DELIVERED;
             const isDispatched = o.status !== OrderStatus.PENDING && o.status !== OrderStatus.BOOKED && o.status !== OrderStatus.CANCELLED;
             
             if (isDelivered) {
                 days[key].revenue += o.cod_amount;
             }
             
             if (isDispatched) {
                 const shipping = o.courier_fee + o.packaging_cost + o.rto_penalty;
                 const cogs = o.items.reduce((sum, item) => sum + (item.cogs_at_time_of_order * item.quantity), 0);
                 
                 days[key].expense += (shipping + cogs);
                 
                 if (isDelivered) {
                     // For chart profit, we align mainly with delivered logic but subtract all expenses
                     days[key].profit += (o.cod_amount - (shipping + cogs)); 
                 } else {
                     // For non-delivered dispatched items, it's a negative cash flow for that day (expense but no revenue)
                     days[key].profit -= (shipping + cogs);
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
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Financial Overview</h2>
          <p className="text-slate-500 text-sm">Real-time cash flow & profit tracking</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
            <Calendar size={16} className="text-slate-500 ml-2" />
            <input 
              type="date" 
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="text-sm text-slate-600 border-none focus:ring-0 outline-none w-32"
            />
            <span className="text-slate-400">-</span>
            <input 
              type="date" 
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="text-sm text-slate-600 border-none focus:ring-0 outline-none w-32"
            />
            <button className="bg-brand-600 text-white px-4 py-1.5 rounded text-sm hover:bg-brand-700 ml-2">
              Export
            </button>
        </div>
      </div>

      {/* Row 1: High Level Financials */}
      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Financials (Cash Basis)</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard 
          title="Delivered Sale" 
          value={formatCurrency(metrics.gross_revenue)} 
          subValue="Realized Revenue"
          icon={Banknote} 
          color="blue"
        />
        <KPICard 
          title="Total COGS" 
          value={formatCurrency(metrics.total_cogs)} 
          subValue="All Dispatched Inv."
          icon={ShoppingBasket} 
          color="slate"
        />
        <KPICard 
          title="Shipping Expense" 
          value={formatCurrency(metrics.total_shipping_expense)} 
          subValue="Fwd + RTO Charges"
          icon={Truck} 
          color="orange"
        />
        <KPICard 
          title="Ad Spend" 
          value={formatCurrency(metrics.total_ad_spend)} 
          subValue="Marketing Costs"
          icon={BarChart3} 
          color="pink"
        />
        <KPICard 
          title="Cash In Stock" 
          value={formatCurrency(metrics.cash_in_transit_stock)} 
          subValue="In-Transit / RTO"
          icon={Hourglass} 
          color="purple"
        />
        <KPICard 
          title="Real Net Profit" 
          value={formatCurrency(metrics.net_profit)} 
          subValue={`${metrics.roi.toFixed(1)}% ROI`}
          icon={Wallet} 
          color="green"
        />
      </div>

      {/* Row 2: Order Volume */}
      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mt-2">Order Statistics</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard 
          title="Total Orders" 
          value={metrics.total_orders.toString()} 
          subValue="In selected period"
          icon={Package} 
          color="slate"
        />
        <KPICard 
          title="Unbooked" 
          value={metrics.unbooked_orders.toString()} 
          subValue={`${calculatePercentage(metrics.unbooked_orders)} of Total`}
          icon={ClipboardList} 
          color="yellow"
        />
        <KPICard 
          title="Booked" 
          value={metrics.booked_orders.toString()} 
          subValue={`${calculatePercentage(metrics.booked_orders)} of Total`}
          icon={Clipboard} 
          color="indigo"
        />
        <KPICard 
          title="In Transit" 
          value={metrics.in_transit_orders.toString()} 
          subValue={`${calculatePercentage(metrics.in_transit_orders)} of Total`}
          icon={Clock} 
          color="blue"
        />
         <KPICard 
          title="Delivered" 
          value={metrics.delivered_orders.toString()} 
          subValue={`${calculatePercentage(metrics.delivered_orders)} of Total`}
          icon={CheckCircle} 
          color="emerald"
        />
        <KPICard 
          title="Returned (RTO)" 
          value={metrics.rto_orders.toString()} 
          subValue={`${metrics.rto_rate.toFixed(1)}% Rate`}
          icon={ArrowRightLeft} 
          trend="down"
          color="red"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Revenue vs Profit Trend</h3>
          {chartData.length > 0 ? (
            <ProfitChart data={chartData} />
          ) : (
            <div className="h-80 flex items-center justify-center text-slate-400">
              No data for selected period
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Cost Breakdown</h3>
          <div className="space-y-4">
            <CostBar label="Dispatched COGS" amount={metrics.total_cogs} total={metrics.gross_revenue} color="bg-slate-500" />
            <CostBar label="Shipping (Fwd + RTO)" amount={metrics.total_shipping_expense} total={metrics.gross_revenue} color="bg-orange-500" />
            <CostBar label="Ad Spend" amount={metrics.total_ad_spend} total={metrics.gross_revenue} color="bg-purple-500" />
            <CostBar label="Inventory In Transit" amount={metrics.cash_in_transit_stock} total={metrics.total_cogs} color="bg-indigo-400" />
          </div>
          
          <div className="mt-8 p-4 bg-red-50 rounded-lg border border-red-100">
            <div className="flex items-center gap-2 text-red-700 mb-2">
                <AlertTriangle size={16} />
                <span className="font-bold text-sm">Loss Alert: RTOs</span>
            </div>
            <p className="text-xs text-red-600">
                You lost <strong>{formatCurrency(metrics.rto_orders * 250)}</strong> approx. on RTO shipping fees this period.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const CostBar = ({ label, amount, total, color }: any) => {
    // Avoid division by zero
    const displayTotal = total > 0 ? total : (amount > 0 ? amount * 1.5 : 100); 
    const percent = Math.min((amount / displayTotal) * 100, 100);
    
    return (
        <div>
            <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">{label}</span>
                <span className="font-medium">{formatCurrency(amount)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
                <div className={`h-2 rounded-full ${color}`} style={{ width: `${percent}%` }}></div>
            </div>
        </div>
    )
}

export default Dashboard;