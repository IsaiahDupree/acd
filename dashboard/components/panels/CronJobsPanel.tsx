'use client';

import { useEffect, useState, useCallback } from 'react';
import { DashboardPanel } from '@/components/DashboardPanel';

const CLOUD_SYNC_URL = 'http://localhost:3200';

interface CronJob {
  id: string;
  slug: string;
  platform: string | null;
  data_type: string | null;
  schedule: string;
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_count: number;
  error_message: string | null;
}

function relativeTime(ts: string | null): string {
  if (!ts) return 'never';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusBadge(status: string | null): string {
  if (status === 'success') return '✅';
  if (status === 'error') return '❌';
  if (status === 'skipped') return '⏭';
  if (status === 'trigger_requested') return '🔄';
  return '—';
}

export function CronJobsPanel() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`${CLOUD_SYNC_URL}/api/cron/jobs`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setJobs(data.jobs || []);
      setError(null);
    } catch (e) {
      setError(`cloud-sync :3200 unavailable — ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async-poll: setState runs post-await, not synchronously
    fetchJobs();
    const interval = setInterval(fetchJobs, 10_000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const toggleJob = async (slug: string, currentEnabled: boolean) => {
    setActionMsg(`${currentEnabled ? 'Disabling' : 'Enabling'} ${slug}...`);
    try {
      const res = await fetch(`${CLOUD_SYNC_URL}/api/cron/jobs/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActionMsg(`${slug} ${!currentEnabled ? 'enabled' : 'disabled'}`);
      await fetchJobs();
    } catch (e) {
      setActionMsg(`Error: ${(e as Error).message}`);
    }
    setTimeout(() => setActionMsg(null), 3000);
  };

  const runNow = async (slug: string) => {
    setActionMsg(`Triggering ${slug}...`);
    try {
      const res = await fetch(`${CLOUD_SYNC_URL}/api/cron/jobs/${slug}/trigger`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActionMsg(`${slug} triggered`);
      setTimeout(() => fetchJobs(), 2000);
    } catch (e) {
      setActionMsg(`Error: ${(e as Error).message}`);
    }
    setTimeout(() => setActionMsg(null), 3000);
  };

  return (
    <DashboardPanel title="Cron Jobs">
      {loading && (
        <div className="text-gray-400 text-sm py-4 text-center animate-pulse">Loading cron jobs…</div>
      )}
      {error && (
        <div className="text-red-400 text-xs py-2 px-3 bg-red-900/20 rounded">{error}</div>
      )}
      {actionMsg && (
        <div className="text-blue-300 text-xs py-1 px-3 bg-blue-900/20 rounded mb-2">{actionMsg}</div>
      )}
      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-gray-300">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="text-left py-2 pr-3">Slug</th>
                <th className="text-left py-2 pr-3">Platform</th>
                <th className="text-left py-2 pr-3">Schedule</th>
                <th className="text-center py-2 pr-3">Enabled</th>
                <th className="text-center py-2 pr-3">Last Run</th>
                <th className="text-right py-2 pr-3">Count</th>
                <th className="text-right py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.slug} className="border-b border-gray-800 hover:bg-gray-800/30">
                  <td className="py-2 pr-3 font-mono">{job.slug}</td>
                  <td className="py-2 pr-3">{job.platform || '—'}</td>
                  <td className="py-2 pr-3 font-mono text-gray-400">
                    {job.schedule === 'quiet_hours' ? '🌙 quiet' : job.schedule}
                  </td>
                  <td className="py-2 pr-3 text-center">
                    <button
                      onClick={() => toggleJob(job.slug, job.enabled)}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                        job.enabled
                          ? 'bg-green-700/40 text-green-300 hover:bg-green-700/60'
                          : 'bg-gray-700/40 text-gray-400 hover:bg-gray-700/60'
                      }`}
                    >
                      {job.enabled ? '✅ ON' : '⏸ OFF'}
                    </button>
                  </td>
                  <td className="py-2 pr-3 text-center">
                    <span title={job.last_run_at || 'never'}>
                      {statusBadge(job.last_run_status)} {relativeTime(job.last_run_at)}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right">{job.last_run_count ?? 0}</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => runNow(job.slug)}
                      className="px-2 py-0.5 rounded text-xs bg-blue-700/40 text-blue-300 hover:bg-blue-700/60 transition-colors"
                    >
                      Run Now
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-gray-600 text-xs mt-2">Auto-refreshes every 10s • Data from cloud-sync :3200</div>
        </div>
      )}
    </DashboardPanel>
  );
}
