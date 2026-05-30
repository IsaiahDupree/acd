/**
 * Dashboard Integration Module
 * 
 * Provides functions to read agent harness state and integrate with
 * the autonomous coding dashboard.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const FILES = {
  progress: path.join(PROJECT_ROOT, 'claude-progress.txt'),
  features: path.join(PROJECT_ROOT, 'feature_list.json'),
  status: path.join(PROJECT_ROOT, 'harness-status.json')
};

/**
 * Parse the progress file into structured session data
 */
export function parseProgressFile() {
  if (!fs.existsSync(FILES.progress)) {
    return { sessions: [], raw: '' };
  }
  
  const content = fs.readFileSync(FILES.progress, 'utf-8');
  const sessionPattern = /=== Session ([^\n]+) ===/g;
  const sessions = [];
  let match;
  let lastIndex = 0;
  
  while ((match = sessionPattern.exec(content)) !== null) {
    if (lastIndex > 0) {
      // Get content of previous session
      const sessionContent = content.slice(lastIndex, match.index).trim();
      const actions = sessionContent.split('\n')
        .filter(line => line.startsWith('- '))
        .map(line => line.slice(2));
      
      sessions[sessions.length - 1].actions = actions;
    }
    
    sessions.push({
      timestamp: match[1],
      actions: []
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Get content of last session
  if (sessions.length > 0 && lastIndex < content.length) {
    const sessionContent = content.slice(lastIndex).trim();
    const actions = sessionContent.split('\n')
      .filter(line => line.startsWith('- '))
      .map(line => line.slice(2));
    
    sessions[sessions.length - 1].actions = actions;
  }
  
  return { sessions, raw: content };
}

/**
 * Get feature statistics and list
 */
export function getFeatureStats() {
  if (!fs.existsSync(FILES.features)) {
    return {
      total: 0,
      passing: 0,
      pending: 0,
      percentComplete: 0,
      features: [],
      byCategory: {}
    };
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(FILES.features, 'utf-8'));
    const features = data.features || [];
    const total = features.length;
    const passing = features.filter(f => f.passes).length;
    
    // Group by category
    const byCategory = {};
    features.forEach(f => {
      const cat = f.category || 'uncategorized';
      if (!byCategory[cat]) {
        byCategory[cat] = { total: 0, passing: 0, features: [] };
      }
      byCategory[cat].total++;
      if (f.passes) byCategory[cat].passing++;
      byCategory[cat].features.push(f);
    });
    
    return {
      project: data.project || 'Unknown',
      created: data.created,
      total,
      passing,
      pending: total - passing,
      percentComplete: total > 0 ? ((passing / total) * 100).toFixed(1) : 0,
      features,
      byCategory
    };
  } catch (e) {
    console.error('Error parsing feature list:', e.message);
    return {
      total: 0,
      passing: 0,
      pending: 0,
      percentComplete: 0,
      features: [],
      byCategory: {},
      error: e.message
    };
  }
}

/**
 * Get current harness status
 */
export function getHarnessStatus() {
  if (!fs.existsSync(FILES.status)) {
    return {
      status: 'idle',
      lastUpdated: null,
      sessionType: null,
      stats: getFeatureStats()
    };
  }
  
  try {
    return JSON.parse(fs.readFileSync(FILES.status, 'utf-8'));
  } catch (e) {
    return {
      status: 'unknown',
      error: e.message
    };
  }
}

/**
 * Get the next pending feature
 */
export function getNextFeature() {
  const { features } = getFeatureStats();
  
  const pending = features
    .filter(f => !f.passes)
    .sort((a, b) => (a.priority || 999) - (b.priority || 999));
  
  return pending[0] || null;
}

/**
 * Get recently completed features
 */
export function getRecentlyCompleted(limit = 10) {
  const { features } = getFeatureStats();
  
  return features
    .filter(f => f.passes && f.implemented_at)
    .sort((a, b) => new Date(b.implemented_at) - new Date(a.implemented_at))
    .slice(0, limit);
}

/**
 * Get comprehensive dashboard data
 */
export function getDashboardData() {
  const stats = getFeatureStats();
  const progress = parseProgressFile();
  const status = getHarnessStatus();
  const nextFeature = getNextFeature();
  const recentlyCompleted = getRecentlyCompleted(5);
  
  return {
    status: status.status,
    sessionType: status.sessionType,
    lastUpdated: status.lastUpdated,
    stats: {
      total: stats.total,
      passing: stats.passing,
      pending: stats.pending,
      percentComplete: stats.percentComplete
    },
    project: stats.project,
    byCategory: stats.byCategory,
    sessions: progress.sessions.slice(-10), // Last 10 sessions
    nextFeature,
    recentlyCompleted,
    isComplete: stats.total > 0 && stats.passing === stats.total
  };
}

/**
 * Watch for changes and callback
 */
export function watchForChanges(callback, intervalMs = 2000) {
  let lastData = JSON.stringify(getDashboardData());
  
  const interval = setInterval(() => {
    const currentData = getDashboardData();
    const currentJson = JSON.stringify(currentData);
    
    if (currentJson !== lastData) {
      lastData = currentJson;
      callback(currentData);
    }
  }, intervalMs);
  
  // Initial callback
  callback(getDashboardData());
  
  // Return cleanup function
  return () => clearInterval(interval);
}

// Export for CommonJS compatibility
export default {
  parseProgressFile,
  getFeatureStats,
  getHarnessStatus,
  getNextFeature,
  getRecentlyCompleted,
  getDashboardData,
  watchForChanges
};
