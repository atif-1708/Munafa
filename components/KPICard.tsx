import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string;
  subValue?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'brand' | 'blue' | 'slate' | 'orange' | 'pink' | 'purple' | 'green' | 'yellow' | 'red' | 'emerald' | 'indigo';
}

const colorStyles: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600 border-brand-100',
  blue: 'bg-blue-50 text-blue-600 border-blue-100',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  orange: 'bg-orange-50 text-orange-600 border-orange-100',
  pink: 'bg-pink-50 text-pink-600 border-pink-100',
  purple: 'bg-purple-50 text-purple-600 border-purple-100',
  green: 'bg-green-50 text-green-600 border-green-100',
  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  yellow: 'bg-yellow-50 text-yellow-600 border-yellow-100',
  red: 'bg-red-50 text-red-600 border-red-100',
  indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
};

const KPICard: React.FC<KPICardProps> = ({ title, value, subValue, icon: Icon, trend, color = "brand" }) => {
  const styles = colorStyles[color] || colorStyles.brand;

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 h-full flex flex-col justify-between group">
      <div className="flex justify-between items-start gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 truncate">{title}</p>
          <h3 className="text-2xl font-bold text-slate-900 tracking-tight truncate" title={value}>{value}</h3>
        </div>
        <div className={`p-3 rounded-xl ${styles} shrink-0 group-hover:scale-105 transition-transform`}>
          <Icon size={22} strokeWidth={2} />
        </div>
      </div>
      
      {subValue && (
        <div className="mt-4 pt-3 border-t border-slate-50 flex items-center">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                trend === 'down' 
                    ? 'bg-red-50 text-red-700' 
                    : trend === 'neutral' 
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-emerald-50 text-emerald-700'
            }`}>
              {subValue}
            </span>
        </div>
      )}
    </div>
  );
};

export default KPICard;