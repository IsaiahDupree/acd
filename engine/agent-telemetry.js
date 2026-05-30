#!/usr/bin/env node

/**
 * ACD Agent Telemetry
 * ===================
 * Structured event emitter for agent observability.
 * Writes events to harness/telemetry/{slug}.ndjson + in-memory ring buffer.
 *
 * Events: session_start, session_end, feature_passed, tool_call,
 *         progress_snap, stuck_detected, doctor_called, healed
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TELEMETRY_DIR = path.join(__dirname, 'telemetry');
const RING_SIZE = 200;

// In-memory ring buffer: Map<slug, Event[]>
const rings = new Map();

function ensureDir() {
  if (!fs.existsSync(TELEMETRY_DIR)) {
    fs.mkdirSync(TELEMETRY_DIR, { recursive: true });
  }
}

/**
 * Emit a telemetry event.
 * @param {string} slug - Agent project ID / slug
 * @param {string} event - Event name
 * @param {object} data - Additional event data
 * @returns {object} The event entry written
 */
export function emit(slug, event, data = {}) {
  const entry = {
    ts: new Date().toISOString(),
    slug,
    event,
    ...data,
  };

  // Update ring buffer
  if (!rings.has(slug)) rings.set(slug, []);
  const ring = rings.get(slug);
  ring.push(entry);
  if (ring.length > RING_SIZE) ring.shift();

  // Append to NDJSON on disk (non-fatal)
  try {
    ensureDir();
    const file = path.join(TELEMETRY_DIR, `${slug}.ndjson`);
    fs.appendFileSync(file, JSON.stringify(entry) + '\n');
  } catch { /* non-fatal */ }

  return entry;
}

/**
 * Get recent events from ring buffer.
 * @param {string} slug
 * @param {number} limit
 */
export function getEvents(slug, limit = RING_SIZE) {
  const ring = rings.get(slug) || [];
  return ring.slice(-limit);
}

/** List all slugs with telemetry data in memory. */
export function getAllSlugs() {
  return [...rings.keys()];
}

/** Clear in-memory events for a slug. */
export function clearEvents(slug) {
  rings.delete(slug);
}

/**
 * Factory: create a bound telemetry emitter for a specific slug.
 * @param {string} slug
 */
export function createTelemetry(slug) {
  return {
    emit: (event, data) => emit(slug, event, data),
    getEvents: (limit) => getEvents(slug, limit),
    clear: () => clearEvents(slug),
  };
}
