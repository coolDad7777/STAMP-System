import React from 'react';
import { 
  CheckCircleIcon, 
  ExclamationIcon, 
  ClockIcon,
  ShieldCheckIcon
} from '@heroicons/react/outline';

interface ActivityItem {
  id: string;
  type: 'verification' | 'compliance' | 'audit' | 'alert';
  title: string;
  description: string;
  timestamp: string;
  status: 'success' | 'warning' | 'pending' | 'info';
  participant?: string;
}

const mockActivities: ActivityItem[] = [
  {
    id: '1',
    type: 'verification',
    title: 'Attendance Verified',
    description: 'AA Meeting at Downtown Community Center',
    timestamp: '5 minutes ago',
    status: 'success',
    participant: 'J.Smith',
  },
  {
    id: '2',
    type: 'compliance',
    title: 'Compliance Alert',
    description: 'Missed required meeting - automatic notification sent',
    timestamp: '1 hour ago',
    status: 'warning',
    participant: 'M.Johnson',
  },
  {
    id: '3',
    type: 'verification',
    title: 'Bulk Verification Completed',
    description: '25 stamps verified for morning meetings',
    timestamp: '2 hours ago',
    status: 'success',
  },
  {
    id: '4',
    type: 'audit',
    title: 'Cross-Jurisdiction Verification',
    description: 'Federal probation verification request processed',
    timestamp: '3 hours ago',
    status: 'info',
    participant: 'K.Williams',
  },
  {
    id: '5',
    type: 'verification',
    title: 'Stamp Validation Failed',
    description: 'Invalid cryptographic signature detected',
    timestamp: '4 hours ago',
    status: 'warning',
    participant: 'R.Davis',
  },
];

function getActivityIcon(type: ActivityItem['type'], status: ActivityItem['status']) {
  switch (type) {
    case 'verification':
      return status === 'success' ? CheckCircleIcon : ExclamationIcon;
    case 'compliance':
      return ExclamationIcon;
    case 'audit':
      return ShieldCheckIcon;
    case 'alert':
      return ClockIcon;
    default:
      return CheckCircleIcon;
  }
}

function getStatusColor(status: ActivityItem['status']) {
  switch (status) {
    case 'success':
      return 'text-success-600 bg-success-100';
    case 'warning':
      return 'text-warning-600 bg-warning-100';
    case 'pending':
      return 'text-brand-600 bg-brand-100';
    case 'info':
      return 'text-gray-600 bg-gray-100';
    default:
      return 'text-gray-600 bg-gray-100';
  }
}

export function RecentActivity() {
  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {mockActivities.map((activity, activityIdx) => {
          const Icon = getActivityIcon(activity.type, activity.status);
          const colorClass = getStatusColor(activity.status);
          
          return (
            <li key={activity.id}>
              <div className="relative pb-8">
                {activityIdx !== mockActivities.length - 1 ? (
                  <span
                    className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                    aria-hidden="true"
                  />
                ) : null}
                <div className="relative flex space-x-3">
                  <div>
                    <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${colorClass}`}>
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div>
                      <div className="text-sm">
                        <span className="font-medium text-gray-900">
                          {activity.title}
                        </span>
                        {activity.participant && (
                          <span className="ml-2 text-gray-500">
                            • {activity.participant}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-gray-500">
                        {activity.timestamp}
                      </p>
                    </div>
                    <div className="mt-2 text-sm text-gray-700">
                      <p>{activity.description}</p>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}