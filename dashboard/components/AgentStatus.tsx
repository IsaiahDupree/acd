'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, AgentRun, Feature } from '@/lib/api';

interface AgentStatusProps {
  projectId: string;
}

export default function AgentStatus({ projectId }: AgentStatusProps) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [harnessStatus, setHarnessStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [runsData, featuresData, logsData, statusData] = await Promise.all([
        api.getAgentRuns(projectId).catch(() => []),
        api.getFeatures(projectId).catch(() => []),
        api.getHarnessLogs(projectId, 50).catch(() => []),
        api.getHarnessStatus(projectId).catch(() => null),
      ]);

      setRuns(runsData);
      setFeatures(featuresData);
      setLogs(logsData);
      setHarnessStatus(statusData);
    } catch (error) {
      console.error('Failed to load agent status:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async-poll: setState runs post-await, not synchronously
    loadData();
    const interval = setInterval(loadData, 2000); // Poll every 2 seconds for real-time updates
    return () => clearInterval(interval);
  }, [loadData]);

  // Determine current and next process
  const getCurrentProcess = () => {
    if (!harnessStatus) return null;
    
    const sessionType = harnessStatus.sessionType || harnessStatus.sessionType;
    const status = harnessStatus.status || 'idle';
    
    if (status === 'running') {
      if (sessionType === 'INITIALIZER') {
        return {
          name: 'Initializer Session',
          description: 'Reading PRDs and creating feature list',
          steps: [
            'Reading PRD files',
            'Analyzing requirements',
            'Creating feature_list.json',
            'Setting up project structure'
          ]
        };
      } else if (sessionType === 'CODING') {
        return {
          name: 'Coding Session',
          description: 'Implementing features',
          steps: [
            'Reading feature_list.json',
            'Selecting next feature',
            'Implementing feature',
            'Running tests',
            'Updating feature status'
          ]
        };
      }
    }
    
    return null;
  };

  const getNextProcess = () => {
    if (!harnessStatus) return null;
    
    const sessionType = harnessStatus.sessionType || harnessStatus.sessionType;
    const status = harnessStatus.status || 'idle';
    
    if (status === 'running' && sessionType === 'INITIALIZER') {
      return {
        name: 'Coding Sessions',
        description: 'Will start after initializer completes',
        steps: [
          'Session #2: First feature implementation',
          'Session #3: Next feature implementation',
          'Continue until all features complete'
        ]
      };
    } else if (status === 'running' && sessionType === 'CODING') {
      return {
        name: 'Next Coding Session',
        description: 'Will continue with next feature',
        steps: [
          'Select next pending feature',
          'Implement and test',
          'Update progress'
        ]
      };
    }
    
    return null;
  };

  const passingFeatures = features.filter(f => f.status === 'passing').length;
  const totalFeatures = features.length;
  const progress = totalFeatures > 0 ? (passingFeatures / totalFeatures) * 100 : 0;

  if (loading) {
    return <div className="text-gray-400">Loading agent status...</div>;
  }

  const currentProcess = getCurrentProcess();
  const nextProcess = getNextProcess();

  return (
    <div className="space-y-6">
      {/* Current & Next Process */}
      {(currentProcess || nextProcess) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {currentProcess && (
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-blue-500/50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold">Current Process</h3>
                <span className="px-3 py-1 rounded-full text-sm bg-blue-500/20 text-blue-400">
                  {harnessStatus?.sessionType || 'Running'}
                </span>
              </div>
              <div className="mb-4">
                <div className="text-lg font-medium text-blue-300 mb-2">{currentProcess.name}</div>
                <div className="text-sm text-gray-400 mb-4">{currentProcess.description}</div>
                <div className="space-y-2">
                  {currentProcess.steps.map((step, idx) => (
                    <div key={idx} className="flex items-center text-sm text-gray-300">
                      <div className="w-2 h-2 rounded-full bg-blue-400 mr-3"></div>
                      {step}
                    </div>
                  ))}
                </div>
              </div>
              {harnessStatus?.stats && (
                <div className="pt-4 border-t border-gray-700">
                  <div className="text-sm text-gray-400">
                    Progress: {harnessStatus.stats.passing || 0}/{harnessStatus.stats.total || 0} features
                    {harnessStatus.stats.percentComplete && ` (${harnessStatus.stats.percentComplete}%)`}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {nextProcess && (
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold">Next Process</h3>
                <span className="px-3 py-1 rounded-full text-sm bg-gray-500/20 text-gray-400">
                  Upcoming
                </span>
              </div>
              <div className="mb-4">
                <div className="text-lg font-medium text-gray-300 mb-2">{nextProcess.name}</div>
                <div className="text-sm text-gray-400 mb-4">{nextProcess.description}</div>
                <div className="space-y-2">
                  {nextProcess.steps.map((step, idx) => (
                    <div key={idx} className="flex items-center text-sm text-gray-500">
                      <div className="w-2 h-2 rounded-full bg-gray-500 mr-3"></div>
                      {step}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Feature Progress */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <h3 className="text-xl font-semibold mb-4">Feature Progress</h3>
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-400 mb-2">
            <span>{passingFeatures} of {totalFeatures} features passing</span>
            <span>{progress.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-4">
            <div
              className="bg-green-500 h-4 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div>
            <div className="text-sm text-gray-400">Passing</div>
            <div className="text-2xl font-bold text-green-400">
              {features.filter(f => f.status === 'passing').length}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-400">In Progress</div>
            <div className="text-2xl font-bold text-blue-400">
              {features.filter(f => f.status === 'in_progress').length}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-400">Pending</div>
            <div className="text-2xl font-bold text-yellow-400">
              {features.filter(f => f.status === 'pending').length}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-400">Failing</div>
            <div className="text-2xl font-bold text-red-400">
              {features.filter(f => f.status === 'failing').length}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Agent Runs */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <h3 className="text-xl font-semibold mb-4">Recent Agent Runs</h3>
        <div className="space-y-2">
          {runs.length === 0 ? (
            <p className="text-gray-500 text-sm">No agent runs yet</p>
          ) : (
            runs.slice(0, 10).map((run) => (
              <div key={run.id} className="flex items-center justify-between p-3 bg-gray-700/30 rounded">
                <div>
                  <div className="text-sm text-gray-300">{run.runType}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(run.createdAt).toLocaleString()}
                  </div>
                </div>
                <span className={`px-2 py-1 rounded text-xs ${
                  run.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                  run.status === 'running' ? 'bg-blue-500/20 text-blue-400' :
                  run.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {run.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Harness Logs */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <h3 className="text-xl font-semibold mb-4">Harness Logs</h3>
        <div className="bg-black/50 rounded p-4 font-mono text-sm max-h-96 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-gray-500">No logs available</p>
          ) : (
            logs.map((log, index) => {
              // Color code log lines based on content
              let className = "text-gray-300 mb-1";
              if (log.includes('❌') || log.includes('Error:') || log.includes('error')) {
                className = "text-red-400 mb-1";
              } else if (log.includes('✅') || log.includes('success')) {
                className = "text-green-400 mb-1";
              } else if (log.includes('⚠️') || log.includes('warning')) {
                className = "text-yellow-400 mb-1";
              } else if (log.includes('🚀') || log.includes('Starting')) {
                className = "text-blue-400 mb-1";
              } else if (log.includes('💬') || log.includes('Assistant')) {
                className = "text-cyan-400 mb-1";
              } else if (log.includes('🔧') || log.includes('System')) {
                className = "text-purple-400 mb-1";
              }
              
              return (
                <div key={index} className={className}>
                  {log}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

