import React, { useMemo, useState } from 'react';
import { Order, Product, AdSpend, OrderStatus } from '../types';
import { calculateProductPerformance, formatCurrency, ProductPerformance } from '../services/calculator';
import { TrendingUp, Package, AlertCircle, Eye, X, ArrowRight, Truck, ShoppingBag, Banknote, CheckCircle2, RotateCcw, Clock } from 'lucide-react';

interface ProfitabilityProps {
  orders: Order[];
  products: Product[];
  adSpend?: AdSpend[];
}

const Profitability: React.FC<ProfitabilityProps> = ({ orders, products, adSpend = [] }) => {
  const data = useMemo(() => calculateProductPerformance(orders, products, adSpend), [orders, products, adSpend]);
  const [selectedItem, setSelectedItem] = useState<ProductPerformance | null>(null);

  return (
    <div className="space-y-6 relative">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Deep Profit Analysis</h2>
          <p className="text-slate-500 text-sm">Real Net Profit per SKU (Revenue - COGS - Shipping Losses - Ads)</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700">Product</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-center">Sales</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-center">RTO %</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-right">Revenue</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-right">COGS</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-right">Cash Stuck</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-right">Net Profit</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((item) => {
                const isProfitable = item.net_profit > 0;
                return (
                  <tr key={item.id + item.sku} className="hover:bg-slate-50">
                    <td className="px-6 py-4 max-w-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                          <Package size={16} />
                        </div>
                        <div>
                          <div className="font-medium text-slate-900 truncate">{item.title}</div>
                          <div className="text-xs text-slate-500">{item.sku}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="font-medium text-slate-700">{item.units_sold}</div>
                      <div className="text-xs text-green-600">Delivered</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className={`font-medium ${item.rto_rate > 20 ? 'text-red-600' : 'text-slate-700'}`}>
                        {item.rto_rate.toFixed(1)}%
                      </div>
                      <div className="text-xs text-slate-400">{item.units_returned} returned</div>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-slate-700">{formatCurrency(item.gross_revenue)}</td>
                    <td className="px-6 py-4 text-right text-slate-500">{formatCurrency(item.cogs_total)}</td>
                    <td className="px-6 py-4 text-right">
                        <span className="text-indigo-600 font-medium">{formatCurrency(item.cash_in_stock)}</span>
                        <div className="text-[10px] text-slate-400">In Transit</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className={`font-bold ${isProfitable ? 'text-green-700' : 'text-red-600'}`}>
                        {formatCurrency(item.net_profit)}
                      </div>
                      {item.gross_revenue > 0 && (
                        <div className="text-xs text-slate-400">
                          {((item.net_profit / item.gross_revenue) * 100).toFixed(0)}% Margin
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                        <button 
                            onClick={() => setSelectedItem(item)}
                            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-brand-600 transition-colors"
                            title="View Details"
                        >
                            <Eye size={18} />
                        </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                    <div className="flex gap-4">
                        <div className="w-12 h-12 bg-white rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 shadow-sm">
                            <Package size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-900">{selectedItem.title}</h3>
                            <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                                <span className="font-mono bg-slate-200 px-2 py-0.5 rounded text-xs text-slate-700">{selectedItem.sku}</span>
                                <span>•</span>
                                <span>{selectedItem.units_sold + selectedItem.units_returned + selectedItem.units_in_transit} Total Dispatched</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={() => setSelectedItem(null)} className="text-slate-400 hover:text-slate-600 p-1">
                        <X size={24} />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 p-6">
                    {/* KPI Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                        <div className={`p-4 rounded-xl border ${selectedItem.net_profit > 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                            <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${selectedItem.net_profit > 0 ? 'text-green-600' : 'text-red-600'}`}>Net Profit</p>
                            <h4 className={`text-2xl font-bold ${selectedItem.net_profit > 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(selectedItem.net_profit)}</h4>
                        </div>
                        <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Profit Margin</p>
                            <h4 className="text-2xl font-bold text-slate-800">
                                {selectedItem.gross_revenue > 0 ? ((selectedItem.net_profit / selectedItem.gross_revenue) * 100).toFixed(1) : 0}%
                            </h4>
                        </div>
                        <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Sales</p>
                            <h4 className="text-2xl font-bold text-slate-800">{formatCurrency(selectedItem.gross_revenue)}</h4>
                        </div>
                        <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">RTO Rate</p>
                            <div className="flex items-baseline gap-2">
                                <h4 className={`text-2xl font-bold ${selectedItem.rto_rate > 20 ? 'text-red-600' : 'text-slate-800'}`}>
                                    {selectedItem.rto_rate.toFixed(1)}%
                                </h4>
                                <span className="text-xs text-slate-400">({selectedItem.units_returned} units)</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Cost Breakdown */}
                        <div>
                            <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <Banknote size={18} className="text-slate-500" /> Financial Breakdown
                            </h4>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                                    <span className="text-sm text-slate-600">Gross Revenue</span>
                                    <span className="font-semibold text-slate-900">{formatCurrency(selectedItem.gross_revenue)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                                    <span className="text-sm text-slate-600">COGS (Realized Sold)</span>
                                    <span className="font-semibold text-slate-900">-{formatCurrency(selectedItem.cogs_total)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                                    <span className="text-sm text-slate-600">Shipping & Packaging</span>
                                    <span className="font-semibold text-red-500">-{formatCurrency(selectedItem.shipping_cost_allocation)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                                    <span className="text-sm text-slate-600">Ad Spend Allocation</span>
                                    <span className="font-semibold text-purple-600">-{formatCurrency(selectedItem.ad_spend_allocation)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-indigo-800">Cash in Stock (In Transit/RTO)</span>
                                        <span className="text-[10px] text-indigo-500">Asset Value currently in network</span>
                                    </div>
                                    <span className="font-bold text-indigo-700">{formatCurrency(selectedItem.cash_in_stock)}</span>
                                </div>
                                <div className="border-t border-slate-200 pt-3 flex justify-between items-center px-3">
                                    <span className="font-bold text-slate-900">Net Profit</span>
                                    <span className={`font-bold ${selectedItem.net_profit > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {formatCurrency(selectedItem.net_profit)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Order Statistics (Replaced Recent Orders) */}
                        <div>
                            <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <ShoppingBag size={18} className="text-slate-500" /> Order Statistics
                            </h4>
                            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden p-6 space-y-6">
                                
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-slate-100 text-slate-600 rounded-lg">
                                            <Package size={20} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-slate-500">Total Dispatched</p>
                                            <p className="text-lg font-bold text-slate-900">{selectedItem.units_sold + selectedItem.units_returned + selectedItem.units_in_transit}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                         <p className="text-xs text-slate-400">Total Units</p>
                                    </div>
                                </div>

                                <div className="h-px bg-slate-100"></div>

                                <div className="space-y-4">
                                    {/* Delivered */}
                                    <div>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="flex items-center gap-2 text-slate-600">
                                                <CheckCircle2 size={14} className="text-green-500" /> Delivered
                                            </span>
                                            <span className="font-medium">{selectedItem.units_sold}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-2 rounded-full">
                                            <div 
                                                className="bg-green-500 h-2 rounded-full" 
                                                style={{width: `${((selectedItem.units_sold / (selectedItem.units_sold + selectedItem.units_returned + selectedItem.units_in_transit || 1)) * 100)}%`}}
                                            ></div>
                                        </div>
                                    </div>

                                    {/* In Transit */}
                                    <div>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="flex items-center gap-2 text-slate-600">
                                                <Clock size={14} className="text-blue-500" /> In Transit
                                            </span>
                                            <span className="font-medium">{selectedItem.units_in_transit}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-2 rounded-full">
                                            <div 
                                                className="bg-blue-500 h-2 rounded-full" 
                                                style={{width: `${((selectedItem.units_in_transit / (selectedItem.units_sold + selectedItem.units_returned + selectedItem.units_in_transit || 1)) * 100)}%`}}
                                            ></div>
                                        </div>
                                    </div>

                                    {/* Returned */}
                                    <div>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="flex items-center gap-2 text-slate-600">
                                                <RotateCcw size={14} className="text-red-500" /> Returned (RTO)
                                            </span>
                                            <span className="font-medium">{selectedItem.units_returned}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-2 rounded-full">
                                            <div 
                                                className="bg-red-500 h-2 rounded-full" 
                                                style={{width: `${((selectedItem.units_returned / (selectedItem.units_sold + selectedItem.units_returned + selectedItem.units_in_transit || 1)) * 100)}%`}}
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Profitability;