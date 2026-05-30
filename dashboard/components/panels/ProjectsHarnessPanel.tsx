'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { api, Project, HarnessStatus, Analytics, CostSummary } from '@/lib/api';
import ProjectCard from '@/components/ProjectCard';
import HarnessControl from '@/components/HarnessControl';
import AgentStatus from '@/components/AgentStatus';
import SchedulerControl from '@/components/SchedulerControl';
import UsageChart from '@/components/UsageChart';
import RecentActivity from '@/components/RecentActivity';

export function ProjectsHarnessPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [harnessStatus, setHarnessStatus] = useState<HarnessStatus | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const p = await api.getProjects();
      setProjects(p);
      if (selected) {
        const [s, a, c] = await Promise.all([
          api.getHarnessStatus(selected.id).catch(() => null),
          api.getAnalytics(selected.id).catch(() => null),
          api.getCostSummary(selected.id).catch(() => null),
        ]);
        setHarnessStatus(s);
        setAnalytics(a ?? null);
        setCostSummary(c ?? null);
      }
    } catch { /* silently ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async-poll: setState runs post-await, not synchronously
    loadData();
    const t = setInterval(loadData, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: re-run only on selected id change
  }, [selected?.id]);

  const handleStart = async (id: string, config: any) => {
    try { await api.startHarness(id, config); await loadData(); toast.success('Harness started!'); }
    catch (e: any) { toast.error(e?.message || 'Failed to start harness'); }
  };

  const handleStop = async (id: string) => {
    try { await api.stopHarness(id); await loadData(); toast.success('Harness stopped!'); }
    catch (e: any) { toast.error(e?.message || 'Failed to stop harness'); }
  };

  if (loading) {
    return <div className="text-sm text-gray-500 py-6 text-center animate-pulse">Loading projects…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Project cards */}
      {projects.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wide">Projects</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                isSelected={selected?.id === p.id}
                onClick={() => setSelected(p)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Selected project detail */}
      {selected && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/60 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold">{selected.name}</h3>
              {selected.description && <p className="text-gray-400 text-sm mt-1">{selected.description}</p>}
            </div>
            <span className={`px-3 py-1 rounded-full text-sm ${
              selected.status === 'active' ? 'bg-green-500/20 text-green-400' :
              selected.status === 'paused' ? 'bg-yellow-500/20 text-yellow-400' :
              selected.status === 'complete' ? 'bg-blue-500/20 text-blue-400' :
              'bg-gray-500/20 text-gray-400'
            }`}>
              {selected.status}
            </span>
          </div>

          <HarnessControl projectId={selected.id} status={harnessStatus} onStart={handleStart} onStop={handleStop} />
          <AgentStatus projectId={selected.id} />
          <SchedulerControl />

          {(costSummary || analytics) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {costSummary && (
                <div className="bg-gray-700/30 rounded-lg p-4">
                  <h4 className="text-sm font-medium mb-3">Usage & Costs</h4>
                  <UsageChart costSummary={costSummary} />
                </div>
              )}
              {analytics && (
                <div className="bg-gray-700/30 rounded-lg p-4">
                  <h4 className="text-sm font-medium mb-3">Recent Activity</h4>
                  <RecentActivity analytics={analytics} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
