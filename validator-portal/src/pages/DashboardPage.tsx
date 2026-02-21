import React from 'react';
import { 
  CheckCircleIcon, 
  ExclamationIcon, 
  ClockIcon, 
  TrendingUpIcon,
  TrendingDownIcon,
  UsersIcon,
  DocumentIcon,
  ShieldCheckIcon
} from '@heroicons/react/outline';
import { StatsCard } from '../components/ui/StatsCard';
import { RecentActivity } from '../components/dashboard/RecentActivity';
import { ComplianceChart } from '../components/dashboard/ComplianceChart';
import { QuickActions } from '../components/dashboard/QuickActions';

// Mock data - in real app this would come from API
const mockStats = {
  totalVerifications: { value: 1247, change: 12, trend: 'up' as const },
  pendingReviews: { value: 23, change: -5, trend: 'down' as const },
  complianceRate: { value: 94.2, change: 2.1, trend: 'up' as const },
  activeParticipants: { value: 342, change: 8, trend: 'up' as const },
};

const mockAlerts = [
  {
    id: '1',
    type: 'warning' as const,
    title: 'Low compliance rate detected',
    message: 'Participant J.Smith has missed 3 consecutive meetings',
    timestamp: '2024-01-15T10:30:00Z',
  },
  {
    id: '2',
    type: 'info' as const,
    title: 'System maintenance scheduled',
    message: 'Scheduled maintenance window: Jan 20, 2:00-4:00 AM',
    timestamp: '2024-01-15T09:15:00Z',
  },
];

export function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Dashboard</h2>
        <p className="mt-2 text-sm text-gray-700">
          Monitor attendance verification and compliance across your jurisdiction
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Verifications"
          value={mockStats.totalVerifications.value.toLocaleString()}
          change={mockStats.totalVerifications.change}
          trend={mockStats.totalVerifications.trend}
          icon={CheckCircleIcon}
          color="success"
        />
        
        <StatsCard
          title="Pending Reviews"
          value={mockStats.pendingReviews.value.toString()}
          change={mockStats.pendingReviews.change}
          trend={mockStats.pendingReviews.trend}
          icon={ClockIcon}
          color="warning"
        />
        
        <StatsCard
          title="Compliance Rate"
          value={`${mockStats.complianceRate.value}%`}
          change={mockStats.complianceRate.change}
          trend={mockStats.complianceRate.trend}
          icon={ShieldCheckIcon}
          color="info"
        />
        
        <StatsCard
          title="Active Participants"
          value={mockStats.activeParticipants.value.toString()}
          change={mockStats.activeParticipants.change}
          trend={mockStats.activeParticipants.trend}
          icon={UsersIcon}
          color="info"
        />
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column - 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          {/* Compliance chart */}
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-medium text-gray-900">
                Compliance Trends
              </h3>
              <p className="text-sm text-gray-500">
                7-day rolling average compliance rates
              </p>
            </div>
            <div className="card-body">
              <ComplianceChart />
            </div>
          </div>

          {/* Recent activity */}
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-medium text-gray-900">
                Recent Activity
              </h3>
              <p className="text-sm text-gray-500">
                Latest verification and compliance events
              </p>
            </div>
            <div className="card-body">
              <RecentActivity />
            </div>
          </div>
        </div>

        {/* Right column - 1/3 width */}
        <div className="space-y-6">
          {/* Quick actions */}
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-medium text-gray-900">
                Quick Actions
              </h3>
            </div>
            <div className="card-body">
              <QuickActions />
            </div>
          </div>

          {/* Alerts */}
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-medium text-gray-900">
                System Alerts
              </h3>
            </div>
            <div className="card-body">
              <div className="space-y-3">
                {mockAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg border-l-4 ${
                      alert.type === 'warning'
                        ? 'bg-warning-50 border-warning-400'
                        : alert.type === 'info'
                        ? 'bg-brand-50 border-brand-400'
                        : 'bg-danger-50 border-danger-400'
                    }`}
                  >
                    <div className="flex items-start">
                      {alert.type === 'warning' ? (
                        <ExclamationIcon className="w-5 h-5 text-warning-600 mt-0.5" />
                      ) : (
                        <DocumentIcon className="w-5 h-5 text-brand-600 mt-0.5" />
                      )}
                      <div className="ml-3 flex-1">
                        <h4 className="text-sm font-medium text-gray-900">
                          {alert.title}
                        </h4>
                        <p className="text-sm text-gray-600 mt-1">
                          {alert.message}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          {new Date(alert.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* System status */}
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-medium text-gray-900">
                System Status
              </h3>
            </div>
            <div className="card-body">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">API Services</span>
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-success-500 rounded-full mr-2"></div>
                    <span className="text-sm text-success-600 font-medium">
                      Operational
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Database</span>
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-success-500 rounded-full mr-2"></div>
                    <span className="text-sm text-success-600 font-medium">
                      Operational
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Blockchain Network</span>
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-success-500 rounded-full mr-2"></div>
                    <span className="text-sm text-success-600 font-medium">
                      Operational
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">HSM Services</span>
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-warning-500 rounded-full mr-2"></div>
                    <span className="text-sm text-warning-600 font-medium">
                      Degraded
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}