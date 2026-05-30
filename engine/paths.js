// Canonical path + port resolution for the ACD package.
// Every engine module should import from here instead of hardcoding paths,
// so the package is relocatable and env-overridable.
//
// Layout (relative to ACD_ROOT, the package root one level above engine/):
//   engine/        all harness JS
//   prompts/       generic prompts: initializer.md, coding.md
//   data/features/ canonical per-project feature lists (<slug>.json)
//   data/prds/     PRD source docs (<slug>.md)
//   data/repo-queue.json, data/schedule.json
//   data/logs/  data/pids/  data/metrics/
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url)); // .../acd/engine

export const ENGINE_DIR = __dirname;
export const ACD_ROOT = process.env.ACD_ROOT || resolve(__dirname, '..');
export const DATA_DIR = process.env.ACD_DATA || join(ACD_ROOT, 'data');
export const PROMPTS_DIR = process.env.ACD_PROMPTS || join(ACD_ROOT, 'prompts');

export const FEATURES_DIR = process.env.ACD_FEATURES || join(DATA_DIR, 'features');
export const PRDS_DIR = process.env.ACD_PRDS || join(DATA_DIR, 'prds');
export const LOGS_DIR = join(DATA_DIR, 'logs');
export const PIDS_DIR = join(DATA_DIR, 'pids');
export const METRICS_DIR = join(DATA_DIR, 'metrics');

export const QUEUE_FILE = process.env.ACD_QUEUE || join(DATA_DIR, 'repo-queue.json');
export const SCHEDULE_FILE = process.env.ACD_SCHEDULE || join(DATA_DIR, 'schedule.json');

export const MCP_CONFIG = process.env.ACD_MCP_CONFIG || join(ACD_ROOT, '.mcp.json');
export const AGENTS_DIR = process.env.ACD_AGENTS_DIR || join(ACD_ROOT, '.claude', 'agents');

// Path helpers
export const featureFile = (slug) => join(FEATURES_DIR, `${slug}.json`);
export const prdFile = (slug) => join(PRDS_DIR, `${slug}.md`);

// Ports. activity is null (disabled) unless ACTIVITY_PORT is explicitly set.
export const PORTS = {
  backend: Number(process.env.BACKEND_PORT || 3434),
  dashboard: Number(process.env.DASHBOARD_PORT || 3535),
  liveOps: Number(process.env.LIVE_OPS_PORT || 3456),
  activity: process.env.ACTIVITY_PORT ? Number(process.env.ACTIVITY_PORT) : null,
};

export default {
  ENGINE_DIR, ACD_ROOT, DATA_DIR, PROMPTS_DIR, FEATURES_DIR, PRDS_DIR,
  LOGS_DIR, PIDS_DIR, METRICS_DIR, QUEUE_FILE, SCHEDULE_FILE,
  MCP_CONFIG, AGENTS_DIR, featureFile, prdFile, PORTS,
};
