#!/usr/bin/env node
// validate-features.js — zero-dependency validator for ACD feature lists.
//
// Validates every *.json in a directory against schema/feature.schema.json
// (JSON Schema draft 2020-12). Implements just the subset of JSON Schema the
// canonical feature shape uses (type / required / enum / minLength / array
// items / $ref), hand-rolled against Node builtins so no npm dep is needed.
//
// Usage:
//   node validate-features.js [dir]        # defaults to data/features
//   node validate-features.js [dir] --quiet # only print failures + summary
//
// Exit code: 0 if every file validates, 1 otherwise.

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, dirname, basename, resolve } from 'path';
import { fileURLToPath } from 'url';
import { FEATURES_DIR, ACD_ROOT } from './paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(ACD_ROOT, 'schema', 'feature.schema.json');

// ---------------------------------------------------------------------------
// Minimal JSON Schema validator (draft 2020-12 subset).
// Supports: type, required, enum, minLength, properties, items, $ref ($defs).
// ---------------------------------------------------------------------------
function resolveRef(ref, root) {
  if (!ref.startsWith('#/')) throw new Error(`unsupported $ref: ${ref}`);
  const parts = ref.slice(2).split('/');
  let node = root;
  for (const p of parts) {
    node = node?.[p];
    if (node === undefined) throw new Error(`$ref not found: ${ref}`);
  }
  return node;
}

function jsonType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number' && Number.isInteger(v)) return 'integer';
  return typeof v; // string | number | boolean | object | undefined
}

// Returns array of error strings (empty = valid).
function validateNode(value, schema, root, path) {
  const errors = [];
  if (schema.$ref) {
    return validateNode(value, resolveRef(schema.$ref, root), root, path);
  }

  // type
  if (schema.type) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = jsonType(value);
    // JSON Schema: an integer also satisfies "number".
    const ok = expected.some((t) =>
      t === actual || (t === 'number' && actual === 'integer'),
    );
    if (!ok) {
      errors.push(`${path || '<root>'}: expected type ${expected.join('|')}, got ${actual}`);
      return errors; // further checks are meaningless if type is wrong
    }
  }

  // enum
  if (schema.enum && !schema.enum.some((e) => e === value)) {
    errors.push(`${path}: value ${JSON.stringify(value)} not in enum [${schema.enum.join(', ')}]`);
  }

  // minLength (strings)
  if (typeof value === 'string' && typeof schema.minLength === 'number' && value.length < schema.minLength) {
    errors.push(`${path}: string shorter than minLength ${schema.minLength}`);
  }

  // object: required + properties
  if (jsonType(value) === 'object') {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in value) || value[key] === undefined) {
          errors.push(`${path || '<root>'}: missing required property "${key}"`);
        }
      }
    }
    if (schema.properties) {
      for (const [key, sub] of Object.entries(schema.properties)) {
        if (key in value && value[key] !== undefined) {
          errors.push(...validateNode(value[key], sub, root, path ? `${path}.${key}` : key));
        }
      }
    }
  }

  // array: items
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => {
      errors.push(...validateNode(item, schema.items, root, `${path}[${i}]`));
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--quiet');
  const quiet = process.argv.includes('--quiet');
  const dir = resolve(args[0] || FEATURES_DIR);

  if (!existsSync(SCHEMA_PATH)) {
    console.error(`Schema not found: ${SCHEMA_PATH}`);
    process.exit(2);
  }
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`Not a directory: ${dir}`);
    process.exit(2);
  }

  let schema;
  try {
    schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  } catch (e) {
    console.error(`Failed to parse schema: ${e.message}`);
    process.exit(2);
  }

  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  let pass = 0;
  let fail = 0;
  const failures = [];

  for (const f of files) {
    const full = join(dir, f);
    let data;
    try {
      data = JSON.parse(readFileSync(full, 'utf8'));
    } catch (e) {
      fail++;
      failures.push({ file: f, errors: [`invalid JSON: ${e.message}`] });
      console.log(`FAIL ${f} — invalid JSON: ${e.message}`);
      continue;
    }
    const errors = validateNode(data, schema, schema, '');
    if (errors.length === 0) {
      pass++;
      if (!quiet) console.log(`PASS ${f}`);
    } else {
      fail++;
      failures.push({ file: f, errors });
      console.log(`FAIL ${f} — ${errors.length} error(s):`);
      for (const e of errors.slice(0, 8)) console.log(`       ${e}`);
      if (errors.length > 8) console.log(`       ...and ${errors.length - 8} more`);
    }
  }

  console.log('');
  console.log(`Summary: ${pass}/${files.length} valid, ${fail} invalid (dir: ${dir})`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
