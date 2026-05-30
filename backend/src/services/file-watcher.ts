/**
 * File Watcher Service
 * 
 * Watches harness artifact files (feature_list.json, claude-progress.txt)
 * and emits events when they change.
 */

import { EventEmitter } from 'events';
import { watch, FSWatcher } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import Redis from 'ioredis';

export interface FeatureStatus {
  id: string;
  description: string;
  category?: string;
  priority?: number;
  passes: boolean;
  implemented_at?: string;
}

export interface FeatureListData {
  project?: string;
  total_features?: number;
  features: FeatureStatus[];
}

export interface ProgressSession {
  timestamp: string;
  actions: string[];
}

export interface FileWatcherEvents {
  'features:updated': (data: { projectId: string; features: FeatureListData }) => void;
  'progress:updated': (data: { projectId: string; sessions: ProgressSession[]; raw: string }) => void;
  'file:error': (data: { projectId: string; file: string; error: string }) => void;
}

export class FileWatcher extends EventEmitter {
  private watchers: Map<string, FSWatcher[]> = new Map();
  private redis: Redis;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEBOUNCE_MS = 500;

  constructor(redisUrl?: string) {
    super();
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
  }

  /**
   * Start watching a project's harness files
   */
  watchProject(projectId: string, projectPath: string): void {
    // Stop existing watchers if any
    this.unwatchProject(projectId);

    const filesToWatch = [
      { name: 'feature_list.json', handler: this.handleFeatureListChange.bind(this) },
      { name: 'claude-progress.txt', handler: this.handleProgressChange.bind(this) },
    ];

    const watchers: FSWatcher[] = [];

    for (const file of filesToWatch) {
      const filePath = path.join(projectPath, file.name);
      
      try {
        const watcher = watch(filePath, { persistent: true }, (eventType) => {
          if (eventType === 'change') {
            this.debounce(`${projectId}:${file.name}`, () => {
              file.handler(projectId, filePath);
            });
          }
        });

        watcher.on('error', (err) => {
          this.emit('file:error', { projectId, file: file.name, error: err.message });
        });

        watchers.push(watcher);

        // Read initial state
        file.handler(projectId, filePath);
      } catch (err: any) {
        console.warn(`Could not watch ${filePath}: ${err.message}`);
      }
    }

    this.watchers.set(projectId, watchers);
  }

  /**
   * Stop watching a project
   */
  unwatchProject(projectId: string): void {
    const watchers = this.watchers.get(projectId);
    if (watchers) {
      watchers.forEach(w => w.close());
      this.watchers.delete(projectId);
    }

    // Clear any pending debounce timers
    for (const [key, timer] of this.debounceTimers) {
      if (key.startsWith(projectId)) {
        clearTimeout(timer);
        this.debounceTimers.delete(key);
      }
    }
  }

  /**
   * Handle feature_list.json changes
   */
  private async handleFeatureListChange(projectId: string, filePath: string): Promise<void> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const data: FeatureListData = JSON.parse(content);

      // Calculate stats
      const total = data.features?.length || 0;
      const passing = data.features?.filter(f => f.passes).length || 0;

      // Emit event
      this.emit('features:updated', { projectId, features: data });

      // Publish to Redis for Socket.IO
      await this.redis.publish(`agent:events:${projectId}`, JSON.stringify({
        event: 'features:updated',
        data: {
          total,
          passing,
          pending: total - passing,
          percentComplete: total > 0 ? ((passing / total) * 100).toFixed(1) : 0,
          features: data.features,
        },
        timestamp: new Date().toISOString(),
      }));

    } catch (err: any) {
      this.emit('file:error', { projectId, file: 'feature_list.json', error: err.message });
    }
  }

  /**
   * Handle claude-progress.txt changes
   */
  private async handleProgressChange(projectId: string, filePath: string): Promise<void> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const sessions = this.parseProgressFile(content);

      // Emit event
      this.emit('progress:updated', { projectId, sessions, raw: content });

      // Publish to Redis for Socket.IO
      await this.redis.publish(`agent:events:${projectId}`, JSON.stringify({
        event: 'progress:updated',
        data: {
          sessions: sessions.slice(-10), // Last 10 sessions
          latestSession: sessions[sessions.length - 1],
        },
        timestamp: new Date().toISOString(),
      }));

    } catch (err: any) {
      this.emit('file:error', { projectId, file: 'claude-progress.txt', error: err.message });
    }
  }

  /**
   * Parse claude-progress.txt into structured sessions
   */
  private parseProgressFile(content: string): ProgressSession[] {
    const sessions: ProgressSession[] = [];
    const sessionPattern = /=== Session ([^\n=]+) ===/g;
    let match;
    let lastIndex = 0;
    let lastTimestamp = '';

    while ((match = sessionPattern.exec(content)) !== null) {
      if (lastIndex > 0 && lastTimestamp) {
        const sessionContent = content.slice(lastIndex, match.index).trim();
        const actions = sessionContent
          .split('\n')
          .filter(line => line.startsWith('- '))
          .map(line => line.slice(2).trim());

        sessions.push({ timestamp: lastTimestamp, actions });
      }

      lastTimestamp = match[1].trim();
      lastIndex = match.index + match[0].length;
    }

    // Handle last session
    if (lastTimestamp && lastIndex < content.length) {
      const sessionContent = content.slice(lastIndex).trim();
      const actions = sessionContent
        .split('\n')
        .filter(line => line.startsWith('- '))
        .map(line => line.slice(2).trim());

      sessions.push({ timestamp: lastTimestamp, actions });
    }

    return sessions;
  }

  /**
   * Debounce file change handlers
   */
  private debounce(key: string, fn: () => void): void {
    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      fn();
    }, this.DEBOUNCE_MS);

    this.debounceTimers.set(key, timer);
  }

  /**
   * Get current feature stats for a project
   */
  async getFeatureStats(projectPath: string): Promise<{ total: number; passing: number; pending: number }> {
    try {
      const filePath = path.join(projectPath, 'feature_list.json');
      const content = await readFile(filePath, 'utf-8');
      const data: FeatureListData = JSON.parse(content);

      const total = data.features?.length || 0;
      const passing = data.features?.filter(f => f.passes).length || 0;

      return { total, passing, pending: total - passing };
    } catch {
      return { total: 0, passing: 0, pending: 0 };
    }
  }

  /**
   * Cleanup
   */
  async shutdown(): Promise<void> {
    for (const projectId of this.watchers.keys()) {
      this.unwatchProject(projectId);
    }
    await this.redis.quit();
  }
}

// Singleton
let instance: FileWatcher | null = null;

export function getFileWatcher(): FileWatcher {
  if (!instance) {
    instance = new FileWatcher();
  }
  return instance;
}

export default FileWatcher;
