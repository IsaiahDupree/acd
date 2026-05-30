#!/usr/bin/env bash
# ACD — single supervised launcher (replaces the original ~152 harness/launch-*.sh).
#
# Usage:
#   engine/launch.sh <slug> [repoPath]
#   engine/launch.sh <slug> [repoPath] [--fg] [--no-watchdog] [--priority N]
#
# What it does:
#   1. Ensures <slug> exists in data/repo-queue.json and is enabled:true
#      (adds a queue entry pointing at data/features/<slug>.json if missing).
#   2. Starts run-queue.js targeting that slug, capped by ACD_MAX_CONCURRENCY
#      (mapped to --total-slots) and logged to data/logs/<slug>.queue.log.
#   3. Launches watchdog.js --start-queue to supervise and auto-restart stalls,
#      unless --no-watchdog is passed.
#
# Conventions: all paths resolve via engine/paths.js semantics (ACD_ROOT one level
# above engine/, data/ under it). Honors ACD_ROOT / ACD_DATA / ACD_MAX_CONCURRENCY env.

set -eu

# ─── Resolve package root (independent of CWD) ───────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ACD_ROOT="${ACD_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
ACD_DATA="${ACD_DATA:-$ACD_ROOT/data}"
ENGINE_DIR="$ACD_ROOT/engine"
QUEUE_FILE="${ACD_QUEUE:-$ACD_DATA/repo-queue.json}"
FEATURES_DIR="${ACD_FEATURES:-$ACD_DATA/features}"
LOGS_DIR="$ACD_DATA/logs"
PIDS_DIR="$ACD_DATA/pids"
MAX_CONCURRENCY="${ACD_MAX_CONCURRENCY:-4}"

# ─── Parse args ──────────────────────────────────────────────────────────────
SLUG=""
REPO_PATH=""
FOREGROUND=0
USE_WATCHDOG=1
PRIORITY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --fg)          FOREGROUND=1 ;;
    --no-watchdog) USE_WATCHDOG=0 ;;
    --priority)    shift; PRIORITY="${1:-0}" ;;
    --priority=*)  PRIORITY="${1#*=}" ;;
    -h|--help)
      sed -n '2,22p' "$0"
      exit 0 ;;
    --*)
      echo "Unknown flag: $1" >&2; exit 2 ;;
    *)
      if [ -z "$SLUG" ]; then SLUG="$1"
      elif [ -z "$REPO_PATH" ]; then REPO_PATH="$1"
      else echo "Unexpected arg: $1" >&2; exit 2; fi ;;
  esac
  shift
done

if [ -z "$SLUG" ]; then
  echo "Usage: engine/launch.sh <slug> [repoPath] [--fg] [--no-watchdog] [--priority N]" >&2
  exit 2
fi

mkdir -p "$LOGS_DIR" "$PIDS_DIR" "$FEATURES_DIR"

if [ ! -f "$QUEUE_FILE" ]; then
  echo "Queue file not found: $QUEUE_FILE" >&2
  exit 1
fi

FEATURE_LIST="$FEATURES_DIR/$SLUG.json"

# ─── 1. Enable / add the slug in the canonical queue (atomic JSON edit) ───────
ACD_QUEUE="$QUEUE_FILE" \
ACD_SLUG="$SLUG" \
ACD_FEATURE_LIST="$FEATURE_LIST" \
ACD_REPO_PATH="$REPO_PATH" \
ACD_PRIORITY="$PRIORITY" \
node - <<'NODE'
import fs from 'fs';

const file        = process.env.ACD_QUEUE;
const slug        = process.env.ACD_SLUG;
const featureList = process.env.ACD_FEATURE_LIST;
const repoPath    = process.env.ACD_REPO_PATH || '';
const priority    = Number(process.env.ACD_PRIORITY || 0);

const q = JSON.parse(fs.readFileSync(file, 'utf-8'));
if (!Array.isArray(q.repos)) q.repos = [];

const matches = (r) => r.id === slug || r.slug === slug || r.name === slug;
let entry = q.repos.find(matches);

if (entry) {
  entry.enabled = true;
  // Backfill missing routing fields without clobbering existing values.
  if (!entry.id) entry.id = slug;
  if (!entry.slug) entry.slug = slug;
  if (!entry.featureList) entry.featureList = featureList;
  if (repoPath) entry.path = repoPath;
  if (typeof entry.priority !== 'number') entry.priority = priority;
  console.error(`[launch] enabled existing queue entry: ${slug}`);
} else {
  entry = {
    id: slug,
    slug,
    name: slug,
    path: repoPath || process.cwd(),
    featureList,
    priority,
    enabled: true,
    untilComplete: true,
  };
  q.repos.push(entry);
  console.error(`[launch] added new queue entry: ${slug}`);
}

fs.writeFileSync(file, JSON.stringify(q, null, 2) + '\n');
NODE

echo "[launch] slug=$SLUG queue=$QUEUE_FILE features=$FEATURE_LIST concurrency=$MAX_CONCURRENCY"

if [ ! -f "$FEATURE_LIST" ]; then
  echo "[launch] WARNING: feature list missing ($FEATURE_LIST). Run 'npm run -s queue -- --generate' or acd_generate_features first."
fi

# ─── 2. Start run-queue.js for this slug (concurrency-capped) ────────────────
QUEUE_LOG="$LOGS_DIR/$SLUG.queue.log"
QUEUE_PID_FILE="$PIDS_DIR/$SLUG.queue.pid"

# Map the global cap to parallel slots. run-queue uses --total-slots/--slot;
# we run the highest-priority worker slot here (slot 0) so a single launch
# respects the cap while additional launches fill other slots.
QUEUE_ARGS="--queue=$QUEUE_FILE --repo=$SLUG --total-slots=$MAX_CONCURRENCY --slot=0 --loop"

if [ "$FOREGROUND" -eq 1 ]; then
  echo "[launch] foreground: node $ENGINE_DIR/run-queue.js $QUEUE_ARGS"
  exec node "$ENGINE_DIR/run-queue.js" $QUEUE_ARGS
fi

echo "[launch] starting run-queue.js (log: $QUEUE_LOG)"
ACD_ROOT="$ACD_ROOT" ACD_DATA="$ACD_DATA" ACD_MAX_CONCURRENCY="$MAX_CONCURRENCY" \
  nohup node "$ENGINE_DIR/run-queue.js" $QUEUE_ARGS >> "$QUEUE_LOG" 2>&1 &
QUEUE_PID=$!
echo "$QUEUE_PID" > "$QUEUE_PID_FILE"
echo "[launch] run-queue.js PID=$QUEUE_PID"

# ─── 3. Supervise with the watchdog (auto-restart on stall) ──────────────────
if [ "$USE_WATCHDOG" -eq 1 ]; then
  WATCHDOG_LOG="$LOGS_DIR/watchdog.log"
  WATCHDOG_PID_FILE="$PIDS_DIR/watchdog.pid"
  if [ -f "$WATCHDOG_PID_FILE" ] && kill -0 "$(cat "$WATCHDOG_PID_FILE" 2>/dev/null)" 2>/dev/null; then
    echo "[launch] watchdog already running (PID $(cat "$WATCHDOG_PID_FILE"))"
  else
    echo "[launch] starting watchdog.js --start-queue (log: $WATCHDOG_LOG)"
    ACD_ROOT="$ACD_ROOT" ACD_DATA="$ACD_DATA" \
      nohup node "$ENGINE_DIR/watchdog.js" --start-queue >> "$WATCHDOG_LOG" 2>&1 &
    WATCHDOG_PID=$!
    echo "$WATCHDOG_PID" > "$WATCHDOG_PID_FILE"
    echo "[launch] watchdog.js PID=$WATCHDOG_PID"
  fi
fi

echo "[launch] done. Tail progress:  tail -f \"$QUEUE_LOG\""
