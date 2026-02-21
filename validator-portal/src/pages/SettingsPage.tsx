import React from 'react';
import { CogIcon, UserCircleIcon } from '@heroicons/react/outline';

export function SettingsPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="mt-1 text-sm text-gray-700">
          Manage your account settings and system preferences
        </p>
      </div>

      {/* Coming soon placeholder */}
      <div className="card">
        <div className="card-body text-center py-16">
          <CogIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-medium text-gray-900">
            System Settings
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Account management and system configuration options are coming soon.
          </p>
          <div className="mt-6">
            <button className="btn-secondary">
              <UserCircleIcon className="w-4 h-4 mr-2" />
              Update Profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}