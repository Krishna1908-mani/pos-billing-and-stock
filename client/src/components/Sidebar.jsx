import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Receipt,
  Truck,
  Users,
  History,
  AlertCircle,
  TrendingUp,
  FileBarChart,
  Settings,
  Sparkles,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const Sidebar = ({ isCollapsed, setIsCollapsed }) => {
  const navItems = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard },
    { label: 'Products', path: '/products', icon: Package },
    { label: 'POS Checkout', path: '/pos', icon: ShoppingCart },
    { label: 'Sales & Invoices', path: '/sales', icon: Receipt },
    { label: 'Purchases (Inward)', path: '/purchases', icon: Truck },
    { label: 'Suppliers', path: '/suppliers', icon: Users },
    { label: 'Stock Movement Ledger', path: '/inventory', icon: History },
    { label: 'Supplier Dues', path: '/dues', icon: AlertCircle },
    {
      label: 'Restock Intelligence',
      path: '/restock',
      icon: TrendingUp,
      highlight: true
    },
    { label: 'Reports & Analytics', path: '/reports', icon: FileBarChart },
    { label: 'Settings', path: '/settings', icon: Settings }
  ];

  return (
    <aside
      className={`fixed top-0 left-0 z-40 h-screen transition-all duration-300 ease-in-out bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800 bg-slate-950/40">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30 font-bold text-lg flex-shrink-0">
              S
            </div>
            <div className="truncate">
              <span className="font-bold text-white text-base tracking-tight block">StockWise</span>
              <span className="text-[10px] text-indigo-400 font-medium uppercase tracking-wider block">Retail Intelligence</span>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="w-9 h-9 mx-auto rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30 font-bold text-lg">
            S
          </div>
        )}

        {/* Toggle Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors ${
            isCollapsed ? 'hidden' : 'block'
          }`}
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                }`
              }
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
              {!isCollapsed && item.highlight && (
                <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 px-1.5 py-0.5 rounded-full">
                  <Sparkles className="w-2.5 h-2.5" /> Novel
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Expand trigger when collapsed */}
      {isCollapsed && (
        <div className="p-3 border-t border-slate-800 flex justify-center">
          <button
            onClick={() => setIsCollapsed(false)}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors"
            title="Expand Sidebar"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Footer Store Tag */}
      {!isCollapsed && (
        <div className="p-4 border-t border-slate-800 text-xs text-slate-500">
          <div className="font-medium text-slate-400">StockWise Retail OS</div>
          <div>v1.0 Production Ready</div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
