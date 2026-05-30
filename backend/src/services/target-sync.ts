/**
 * Target Sync Service
 * 
 * Syncs targets from repo-queue.json to database and tracks progress
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface RepoQueueEntry {
  id: string;
  name: string;
  path: string;
  priority: number;
  complexity?: 'low' | 'medium' | 'high';
  enabled?: boolean;
  focus?: string;
  featureList?: string;
}

interface RepoQueue {
  repos: RepoQueueEntry[];
  modelTiers?: Record<string, { models: string[]; fallback: string }>;
}

// Read feature progress from feature_list.json
function getFeatureProgress(featureListPath: string): { total: number; passing: number; percent: number } {
  if (!featureListPath || !fs.existsSync(featureListPath)) {
    return { total: 0, passing: 0, percent: 0 };
  }

  try {
    const data = JSON.parse(fs.readFileSync(featureListPath, 'utf-8'));
    const features = data.features || data || [];
    if (!Array.isArray(features)) {
      return { total: 0, passing: 0, percent: 0 };
    }

    const total = features.length;
    const passing = features.filter((f: any) => 
      f.completed || f.passes || f.status === 'passing'
    ).length;

    return {
      total,
      passing,
      percent: total > 0 ? (passing / total) * 100 : 0
    };
  } catch (e) {
    return { total: 0, passing: 0, percent: 0 };
  }
}

// Sync all targets from repo-queue.json to database
export async function syncTargetsFromQueue(queueFilePath: string): Promise<void> {
  if (!fs.existsSync(queueFilePath)) {
    console.error(`Queue file not found: ${queueFilePath}`);
    return;
  }

  const queue: RepoQueue = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
  
  for (const repo of queue.repos) {
    const progress = getFeatureProgress(repo.featureList || '');
    const isComplete = progress.total > 0 && progress.passing === progress.total;

    await prisma.target.upsert({
      where: { repoId: repo.id },
      create: {
        repoId: repo.id,
        name: repo.name,
        path: repo.path,
        priority: repo.priority || 99,
        complexity: (repo.complexity || 'medium') as any,
        enabled: repo.enabled !== false,
        focus: repo.focus || null,
        totalFeatures: progress.total,
        passingFeatures: progress.passing,
        percentComplete: progress.percent,
        status: isComplete ? 'complete' : 'pending'
      },
      update: {
        name: repo.name,
        path: repo.path,
        priority: repo.priority || 99,
        complexity: (repo.complexity || 'medium') as any,
        enabled: repo.enabled !== false,
        focus: repo.focus || null,
        totalFeatures: progress.total,
        passingFeatures: progress.passing,
        percentComplete: progress.percent,
        status: isComplete ? 'complete' : undefined
      }
    });
  }

  console.log(`Synced ${queue.repos.length} targets to database`);
}

// Update target progress
export async function updateTargetProgress(repoId: string, featureListPath: string): Promise<void> {
  const progress = getFeatureProgress(featureListPath);
  const isComplete = progress.total > 0 && progress.passing === progress.total;

  await prisma.target.update({
    where: { repoId },
    data: {
      totalFeatures: progress.total,
      passingFeatures: progress.passing,
      percentComplete: progress.percent,
      status: isComplete ? 'complete' : undefined
    }
  });
}

// Start a new harness session
export async function startSession(
  repoId: string,
  sessionNumber: number,
  sessionType: string,
  model: string
): Promise<string> {
  // Get or create target
  let target = await prisma.target.findUnique({ where: { repoId } });
  
  if (!target) {
    target = await prisma.target.create({
      data: {
        repoId,
        name: repoId,
        path: '',
        status: 'active'
      }
    });
  }

  // Get current feature count for "before"
  const featuresBefore = target.passingFeatures;

  // Create session
  const session = await prisma.harnessSession.create({
    data: {
      targetId: target.id,
      sessionNumber,
      sessionType,
      model,
      status: 'running',
      featuresBefore
    }
  });

  // Update target status
  await prisma.target.update({
    where: { id: target.id },
    data: {
      status: 'active',
      lastSessionAt: new Date(),
      lastModel: model
    }
  });

  return session.id;
}

// End a harness session
export async function endSession(
  sessionId: string,
  result: {
    success: boolean;
    featuresAfter: number;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    durationMs?: number;
    errorType?: string;
    errorMessage?: string;
    commitsMade?: number;
  }
): Promise<void> {
  const session = await prisma.harnessSession.findUnique({
    where: { id: sessionId },
    include: { target: true }
  });

  if (!session) return;

  const featuresCompleted = Math.max(0, result.featuresAfter - session.featuresBefore);

  await prisma.harnessSession.update({
    where: { id: sessionId },
    data: {
      status: result.success ? 'completed' : 'failed',
      featuresAfter: result.featuresAfter,
      featuresCompleted,
      inputTokens: result.inputTokens || 0,
      outputTokens: result.outputTokens || 0,
      costUsd: result.costUsd || 0,
      durationMs: result.durationMs || 0,
      errorType: result.errorType,
      errorMessage: result.errorMessage,
      commitsMade: result.commitsMade || 0,
      finishedAt: new Date()
    }
  });

  // Update target progress
  await prisma.target.update({
    where: { id: session.targetId },
    data: {
      passingFeatures: result.featuresAfter,
      percentComplete: session.target.totalFeatures > 0 
        ? (result.featuresAfter / session.target.totalFeatures) * 100 
        : 0,
      status: result.featuresAfter === session.target.totalFeatures ? 'complete' : 'active'
    }
  });

  // Update model usage
  await updateModelUsage(
    session.model,
    result.inputTokens || 0,
    result.outputTokens || 0,
    result.costUsd || 0
  );

  // Update daily snapshot
  await updateDailySnapshot(
    session.targetId,
    result.featuresAfter,
    session.target.totalFeatures,
    result.inputTokens || 0,
    result.costUsd || 0
  );
}

// Update model usage stats
async function updateModelUsage(
  model: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number
): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.modelUsage.upsert({
    where: {
      model_usageDate: { model, usageDate: today }
    },
    create: {
      model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costUsd,
      requestCount: 1,
      usageDate: today
    },
    update: {
      inputTokens: { increment: inputTokens },
      outputTokens: { increment: outputTokens },
      totalTokens: { increment: inputTokens + outputTokens },
      costUsd: { increment: costUsd },
      requestCount: { increment: 1 }
    }
  });
}

// Update daily progress snapshot
async function updateDailySnapshot(
  targetId: string,
  passingFeatures: number,
  totalFeatures: number,
  tokensUsed: number,
  costUsd: number
): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.progressSnapshot.upsert({
    where: {
      targetId_snapshotDate: { targetId, snapshotDate: today }
    },
    create: {
      targetId,
      totalFeatures,
      passingFeatures,
      percentComplete: totalFeatures > 0 ? (passingFeatures / totalFeatures) * 100 : 0,
      sessionsToday: 1,
      tokensToday: tokensUsed,
      costToday: costUsd,
      snapshotDate: today
    },
    update: {
      passingFeatures,
      percentComplete: totalFeatures > 0 ? (passingFeatures / totalFeatures) * 100 : 0,
      sessionsToday: { increment: 1 },
      tokensToday: { increment: tokensUsed },
      costToday: { increment: costUsd }
    }
  });
}

// Get all targets with latest stats
export async function getAllTargets() {
  return prisma.target.findMany({
    orderBy: { priority: 'asc' },
    include: {
      sessions: {
        orderBy: { startedAt: 'desc' },
        take: 5
      }
    }
  });
}

// Get target stats summary
export async function getTargetsSummary() {
  const targets = await prisma.target.findMany();
  
  const totalFeatures = targets.reduce((sum, t) => sum + t.totalFeatures, 0);
  const passingFeatures = targets.reduce((sum, t) => sum + t.passingFeatures, 0);
  const completeTargets = targets.filter(t => t.status === 'complete').length;
  
  return {
    totalTargets: targets.length,
    enabledTargets: targets.filter(t => t.enabled).length,
    completeTargets,
    totalFeatures,
    passingFeatures,
    pendingFeatures: totalFeatures - passingFeatures,
    overallPercent: totalFeatures > 0 ? (passingFeatures / totalFeatures) * 100 : 0
  };
}

// Get model usage summary
export async function getModelUsageSummary(days: number = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const usage = await prisma.modelUsage.findMany({
    where: { usageDate: { gte: since } },
    orderBy: { usageDate: 'desc' }
  });

  const byModel: Record<string, { tokens: number; cost: number; requests: number }> = {};
  
  for (const u of usage) {
    if (!byModel[u.model]) {
      byModel[u.model] = { tokens: 0, cost: 0, requests: 0 };
    }
    byModel[u.model].tokens += u.totalTokens;
    byModel[u.model].cost += u.costUsd;
    byModel[u.model].requests += u.requestCount;
  }

  return {
    periodDays: days,
    totalTokens: usage.reduce((sum, u) => sum + u.totalTokens, 0),
    totalCost: usage.reduce((sum, u) => sum + u.costUsd, 0),
    totalRequests: usage.reduce((sum, u) => sum + u.requestCount, 0),
    byModel
  };
}

// Sync features from feature_list.json to database
export async function syncFeaturesForTarget(repoId: string, featureListPath: string): Promise<number> {
  console.log(`syncFeaturesForTarget: repoId=${repoId}, path=${featureListPath}`);
  
  if (!featureListPath || !fs.existsSync(featureListPath)) {
    console.log(`syncFeaturesForTarget: File not found or empty path`);
    return 0;
  }

  const target = await prisma.target.findUnique({ where: { repoId } });
  console.log(`syncFeaturesForTarget: target found=${!!target}`);
  if (!target) return 0;

  try {
    const data = JSON.parse(fs.readFileSync(featureListPath, 'utf-8'));
    const features = data.features || data || [];
    if (!Array.isArray(features)) return 0;

    let synced = 0;
    for (const f of features) {
      const featureKey = f.id || f.key || `feature-${synced}`;
      const passes = !!(f.completed || f.passes || f.status === 'passing');
      
      // Parse priority - handle "P0", "P1", numeric, etc.
      let priority = 50;
      if (typeof f.priority === 'number') {
        priority = f.priority;
      } else if (typeof f.priority === 'string') {
        const match = f.priority.match(/P?(\d+)/i);
        if (match) priority = parseInt(match[1], 10);
      }
      
      await prisma.targetFeature.upsert({
        where: {
          targetId_featureKey: { targetId: target.id, featureKey }
        },
        create: {
          targetId: target.id,
          featureKey,
          name: f.name || f.title || featureKey,
          description: f.description || null,
          category: f.category || null,
          priority,
          status: passes ? 'passing' : 'pending',
          passes,
          implementedAt: passes ? new Date() : null
        },
        update: {
          name: f.name || f.title || featureKey,
          description: f.description || null,
          category: f.category || null,
          status: passes ? 'passing' : 'pending',
          passes,
          implementedAt: passes ? new Date() : undefined
        }
      });
      synced++;
    }
    return synced;
  } catch (e) {
    console.error('Feature sync error:', e);
    return 0;
  }
}

// Log a harness event
export async function logHarnessEvent(
  sessionId: string,
  level: string,
  message: string,
  metadata?: any
): Promise<void> {
  await prisma.harnessLog.create({
    data: { sessionId, level, message, metadata }
  });
}

// Track an error
export async function trackError(
  targetId: string,
  errorType: string,
  message: string,
  options?: { sessionId?: string; errorCode?: string; stackTrace?: string; context?: any }
): Promise<void> {
  const target = await prisma.target.findUnique({ where: { repoId: targetId } });
  if (!target) return;

  await prisma.harnessError.create({
    data: {
      targetId: target.id,
      sessionId: options?.sessionId,
      errorType,
      errorCode: options?.errorCode,
      message,
      stackTrace: options?.stackTrace,
      context: options?.context
    }
  });
}

// Track a commit
export async function trackCommit(
  sessionId: string,
  targetId: string,
  sha: string,
  message: string,
  options?: { filesChanged?: number; additions?: number; deletions?: number; branch?: string }
): Promise<void> {
  const target = await prisma.target.findUnique({ where: { repoId: targetId } });
  if (!target) return;

  await prisma.harnessCommit.create({
    data: {
      sessionId,
      targetId: target.id,
      sha,
      message,
      filesChanged: options?.filesChanged || 0,
      additions: options?.additions || 0,
      deletions: options?.deletions || 0,
      branch: options?.branch || 'main'
    }
  });
}

// Track token usage detail
export async function trackTokenUsage(
  sessionId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
  options?: { cacheReadTokens?: number; cacheWriteTokens?: number; toolName?: string }
): Promise<void> {
  await prisma.tokenUsageDetail.create({
    data: {
      sessionId,
      model,
      inputTokens,
      outputTokens,
      cacheReadTokens: options?.cacheReadTokens || 0,
      cacheWriteTokens: options?.cacheWriteTokens || 0,
      costUsd,
      toolName: options?.toolName
    }
  });
}

// Get features for a target
export async function getTargetFeatures(repoId: string) {
  const target = await prisma.target.findUnique({ where: { repoId } });
  if (!target) return [];

  return prisma.targetFeature.findMany({
    where: { targetId: target.id },
    orderBy: [{ passes: 'asc' }, { priority: 'asc' }]
  });
}

// Get recent errors
export async function getRecentErrors(limit: number = 50) {
  return prisma.harnessError.findMany({
    where: { resolved: false },
    orderBy: { createdAt: 'desc' },
    take: limit
  });
}

// Get session logs
export async function getSessionLogs(sessionId: string) {
  return prisma.harnessLog.findMany({
    where: { sessionId },
    orderBy: { timestamp: 'asc' }
  });
}

// Get commits for a target
export async function getTargetCommits(repoId: string, limit: number = 50) {
  const target = await prisma.target.findUnique({ where: { repoId } });
  if (!target) return [];

  return prisma.harnessCommit.findMany({
    where: { targetId: target.id },
    orderBy: { createdAt: 'desc' },
    take: limit
  });
}

export default {
  syncTargetsFromQueue,
  updateTargetProgress,
  startSession,
  endSession,
  getAllTargets,
  getTargetsSummary,
  getModelUsageSummary,
  syncFeaturesForTarget,
  logHarnessEvent,
  trackError,
  trackCommit,
  trackTokenUsage,
  getTargetFeatures,
  getRecentErrors,
  getSessionLogs,
  getTargetCommits
};
