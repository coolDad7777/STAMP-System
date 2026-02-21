import React from 'react';
import { TrendingUpIcon, TrendingDownIcon } from '@heroicons/react/outline';

interface StatsCardProps {
  title: string;
  value: string;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ComponentType<{ className?: string }>;
  color?: 'success' | 'warning' | 'danger' | 'info';
}

export function StatsCard({
  title,
  value,
  change,
  trend,
  icon: Icon,
  color = 'info'
}: StatsCardProps) {
  const colorClasses = {
    success: 'text-success-600 bg-success-100',
    warning: 'text-warning-600 bg-warning-100',
    danger: 'text-danger-600 bg-danger-100',
    info: 'text-brand-600 bg-brand-100',
  };

  const trendColorClasses = {
    up: 'text-success-600',
    down: 'text-danger-600',
    neutral: 'text-gray-600',
  };

  return (
    <div className="stat-card">
      <div className="flex items-center">
        <div className="flex-shrink-0">
          {Icon && (
            <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
              <Icon className="w-6 h-6" />
            </div>
          )}
        </div>
        <div className="ml-4 flex-1">
          <p className="stat-label">{title}</p>
          <div className="flex items-baseline">
            <p className="stat-value">{value}</p>
            {change !== undefined && trend && (
              <div className={`ml-2 flex items-baseline text-sm ${trendColorClasses[trend]}`}>
                {trend === 'up' && <TrendingUpIcon className="w-4 h-4 mr-1" />}
                {trend === 'down' && <TrendingDownIcon className="w-4 h-4 mr-1" />}
                <span className="font-medium">
                  {change > 0 ? '+' : ''}{change}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}