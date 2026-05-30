/**
 * Server-side path resolution for the ACD harness data directory.
 *
 * The Next API routes (dashboard-stats, agent-status, prd-coverage) read
 * harness state from the canonical ACD data dir:
 *   acd/data/  ->  features/<slug>.json, prds/<slug>.md, repo-queue.json,
 *                  queue-status.json, parallel-status.json, logs/
 *
 * Override with ACD_DATA. Otherwise resolve relative to this file
 * (lib/ -> dashboard/ -> acd/ -> data/).
 */
import fs from 'fs';
import path from 'path';

// __dirname here is .../acd/dashboard/lib at runtime under Next's server build,
// but the source layout is acd/dashboard/lib. Resolve up to the package root.
function defaultDataDir(): string {
  // process.cwd() is the dashboard root when Next runs (`next dev`/`next start`).
  // acd/data is a sibling of the dashboard dir.
  return path.resolve(process.cwd(), '..', 'data');
}

export const DATA_DIR: string = process.env.ACD_DATA || defaultDataDir();
export const FEATURES_DIR: string = process.env.ACD_FEATURES || path.join(DATA_DIR, 'features');
export const PRDS_DIR: string = process.env.ACD_PRDS || path.join(DATA_DIR, 'prds');
export const LOGS_DIR: string = path.join(DATA_DIR, 'logs');
export const QUEUE_FILE: string = process.env.ACD_QUEUE || path.join(DATA_DIR, 'repo-queue.json');

export function dataPath(...parts: string[]): string {
  return path.join(DATA_DIR, ...parts);
}

export function safeReadJson(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** A repo's stable identifier in the queue is `slug` (legacy: `id`). */
export function repoSlug(r: any): string {
  return r?.slug || r?.id || '';
}

/**
 * Resolve a feature file for a slug. Prefers the canonical
 * data/features/<slug>.json, then the queue's featureList path (which may
 * point at a legacy location).
 */
export function resolveFeatureFile(slug: string, featureListPath?: string): string {
  const canonical = path.join(FEATURES_DIR, `${slug}.json`);
  if (fs.existsSync(canonical)) return canonical;
  if (featureListPath) {
    return featureListPath.startsWith('/') ? featureListPath : path.join(DATA_DIR, featureListPath);
  }
  return canonical;
}
