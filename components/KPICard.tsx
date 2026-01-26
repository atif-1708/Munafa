import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string;
  subValue?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  color?: string;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, subValue, icon: Icon, trend, color = "brand" }) => {
  return (
    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
          <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
          {subValue && (
            <p className={`text-xs mt-2 font-medium ${
                trend === 'down' ? 'text-red-600' : 'text-green-600'
            }`}>
              {subValue}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-lg bg-${color}-50 text-${color}-600`}>
          <Icon size={24} />
        </div>
      </div>
    </div>
  );
};

export default KPICard;