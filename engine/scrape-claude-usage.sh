#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Claude Desktop Usage Scraper — DISABLED
# ═══════════════════════════════════════════════════════════════
# Opens Claude Settings > Usage, screenshots it, OCRs it,
# extracts usage metrics, writes claude-usage.json
# DISABLED: write stub 0% so harness never opens the desktop app
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo '{"session_percent":0,"weekly_all_percent":0,"weekly_sonnet_percent":0,"max_weekly_percent":0,"disabled":true}' > "$SCRIPT_DIR/claude-usage.json"
exit 0
# ═══════════════════════════════════════════════════════════════
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT="$SCRIPT_DIR/claude-usage.json"

command -v cliclick &>/dev/null || { echo '{"error":"cliclick not installed"}' > "$OUTPUT"; exit 1; }

# ── 1. Navigate to Settings > Usage ──────────────────────────
osascript -e 'tell application "Claude" to activate'
sleep 1
osascript <<'AS'
tell application "System Events"
    tell process "Claude"
        set frontmost to true
        delay 0.5
        keystroke "," using command down
        delay 2
    end tell
end tell
AS
sleep 1

# Get window position
WPOS=$(osascript -e '
tell application "System Events"
    tell process "Claude"
        set pos to position of window 1
        set sz to size of window 1
        return (item 1 of pos as text) & "," & (item 2 of pos as text) & "," & (item 1 of sz as text) & "," & (item 2 of sz as text)
    end tell
end tell
')
IFS=',' read -r WX WY WW WH <<< "$WPOS"

# Click "Usage" in settings nav (x≈345, y≈350 from window origin)
osascript -e 'tell application "Claude" to activate'
sleep 0.3
cliclick c:$((WX+345)),$((WY+350))
sleep 2

# ── 2. Screenshot full Usage page (two shots: top + scrolled) ─
SHOT1="/tmp/claude-usage-top.png"
SHOT2="/tmp/claude-usage-bottom.png"

screencapture -x -R ${WX},${WY},${WW},${WH} "$SHOT1"

# Scroll down
osascript -e 'tell application "System Events" to key code 121'
sleep 1
screencapture -x -R ${WX},${WY},${WW},${WH} "$SHOT2"

# ── 3. OCR both screenshots ──────────────────────────────────
ocr_image() {
    swift -e "
import Vision; import AppKit
let url = URL(fileURLWithPath: \"$1\")
guard let img = NSImage(contentsOf: url),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }
let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
try VNImageRequestHandler(cgImage: cg).perform([req])
for obs in req.results ?? [] {
    if let t = obs.topCandidates(1).first?.string { print(t) }
}
" 2>/dev/null
}

OCR1=$(ocr_image "$SHOT1")
OCR2=$(ocr_image "$SHOT2")
ALL_TEXT="$OCR1
$OCR2"

# ── 4. Parse usage metrics ───────────────────────────────────
python3 - "$ALL_TEXT" "$OUTPUT" << 'PYEOF'
import sys, json, re
from datetime import datetime

text = sys.argv[1]
output_path = sys.argv[2]
lines = text.strip().split('\n')

usage = {
    "scraped_at": datetime.now().isoformat(),
    "plan": None,
    "session_percent": None,
    "session_resets_in": None,
    "weekly_all_percent": None,
    "weekly_all_resets": None,
    "weekly_sonnet_percent": None,
    "weekly_sonnet_resets_in": None,
    "extra_spent_usd": None,
    "extra_limit_usd": None,
    "extra_percent": None,
    "credit_balance_usd": None,
    "max_weekly_percent": None,
}

# Join all lines for multi-line matching
full = '\n'.join(lines)

# Plan
if 'Max' in full and '20x' in full:
    usage["plan"] = "Max (20x)"
elif 'Pro' in full:
    usage["plan"] = "Pro"

# Find all "X% used" occurrences with context
pct_matches = list(re.finditer(r'(\d+)%\s*used', full))

# Current session: look for "Current session" then nearest "X% used"
session_idx = full.lower().find('current session')
if session_idx >= 0:
    # Find the nearest % used after this
    for m in pct_matches:
        if m.start() > session_idx and m.start() - session_idx < 200:
            usage["session_percent"] = int(m.group(1))
            break
    # Resets in
    r = re.search(r'[Rr]esets\s+in\s+([\d]+\s*hr?\s*\d*\s*min)', full[session_idx:session_idx+200])
    if r:
        usage["session_resets_in"] = r.group(1).strip()

# All models (weekly)
all_idx = full.lower().find('all model')
if all_idx >= 0:
    chunk = full[max(0,all_idx-200):all_idx+200]
    for m in re.finditer(r'(\d+)%\s*used', chunk):
        usage["weekly_all_percent"] = int(m.group(1))
    r = re.search(r'[Rr]esets\s+([\w]+\s+[\d:]+\s*[AP]M)', chunk)
    if r:
        usage["weekly_all_resets"] = r.group(1).strip()

# Sonnet only (weekly)
sonnet_idx = full.lower().find('sonnet only')
if sonnet_idx >= 0:
    chunk = full[sonnet_idx:sonnet_idx+200]
    m = re.search(r'(\d+)%\s*used', chunk)
    if m:
        usage["weekly_sonnet_percent"] = int(m.group(1))
    r = re.search(r'[Rr]esets\s+in\s+([\d]+\s*hr?\s*\d*\s*min)', chunk)
    if r:
        usage["weekly_sonnet_resets_in"] = r.group(1).strip()

# Extra usage: "$X.XX spent"
m = re.search(r'\$([\d.]+)\s*spent', full)
if m:
    usage["extra_spent_usd"] = float(m.group(1))
# Find associated percentage
spent_idx = full.find('spent')
if spent_idx >= 0:
    chunk = full[spent_idx:spent_idx+100]
    m = re.search(r'(\d+)%\s*used', chunk)
    if m:
        usage["extra_percent"] = int(m.group(1))

# Monthly spend limit
m = re.search(r'\$(\d+)\s*\n.*[Mm]onthly\s*spend\s*limit', full)
if not m:
    m = re.search(r'[Mm]onthly\s*spend\s*limit.*?\$(\d+)', full)
if m:
    usage["extra_limit_usd"] = int(m.group(1))
else:
    # Try finding $20 near "spend limit"
    limit_idx = full.lower().find('spend limit')
    if limit_idx >= 0:
        chunk = full[max(0,limit_idx-100):limit_idx+50]
        m = re.search(r'\$(\d+)', chunk)
        if m:
            usage["extra_limit_usd"] = int(m.group(1))

# Credit balance
m = re.search(r'\$([\d.]+)\s*\n.*[Cc]urrent\s*balance', full)
if not m:
    m = re.search(r'[Cc]urrent\s*balance.*?\$([\d.]+)', full)
if m:
    usage["credit_balance_usd"] = float(m.group(1))
else:
    bal_idx = full.lower().find('balance')
    if bal_idx >= 0:
        chunk = full[max(0,bal_idx-100):bal_idx+50]
        m = re.search(r'\$([\d.]+)', chunk)
        if m:
            usage["credit_balance_usd"] = float(m.group(1))

# Max weekly usage (the one that matters most for budget guardian)
weekly_pcts = [v for v in [usage["weekly_all_percent"], usage["weekly_sonnet_percent"]] if v is not None]
usage["max_weekly_percent"] = max(weekly_pcts) if weekly_pcts else None

with open(output_path, 'w') as f:
    json.dump(usage, f, indent=2)

print(json.dumps(usage, indent=2))
PYEOF

echo "✅ Written to $OUTPUT"
