'use client';

import { CostSummary } from '@/lib/api';

interface UsageChartProps {
  costSummary: CostSummary | null;
}

export default function UsageChart({ costSummary }: UsageChartProps) {
  // Handle null/undefined costSummary
  if (!costSummary) {
    return (
      <div className="text-gray-500 text-sm">No cost data available</div>
    );
  }

  const models = Object.keys(costSummary.byModel || {});
  const totalCost = costSummary.totalCost || 0;
  const averageCostPerSession = costSummary.averageCostPerSession || 0;
  const sessions = costSummary.sessions || 0;
  const totalTokens = costSummary.totalTokens || 0;
  const isOAuthToken = costSummary.isOAuthToken || false;
  
  return (
    <div className="space-y-4">
      {isOAuthToken && (
        <div className="bg-blue-500/20 border border-blue-500/50 rounded-lg p-3 mb-4">
          <div className="text-sm text-blue-300">
            ✅ Using Claude Code subscription - Costs covered by your plan
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-sm text-gray-400 mb-1">Total Sessions</div>
          <div className="text-2xl font-bold text-blue-400">{sessions}</div>
        </div>
        <div>
          <div className="text-sm text-gray-400 mb-1">Avg Cost/Session</div>
          <div className="text-2xl font-bold text-green-400">
            {isOAuthToken ? (
              <span className="text-green-300">$0.00 <span className="text-xs text-gray-400">(covered)</span></span>
            ) : (
              `$${averageCostPerSession.toFixed(2)}`
            )}
          </div>
        </div>
      </div>

      {models.length > 0 && (
        <div>
          <div className="text-sm text-gray-400 mb-2">Cost by Model</div>
          <div className="space-y-2">
            {models.map((model) => {
              const modelData = costSummary.byModel?.[model];
              if (!modelData) return null;
              
              const percentage = totalCost > 0 ? (modelData.cost / totalCost) * 100 : 0;
              
              return (
                <div key={model}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-300">{model}</span>
                    <span className="text-yellow-400">${(modelData.cost || 0).toFixed(2)}</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-yellow-400 h-2 rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-gray-700">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Total Tokens</span>
          <span className="text-lg font-semibold text-purple-400">
            {totalTokens.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

