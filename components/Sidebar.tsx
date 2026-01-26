import React from 'react';
import { LayoutDashboard, ShoppingBag, Truck, BarChart3, Settings, TrendingUp, Plug, PackageSearch } from 'lucide-react';

interface SidebarProps {
  currentPage: string;
  setPage: (page: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setPage }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inventory', label: 'Inventory & Costs', icon: PackageSearch },
    { id: 'orders', label: 'Orders & RTO', icon: ShoppingBag },
    { id: 'couriers', label: 'Courier Performance', icon: Truck },
    { id: 'profitability', label: 'Product Profitability', icon: TrendingUp },
    { id: 'marketing', label: 'Ad Spend', icon: BarChart3 },
    { id: 'integrations', label: 'Integrations', icon: Plug },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="w-64 bg-slate-900 text-white h-screen fixed left-0 top-0 flex flex-col border-r border-slate-800 z-50">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-2xl font-bold tracking-tight text-brand-500">MunafaBakhsh</h1>
        <p className="text-xs text-slate-400 mt-1">Profit Intelligence OS</p>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
              currentPage === item.id 
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/50' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <item.icon size={20} />
            <span className="font-medium text-sm">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">
            MS
          </div>
          <div>
            <p className="text-sm font-medium">My Store</p>
            <p className="text-xs text-slate-500">Standard Plan</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;