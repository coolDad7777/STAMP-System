import React from 'react';
import { SearchIcon, ShieldCheckIcon } from '@heroicons/react/outline';

export function AuditPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Audit Logs</h2>
          <p className="mt-1 text-sm text-gray-700">
            Review system audit trail and integrity verification
          </p>
        </div>
        
        <div className="mt-4 sm:mt-0">
          <button className="btn-primary">
            <ShieldCheckIcon className="w-4 h-4 mr-2" />
            Verify Integrity
          </button>
        </div>
      </div>

      {/* Coming soon placeholder */}
      <div className="card">
        <div className="card-body text-center py-16">
          <SearchIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-medium text-gray-900">
            Audit Trail Viewer
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Comprehensive audit log analysis and integrity verification tools are coming soon.
          </p>
          <div className="mt-6">
            <button className="btn-secondary">
              <SearchIcon className="w-4 h-4 mr-2" />
              Search Logs
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}