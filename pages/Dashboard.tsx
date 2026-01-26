import React, { useMemo } from 'react';
import { Order, AdSpend, DashboardMetrics } from '../types';
import { calculateMetrics, formatCurrency } from '../services/calculator';
import KPICard from '../components/KPICard';
import ProfitChart from '../components/ProfitChart';
import { 
  Wallet, TrendingDown, PackageCheck, AlertTriangle, 
  Banknote, ArrowRightLeft 
} from 'lucide-react';

interface DashboardProps {
  orders: Order[];
  adSpend: AdSpend[];
}

const Dashboard: React.FC<DashboardProps> = ({ orders, adSpend }) => {
  const metrics: DashboardMetrics = useMemo(() => calculateMetrics(orders, adSpend), [orders, adSpend]);

  // Transform data for chart (Last 7 days aggregated)
  const chartData = useMemo(() => {
    const days: Record<string, { date: string, revenue: number, profit: number, expense: number }> = {};
    const now = new Date();
    
    // Initialize last 7 days
    for(let i=6; i>=0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const key = d.toISOString().split('T')[0];
        days[key] = { date: d.toLocaleDateString('en-US', {weekday: 'short'}), revenue: 0, profit: 0, expense: 0 };
    }

    // Populate data (Simplified for demo - usually would use the full calc engine per day)
    orders.forEach(o => {
        const key = o.created_at.split('T')[0];
        if (days[key] && o.status === 'DELIVERED') {
            days[key].revenue += o.cod_amount;
            // Rough estimation for chart
            const expense = (o.cod_amount * 0.6); 
            days[key].expense += expense;
            days[key].profit += (o.cod_amount - expense);
        }
    });

    return Object.values(days);
  }, [orders]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Financial Overview</h2>
          <p className="text-slate-500 text-sm">Real-time profit tracking including RTO deduction</p>
        </div>
        <div className="flex gap-2">
            <span className="bg-white border px-3 py-1 rounded text-sm text-slate-600">Last 30 Days</span>
            <button className="bg-brand-600 text-white px-4 py-1 rounded text-sm hover:bg-brand-700">Export Report</button>
        </div>
      </div>

      {/* Top Row: The Critical Numbers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KPICard 
          title="Net Profit (Real)" 
          value={formatCurrency(metrics.net_profit)} 
          subValue={`${metrics.roi.toFixed(1)}% ROI`}
          icon={Wallet} 
          color="green"
        />
        <KPICard 
          title="Pending Remittance" 
          value={formatCurrency(metrics.pending_remittance)} 
          subValue="Cash held by couriers"
          icon={Banknote} 
          color="amber"
        />
        <KPICard 
          title="RTO Rate" 
          value={`${metrics.rto_rate.toFixed(1)}%`} 
          subValue={`${metrics.rto_orders} Orders Returned`}
          icon={ArrowRightLeft} 
          trend="down"
          color="red"
        />
      </div>

      {/* Second Row: Detailed Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <KPICard 
          title="Gross Revenue" 
          value={formatCurrency(metrics.gross_revenue)} 
          icon={TrendingDown} 
          color="blue"
        />
        <KPICard 
          title="Ad Spend" 
          value={formatCurrency(metrics.total_ad_spend)} 
          icon={TrendingDown} 
          color="purple"
        />
         <KPICard 
          title="Shipping & RTO Cost" 
          value={formatCurrency(metrics.total_shipping_expense)} 
          icon={TrendingDown} 
          color="orange"
        />
         <KPICard 
          title="COGS" 
          value={formatCurrency(metrics.total_cogs)} 
          icon={PackageCheck} 
          color="slate"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-6">Revenue vs Profit Trend</h3>
          <ProfitChart data={chartData} />
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Cost Breakdown</h3>
          <div className="space-y-4">
            <CostBar label="COGS" amount={metrics.total_cogs} total={metrics.gross_revenue} color="bg-slate-500" />
            <CostBar label="Shipping (Fwd + RTO)" amount={metrics.total_shipping_expense} total={metrics.gross_revenue} color="bg-orange-500" />
            <CostBar label="Ad Spend" amount={metrics.total_ad_spend} total={metrics.gross_revenue} color="bg-purple-500" />
            <CostBar label="Packaging" amount={metrics.delivered_orders * 45} total={metrics.gross_revenue} color="bg-blue-400" />
          </div>
          
          <div className="mt-8 p-4 bg-red-50 rounded-lg border border-red-100">
            <div className="flex items-center gap-2 text-red-700 mb-2">
                <AlertTriangle size={16} />
                <span className="font-bold text-sm">Loss Alert: RTOs</span>
            </div>
            <p className="text-xs text-red-600">
                You lost <strong>{formatCurrency(metrics.rto_orders * 250)}</strong> approx. on RTO shipping fees this month.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const CostBar = ({ label, amount, total, color }: any) => {
    const percent = total > 0 ? (amount / total) * 100 : 0;
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