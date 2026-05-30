/**
 * API Client for Autonomous Coding Dashboard
 * Connects to the backend API on NEXT_PUBLIC_BACKEND_PORT (default 3434),
 * overridable via NEXT_PUBLIC_API_URL.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || `http://localhost:${process.env.NEXT_PUBLIC_BACKEND_PORT || 3434}`;

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'paused' | 'archived' | 'complete';
  touchLevel?: string;
  profitPotential?: string;
  difficulty?: string;
  automationMode?: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    features: number;
    workItems: number;
  };
}

export interface Feature {
  id: string;
  projectId: string;
  featureKey: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'passing' | 'failing' | 'blocked';
  priority: number;
  sessionCompleted?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRun {
  id: string;
  projectId: string;
  agentId: string;
  runType: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  model: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    events: number;
  };
}

export interface HarnessStatus {
  projectId: string;
  status: 'running' | 'stopped' | 'error' | 'completed' | 'idle';
  pid?: number;
  startedAt?: string;
  lastUpdate?: string;
  message?: string;
  sessionNumber?: number;
  sessionType?: 'initializer' | 'coding' | 'INITIALIZER' | 'CODING';
  featuresPassing?: number;
  featuresTotal?: number;
  progressPercent?: number;
  stats?: {
    total: number;
    passing: number;
    pending: number;
    percentComplete?: number | string;
  };
}

export interface CostEntry {
  id: string;
  projectId: string;
  sessionNumber: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: string;
}

export interface CostSummary {
  isOAuthToken?: boolean; // True if using Claude Code subscription (free)
  totalCost: number;
  totalTokens: number;
  sessions: number;
  averageCostPerSession: number;
  byModel: Record<string, { cost: number; tokens: number }>;
}

export interface Analytics {
  projectId: string;
  featuresCompleted: number;
  featuresTotal: number;
  sessionsRun: number;
  totalCost: number;
  averageSessionDuration: number;
  successRate: number;
  recentActivity: Array<{
    type: string;
    timestamp: string;
    description: string;
  }>;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorData.message || errorMessage;
      } catch {
        // If response isn't JSON, use status text
      }
      throw new Error(`API error (${response.status}): ${errorMessage}`);
    }

    const data = await response.json();
    return data.data || data;
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    return this.fetch<Project[]>('/api/projects');
  }

  async getProject(id: string): Promise<Project> {
    return this.fetch<Project>(`/api/projects/${id}`);
  }

  async createProject(data: Partial<Project>): Promise<Project> {
    return this.fetch<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Features
  async getFeatures(projectId: string): Promise<Feature[]> {
    return this.fetch<Feature[]>(`/api/projects/${projectId}/features`);
  }

  async syncFeatures(projectId: string, features: any[]): Promise<Feature[]> {
    return this.fetch<Feature[]>(`/api/projects/${projectId}/features/sync`, {
      method: 'POST',
      body: JSON.stringify({ features }),
    });
  }

  // Agent Runs
  async getAgentRuns(projectId: string): Promise<AgentRun[]> {
    return this.fetch<AgentRun[]>(`/api/projects/${projectId}/agent-runs`);
  }

  async startAgentRun(projectId: string, config: any): Promise<AgentRun> {
    return this.fetch<AgentRun>(`/api/projects/${projectId}/agent-runs`, {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  // Harness Control
  async startHarness(projectId: string, config: any): Promise<HarnessStatus> {
    return this.fetch<HarnessStatus>(`/api/projects/${projectId}/harness/start`, {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async stopHarness(projectId: string, force?: boolean): Promise<HarnessStatus> {
    return this.fetch<HarnessStatus>(`/api/projects/${projectId}/harness/stop`, {
      method: 'POST',
      body: JSON.stringify({ force }),
    });
  }

  async getHarnessStatus(projectId: string): Promise<HarnessStatus> {
    return this.fetch<HarnessStatus>(`/api/projects/${projectId}/harness/status`);
  }

  async getHarnessLogs(projectId: string, limit: number = 100): Promise<string[]> {
    return this.fetch<string[]>(`/api/projects/${projectId}/harness/logs?limit=${limit}`);
  }

  // Cost Tracking
  async getCosts(projectId: string, limit: number = 100): Promise<CostEntry[]> {
    return this.fetch<CostEntry[]>(`/api/projects/${projectId}/costs?limit=${limit}`);
  }

  async getCostSummary(projectId: string, start?: string, end?: string): Promise<CostSummary> {
    const params = new URLSearchParams();
    if (start) params.append('start', start);
    if (end) params.append('end', end);
    return this.fetch<CostSummary>(`/api/projects/${projectId}/costs/summary?${params}`);
  }

  // Analytics
  async getAnalytics(projectId: string, start?: string, end?: string): Promise<Analytics> {
    const params = new URLSearchParams();
    if (start) params.append('start', start);
    if (end) params.append('end', end);
    return this.fetch<Analytics>(`/api/projects/${projectId}/analytics?${params}`);
  }

  async getRealTimeMetrics(projectId: string): Promise<any> {
    return this.fetch<any>(`/api/projects/${projectId}/metrics/realtime`);
  }

  // Dashboard Stats
  async getDashboardStats(): Promise<any> {
    return this.fetch<any>('/api/dashboard/stats');
  }

  // Scheduler
  async getSchedulerStatus(): Promise<SchedulerStatus> {
    return this.fetch<SchedulerStatus>('/api/scheduler/status');
  }

  async updateSchedulerConfig(config: Partial<SchedulerConfig>): Promise<any> {
    return this.fetch<any>('/api/scheduler/config', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async clearSchedulerQueue(): Promise<any> {
    return this.fetch<any>('/api/scheduler/clear', {
      method: 'POST',
    });
  }
}

export interface SchedulerStatus {
  queueLength: number;
  runningTasks: number;
  circuitBreakerOpen: boolean;
  circuitBreakerFailures: number;
  rateLimitState: {
    requestsInWindow: number;
    windowStart: string;
    remainingRequests?: number;
    resetAt?: string;
    limit?: number;
    lastRequestTime?: string;
  };
  config: SchedulerConfig;
}

export interface SchedulerConfig {
  requestsPerMinute: number;
  maxConcurrent: number;
  maxRetries: number;
  minTimeBetweenRequests: number;
}

export const api = new ApiClient();

