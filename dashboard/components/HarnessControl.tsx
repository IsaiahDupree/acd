'use client';

import { useState } from 'react';
import { HarnessStatus } from '@/lib/api';

interface HarnessControlProps {
  projectId: string;
  status: HarnessStatus | null;
  onStart: (projectId: string, config: any) => Promise<void>;
  onStop: (projectId: string) => Promise<void>;
}

export default function HarnessControl({ projectId, status, onStart, onStop }: HarnessControlProps) {
  const [config, setConfig] = useState({
    continuous: true,
    maxSessions: 100,
    sessionDelayMs: 5000,
    projectPath: '',
  });
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    setLoading(true);
    try {
      await onStart(projectId, config);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await onStop(projectId);
    } finally {
      setLoading(false);
    }
  };

  const isRunning = status?.status === 'running';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold mb-1">Harness Control</h3>
          <p className="text-sm text-gray-400">
            Status: <span className={isRunning ? 'text-green-400' : 'text-gray-500'}>
              {status?.status || 'stopped'}
            </span>
            {status?.pid && ` (PID: ${status.pid})`}
          </p>
        </div>
        <div className="flex gap-2">
          {!isRunning ? (
            <button
              onClick={handleStart}
              disabled={loading}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 rounded-lg font-medium disabled:opacity-50"
            >
              {loading ? 'Starting...' : 'Start Harness'}
            </button>
          ) : (
            <button
              onClick={handleStop}
              disabled={loading}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg font-medium disabled:opacity-50"
            >
              {loading ? 'Stopping...' : 'Stop Harness'}
            </button>
          )}
        </div>
      </div>

      {!isRunning && (
        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-700/30 rounded">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Max Sessions</label>
            <input
              type="number"
              value={config.maxSessions}
              onChange={(e) => setConfig({ ...config, maxSessions: parseInt(e.target.value) })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Session Delay (ms)</label>
            <input
              type="number"
              value={config.sessionDelayMs}
              onChange={(e) => setConfig({ ...config, sessionDelayMs: parseInt(e.target.value) })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white"
            />
          </div>
          <div className="col-span-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.continuous}
                onChange={(e) => setConfig({ ...config, continuous: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm text-gray-300">Continuous mode</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

