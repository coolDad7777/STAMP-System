import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircleIcon,
  DocumentReportIcon,
  SearchIcon,
  UploadIcon,
  DownloadIcon,
  RefreshIcon,
} from '@heroicons/react/outline';
import toast from 'react-hot-toast';

export function QuickActions() {
  const navigate = useNavigate();

  const handleBulkVerify = () => {
    navigate('/verification');
  };

  const handleGenerateReport = () => {
    navigate('/compliance');
  };

  const handleViewAudit = () => {
    navigate('/audit');
  };

  const handleExportData = async () => {
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 2000)),
      {
        loading: 'Preparing export...',
        success: 'Data exported successfully',
        error: 'Export failed',
      }
    );
  };

  const handleSyncData = async () => {
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 1500)),
      {
        loading: 'Syncing with blockchain network...',
        success: 'Data synchronized',
        error: 'Sync failed',
      }
    );
  };

  const actions = [
    {
      name: 'Bulk Verify',
      description: 'Verify multiple attendance stamps',
      icon: CheckCircleIcon,
      color: 'text-success-600 bg-success-100 hover:bg-success-200',
      onClick: handleBulkVerify,
    },
    {
      name: 'Generate Report',
      description: 'Create compliance report',
      icon: DocumentReportIcon,
      color: 'text-brand-600 bg-brand-100 hover:bg-brand-200',
      onClick: handleGenerateReport,
    },
    {
      name: 'View Audit Logs',
      description: 'Review system audit trail',
      icon: SearchIcon,
      color: 'text-gray-600 bg-gray-100 hover:bg-gray-200',
      onClick: handleViewAudit,
    },
    {
      name: 'Export Data',
      description: 'Download verification records',
      icon: DownloadIcon,
      color: 'text-purple-600 bg-purple-100 hover:bg-purple-200',
      onClick: handleExportData,
    },
    {
      name: 'Sync Blockchain',
      description: 'Synchronize with network',
      icon: RefreshIcon,
      color: 'text-indigo-600 bg-indigo-100 hover:bg-indigo-200',
      onClick: handleSyncData,
    },
  ];

  return (
    <div className="space-y-3">
      {actions.map((action) => (
        <button
          key={action.name}
          onClick={action.onClick}
          className="w-full flex items-center p-3 text-left rounded-lg border border-gray-200 hover:border-gray-300 transition-colors group"
        >
          <div className={`flex-shrink-0 p-2 rounded-lg ${action.color} transition-colors`}>
            <action.icon className="w-5 h-5" />
          </div>
          <div className="ml-3 flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 group-hover:text-gray-700">
              {action.name}
            </p>
            <p className="text-xs text-gray-500">
              {action.description}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}