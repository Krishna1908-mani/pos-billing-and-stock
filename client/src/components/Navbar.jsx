import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShoppingCart, LogOut, User as UserIcon, Activity } from 'lucide-react';
import api from '../api/client';

const Navbar = ({ isCollapsed }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [health, setHealth] = useState('CHECKING');

  useEffect(() => {
    const checkServerHealth = async () => {
      try {
        const res = await api.get('/health');
        if (res.data.status === 'UP') {
          setHealth('ONLINE');
        } else {
          setHealth('DEGRADED');
        }
      } catch (err) {
        setHealth('OFFLINE');
      }
    };

    checkServerHealth();
    const interval = setInterval(checkServerHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header
      className={`fixed top-0 right-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/80 transition-all duration-300 ease-in-out px-6 flex items-center justify-between ${
        isCollapsed ? 'left-20' : 'left-64'
      }`}
    >
      {/* Left side info */}
      <div className="flex items-center gap-4">
        <h2 className="text-sm font-semibold text-slate-800 hidden sm:block">
          StockWise Inventory & Sales Intelligence
        </h2>
        {/* Live MongoDB / Server Connection Status */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
            health === 'ONLINE'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : health === 'OFFLINE'
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}
          title="Backend API & MongoDB live connection state"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              health === 'ONLINE' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
            }`}
          />
          <Activity className="w-3 h-3" />
          <span>{health === 'ONLINE' ? 'Live System Active' : health}</span>
        </div>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-3">
        {/* Quick POS Button */}
        <button
          onClick={() => navigate('/pos')}
          className="flex items-center gap-2 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
        >
          <ShoppingCart className="w-4 h-4" />
          <span>Open POS (F2)</span>
        </button>

        {/* User Profile Pill */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-semibold text-xs">
            {user?.name ? user.name.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
          </div>
          <div className="hidden md:block text-left">
            <div className="text-xs font-semibold text-slate-900 leading-tight">
              {user?.name || 'User'}
            </div>
            <div className="text-[10px] text-slate-500 font-medium capitalize">
              {user?.role || 'Staff'} Account
            </div>
          </div>

          {/* Logout Button */}
          <button
            onClick={logout}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors ml-1"
            title="Sign out of StockWise"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
