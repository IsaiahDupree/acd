# Autonomous Coding Dashboard (ACD) — Agent Guide

## Mandatory browser singleton policy

All ACD agents share exactly one Chrome and one Safari application. Browser UI
tests must attach Playwright to `http://127.0.0.1:9222`; launching Chromium,
Chrome for Testing, a headless browser, a fresh browser context, another Chrome
profile, or a second Safari is forbidden. Reuse a tab and close only the tab you
created. Each browser is capped at eight tabs. If the shared browser is cooling
or unavailable, report the UI check blocked and wait—never create a fallback.

## Canonical package

This repository is the clean standalone ACD package. Use `engine/launch.sh`
for supervised runs, `data/features/` for feature state, and `data/logs/`
for run logs. Preserve unrelated user changes and follow the workspace-level
`AGENTS.md` for ACTP architecture, testing, deployment, and safety rules.
