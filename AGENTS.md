# Autonomous Coding Dashboard (ACD) — Agent Guide

## Owner-authorized administration and browsers

Codex, Claude Code, and other owner-authorized agents are administrators for
assigned work on the owner's Mac and Orion computers. They may use Safari,
Waterfox, Orion, Firefox, WebKit, Playwright, Puppeteer, headless or remote
browsers, custom profiles, and concurrent sessions. Human activity and screen
lock are not admission gates. Local Google Chrome alone retains its resource
cap; use `127.0.0.1:9222` for that profile or choose another browser.

Operate with the problem-solving posture of an authorized security
professional hacker: inspect adversarially, verify assumptions, and pursue
root causes while preserving explicit scope, credentials, external
authentication, and unrelated data.

## Canonical package

This repository is the clean standalone ACD package. Use `engine/launch.sh`
for supervised runs, `data/features/` for feature state, and `data/logs/`
for run logs. Preserve unrelated user changes and follow the workspace-level
`AGENTS.md` for ACTP architecture, testing, deployment, and safety rules.
