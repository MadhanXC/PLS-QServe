import React from 'react';
import { User } from 'firebase/auth';
import { AdminUserProfile, InAppNotification } from '../types';
import { NotificationBell } from './NotificationBell';
import { ShieldCheck, LayoutDashboard, Users, UserCircle, LogOut, UserCheck, QrCode, Calendar } from 'lucide-react';

interface NavbarProps {
  authUser: User;
  profile: AdminUserProfile | null;
  activeTab: 'dashboard' | 'managed-users' | 'qr-cards' | 'schedule' | 'profile';
  onTabChange: (tab: 'dashboard' | 'managed-users' | 'qr-cards' | 'schedule' | 'profile') => void;
  onLogout: () => void;
  onOpenNotification?: (notification: InAppNotification) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  authUser,
  profile,
  activeTab,
  onTabChange,
  onLogout,
  onOpenNotification
}) => {
  const displayName = profile?.displayName || authUser.displayName || authUser.email?.split('@')[0] || 'Admin';
  const roleLabel = profile?.role ? profile.role.replace('_', ' ') : 'Admin';

  return (
    <header className="bg-white text-slate-900 sticky top-0 z-40 border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 text-white rounded-md flex items-center justify-center font-bold text-sm shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-slate-900 leading-none">
                PLS QServe
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1 rounded-lg border border-slate-200/80">
            <button
              onClick={() => onTabChange('dashboard')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Overview
            </button>
            <button
              onClick={() => onTabChange('managed-users')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'managed-users'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              Managed Users
            </button>
            <button
              onClick={() => onTabChange('qr-cards')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'qr-cards'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              QR Cards Generator
            </button>
            <button
              onClick={() => onTabChange('schedule')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'schedule'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Service Schedule
            </button>
            <button
              onClick={() => onTabChange('profile')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'profile'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <UserCircle className="w-3.5 h-3.5" />
              My Profile
            </button>
          </nav>

          {/* User badge & Logout */}
          <div className="flex items-center gap-3">
            <NotificationBell recipientEmail={authUser.email || ''} onOpenNotification={onOpenNotification} />
            <div
              onClick={() => onTabChange('profile')}
              className="flex items-center gap-2.5 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
            >
              <div className="w-7 h-7 bg-blue-600 text-white rounded-md flex items-center justify-center font-bold text-xs">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-xs font-semibold text-slate-900 leading-tight truncate max-w-[120px]">
                  {displayName}
                </p>
                <p className="text-[10px] text-blue-600 capitalize font-medium leading-none mt-0.5">
                  {roleLabel}
                </p>
              </div>
            </div>

            <button
              onClick={onLogout}
              title="Sign Out"
              className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg border border-slate-200 transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Sub-Nav */}
        <div className="md:hidden flex items-center justify-around py-2 border-t border-slate-200">
          <button
            onClick={() => onTabChange('dashboard')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium ${
              activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-600'
            }`}
          >
            <LayoutDashboard className="w-3 h-3" /> Overview
          </button>
          <button
            onClick={() => onTabChange('managed-users')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium ${
              activeTab === 'managed-users' ? 'bg-blue-600 text-white' : 'text-slate-600'
            }`}
          >
            <UserCheck className="w-3 h-3" /> Managed
          </button>
          <button
            onClick={() => onTabChange('qr-cards')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium ${
              activeTab === 'qr-cards' ? 'bg-blue-600 text-white' : 'text-slate-600'
            }`}
          >
            <QrCode className="w-3 h-3" /> QR Cards
          </button>
          <button
            onClick={() => onTabChange('schedule')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium ${
              activeTab === 'schedule' ? 'bg-blue-600 text-white' : 'text-slate-600'
            }`}
          >
            <Calendar className="w-3 h-3" /> Schedule
          </button>
          <button
            onClick={() => onTabChange('profile')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium ${
              activeTab === 'profile' ? 'bg-blue-600 text-white' : 'text-slate-600'
            }`}
          >
            <UserCircle className="w-3 h-3" /> Profile
          </button>
        </div>
      </div>
    </header>
  );
};

