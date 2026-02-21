import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const mockChartData = [
  { date: '2024-01-08', compliance: 92.5 },
  { date: '2024-01-09', compliance: 94.2 },
  { date: '2024-01-10', compliance: 91.8 },
  { date: '2024-01-11', compliance: 96.1 },
  { date: '2024-01-12', compliance: 93.7 },
  { date: '2024-01-13', compliance: 95.3 },
  { date: '2024-01-14', compliance: 94.2 },
];

export function ComplianceChart() {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={mockChartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis 
            dataKey="date" 
            tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            stroke="#6b7280"
            fontSize={12}
          />
          <YAxis 
            domain={['dataMin - 5', 'dataMax + 5']}
            stroke="#6b7280"
            fontSize={12}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip 
            formatter={(value: number) => [`${value}%`, 'Compliance Rate']}
            labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            }}
          />
          <Line 
            type="monotone" 
            dataKey="compliance" 
            stroke="#2563eb" 
            strokeWidth={2}
            dot={{ fill: '#2563eb', strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, stroke: '#2563eb', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}