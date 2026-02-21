import React, { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  CheckCircleIcon,
  DocumentReportIcon,
  SearchIcon,
  CogIcon,
  LogoutIcon,
  ShieldCheckIcon,
  UserCircleIcon,
} from '@heroicons/react/outline';
import { useAuth } from '../stores/AuthStore';
import { NotificationBell } from './ui/NotificationBell';

interface LayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Verification', href: '/verification', icon: CheckCircleIcon },
  { name: 'Compliance Reports', href: '/compliance', icon: DocumentReportIcon },
  { name: 'Audit Logs', href: '/audit', icon: SearchIcon },
  { name: 'Settings', href: '/settings', icon: CogIcon },
];

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col">
        <div className="flex flex-col flex-grow pt-5 bg-white border-r border-gray-200">
          {/* Logo */}
          <div className="flex items-center flex-shrink-0 px-4">
            <ShieldCheckIcon className="w-8 h-8 text-brand-600" />
            <span className="ml-2 text-xl font-bold text-gray-900">
              STAMP Portal
            </span>
          </div>
          
          {/* Navigation */}
          <div className="mt-8 flex-grow flex flex-col">
            <nav className="flex-1 px-2 pb-4 space-y-1">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`sidebar-nav-item ${
                      isActive ? 'active' : 'inactive'
                    }`}
                  >
                    <item.icon
                      className={`mr-3 w-5 h-5 ${
                        isActive ? 'text-brand-700' : 'text-gray-400'
                      }`}
                      aria-hidden="true"
                    />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* User info */}
          <div className="flex-shrink-0 p-4 border-t border-gray-200">
            <div className="flex items-center">
              <UserCircleIcon className="w-8 h-8 text-gray-400" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900">
                  {user?.name || 'Validator User'}
                </p>
                <p className="text-xs text-gray-500">
                  {user?.role || 'Probation Officer'}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="ml-auto p-1 text-gray-400 hover:text-gray-600 transition-colors"
                title="Logout"
              >
                <LogoutIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                type="button"
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
              >
                <span className="sr-only">Open sidebar</span>
                {/* Menu icon would go here */}
              </button>
            </div>

            {/* Page title */}
            <div className="flex-1 md:flex-none">
              <h1 className="text-2xl font-semibold text-gray-900">
                {navigation.find(item => item.href === location.pathname)?.name || 'Dashboard'}
              </h1>
            </div>

            {/* Right side */}
            <div className="flex items-center space-x-4">
              <NotificationBell />
              
              {/* Status indicator */}
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-success-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-gray-600 hidden sm:block">
                  System Online
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <div className="p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}