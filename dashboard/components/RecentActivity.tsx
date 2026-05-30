'use client';

import { Analytics } from '@/lib/api';

interface RecentActivityProps {
  analytics: Analytics;
}

export default function RecentActivity({ analytics }: RecentActivityProps) {
  const activities = analytics.recentActivity || [];

  return (
    <div className="space-y-3">
      {activities.length === 0 ? (
        <p className="text-gray-500 text-sm">No recent activity</p>
      ) : (
        activities.map((activity, index) => (
          <div key={index} className="flex items-start gap-3 p-3 bg-gray-700/30 rounded">
            <div className="w-2 h-2 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-300">{activity.description}</div>
              <div className="text-xs text-gray-500 mt-1">
                {new Date(activity.timestamp).toLocaleString()}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

