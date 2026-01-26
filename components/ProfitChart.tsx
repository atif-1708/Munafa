import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { formatCurrency } from '../services/calculator';

interface ProfitChartProps {
  data: any[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl text-xs">
        <p className="font-bold mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {formatCurrency(entry.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const ProfitChart: React.FC<ProfitChartProps> = ({ data }) => {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis 
            dataKey="date" 
            axisLine={false} 
            tickLine={false} 
            tick={{fontSize: 12, fill: '#64748b'}} 
          />
          <YAxis 
            hide 
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar dataKey="revenue" stackId="a" fill="#22c55e" name="Revenue" radius={[0, 0, 4, 4]} />
          <Bar dataKey="profit" stackId="b" fill="#15803d" name="Net Profit" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" stackId="b" fill="#ef4444" name="Expenses (Ads+Ship+COGS)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ProfitChart;