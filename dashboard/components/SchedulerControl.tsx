'use client';

import { useCallback, useState, useEffect } from 'react';
import { api, SchedulerStatus, SchedulerConfig } from '@/lib/api';
import { toast } from 'react-hot-toast';

interface SchedulerControlProps {
  className?: string;
}

export default function SchedulerControl({ className = '' }: SchedulerControlProps) {
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [configEditing, setConfigEditing] = useState(false);
  const [editedConfig, setEditedConfig] = useState<Partial<SchedulerConfig>>({});

  const loadStatus = useCallback(async () => {
    try {
      const data = await api.getSchedulerStatus();
      setStatus(data);
      if (!configEditing) {
        setEditedConfig(data.config);
      }
    } catch (error) {
      console.error('Failed to load scheduler status:', error);
    } finally {
      setLoading(false);
    }
  }, [configEditing]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async-poll: setState runs post-await, not synchronously
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  const handleUpdateConfig = async () => {
    try {
      await api.updateSchedulerConfig(editedConfig);
      toast.success('Scheduler config updated');
      setConfigEditing(false);
      loadStatus();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update config');
    }
  };

  const handleClearQueue = async () => {
    try {
      await api.clearSchedulerQueue();
      toast.success('Queue cleared');
      loadStatus();
    } catch (error: any) {
      toast.error(error.message || 'Failed to clear queue');
    }
  };

  if (loading) {
    return (
      <div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
        <div className="animate-pulse">Loading scheduler...</div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
        <div className="text-yellow-400">Scheduler status unavailable</div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          🚦 Rate Limiter & Scheduler
          {status.circuitBreakerOpen && (
            <span className="text-xs bg-red-600 px-2 py-1 rounded">Circuit Open</span>
          )}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setConfigEditing(!configEditing)}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded transition"
          >
            {configEditing ? 'Cancel' : '⚙️ Configure'}
          </button>
          {status.queueLength > 0 && (
            <button
              onClick={handleClearQueue}
              className="px-3 py-1 text-sm bg-yellow-600 hover:bg-yellow-500 rounded transition"
            >
              Clear Queue
            </button>
          )}
        </div>
      </div>

      {/* Status Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-gray-700/50 rounded p-3">
          <div className="text-xs text-gray-400 mb-1">Queue</div>
          <div className="text-xl font-bold">{status.queueLength}</div>
        </div>
        <div className="bg-gray-700/50 rounded p-3">
          <div className="text-xs text-gray-400 mb-1">Running</div>
          <div className="text-xl font-bold">{status.runningTasks}</div>
        </div>
        <div className="bg-gray-700/50 rounded p-3">
          <div className="text-xs text-gray-400 mb-1">Requests/Window</div>
          <div className="text-xl font-bold">
            {status.rateLimitState.requestsInWindow}
            <span className="text-sm text-gray-400">/{status.config.requestsPerMinute}</span>
          </div>
        </div>
        <div className="bg-gray-700/50 rounded p-3">
          <div className="text-xs text-gray-400 mb-1">Circuit Breaker</div>
          <div className={`text-xl font-bold ${status.circuitBreakerOpen ? 'text-red-400' : 'text-green-400'}`}>
            {status.circuitBreakerOpen ? '🔴 Open' : '🟢 Closed'}
          </div>
          {status.circuitBreakerFailures > 0 && (
            <div className="text-xs text-gray-400">
              {status.circuitBreakerFailures} failures
            </div>
          )}
        </div>
      </div>

      {/* Rate Limit Progress */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>Rate Limit Usage</span>
          <span>{Math.round((status.rateLimitState.requestsInWindow / status.config.requestsPerMinute) * 100)}%</span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              status.rateLimitState.requestsInWindow / status.config.requestsPerMinute > 0.8
                ? 'bg-red-500'
                : status.rateLimitState.requestsInWindow / status.config.requestsPerMinute > 0.5
                ? 'bg-yellow-500'
                : 'bg-green-500'
            }`}
            style={{
              width: `${Math.min(100, (status.rateLimitState.requestsInWindow / status.config.requestsPerMinute) * 100)}%`,
            }}
          />
        </div>
      </div>

      {/* Configuration Editor */}
      {configEditing && (
        <div className="border-t border-gray-700 pt-4 mt-4">
          <h4 className="text-sm font-medium mb-3">Scheduler Configuration</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Requests/Minute</label>
              <input
                type="number"
                value={editedConfig.requestsPerMinute || ''}
                onChange={(e) => setEditedConfig({ ...editedConfig, requestsPerMinute: parseInt(e.target.value) || 0 })}
                className="w-full bg-gray-700 rounded px-3 py-2 text-sm"
                min={1}
                max={100}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Max Concurrent</label>
              <input
                type="number"
                value={editedConfig.maxConcurrent || ''}
                onChange={(e) => setEditedConfig({ ...editedConfig, maxConcurrent: parseInt(e.target.value) || 0 })}
                className="w-full bg-gray-700 rounded px-3 py-2 text-sm"
                min={1}
                max={10}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Min Delay (ms)</label>
              <input
                type="number"
                value={editedConfig.minTimeBetweenRequests || ''}
                onChange={(e) => setEditedConfig({ ...editedConfig, minTimeBetweenRequests: parseInt(e.target.value) || 0 })}
                className="w-full bg-gray-700 rounded px-3 py-2 text-sm"
                min={500}
                max={60000}
                step={500}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Max Retries</label>
              <input
                type="number"
                value={editedConfig.maxRetries || ''}
                onChange={(e) => setEditedConfig({ ...editedConfig, maxRetries: parseInt(e.target.value) || 0 })}
                className="w-full bg-gray-700 rounded px-3 py-2 text-sm"
                min={0}
                max={10}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setConfigEditing(false)}
              className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded transition"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdateConfig}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded transition"
            >
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="mt-4 text-xs text-gray-500">
        <p>💡 <strong>Tips:</strong></p>
        <ul className="mt-1 space-y-1 list-disc list-inside">
          <li>Lower requests/minute if hitting rate limits frequently</li>
          <li>Circuit breaker opens after consecutive failures to prevent cascading errors</li>
          <li>Auth errors automatically stop the harness to prevent wasted retries</li>
        </ul>
      </div>
    </div>
  );
}
