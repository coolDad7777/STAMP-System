import React from 'react';
import { CheckCircleIcon, ExclamationIcon, ClockIcon } from '@heroicons/react/outline';

interface RecentItem {
  id: string;
  participantId: string;
  meetingType: string;
  meetingName: string;
  status: string;
  checkinTime: number;
}

interface RecentActivityProps {
  items?: RecentItem[];
}

function statusColor(status: string) {
  if (status === 'verified') return 'text-success-600 bg-success-100';
  if (status === 'invalid') return 'text-danger-600 bg-danger-100';
  if (status === 'completed') return 'text-warning-600 bg-warning-100';
  return 'text-brand-600 bg-brand-100';
}

export function RecentActivity({ items = [] }: RecentActivityProps) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500">No recent sessions. Client check-ins appear here.</p>;
  }

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {items.map((item, idx) => {
          const Icon =
            item.status === 'verified'
              ? CheckCircleIcon
              : item.status === 'invalid'
                ? ExclamationIcon
                : ClockIcon;
          const colorClass = statusColor(item.status);

          return (
            <li key={item.id}>
              <div className="relative pb-8">
                {idx !== items.length - 1 ? (
                  <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                ) : null}
                <div className="relative flex space-x-3">
                  <div>
                    <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${colorClass}`}>
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      <span className="font-medium text-gray-900">{item.meetingType}</span>
                      <span className="ml-2 text-gray-500">• {item.participantId}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-500">
                      {new Date(item.checkinTime).toLocaleString()}
                    </p>
                    <p className="mt-2 text-sm text-gray-700">{item.meetingName}</p>
                    <p className="text-xs text-gray-500 mt-1 capitalize">{item.status}</p>
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
