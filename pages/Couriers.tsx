import React, { useMemo } from 'react';
import { Order } from '../types';
import { calculateCourierPerformance, formatCurrency } from '../services/calculator';
import { Truck, AlertCircle, CheckCircle2, Banknote } from 'lucide-react';

interface CouriersProps {
  orders: Order[];
}

const Couriers: React.FC<CouriersProps> = ({ orders }) => {
  const stats = useMemo(() => calculateCourierPerformance(orders), [orders]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Courier Performance</h2>
          <p className="text-slate-500 text-sm">Analyze Delivery Rates & Remittance Health</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stats.map((courier) => (
          <div key={courier.name} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                    <Truck size={20} />
                  </div>
                  <h3 className="font-bold text-lg text-slate-900">{courier.name}</h3>
                </div>
                <div className={`px-2 py-1 rounded text-xs font-bold ${
                    courier.delivery_rate >= 80 ? 'bg-green-100 text-green-700' : 
                    courier.delivery_rate >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                }`}>
                  {courier.delivery_rate.toFixed(1)}% Success
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 flex items-center gap-2">
                    <CheckCircle2 size={14} /> Delivered
                  </span>
                  <span className="font-medium">{courier.delivered}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 flex items-center gap-2">
                    <AlertCircle size={14} /> Returned (RTO)
                  </span>
                  <span className="font-medium text-red-600">{courier.rto}</span>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2">
                    <div 
                        className={`h-1.5 rounded-full ${courier.delivery_rate >= 80 ? 'bg-green-500' : 'bg-orange-500'}`} 
                        style={{ width: `${courier.delivery_rate}%` }}
                    ></div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 bg-slate-50 -mx-6 -mb-6 p-4 flex justify-between items-center">
                <div className="flex items-center gap-2 text-slate-600">
                    <Banknote size={16} />
                    <span className="text-xs font-medium">Pending Remittance</span>
                </div>
                <span className="font-bold text-slate-800">{formatCurrency(courier.cash_pending)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Couriers;