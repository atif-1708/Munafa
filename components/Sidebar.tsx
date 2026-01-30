
import React from 'react';
import { LayoutDashboard, ShoppingBag, Truck, BarChart3, Settings, TrendingUp, Plug, PackageSearch, GitCompare, LogOut } from 'lucide-react';
import { supabase } from '../services/supabase';

interface SidebarProps {
  currentPage: string;
  setPage: (page: string) => void;
  inventoryAlertCount?: number;
  storeName?: string;
  email?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ 
    currentPage, 
    setPage, 
    inventoryAlertCount = 0,
    storeName = 'My Store',
    email = 'user@example.com' 
}) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'reconciliation', label: 'Shopify', icon: GitCompare },
    { id: 'inventory', label: 'Inventory & Costs', icon: PackageSearch },
    { id: 'orders', label: 'Orders & RTO', icon: ShoppingBag },
    { id: 'couriers', label: 'Courier Performance', icon: Truck },
    { id: 'profitability', label: 'Product Profitability', icon: TrendingUp },
    { id: 'marketing', label: 'Ad Spend', icon: BarChart3 },
    { id: 'integrations', label: 'Integrations', icon: Plug },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleLogout = async () => {
      await supabase.auth.signOut();
      window.location.reload();
  };

  return (
    <div className="w-64 bg-slate-900 text-white h-screen fixed left-0 top-0 flex flex-col border-r border-slate-800 z-50">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold tracking-tight text-brand-500 leading-tight">MunafaBakhsh<br/><span className="text-white">Karobaar</span></h1>
        <p className="text-xs text-slate-400 mt-2">eCommerce Intelligence</p>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 ${
              currentPage === item.id 
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/50' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
                <item.icon size={20} />
                <span className="font-medium text-sm">{item.label}</span>
            </div>
            
            {/* Inventory Alert Badge */}
            {item.id === 'inventory' && inventoryAlertCount > 0 && (
                <div className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse shadow-sm shadow-red-900/50">
                    {inventoryAlertCount}
                </div>
            )}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold shrink-0">
                {storeName.substring(0,2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{storeName}</p>
                <p className="text-xs text-slate-500 truncate">{email}</p>
              </div>
            </div>
            <button 
                onClick={handleLogout}
                className="text-slate-500 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors"
                title="Logout"
            >
                <LogOut size={18} />
            </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
