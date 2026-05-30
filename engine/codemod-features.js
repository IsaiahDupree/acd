#!/usr/bin/env node
// codemod-features.js — normalize ACD feature lists to the canonical shape.
//
// Canonical shape (see schema/feature.schema.json):
//   { project, slug, version, features: [ { id, title, description, category,
//     priority, status, passes, dependencies, acceptance, files } ] }
//
// Transforms applied IN PLACE (a backup is written first):
//   * name -> title (title wins if both present; derive from description/id if neither)
//   * flatten any categories[].features into features[] (id prefixed by category)
//     — note: in the current dataset `categories` is metadata and `features` is
//       already flat, so this only fires on truly nested inputs.
//   * derive missing id from index ("F-<n>")
//   * normalize priority  -> low | medium | high | critical
//   * normalize status    -> todo | in_progress | done | blocked
//     (default from passes: passes ? 'done' : 'todo')
//   * drop junk features whose title is exactly a doc heading (Mandatory Rules,
//     Overview, Goals, Non-Goals, Out of Scope, ...) — each drop is logged.
//   * preserve/derive slug from the filename.
//
// Files without a top-level `features` array (sidecar metrics/status files) are
// skipped untouched.
//
// Usage:
//   node codemod-features.js [dir] [--dry-run]
//     dir defaults to data/features. --dry-run reports without writing.

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync, copyFileSync } from 'fs';
import { join, resolve, basename } from 'path';
import { FEATURES_DIR } from './paths.js';

// Exact (case-insensitive, trimmed) titles considered doc-heading junk.
const JUNK_TITLES = new Set([
  'mandatory rules',
  'overview',
  'goals',
  'non-goals',
  'non goals',
  'out of scope',
  'mission',
  'features to build',
  'working directory',
  'output files',
  'success metrics',
  'architecture',
  'background',
  'scope',
  'context',
  'introduction',
  'summary',
  'notes',
].map((s) => s.toLowerCase()));

function normalizePriority(p) {
  if (p === undefined || p === null) return undefined;
  if (typeof p === 'string') {
    const m = p.trim().toUpperCase();
    const map = { P0: 'critical', P1: 'high', P2: 'medium', P3: 'low', P4: 'low' };
    if (map[m]) return map[m];
    const lower = p.trim().toLowerCase();
    if (['low', 'medium', 'high', 'critical'].includes(lower)) return lower;
    return undefined;
  }
  if (typeof p === 'number') {
    // Numeric scales seen: 1 (highest) .. 4 (lowest).
    const map = { 1: 'critical', 2: 'high', 3: 'medium', 4: 'low' };
    return map[p] || undefined;
  }
  return undefined;
}

function normalizeStatus(s, passes) {
  const fallback = passes ? 'done' : 'todo';
  if (typeof s !== 'string') return fallback;
  const v = s.trim().toLowerCase();
  const map = {
    completed: 'done',
    complete: 'done',
    done: 'done',
    not_applicable: 'done',
    pending: 'todo',
    todo: 'todo',
    not_started: 'todo',
    in_progress: 'in_progress',
    'in-progress': 'in_progress',
    wip: 'in_progress',
    blocked: 'blocked',
    todo_: 'todo',
  };
  return map[v] || fallback;
}

function deriveTitle(ft) {
  if (typeof ft.title === 'string' && ft.title.trim()) return ft.title.trim();
  if (typeof ft.name === 'string' && ft.name.trim()) return ft.name.trim();
  if (typeof ft.description === 'string' && ft.description.trim()) {
    const d = ft.description.trim();
    return d.length > 80 ? `${d.slice(0, 77)}...` : d;
  }
  return null; // caller falls back to id
}

function isArrOfStrings(v) {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function normalizeFeature(raw, index, log) {
  const passes = typeof raw.passes === 'boolean' ? raw.passes : false;
  const id = (typeof raw.id === 'string' && raw.id.trim()) ? raw.id.trim()
    : (raw.id !== undefined && raw.id !== null) ? String(raw.id)
      : `F-${String(index + 1).padStart(3, '0')}`;

  let title = deriveTitle(raw);
  if (!title) title = id;

  const out = { id, title, passes };

  if (typeof raw.description === 'string' && raw.description.trim()) out.description = raw.description;
  if (typeof raw.category === 'string' && raw.category.trim()) out.category = raw.category;

  const priority = normalizePriority(raw.priority);
  if (priority) out.priority = priority;

  out.status = normalizeStatus(raw.status, passes);

  if (Array.isArray(raw.dependencies)) out.dependencies = raw.dependencies.filter((x) => typeof x === 'string');
  if (isArrOfStrings(raw.acceptance)) out.acceptance = raw.acceptance;
  if (isArrOfStrings(raw.files)) out.files = raw.files;

  // Preserve any other extra fields (phase, effort, prd, notes, ...) — schema is
  // additionalProperties:true, and runners may rely on them.
  const known = new Set(['id', 'title', 'name', 'passes', 'description', 'category',
    'priority', 'status', 'dependencies', 'acceptance', 'files']);
  for (const [k, v] of Object.entries(raw)) {
    if (!known.has(k) && !(k in out)) out[k] = v;
  }

  return out;
}

function collectFeatures(data, log) {
  // Already-flat features[].
  let flat = Array.isArray(data.features) ? data.features.slice() : [];

  // Truly-nested categories[].features — only when category entries carry their
  // own feature arrays. (In this dataset categories is metadata, so this is a
  // no-op, but it future-proofs the canonical contract.)
  if (Array.isArray(data.categories)) {
    for (const cat of data.categories) {
      if (cat && typeof cat === 'object' && Array.isArray(cat.features)) {
        const catName = typeof cat.name === 'string' ? cat.name : undefined;
        for (const f of cat.features) {
          const copy = { ...f };
          if (catName && !copy.category) copy.category = catName;
          if (catName && copy.id) copy.id = `${catName}-${copy.id}`;
          flat.push(copy);
        }
        log(`  flattened ${cat.features.length} features from nested category "${catName || '?'}"`);
      }
    }
  }
  return flat;
}

function processFile(full, file, dryRun, backupDir) {
  const log = (m) => console.log(m);
  let data;
  try {
    data = JSON.parse(readFileSync(full, 'utf8'));
  } catch (e) {
    console.log(`SKIP ${file} — invalid JSON: ${e.message}`);
    return { changed: false, dropped: 0, skipped: true, error: true };
  }

  if (!Array.isArray(data.features) && !Array.isArray(data.categories?.find?.((c) => c?.features))) {
    if (!Array.isArray(data.features)) {
      console.log(`SKIP ${file} — no features array (sidecar/metrics file)`);
      return { changed: false, dropped: 0, skipped: true };
    }
  }

  const slug = (typeof data.slug === 'string' && data.slug.trim())
    ? data.slug.trim()
    : basename(file, '.json');

  const rawFeatures = collectFeatures(data, log);
  const out = [];
  let dropped = 0;
  rawFeatures.forEach((raw, i) => {
    const titleProbe = (deriveTitle(raw) || '').trim().toLowerCase();
    if (titleProbe && JUNK_TITLES.has(titleProbe)) {
      dropped++;
      console.log(`  DROP junk feature in ${file}: id=${raw.id ?? '?'} title="${deriveTitle(raw)}"`);
      return;
    }
    out.push(normalizeFeature(raw, i, log));
  });

  // Build canonical object. Preserve project/version + any extra top-level keys.
  const canonical = {};
  if (typeof data.project === 'string') canonical.project = data.project;
  else if (typeof data.app_name === 'string') canonical.project = data.app_name;
  else if (typeof data.name === 'string') canonical.project = data.name;
  canonical.slug = slug;
  if (typeof data.version === 'string') canonical.version = data.version;
  else if (typeof data.version === 'number') canonical.version = String(data.version);

  // Carry through other top-level metadata (description, totalFeatures, phases,
  // categories, prd, priority, ...) for compatibility, except the keys we own.
  const ownTop = new Set(['project', 'app_name', 'name', 'slug', 'version', 'features']);
  for (const [k, v] of Object.entries(data)) {
    if (!ownTop.has(k)) canonical[k] = v;
  }
  canonical.features = out;

  const before = JSON.stringify(data);
  const after = JSON.stringify(canonical);
  const changed = before !== after;

  if (!dryRun && changed) {
    if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
    copyFileSync(full, join(backupDir, file));
    writeFileSync(full, JSON.stringify(canonical, null, 2) + '\n');
  }

  return { changed, dropped, skipped: false, features: out.length };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dir = resolve(args.find((a) => !a.startsWith('--')) || FEATURES_DIR);
  const backupDir = join(dir, '.backup');

  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`Not a directory: ${dir}`);
    process.exit(2);
  }

  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  let changedFiles = 0;
  let droppedTotal = 0;
  let skipped = 0;
  let errors = 0;

  console.log(`Codemod ${dryRun ? '(DRY RUN) ' : ''}over ${files.length} files in ${dir}`);
  if (!dryRun) console.log(`Backups -> ${backupDir}`);
  console.log('');

  for (const f of files) {
    const r = processFile(join(dir, f), f, dryRun, backupDir);
    if (r.error) errors++;
    if (r.skipped) { skipped++; continue; }
    if (r.changed) changedFiles++;
    droppedTotal += r.dropped;
  }

  console.log('');
  console.log('--- Codemod summary ---');
  console.log(`files processed : ${files.length}`);
  console.log(`files changed   : ${changedFiles}${dryRun ? ' (would change)' : ''}`);
  console.log(`files skipped   : ${skipped} (no features array / parse error)`);
  console.log(`parse errors    : ${errors}`);
  console.log(`features dropped : ${droppedTotal}`);
}

main();
