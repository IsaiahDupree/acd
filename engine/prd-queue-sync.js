#!/usr/bin/env node

/**
 * PRD Queue Sync — Auto-Discovery
 * ================================
 * Scans all harness/*-features.json files and ensures every incomplete
 * project is represented in repo-queue.json so ACD runs continuously
 * against all unfinished work.
 *
 * Runs at the start of each watchdog pass. Safe to run repeatedly — only
 * adds missing entries, never removes or modifies existing ones.
 *
 * Usage:
 *   node harness/prd-queue-sync.js [--dry-run] [--verbose]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const QUEUE_FILE = path.join(__dirname, 'repo-queue.json');
const FEATURES_DIRS = [
  __dirname,                          // harness/*-features.json
  path.join(__dirname, 'features'),   // harness/features/*.json
];
const PRD_DIR = path.join(ROOT, 'docs', 'prd');

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[prd-queue-sync] ${ts} ${msg}`);
}

function verbose(msg) {
  if (VERBOSE) log(msg);
}

// Load the current queue
function loadQueue() {
  if (!fs.existsSync(QUEUE_FILE)) {
    log(`ERROR: Queue file not found: ${QUEUE_FILE}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
}

// Get all feature JSON files
function findFeatureFiles() {
  const files = [];
  for (const dir of FEATURES_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (entry.endsWith('-features.json') || entry.endsWith('.json')) {
        const full = path.join(dir, entry);
        try {
          const data = JSON.parse(fs.readFileSync(full, 'utf-8'));
          if (data.features && Array.isArray(data.features)) {
            files.push({ path: full, data, name: entry });
          }
        } catch (e) {
          verbose(`Skipping invalid JSON: ${entry}`);
        }
      }
    }
  }
  return files;
}

// Check if a feature file has all features passing
function isComplete(data) {
  const features = data.features || [];
  if (features.length === 0) return false;
  return features.every(f => f.passes === true);
}

// Get passing count
function getProgress(data) {
  const features = data.features || [];
  const passing = features.filter(f => f.passes === true).length;
  return { total: features.length, passing };
}

// Derive a repo ID from the feature filename
function deriveId(filename) {
  return filename
    .replace('-features.json', '')
    .replace('.json', '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
}

// Try to find a matching PRD doc for a feature file
function findPrdDoc(featureData, repoId) {
  // Check if PRD field exists in feature file
  if (featureData.prd) {
    const candidates = [
      featureData.prd,
      path.join(PRD_DIR, featureData.prd),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }

  // Try to find by repoId in docs/prd/
  if (fs.existsSync(PRD_DIR)) {
    const prdFiles = fs.readdirSync(PRD_DIR);
    const slug = repoId.toLowerCase();
    for (const prd of prdFiles) {
      if (prd.toLowerCase().includes(slug) || slug.includes(prd.toLowerCase().replace('.md', ''))) {
        return path.join(PRD_DIR, prd);
      }
    }
  }

  return null;
}

// Infer the most likely target repo path
function inferTargetPath(featureData) {
  // If data has a target_path, use it
  if (featureData.target_path) {
    return path.dirname(featureData.target_path);
  }

  // Check project field
  if (featureData.project) {
    const candidates = [
      path.join('/Users/isaiahdupree/Documents/Software', featureData.project),
      path.join('/Users/isaiahdupree/Documents/Software/actp-worker'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }

  // Default to ACD root
  return ROOT;
}

async function main() {
  log(`Starting PRD queue sync${DRY_RUN ? ' (DRY RUN)' : ''}...`);

  const queue = loadQueue();
  const existingIds = new Set((queue.repos || []).map(r => r.id));
  const featureFiles = findFeatureFiles();

  log(`Found ${featureFiles.length} feature files, ${existingIds.size} repos in queue`);

  const toAdd = [];

  for (const { path: filePath, data, name } of featureFiles) {
    if (isComplete(data)) {
      verbose(`COMPLETE: ${name}`);
      continue;
    }

    const { total, passing } = getProgress(data);
    if (total === 0) {
      verbose(`EMPTY: ${name}`);
      continue;
    }

    const repoId = deriveId(name);

    if (existingIds.has(repoId)) {
      verbose(`ALREADY IN QUEUE: ${repoId} (${passing}/${total})`);
      continue;
    }

    // Not in queue and not complete — add it
    const prdDoc = findPrdDoc(data, repoId);
    const targetPath = inferTargetPath(data);
    const projectName = data.description || data.name || repoId;

    const entry = {
      id: repoId,
      name: projectName,
      path: targetPath,
      featureList: filePath,
      priority: -10, // Low priority — auto-discovered entries run after manually curated ones
      enabled: true,
      untilComplete: true,
      complexity: 'medium',
      focus: `Auto-discovered from ${name}. ${passing}/${total} features complete. Complete remaining ${total - passing} features.`,
    };

    if (prdDoc) {
      entry.prd = prdDoc;
      entry.prompt = prdDoc;
    }

    toAdd.push(entry);
    log(`WILL ADD: ${repoId} (${passing}/${total} complete) → ${targetPath}`);
  }

  if (toAdd.length === 0) {
    log('Nothing to add — queue is up to date.');
    return;
  }

  if (DRY_RUN) {
    log(`DRY RUN: Would add ${toAdd.length} entries to queue`);
    return;
  }

  // Insert new entries before the end of the repos array
  queue.repos = [...(queue.repos || []), ...toAdd];
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
  log(`Added ${toAdd.length} auto-discovered entries to repo-queue.json`);
}

main().catch(err => {
  log(`ERROR: ${err.message}`);
  process.exit(1);
});
