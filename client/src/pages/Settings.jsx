import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Settings as SettingsIcon,
  Server,
  User,
  ShieldCheck,
  Database,
  Store,
  RefreshCw,
  Clock,
  Sparkles
} from 'lucide-react';

const Settings = () => {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    try {
      setLoading(true);
      const res = await api.get('/health');
      setHealth(res.data);
    } catch (err) {
      setHealth({ status: 'OFFLINE', database: 'DISCONNECTED' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">System Configuration</h1>
        <p className="text-xs text-slate-500 font-medium mt-0.5">
          Store profile, server telemetry, and security permissions
        </p>
      </div>

      {/* Store Profile Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 pb-2 border-b border-slate-100 flex items-center gap-2">
          <Store className="w-4 h-4 text-indigo-600" />
          Retail Store Identity
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-slate-400 font-medium block">Store Name</span>
            <span className="text-sm font-bold text-slate-900 mt-0.5 block">StockWise Retail Supermarket</span>
          </div>
          <div>
            <span className="text-slate-400 font-medium block">GSTIN / Tax ID</span>
            <span className="text-sm font-bold font-mono text-slate-900 mt-0.5 block">29ABCDE1234F1Z5</span>
          </div>
          <div>
            <span className="text-slate-400 font-medium block">Primary Currency</span>
            <span className="text-sm font-bold text-slate-900 mt-0.5 block">Indian Rupee (INR - ₹)</span>
          </div>
          <div>
            <span className="text-slate-400 font-medium block">Store Address</span>
            <span className="text-sm font-semibold text-slate-800 mt-0.5 block">
              123 Commercial Boulevard, Retail Hub, Bangalore 560001
            </span>
          </div>
        </div>
      </div>

      {/* Backend & Database Telemetry */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Server className="w-4 h-4 text-emerald-600" />
            Backend & Database Health
          </h2>
          <button
            onClick={fetchHealth}
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Check Telemetry</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 font-medium block">API Server Status</span>
            <span className="text-base font-bold font-mono text-emerald-600 mt-1 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              {health?.status || 'ONLINE'}
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 font-medium block">MongoDB Engine State</span>
            <span className="text-base font-bold font-mono text-indigo-600 mt-1 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-indigo-500" />
              {health?.database || 'CONNECTED'}
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 font-medium block">Uptime Duration</span>
            <span className="text-base font-bold font-mono text-slate-800 mt-1 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-slate-400" />
              {health?.uptimeSeconds ? `${health.uptimeSeconds} seconds` : 'Active'}
            </span>
          </div>
        </div>
      </div>

      {/* User Session Profile & Role */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 pb-2 border-b border-slate-100 flex items-center gap-2">
          <User className="w-4 h-4 text-indigo-600" />
          Active Session Identity
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-slate-400 font-medium block">Account Name</span>
            <span className="text-sm font-bold text-slate-900 mt-0.5 block">{user?.name}</span>
          </div>
          <div>
            <span className="text-slate-400 font-medium block">Email Address</span>
            <span className="text-sm font-bold font-mono text-slate-900 mt-0.5 block">{user?.email}</span>
          </div>
          <div>
            <span className="text-slate-400 font-medium block">Role & Privileges</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200 mt-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              {user?.role} Permissions
            </span>
          </div>
        </div>
      </div>

      {/* College Project & Viva Reference Card */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-2xl border border-indigo-100 p-6 space-y-3">
        <div className="flex items-center gap-2 text-indigo-900 font-bold text-sm">
          <Sparkles className="w-4 h-4 text-indigo-600" />
          <span>College Deliverables & Architecture Overview</span>
        </div>
        <p className="text-xs text-indigo-950 leading-relaxed">
          StockWise implements production-grade retail software engineering standards: atomic stock
          deduction, soft-deletion protection, explainable restock intelligence (ADS/LTD/ROP),
          real-time dynamic accounts payable reconciliation, and PDF invoice generation.
        </p>
        <div className="text-[11px] text-indigo-700 pt-1">
          Detailed Architecture Diagrams, ER Diagrams, College Project Report Outline, and Viva Q&A
          are located in the <code className="bg-white/80 px-1.5 py-0.5 rounded font-mono font-semibold">/docs</code> folder.
        </div>
      </div>
    </div>
  );
};

export default Settings;
