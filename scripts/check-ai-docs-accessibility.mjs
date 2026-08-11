#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const failures = [];
const passes = [];

function record(condition, message) {
  if (condition) {
    passes.push(message);
  } else {
    failures.push(message);
  }
}

function repoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function readText(relativePath) {
  return readFileSync(repoPath(relativePath), 'utf8');
}

function exists(relativePath) {
  return existsSync(repoPath(relativePath));
}

function isDirectory(relativePath) {
  return exists(relativePath) && statSync(repoPath(relativePath)).isDirectory();
}

function splitReference(reference) {
  const [filePath, anchor = ''] = reference.split('#');
  return {
    filePath: filePath.trim(),
    anchor: anchor.trim(),
  };
}

function isDynamicReference(reference) {
  return /[<>*]/.test(reference) || reference.includes(' except ');
}

function slugifyHeading(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function headingSlugs(markdown) {
  const slugs = new Set();
  for (const line of markdown.split('\n')) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) {
      slugs.add(slugifyHeading(match[2]));
    }
  }
  return slugs;
}

function validateReference(reference, source, baseDir = '') {
  if (!reference || isDynamicReference(reference)) {
    return;
  }

  const { filePath, anchor } = splitReference(reference);
  if (!filePath || /^(https?:|mailto:)/.test(filePath)) {
    return;
  }

  const absolutePath = path.resolve(repoRoot, baseDir, decodeURIComponent(filePath));
  const relativePath = path.relative(repoRoot, absolutePath);
  const inRepo = !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
  record(inRepo, `${source}: ${reference} stays inside repo`);

  if (!inRepo) {
    return;
  }

  const resolvedReference = relativePath || '.';
  record(existsSync(absolutePath), `${source}: ${reference} resolves to ${resolvedReference}`);

  if (anchor && existsSync(absolutePath) && statSync(absolutePath).isFile()) {
    const markdown = readFileSync(absolutePath, 'utf8');
    const slug = slugifyHeading(anchor);
    record(headingSlugs(markdown).has(slug), `${source}: ${reference} anchor exists`);
  }
}

function validateMarkdownLinks(relativePath) {
  const markdown = readText(relativePath);
  const baseDir = path.dirname(relativePath);
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  let match;

  while ((match = linkPattern.exec(markdown)) !== null) {
    const target = match[1].trim();
    if (target.startsWith('#')) {
      const slug = slugifyHeading(target.slice(1));
      record(headingSlugs(markdown).has(slug), `${relativePath}: ${target} anchor exists`);
      continue;
    }

    validateReference(target, relativePath, baseDir);
  }
}

function validateManifest(manifest) {
  record(manifest.schema_version === 1, 'manifest: schema_version is 1');
  record(Boolean(manifest.updated_at), 'manifest: updated_at is set');
  record(manifest.project?.name === 'ACD', 'manifest: project name is ACD');

  record(Array.isArray(manifest.entrypoints) && manifest.entrypoints.length >= 5, 'manifest: entrypoints are populated');
  for (const entrypoint of manifest.entrypoints ?? []) {
    record(Boolean(entrypoint.path), `manifest: entrypoint ${entrypoint.path ?? '<missing>'} has path`);
    record(Boolean(entrypoint.kind), `manifest: entrypoint ${entrypoint.path ?? '<missing>'} has kind`);
    record(Array.isArray(entrypoint.audience) && entrypoint.audience.length > 0, `manifest: entrypoint ${entrypoint.path ?? '<missing>'} has audience`);
    record(Boolean(entrypoint.summary), `manifest: entrypoint ${entrypoint.path ?? '<missing>'} has summary`);
    validateReference(entrypoint.path, 'manifest entrypoint');
  }

  record(Array.isArray(manifest.task_routes) && manifest.task_routes.length >= 5, 'manifest: task routes are populated');
  for (const route of manifest.task_routes ?? []) {
    const label = `manifest task route ${route.task ?? '<missing>'}`;
    record(Boolean(route.task), `${label}: task is set`);
    record(Array.isArray(route.read) && route.read.length > 0, `${label}: read list is set`);

    for (const key of ['read', 'code_if_needed', 'runtime_paths']) {
      for (const reference of route[key] ?? []) {
        validateReference(reference, `${label}.${key}`);
      }
    }
  }

  record(Array.isArray(manifest.known_hazards) && manifest.known_hazards.length > 0, 'manifest: known hazards are documented');
  for (const hazard of manifest.known_hazards ?? []) {
    record(Boolean(hazard.id), `manifest hazard ${hazard.id ?? '<missing>'}: id is set`);
    record(Boolean(hazard.summary), `manifest hazard ${hazard.id ?? '<missing>'}: summary is set`);
    record(Boolean(hazard.safe_path), `manifest hazard ${hazard.id ?? '<missing>'}: safe_path is set`);
  }

  record(Array.isArray(manifest.canonical_code) && manifest.canonical_code.length > 0, 'manifest: canonical code is documented');
  for (const item of manifest.canonical_code ?? []) {
    validateReference(item.path, 'manifest canonical_code');
    record(Boolean(item.role), `manifest canonical_code ${item.path ?? '<missing>'}: role is set`);
  }

  record(Array.isArray(manifest.do_not_index_by_default) && manifest.do_not_index_by_default.length > 0, 'manifest: do_not_index_by_default is populated');
}

const requiredDocs = [
  'llms.txt',
  'docs/AI-DOCS-INDEX.md',
  'docs/ai-docs-manifest.json',
  'README.md',
  'CLAUDE.md',
  'docs/CONTROLLING-CLAUDE-CODE-FROM-CODEX.md',
];

for (const document of requiredDocs) {
  record(exists(document), `${document}: exists`);
}

record(isDirectory('docs'), 'docs/: exists as a directory');
record(isDirectory('engine'), 'engine/: exists as a directory');

const llms = readText('llms.txt');
record(llms.includes('## Fast Read Order'), 'llms.txt: has fast read order');
record(llms.includes('## What To Read For Common Tasks'), 'llms.txt: has task routing');
record(llms.includes('## Do Not Waste Tokens On'), 'llms.txt: has token-saving skip list');
for (const document of ['docs/AI-DOCS-INDEX.md', 'README.md', 'CLAUDE.md', 'docs/CONTROLLING-CLAUDE-CODE-FROM-CODEX.md', 'docs/ai-docs-manifest.json']) {
  record(llms.includes(document), `llms.txt: references ${document}`);
}

const aiDocsIndex = readText('docs/AI-DOCS-INDEX.md');
for (const section of ['## One-Minute Orientation', '## Task Router', '## Current Known Hazard', '## Token-Efficient Scan Rules', '## Output Contracts For AI Consumers']) {
  record(aiDocsIndex.includes(section), `AI-DOCS-INDEX.md: includes ${section}`);
}

const readmeFirstLines = readText('README.md').split('\n').slice(0, 25).join('\n');
for (const document of ['llms.txt', 'docs/AI-DOCS-INDEX.md', 'docs/ai-docs-manifest.json']) {
  record(readmeFirstLines.includes(document), `README.md: advertises ${document} near the top`);
}

const claude = readText('CLAUDE.md');
record(claude.includes('llms.txt'), 'CLAUDE.md: tells agents to start with llms.txt');
record(claude.includes('docs/AI-DOCS-INDEX.md'), 'CLAUDE.md: references AI docs index');
record(claude.includes('docs/ai-docs-manifest.json'), 'CLAUDE.md: references manifest');

const manifest = JSON.parse(readText('docs/ai-docs-manifest.json'));
validateManifest(manifest);

for (const document of ['README.md', 'docs/AI-DOCS-INDEX.md', 'docs/CONTROLLING-CLAUDE-CODE-FROM-CODEX.md']) {
  validateMarkdownLinks(document);
}

if (failures.length > 0) {
  console.error(`AI docs accessibility check failed (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`AI docs accessibility check passed (${passes.length} assertions).`);
