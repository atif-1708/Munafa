import React, { useMemo } from 'react';
import { Order, Product } from '../types';
import { calculateProductPerformance, formatCurrency } from '../services/calculator';
import { TrendingUp, Package } from 'lucide-react';

interface ProfitabilityProps {
  orders: Order[];
  products: Product[];
}

const Profitability: React.FC<ProfitabilityProps> = ({ orders, products }) => {
  const data = useMemo(() => calculateProductPerformance(orders, products), [orders, products]);

  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
            <div>
            <h2 className="text-2xl font-bold text-slate-900">Product Profitability</h2>
            <p className="text-slate-500 text-sm">Gross Profit (Sales - COGS) before Ad Spend & Shipping</p>
            </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                        <th className="px-6 py-4 font-semibold text-slate-700">Product Details</th>
                        <th className="px-6 py-4 font-semibold text-slate-700 text-right">Units Sold</th>
                        <th className="px-6 py-4 font-semibold text-slate-700 text-right">Revenue</th>
                        <th className="px-6 py-4 font-semibold text-slate-700 text-right">COGS</th>
                        <th className="px-6 py-4 font-semibold text-slate-700 text-right">Gross Profit</th>
                        <th className="px-6 py-4 font-semibold text-slate-700 text-right">Margin</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {data.map((item) => {
                        const margin = item.gross_revenue > 0 ? (item.gross_profit / item.gross_revenue) * 100 : 0;
                        return (
                            <tr key={item.id} className="hover:bg-slate-50">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-400">
                                            <Package size={16} />
                                        </div>
                                        <div>
                                            <div className="font-medium text-slate-900">{item.title}</div>
                                            <div className="text-xs text-slate-500">{item.sku}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right font-medium text-slate-600">{item.units_sold}</td>
                                <td className="px-6 py-4 text-right text-slate-600">{formatCurrency(item.gross_revenue)}</td>
                                <td className="px-6 py-4 text-right text-slate-600">{formatCurrency(item.cogs_total)}</td>
                                <td className="px-6 py-4 text-right font-bold text-green-700">{formatCurrency(item.gross_profit)}</td>
                                <td className="px-6 py-4 text-right">
                                    <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${margin > 40 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                        {margin.toFixed(0)}%
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    </div>
  );
};

export default Profitability;