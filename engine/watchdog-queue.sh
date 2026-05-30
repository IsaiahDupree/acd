#!/bin/bash
# watchdog-queue.sh — ACD package supervisor (core only).
# ============================================================================
# Keeps the ACD coding pipeline running:
#   • run-queue.js   — N parallel workers chewing through data/repo-queue.json
#   • watchdog.js    — stall/heartbeat monitor that auto-restarts the queue
#   • scheduler.js   — cron/once/daily/weekly schedule daemon (data/schedule.json)
#
# On each restart it re-reads data/repo-queue.json, so newly added entries are
# picked up automatically. Already-complete repos are skipped.
#
# This supervisor is ACD-core ONLY. It deliberately does NOT start any
# social-automation / content / CRM daemons (linkedin-*, *-comment-sweep,
# *-dm-sweep, prospect-*, dev-vlog-*, telegram-*, email-*, upwork-*, blotato-*,
# cron-manager, studio-coordinator, cloud-bridge, etc.) — those belong to the
# ACTP social stack, not the coding harness.
#
# All paths resolve relative to the package (engine/ + data/) and honor
# ACD_ROOT / ACD_DATA / ACD_MAX_CONCURRENCY env overrides (paths.js semantics).
# ============================================================================

# ─── Resolve package layout (independent of CWD) ─────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ACD_ROOT="${ACD_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
ACD_DATA="${ACD_DATA:-$ACD_ROOT/data}"
ENGINE_DIR="$ACD_ROOT/engine"
QUEUE_FILE="${ACD_QUEUE:-$ACD_DATA/repo-queue.json}"
LOGS_DIR="$ACD_DATA/logs"
PIDS_DIR="$ACD_DATA/pids"
METRICS_DIR="$ACD_DATA/metrics"
STUCK_FILE="$METRICS_DIR/stuck-repos.json"
MAX_CONCURRENCY="${ACD_MAX_CONCURRENCY:-4}"

mkdir -p "$LOGS_DIR" "$PIDS_DIR" "$METRICS_DIR"

LOG="$LOGS_DIR/watchdog-queue.log"

# Redirect all output to the canonical log — tee to terminal only when interactive
if [[ -t 1 ]]; then
  exec > >(tee -a "$LOG") 2>&1
else
  exec >> "$LOG" 2>&1
fi

# Singleton lock — prevent double-launch
LOCKFILE="$PIDS_DIR/watchdog-queue.pid"
if [[ -f "$LOCKFILE" ]]; then
  OLD_PID=$(cat "$LOCKFILE" 2>/dev/null)
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[watchdog] Already running (PID $OLD_PID) — exiting"
    exit 0
  fi
fi
echo $$ > "$LOCKFILE"
trap "rm -f '$LOCKFILE'" EXIT INT TERM

# Unset CLAUDECODE so the harness can spawn nested claude sessions
unset CLAUDECODE

# Load environment variables (token/keys) if a package or home .env exists
if [[ -f "$ACD_ROOT/.env" ]]; then
  set -a; source "$ACD_ROOT/.env"; set +a
elif [[ -f "$HOME/.env" ]]; then
  set -a; source "$HOME/.env"; set +a
fi
# ACD uses Claude OAuth (CLAUDE_CODE_OAUTH_TOKEN), never API key — unset to
# prevent run-queue from aborting when ANTHROPIC_API_KEY is present.
unset ANTHROPIC_API_KEY

echo "[watchdog] ACD package supervisor — root=$ACD_ROOT data=$ACD_DATA concurrency=$MAX_CONCURRENCY"

# ─── Start watchdog.js (stall/heartbeat monitor + auto-restart) ──────────────
if ! pgrep -f "$ENGINE_DIR/watchdog.js" > /dev/null 2>&1; then
  echo "[watchdog] Starting watchdog.js (monitor)..."
  ACD_ROOT="$ACD_ROOT" ACD_DATA="$ACD_DATA" ACD_MAX_CONCURRENCY="$MAX_CONCURRENCY" \
    nohup node "$ENGINE_DIR/watchdog.js" >> "$LOGS_DIR/watchdog.log" 2>&1 &
  echo $! > "$PIDS_DIR/watchdog.pid"
  echo "[watchdog] watchdog.js PID: $!"
else
  echo "[watchdog] watchdog.js already running"
fi

# ─── Start scheduler.js (cron/once/daily/weekly schedule daemon) ─────────────
if ! pgrep -f "$ENGINE_DIR/scheduler.js" > /dev/null 2>&1; then
  echo "[watchdog] Starting scheduler.js (schedule daemon)..."
  ACD_ROOT="$ACD_ROOT" ACD_DATA="$ACD_DATA" \
    nohup node "$ENGINE_DIR/scheduler.js" >> "$LOGS_DIR/scheduler.log" 2>&1 &
  echo $! > "$PIDS_DIR/scheduler.pid"
  echo "[watchdog] scheduler.js PID: $!"
else
  echo "[watchdog] scheduler.js already running"
fi

# ─── Telegram notifier (optional — only fires if a token is configured) ──────
TELEGRAM_TOKEN="${TELEGRAM_BOT_TOKEN}"
TELEGRAM_CHAT="${TELEGRAM_CHAT_ID}"

send_telegram() {
  [[ -z "$TELEGRAM_TOKEN" || -z "$TELEGRAM_CHAT" ]] && return 0
  local msg="$1"
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT}" \
    -d "text=${msg}" \
    -d "parse_mode=HTML" \
    > /dev/null 2>&1 || true
}

# ─── Parallel run-queue workers ──────────────────────────────────────────────
PARALLEL_WORKERS="$MAX_CONCURRENCY"
MAX_LOG_LINES=2000          # rotate worker logs when they exceed this
STALL_TIMEOUT=600           # 10 min of no worker output = stalled → kill
LAST_IDLE_NOTIFY=0
IDLE_NOTIFY_INTERVAL=1800    # notify "queue empty" at most every 30 min

rotate_log() {
  local f="$1"
  if [[ -f "$f" ]]; then
    local lines
    lines=$(wc -l < "$f" 2>/dev/null || echo 0)
    if (( lines > MAX_LOG_LINES )); then
      tail -n $MAX_LOG_LINES "$f" > "${f}.tmp" && mv "${f}.tmp" "$f"
    fi
  fi
}

RUN=0
while true; do
  RUN=$((RUN + 1))
  echo "[watchdog] $(date '+%Y-%m-%d %H:%M:%S') — Starting ${PARALLEL_WORKERS}-worker pass #$RUN"

  # Rotate logs before each pass to keep sizes manageable
  rotate_log "$LOG"
  for SLOT in $(seq 0 $((PARALLEL_WORKERS - 1))); do
    rotate_log "$LOGS_DIR/run-queue-worker${SLOT}.log"
  done

  NOW_TS=$(date +%s)

  # Sync auto-discovered feature JSONs into the queue before launching workers
  node "$ENGINE_DIR/prd-queue-sync.js" >> "$LOGS_DIR/prd-queue-sync.log" 2>&1 || true

  # Refresh project-status report every hour (used by acd_project_status MCP tool)
  _PS_LAST=$(cat "$METRICS_DIR/project-status-last-run" 2>/dev/null || echo 0)
  if [[ $((NOW_TS - _PS_LAST)) -ge 3600 ]]; then
    echo "$NOW_TS" > "$METRICS_DIR/project-status-last-run"
    node "$ENGINE_DIR/project-status.js" >> "$LOGS_DIR/project-status.log" 2>&1 &
    echo "[watchdog] project-status scan started (PID: $!)"
  fi

  # Kill any stale workers left from a previous session before starting new ones
  STALE_PIDS=$(pgrep -f "$ENGINE_DIR/run-queue.js" 2>/dev/null)
  if [[ -n "$STALE_PIDS" ]]; then
    echo "[watchdog] $(date '+%Y-%m-%d %H:%M:%S') — Killing stale run-queue workers: $STALE_PIDS"
    kill $STALE_PIDS 2>/dev/null
    sleep 2
  fi

  # Launch all workers in parallel; each handles a different slot of the queue.
  # Forward the canonical queue + global concurrency cap so every worker uses
  # the same data/repo-queue.json that the initial launch did.
  PIDS=()
  for SLOT in $(seq 0 $((PARALLEL_WORKERS - 1))); do
    WORKER_LOG="$LOGS_DIR/run-queue-worker${SLOT}.log"
    echo "[watchdog] $(date '+%Y-%m-%d %H:%M:%S') — Launching worker $SLOT (pass #$RUN)"
    ACD_ROOT="$ACD_ROOT" ACD_DATA="$ACD_DATA" ACD_MAX_CONCURRENCY="$MAX_CONCURRENCY" \
      node "$ENGINE_DIR/run-queue.js" \
        --queue="$QUEUE_FILE" \
        --slot=$SLOT \
        --total-slots=$PARALLEL_WORKERS \
        --generate >> "$WORKER_LOG" 2>&1 &
    PIDS+=($!)
  done

  # Wait for all workers to finish — with stall detection.
  # If a worker's log hasn't grown in STALL_TIMEOUT seconds, kill it as frozen.
  # Uses temp files for per-slot state (bash 3.x compatible — no assoc arrays).
  for SLOT in $(seq 0 $((PARALLEL_WORKERS - 1))); do
    echo "$(stat -f%z "$LOGS_DIR/run-queue-worker${SLOT}.log" 2>/dev/null || echo 0)" \
      > "$METRICS_DIR/acd-stall-size-${SLOT}"
    echo "" > "$METRICS_DIR/acd-stall-since-${SLOT}"
  done

  EXITS=()
  ALL_DONE=false
  while [[ "$ALL_DONE" == "false" ]]; do
    sleep 30
    ALL_DONE=true
    NOW_TS=$(date +%s)
    for i in $(seq 0 $(( ${#PIDS[@]} - 1 ))); do
      PID="${PIDS[$i]}"
      if ! kill -0 "$PID" 2>/dev/null; then
        continue  # already exited
      fi
      ALL_DONE=false
      SLOT=$i
      WLOG="$LOGS_DIR/run-queue-worker${SLOT}.log"
      CURRENT_SIZE=$(stat -f%z "$WLOG" 2>/dev/null || echo 0)
      LAST_SIZE=$(cat "$METRICS_DIR/acd-stall-size-${SLOT}" 2>/dev/null || echo 0)
      if [[ "$CURRENT_SIZE" -gt "$LAST_SIZE" ]]; then
        # Log grew — worker is alive, reset stall timer
        echo "$CURRENT_SIZE" > "$METRICS_DIR/acd-stall-size-${SLOT}"
        echo "$NOW_TS"       > "$METRICS_DIR/acd-stall-since-${SLOT}"
      else
        # Log didn't grow — start/continue stall timer
        STALL_SINCE=$(cat "$METRICS_DIR/acd-stall-since-${SLOT}" 2>/dev/null | tr -d '[:space:]')
        if [[ -z "$STALL_SINCE" ]]; then
          echo "$NOW_TS" > "$METRICS_DIR/acd-stall-since-${SLOT}"
          STALL_SINCE=$NOW_TS
        fi
        STALLED_FOR=$(( NOW_TS - STALL_SINCE ))
        if [[ "$STALLED_FOR" -ge "$STALL_TIMEOUT" ]]; then
          echo "[watchdog] $(date '+%Y-%m-%d %H:%M:%S') — STALL DETECTED: worker $SLOT (PID $PID) silent for ${STALLED_FOR}s — killing"
          send_telegram "&#x1F6AB; ACD worker ${SLOT} stalled (no output for ${STALLED_FOR}s) — killed and restarting."
          kill "$PID" 2>/dev/null
          echo "" > "$METRICS_DIR/acd-stall-since-${SLOT}"
        else
          echo "[watchdog] $(date '+%Y-%m-%d %H:%M:%S') — worker $SLOT silent for ${STALLED_FOR}s (timeout: ${STALL_TIMEOUT}s)"
        fi
      fi
    done
  done

  # Collect exit codes
  for PID in "${PIDS[@]}"; do
    wait "$PID" 2>/dev/null
    EXITS+=($?)
  done

  # Report per-worker results (exit 143 = SIGTERM = expected kill, not a crash)
  for i in "${!EXITS[@]}"; do
    EXIT="${EXITS[$i]}"
    echo "[watchdog] $(date '+%Y-%m-%d %H:%M:%S') — worker $i exited (code=$EXIT)"
    if [ "$EXIT" -ne 0 ] && [ "$EXIT" -ne 143 ]; then
      MSG="&#x26A0;&#xFE0F; ACD worker $i crashed (exit $EXIT) at $(date '+%H:%M:%S')%0ARestarting automatically in 30s."
      echo "[watchdog] Sending crash notification to Telegram"
      send_telegram "$MSG"
    fi
  done

  # Stuck-repo detection: track zero-progress repos, disable after DISABLE_THRESHOLD
  # consecutive zero-progress passes so a hopelessly-stuck repo stops starving the queue.
  STUCK_SCRIPT=$(cat << 'STUCK_EOF'
const fs = require('fs');
const [,, qPath, stuckPath] = process.argv;
const q = JSON.parse(fs.readFileSync(qPath,'utf8'));
const stuck = fs.existsSync(stuckPath) ? JSON.parse(fs.readFileSync(stuckPath,'utf8')) : {};
const DISABLE_THRESHOLD = 8;
let changed = false;
const toDisable = [];
for (const repo of q.repos) {
  if (repo.enabled === false) continue;
  if (!repo.featureList || !fs.existsSync(repo.featureList)) continue;
  try {
    const f = JSON.parse(fs.readFileSync(repo.featureList,'utf8'));
    const feats = f.features || [];
    const passing = feats.filter(x => x.passes).length;
    const total = feats.length;
    if (total === 0 || passing === total) continue;
    const key = repo.id;
    if (!stuck[key]) stuck[key] = { sessions: 0, lastPassing: passing };
    if (stuck[key].lastPassing === passing) {
      stuck[key].sessions++;
    } else {
      stuck[key].sessions = 0;
      stuck[key].lastPassing = passing;
    }
    if (stuck[key].sessions >= DISABLE_THRESHOLD) {
      repo.enabled = false;
      changed = true;
      toDisable.push(repo.name + ' (' + passing + '/' + total + ')');
    }
  } catch(e) {}
}
if (changed) fs.writeFileSync(qPath, JSON.stringify(q, null, 2));
fs.writeFileSync(stuckPath, JSON.stringify(stuck, null, 2));
if (toDisable.length > 0) process.stdout.write('DISABLE:' + toDisable.join('|') + '\n');
STUCK_EOF
)
  STUCK_RESULT=$(echo "$STUCK_SCRIPT" | node - "$QUEUE_FILE" "$STUCK_FILE" 2>/dev/null)
  while IFS= read -r line; do
    if [[ "$line" == DISABLE:* ]]; then
      NAMES="${line#DISABLE:}"
      MSG="&#x1F6A7; ACD disabled stuck repo(s) after ${RUN} passes with no progress:%0A${NAMES//|/%0A}"
      echo "[watchdog] Disabled stuck repo(s): ${NAMES//|/, }"
      send_telegram "$MSG"
    fi
  done <<< "$STUCK_RESULT"

  # Check if all repos are complete
  INCOMPLETE=$(node -e "
    const fs = require('fs');
    const q = JSON.parse(fs.readFileSync('$QUEUE_FILE','utf8'));
    const count = q.repos.filter(r => {
      if (r.enabled === false) return false;
      if (!r.featureList || !fs.existsSync(r.featureList)) return true;
      try {
        const d = JSON.parse(fs.readFileSync(r.featureList,'utf8'));
        const feats = d.features || [];
        return feats.length === 0 || feats.some(f => !f.passes);
      } catch(e) { return true; }
    }).length;
    process.stdout.write(String(count));
  " 2>/dev/null)

  echo "[watchdog] Incomplete repos remaining: $INCOMPLETE"

  if [ "$INCOMPLETE" = "0" ]; then
    NOW=$(date +%s)
    SINCE_LAST=$((NOW - LAST_IDLE_NOTIFY))
    if [ "$SINCE_LAST" -ge "$IDLE_NOTIFY_INTERVAL" ]; then
      MSG="&#x1F4A4; ACD is idle — queue empty at $(date '+%H:%M:%S')%0AAll projects complete. Ready for new coding tasks!%0ASend a PRD or use /dispatch to add work."
      echo "[watchdog] Sending idle notification to Telegram"
      send_telegram "$MSG"
      LAST_IDLE_NOTIFY=$NOW
    fi
    echo "[watchdog] Queue empty — sleeping 5min before recheck..."
    sleep 300
    continue
  fi

  echo "[watchdog] Sleeping 30s before next pass..."
  sleep 30
done
