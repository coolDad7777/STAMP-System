import React, { useEffect, useState } from 'react';
import { 
  CheckCircleIcon, 
  ExclamationIcon, 
  ClockIcon, 
  UsersIcon,
  ShieldCheckIcon
} from '@heroicons/react/outline';
import { StatsCard } from '../components/ui/StatsCard';
import { RecentActivity } from '../components/dashboard/RecentActivity';
import { ComplianceChart } from '../components/dashboard/ComplianceChart';
import { QuickActions } from '../components/dashboard/QuickActions';
import { fetchStats, DashboardStats } from '../api/stats';

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    fetchStats().then(setStats).catch(() => setStats(null));
  }, []);

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
          value={(stats?.totalVerifications ?? 0).toLocaleString()}
          icon={CheckCircleIcon}
          color="success"
        />
        
        <StatsCard
          title="Pending Reviews"
          value={(stats?.pendingReviews ?? 0).toString()}
          icon={ClockIcon}
          color="warning"
        />
        
        <StatsCard
          title="Compliance Rate"
          value={`${stats?.complianceRate ?? 100}%`}
          icon={ShieldCheckIcon}
          color="info"
        />
        
        <StatsCard
          title="Active Participants"
          value={(stats?.activeParticipants ?? 0).toString()}
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
              <RecentActivity items={stats?.recent} />
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
                {(stats?.recent ?? []).length === 0 ? (
                  <p className="text-sm text-gray-500">No recent sessions yet.</p>
                ) : (stats?.recent ?? []).map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border-l-4 bg-brand-50 border-brand-400"
                  >
                    <div className="flex items-start">
                      <ExclamationIcon className="w-5 h-5 text-brand-600 mt-0.5" />
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900">
                          {item.participantId} — {item.meetingType}
                        </p>
                        <p className="text-sm text-gray-600">{item.meetingName}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(item.checkinTime).toLocaleString()} · {item.status}
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