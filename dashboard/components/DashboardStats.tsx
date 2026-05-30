'use client';

import { Analytics, CostSummary } from '@/lib/api';

interface DashboardStatsProps {
  analytics: Analytics | null;
  costSummary: CostSummary | null;
}

export default function DashboardStats({ analytics, costSummary }: DashboardStatsProps) {
  const stats = [
    {
      label: 'Features Completed',
      value: analytics ? `${analytics.featuresCompleted}/${analytics.featuresTotal}` : 'N/A',
      color: 'text-green-400',
    },
    {
      label: 'Sessions Run',
      value: analytics?.sessionsRun || 0,
      color: 'text-blue-400',
    },
    {
      label: 'Success Rate',
      value: analytics ? `${(analytics.successRate * 100).toFixed(1)}%` : 'N/A',
      color: 'text-purple-400',
    },
    {
      label: 'Total Cost',
      value: costSummary ? `$${costSummary.totalCost.toFixed(2)}` : 'N/A',
      color: 'text-yellow-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {stats.map((stat, index) => (
        <div
          key={index}
          className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700"
        >
          <div className="text-sm text-gray-400 mb-2">{stat.label}</div>
          <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
        </div>
      ))}
    </div>
  );
}

