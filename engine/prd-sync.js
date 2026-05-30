#!/usr/bin/env node

/**
 * PRD Sync Service
 * ================
 *
 * Combines features from multiple PRD files into a unified feature backlog.
 * Handles deduplication and tracks feature origins.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { FEATURES_DIR, PRDS_DIR, QUEUE_FILE } from './paths.js';

/**
 * Compute similarity between two strings (0-1 scale)
 * Uses simple word overlap algorithm
 */
export function computeSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;

  const words1 = str1.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const words2 = str2.toLowerCase().split(/\W+/).filter(w => w.length > 3);

  if (words1.length === 0 || words2.length === 0) return 0;

  const set1 = new Set(words1);
  const set2 = new Set(words2);

  const intersection = new Set([...set1].filter(w => set2.has(w)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Generate a stable hash for feature identification
 */
function generateFeatureHash(description) {
  return crypto.createHash('md5')
    .update(description.toLowerCase().trim())
    .digest('hex')
    .substring(0, 8);
}

/**
 * Find duplicate features based on similarity threshold
 */
export function findDuplicates(features, threshold = 0.7) {
  const duplicateGroups = [];
  const processed = new Set();

  for (let i = 0; i < features.length; i++) {
    if (processed.has(i)) continue;

    const group = [features[i]];
    processed.add(i);

    for (let j = i + 1; j < features.length; j++) {
      if (processed.has(j)) continue;

      const similarity = computeSimilarity(
        features[i].description,
        features[j].description
      );

      if (similarity >= threshold) {
        group.push(features[j]);
        processed.add(j);
      }
    }

    if (group.length > 1) {
      duplicateGroups.push(group);
    }
  }

  return duplicateGroups;
}

/**
 * Merge duplicate features, keeping the most complete version
 */
export function mergeDuplicates(duplicateGroup) {
  // Find feature with most complete data
  const primary = duplicateGroup.reduce((best, current) => {
    const bestScore = (best.acceptance_criteria?.length || 0) +
                      (best.files?.length || 0) +
                      (best.description?.length || 0);
    const currentScore = (current.acceptance_criteria?.length || 0) +
                         (current.files?.length || 0) +
                         (current.description?.length || 0);
    return currentScore > bestScore ? current : best;
  });

  // Track all source PRDs
  const sources = duplicateGroup.map(f => f.source_prd).filter(Boolean);

  return {
    ...primary,
    source_prds: [...new Set(sources)],
    merged_from: duplicateGroup.map(f => f.id).filter(id => id !== primary.id)
  };
}

/**
 * Load features from a feature_list.json file
 */
function loadFeatureList(filePath, sourcePrdName) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  Feature list not found: ${filePath}`);
    return [];
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const features = data.features || [];

    // Add source PRD metadata to each feature
    return features.map(f => ({
      ...f,
      source_prd: sourcePrdName,
      feature_hash: generateFeatureHash(f.description || f.name || f.id)
    }));
  } catch (e) {
    console.error(`❌ Error loading ${filePath}: ${e.message}`);
    return [];
  }
}

/**
 * Scan a directory for PRD markdown files
 */
function scanPrdsInDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  const files = fs.readdirSync(dirPath);
  return files
    .filter(f => f.match(/\.(md|markdown)$/i))
    .filter(f => f.match(/prd|spec|requirements/i))
    .map(f => path.join(dirPath, f));
}

/**
 * Main sync function: combine features from multiple sources
 */
export function syncFeatures(options = {}) {
  const {
    sources = [],
    outputPath = './feature_list.json',
    deduplicateThreshold = 0.7,
    mergeStrategy = 'keep-all' // 'keep-all', 'merge-duplicates'
  } = options;

  console.log(`📋 PRD Sync: Combining features from ${sources.length} sources`);

  // Load all features from all sources
  let allFeatures = [];

  for (const source of sources) {
    if (source.type === 'feature_list') {
      const features = loadFeatureList(source.path, source.name);
      console.log(`  ✓ Loaded ${features.length} features from ${source.name}`);
      allFeatures.push(...features);
    } else if (source.type === 'prd_dir') {
      const prdFiles = scanPrdsInDirectory(source.path);
      console.log(`  📁 Found ${prdFiles.length} PRD files in ${source.path}`);
      // PRDs would need to be parsed separately (future enhancement)
    }
  }

  console.log(`\n📊 Total features before deduplication: ${allFeatures.length}`);

  // Find and handle duplicates
  let finalFeatures = allFeatures;

  if (mergeStrategy === 'merge-duplicates' && allFeatures.length > 0) {
    const duplicateGroups = findDuplicates(allFeatures, deduplicateThreshold);
    console.log(`🔍 Found ${duplicateGroups.length} duplicate groups`);

    if (duplicateGroups.length > 0) {
      // Merge duplicates
      const duplicateIds = new Set(
        duplicateGroups.flat().map(f => f.id)
      );

      const uniqueFeatures = allFeatures.filter(f => !duplicateIds.has(f.id));
      const mergedFeatures = duplicateGroups.map(g => mergeDuplicates(g));

      finalFeatures = [...uniqueFeatures, ...mergedFeatures];
      console.log(`  ✓ Merged duplicates: ${allFeatures.length} → ${finalFeatures.length} features`);

      // Log merge details
      for (const group of duplicateGroups) {
        console.log(`  📦 Merged: ${group.map(f => f.id).join(', ')}`);
      }
    }
  }

  // Sort by priority and category
  finalFeatures.sort((a, b) => {
    if (a.priority !== b.priority) {
      return (a.priority || 99) - (b.priority || 99);
    }
    return (a.category || '').localeCompare(b.category || '');
  });

  // Generate unified feature list
  const unifiedFeatureList = {
    project: 'Unified Feature Backlog',
    description: 'Combined features from multiple PRDs',
    total_features: finalFeatures.length,
    created_at: new Date().toISOString(),
    sources: sources.map(s => ({ name: s.name, path: s.path, type: s.type })),
    features: finalFeatures
  };

  // Write output
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(unifiedFeatureList, null, 2));
  console.log(`\n✅ Synced ${finalFeatures.length} features to ${outputPath}`);

  // Generate stats
  const stats = {
    total: finalFeatures.length,
    by_source: {},
    by_category: {},
    passing: finalFeatures.filter(f => f.passes).length
  };

  for (const f of finalFeatures) {
    const source = f.source_prd || 'unknown';
    stats.by_source[source] = (stats.by_source[source] || 0) + 1;

    const category = f.category || 'uncategorized';
    stats.by_category[category] = (stats.by_category[category] || 0) + 1;
  }

  console.log('\n📈 Statistics:');
  console.log(`   Total: ${stats.total} features`);
  console.log(`   Passing: ${stats.passing} (${((stats.passing/stats.total)*100).toFixed(1)}%)`);
  console.log(`\n   By Source:`);
  for (const [source, count] of Object.entries(stats.by_source).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${source}: ${count}`);
  }

  return {
    success: true,
    featuresCount: finalFeatures.length,
    stats
  };
}

/**
 * Watch PRD files for changes and auto-sync
 */
export function watchPrds(sources, outputPath, options = {}) {
  const { interval = 30000 } = options; // 30 seconds default

  console.log(`👀 Watching ${sources.length} PRD sources for changes...`);
  console.log(`   Sync interval: ${interval/1000}s`);

  // Track file mtimes
  const fileMtimes = new Map();

  const checkForChanges = () => {
    let hasChanges = false;

    for (const source of sources) {
      if (!fs.existsSync(source.path)) continue;

      const stat = fs.statSync(source.path);
      const lastMtime = fileMtimes.get(source.path);

      if (!lastMtime || stat.mtime.getTime() > lastMtime) {
        hasChanges = true;
        fileMtimes.set(source.path, stat.mtime.getTime());
      }
    }

    if (hasChanges) {
      console.log(`\n🔄 Changes detected, re-syncing features...`);
      syncFeatures({ sources, outputPath, mergeStrategy: 'merge-duplicates' });
    }
  };

  // Initial sync
  checkForChanges();

  // Set up interval
  setInterval(checkForChanges, interval);
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  function getArgValue(name) {
    const eq = args.find(a => a.startsWith(`${name}=`));
    if (eq) return eq.split('=')[1];
    const idx = args.indexOf(name);
    if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
    return null;
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
PRD Sync - Combine Multiple PRD Feature Lists
==============================================

Combines features from multiple feature_list.json files into a unified backlog.
Deduplicates similar features and tracks their source PRDs.

Usage:
  node prd-sync.js --config=<path>
  node prd-sync.js --sources=<paths> --output=<path>
  node prd-sync.js --config=<path> --watch

Options:
  --config PATH     Config file with sources (JSON)
  --sources PATHS   Comma-separated list of feature_list.json files
  --output PATH     Output path for unified feature list
                    (default: data/repo-queue.json — the canonical queue)
  --watch           Watch for changes and auto-sync
  --help, -h        Show this help

With no --config/--sources, feature lists are auto-discovered from data/features/
and PRD docs from data/prds/.

Config file format:
{
  "sources": [
    { "name": "Project A", "path": "./projectA/feature_list.json", "type": "feature_list" },
    { "name": "Project B", "path": "./projectB/feature_list.json", "type": "feature_list" }
  ],
  "output": "./unified-features.json",
  "mergeStrategy": "merge-duplicates"
}

Examples:
  node prd-sync.js --config=./prd-sync-config.json
  node prd-sync.js --sources=./a/features.json,./b/features.json --output=./unified.json
  node prd-sync.js --config=./prd-sync-config.json --watch
`);
    process.exit(0);
  }

  const configPath = getArgValue('--config');
  const sourcesArg = getArgValue('--sources');
  // Default output is the canonical repo queue (data/repo-queue.json via QUEUE_FILE).
  const outputPath = getArgValue('--output') || QUEUE_FILE;
  const watch = args.includes('--watch');

  let sources = [];
  let mergeStrategy = 'merge-duplicates';

  if (configPath) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    sources = config.sources || [];
    mergeStrategy = config.mergeStrategy || mergeStrategy;
  } else if (sourcesArg) {
    sources = sourcesArg.split(',').map((p, i) => ({
      name: `Source ${i + 1}`,
      path: p.trim(),
      type: 'feature_list'
    }));
  } else {
    // No explicit sources: discover canonical feature lists in data/features (FEATURES_DIR)
    // and PRD docs in data/prds (PRDS_DIR).
    if (fs.existsSync(FEATURES_DIR)) {
      sources = fs.readdirSync(FEATURES_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => ({
          name: path.basename(f, '.json'),
          path: path.join(FEATURES_DIR, f),
          type: 'feature_list',
        }));
    }
    if (fs.existsSync(PRDS_DIR)) {
      sources.push({ name: 'prds', path: PRDS_DIR, type: 'prd_dir' });
    }
    if (sources.length === 0) {
      console.error(`❌ No sources given and none found in ${FEATURES_DIR}. Use --help for usage.`);
      process.exit(1);
    }
    console.log(`📂 Auto-discovered ${sources.length} source(s) from ${FEATURES_DIR} / ${PRDS_DIR}`);
  }

  if (watch) {
    watchPrds(sources, outputPath);
  } else {
    syncFeatures({ sources, outputPath, mergeStrategy });
  }
}

export default { syncFeatures, watchPrds };
