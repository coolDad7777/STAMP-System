import React from 'react';
import { DownloadIcon, CalendarIcon, DocumentReportIcon } from '@heroicons/react/outline';

export function CompliancePage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Compliance Reports</h2>
          <p className="mt-1 text-sm text-gray-700">
            Generate and view compliance reports for court proceedings
          </p>
        </div>
        
        <div className="mt-4 sm:mt-0">
          <button className="btn-primary">
            <DocumentReportIcon className="w-4 h-4 mr-2" />
            Generate New Report
          </button>
        </div>
      </div>

      {/* Coming soon placeholder */}
      <div className="card">
        <div className="card-body text-center py-16">
          <DocumentReportIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-medium text-gray-900">
            Compliance Reports
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Advanced compliance reporting features are coming soon.
          </p>
          <div className="mt-6">
            <button className="btn-secondary">
              <CalendarIcon className="w-4 h-4 mr-2" />
              Schedule Demo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}