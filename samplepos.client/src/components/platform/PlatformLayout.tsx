// Platform Layout — Super Admin Panel Shell
// Distinguishable from tenant layout via indigo/dark styling
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { usePlatformAuth } from '../../contexts/PlatformAuthContext';
import {
    LayoutDashboard,
    Building2,
    ShieldCheck,
    Activity,
    ChevronLeft,
    ChevronRight,
    LogOut,
    Server,
    Menu,
    X,
} from 'lucide-react';
import ServerClock from '../ServerClock';

const navItems = [
    { to: '/platform', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/platform/tenants', icon: Building2, label: 'Tenants', end: false },
    { to: '/platform/admins', icon: ShieldCheck, label: 'Admins', end: false },
    { to: '/platform/health', icon: Activity, label: 'Health', end: false },
];

export default function PlatformLayout() {
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const { admin, logout } = usePlatformAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/platform/login');
    };

    return (
        <div className="flex h-screen bg-slate-100">
            {/* Mobile Overlay */}
            {mobileOpen && (
                <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setMobileOpen(false)} />
            )}

            {/* Sidebar */}
            <aside
                className={`${collapsed ? 'lg:w-16' : 'lg:w-60'} w-64 flex flex-col bg-slate-900 text-white transition-all duration-200 flex-shrink-0 fixed h-full z-30 lg:relative ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
            >
                {/* Brand */}
                <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-700">
                    <Server className="w-7 h-7 text-indigo-400 flex-shrink-0" />
                    {(!collapsed || mobileOpen) && (
                        <span className="font-semibold text-base tracking-tight truncate">Platform Admin</span>
                    )}
                    <button onClick={() => setMobileOpen(false)} className="ml-auto p-1 rounded hover:bg-slate-800 lg:hidden" aria-label="Close menu">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
                    {navItems.map(({ to, icon: Icon, label, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                }`
                            }
                            title={collapsed && !mobileOpen ? label : undefined}
                            onClick={() => setMobileOpen(false)}
                        >
                            <Icon className="w-5 h-5 flex-shrink-0" />
                            {(!collapsed || mobileOpen) && <span>{label}</span>}
                        </NavLink>
                    ))}
                </nav>

                {/* Footer */}
                <div className="border-t border-slate-700 p-3 space-y-2">
                    {/* User info */}
                    {!collapsed && admin && (
                        <div className="px-2 py-1">
                            <p className="text-xs text-slate-400 truncate">{admin.email}</p>
                            <p className="text-[11px] text-slate-500 truncate">{admin.fullName}</p>
                        </div>
                    )}

                    {/* Collapse toggle */}
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className="hidden lg:flex items-center justify-center w-full px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                        {!collapsed && <span className="ml-2 text-xs">Collapse</span>}
                    </button>

                    {/* Logout */}
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-slate-400 hover:bg-red-900/30 hover:text-red-400 transition-colors"
                        title="Logout"
                    >
                        <LogOut className="w-4 h-4 flex-shrink-0" />
                        {!collapsed && <span className="text-xs">Logout</span>}
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile Header */}
                <header className="h-14 bg-slate-900 text-white flex items-center justify-between px-4 lg:hidden sticky top-0 z-10">
                    <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg hover:bg-slate-800" aria-label="Open menu">
                        <Menu className="w-5 h-5" />
                    </button>
                    <span className="font-semibold text-sm">Platform Admin</span>
                    <div className="flex items-center gap-3">
                        <ServerClock />
                        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                            {admin?.fullName?.charAt(0).toUpperCase() || 'A'}
                        </div>
                    </div>
                </header>
                {/* Desktop Top Bar */}
                <header className="h-12 bg-white border-b border-gray-200 items-center justify-end px-4 hidden lg:flex sticky top-0 z-10">
                    <ServerClock />
                </header>
                <main className="flex-1 overflow-auto">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
