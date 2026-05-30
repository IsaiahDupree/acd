#!/usr/bin/env node

/**
 * PRD Feature Extractor
 * =====================
 *
 * Automatically extracts feature entries from PRD markdown files.
 * Generates feature_list.json compatible output.
 */

import fs from 'fs';
import path from 'path';
import { featureFile, prdFile } from './paths.js';

/**
 * Parse markdown into structured sections
 */
function parseMarkdown(markdown) {
  const lines = markdown.split('\n');
  const sections = [];
  let currentSection = null;
  let currentSubsection = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // H1 heading - new section
    if (line.match(/^#\s+(.+)$/)) {
      const title = line.replace(/^#\s+/, '').trim();
      currentSection = { level: 1, title, content: [], subsections: [] };
      sections.push(currentSection);
      currentSubsection = null;
    }
    // H2 heading - subsection
    else if (line.match(/^##\s+(.+)$/)) {
      const title = line.replace(/^##\s+/, '').trim();
      currentSubsection = { level: 2, title, content: [] };
      if (currentSection) {
        currentSection.subsections.push(currentSubsection);
      } else {
        // No parent section, create one
        currentSection = { level: 1, title: 'Untitled', content: [], subsections: [] };
        sections.push(currentSection);
        currentSection.subsections.push(currentSubsection);
      }
    }
    // H3 heading - nested subsection
    else if (line.match(/^###\s+(.+)$/)) {
      const title = line.replace(/^###\s+/, '').trim();
      const nestedSubsection = { level: 3, title, content: [] };
      if (currentSubsection) {
        if (!currentSubsection.subsections) currentSubsection.subsections = [];
        currentSubsection.subsections.push(nestedSubsection);
        currentSubsection = nestedSubsection; // Track for content
      }
    }
    // Content
    else {
      if (currentSubsection) {
        currentSubsection.content.push(line);
      } else if (currentSection) {
        currentSection.content.push(line);
      }
    }
  }

  return sections;
}

/**
 * Extract features from a section or subsection
 */
function extractFeaturesFromSection(section, categoryHint = 'general') {
  const features = [];
  const content = section.content.join('\n');

  // Look for bullet points or checkboxes (common feature list patterns)
  const bulletRegex = /^[\s]*[-*]\s*(.+)$/gm;
  const checkboxRegex = /^[\s]*[-*]\s*\[\s*[xX ]?\s*\]\s*(.+)$/gm;

  let match;

  // Extract checkbox items first (higher priority)
  while ((match = checkboxRegex.exec(content)) !== null) {
    const description = match[1].trim();
    if (description && description.length > 5) {
      const feature = {
        description: description,
        category: inferCategory(description, categoryHint),
        acceptance_criteria: generateAcceptanceCriteria(description, section),
        source_section: section.title
      };
      features.push(feature);
    }
  }

  // Extract regular bullet points
  while ((match = bulletRegex.exec(content)) !== null) {
    const description = match[1].trim();
    // Skip if it starts with [ (checkbox, already processed)
    if (description && description.length > 5 && !description.startsWith('[')) {
      const feature = {
        description: description,
        category: inferCategory(description, categoryHint),
        acceptance_criteria: generateAcceptanceCriteria(description, section),
        source_section: section.title
      };
      features.push(feature);
    }
  }

  // Also check subsections recursively
  if (section.subsections) {
    for (const subsection of section.subsections) {
      const subFeatures = extractFeaturesFromSection(subsection, section.title);
      features.push(...subFeatures);
    }
  }

  return features;
}

/**
 * Infer category from feature description or section title
 */
function inferCategory(description, sectionTitle = '') {
  const text = `${description} ${sectionTitle}`.toLowerCase();

  // Category patterns
  const patterns = {
    'core': /\b(core|essential|fundamental|basic|main)\b/,
    'ui': /\b(ui|interface|display|view|render|layout|design|responsive|mobile|desktop)\b/,
    'api': /\b(api|endpoint|rest|graphql|request|response)\b/,
    'database': /\b(database|db|sql|schema|table|query|migration|index)\b/,
    'auth': /\b(auth|authentication|authorization|login|signup|session|jwt|token)\b/,
    'integration': /\b(integration|third-party|external|webhook|sync)\b/,
    'testing': /\b(test|testing|spec|e2e|unit|integration test)\b/,
    'analytics': /\b(analytics|tracking|metrics|telemetry|monitoring)\b/,
    'performance': /\b(performance|optimization|cache|speed|latency)\b/,
    'security': /\b(security|encryption|permission|access control|vulnerability)\b/,
    'deployment': /\b(deployment|deploy|ci\/cd|pipeline|build|release)\b/,
    'documentation': /\b(documentation|docs|readme|guide|tutorial)\b/,
    'notification': /\b(notification|alert|email|sms|push)\b/,
    'automation': /\b(automation|scheduled|cron|background|queue)\b/,
    'logs': /\b(log|logging|audit|history|timeline)\b/,
    'config': /\b(config|configuration|settings|preferences)\b/
  };

  for (const [category, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) {
      return category;
    }
  }

  return 'general';
}

/**
 * Generate acceptance criteria from feature description and context
 */
function generateAcceptanceCriteria(description, section) {
  const criteria = [];
  const lowerDesc = description.toLowerCase();

  // Look for explicit criteria in section content
  const content = section.content.join('\n').toLowerCase();

  // Common patterns for acceptance criteria
  if (lowerDesc.includes('display') || lowerDesc.includes('show')) {
    criteria.push('Information is displayed correctly');
    criteria.push('Layout is responsive and accessible');
  }

  if (lowerDesc.includes('track') || lowerDesc.includes('log')) {
    criteria.push('Data is tracked accurately');
    criteria.push('Logs are stored persistently');
  }

  if (lowerDesc.includes('api') || lowerDesc.includes('endpoint')) {
    criteria.push('API endpoint returns expected data');
    criteria.push('Proper error handling is implemented');
    criteria.push('Response time is acceptable');
  }

  if (lowerDesc.includes('test')) {
    criteria.push('Tests run successfully');
    criteria.push('Test results are displayed');
    criteria.push('Failed tests show error details');
  }

  if (lowerDesc.includes('button') || lowerDesc.includes('click')) {
    criteria.push('Button is visible and properly styled');
    criteria.push('Click handler executes expected action');
    criteria.push('Loading/success states are shown');
  }

  if (lowerDesc.includes('form') || lowerDesc.includes('input')) {
    criteria.push('Form fields accept input correctly');
    criteria.push('Validation errors are shown');
    criteria.push('Submit action works as expected');
  }

  if (lowerDesc.includes('chart') || lowerDesc.includes('graph')) {
    criteria.push('Chart displays data accurately');
    criteria.push('Axes and labels are readable');
    criteria.push('Chart updates with data changes');
  }

  if (lowerDesc.includes('websocket') || lowerDesc.includes('real-time')) {
    criteria.push('WebSocket connection established');
    criteria.push('Real-time updates work correctly');
    criteria.push('Reconnection on disconnect');
  }

  // If no specific criteria matched, add generic ones
  if (criteria.length === 0) {
    criteria.push('Feature is implemented as described');
    criteria.push('No errors occur during operation');
    criteria.push('Feature passes all tests');
  }

  return criteria;
}

/**
 * Generate sequential feature IDs
 */
function generateFeatureIds(features, startingId = 1) {
  return features.map((feature, index) => ({
    id: `feat-${String(startingId + index).padStart(3, '0')}`,
    ...feature,
    priority: startingId + index,
    passes: false
  }));
}

/**
 * Main extraction function
 */
export function extractFeaturesFromPRD(markdown, options = {}) {
  const {
    startingId = 1,
    projectName = 'Extracted from PRD',
    includeUncategorized = true,
    silent = false,
  } = options;

  const log = silent ? () => {} : console.log.bind(console);

  log('📄 Parsing PRD markdown...');
  const sections = parseMarkdown(markdown);
  log(`   Found ${sections.length} top-level sections`);

  log('\n🔍 Extracting features from sections...');
  let allFeatures = [];

  for (const section of sections) {
    // Skip non-feature sections (overview, problem statement, etc.)
    const skipSections = ['overview', 'introduction', 'problem statement', 'goals', 'glossary'];
    if (skipSections.some(skip => section.title.toLowerCase().includes(skip))) {
      log(`   ⏭️  Skipping section: ${section.title}`);
      continue;
    }

    log(`   📋 Processing: ${section.title}`);
    const features = extractFeaturesFromSection(section);
    log(`      → Extracted ${features.length} features`);
    allFeatures.push(...features);
  }

  log(`\n✅ Total features extracted: ${allFeatures.length}`);

  // Remove duplicates (similar descriptions)
  allFeatures = deduplicateFeatures(allFeatures);
  log(`   After deduplication: ${allFeatures.length} features`);

  // Generate IDs and priorities
  const featuresWithIds = generateFeatureIds(allFeatures, startingId);

  // Generate feature list structure
  const featureList = {
    project: projectName,
    description: 'Features extracted from PRD',
    total_features: featuresWithIds.length,
    created_at: new Date().toISOString(),
    features: featuresWithIds
  };

  // Print summary by category
  const byCategory = {};
  for (const f of featuresWithIds) {
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
  }

  log('\n📊 Features by category:');
  for (const [category, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    log(`   ${category}: ${count}`);
  }

  return featureList;
}

/**
 * Remove duplicate features based on similarity
 */
function deduplicateFeatures(features) {
  const unique = [];
  const seen = new Set();

  for (const feature of features) {
    // Normalize description for comparison
    const normalized = feature.description.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(feature);
    }
  }

  return unique;
}

/**
 * Load PRD from file
 */
export function loadPRDFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`PRD file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Save feature list to JSON file
 */
export function saveFeatureList(featureList, outputPath) {
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(featureList, null, 2));
  console.log(`\n💾 Saved feature list to: ${outputPath}`);
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
PRD Feature Extractor
=====================

Automatically extract features from PRD markdown files.

Usage:
  node prd-extractor.js <prd-file> [options]
  node prd-extractor.js --slug <slug> [options]

Options:
  --slug SLUG           Resolve PRD from data/prds/<slug>.md and output to
                        data/features/<slug>.json (overridable by --output)
  --output PATH         Output path for feature_list.json
                        (default: data/features/<slug>.json when --slug given,
                         else ./feature_list.json)
  --starting-id N       Starting feature ID number (default: 1)
  --project NAME        Project name (default: "Extracted from PRD")
  --help, -h            Show this help

Examples:
  node prd-extractor.js ./PRD.md
  node prd-extractor.js --slug my-app
  node prd-extractor.js ./PRD.md --output ./features.json --starting-id 100
  node prd-extractor.js ./PRD.md --project "My App" --output ./feature_list.json
`);
    process.exit(0);
  }

  const getArg = (name, defaultValue) => {
    const idx = args.indexOf(name);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : defaultValue;
  };

  const slug = getArg('--slug', null);
  // PRD input: positional path wins, else resolve <slug>.md from data/prds (PRDS_DIR).
  const positional = args[0] && !args[0].startsWith('-') ? args[0] : null;
  const prdInput = positional || (slug ? prdFile(slug) : null);
  if (!prdInput) {
    console.error('❌ Error: PRD file path or --slug is required');
    console.error('Usage: node prd-extractor.js <prd-file> [options]  |  --slug <slug>');
    process.exit(1);
  }

  // Output: explicit --output wins, else data/features/<slug>.json (featureFile), else ./feature_list.json
  const outputPath = getArg('--output', slug ? featureFile(slug) : './feature_list.json');
  const startingId = parseInt(getArg('--starting-id', '1'), 10);
  const projectName = getArg('--project', slug || 'Extracted from PRD');

  try {
    console.log('\n🚀 PRD Feature Extractor\n');
    console.log(`   PRD source: ${prdInput}`);
    console.log(`   Output:     ${outputPath}`);
    const markdown = loadPRDFile(prdInput);
    const featureList = extractFeaturesFromPRD(markdown, { startingId, projectName });
    saveFeatureList(featureList, outputPath);
    console.log('\n✅ Extraction complete!\n');
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}\n`);
    process.exit(1);
  }
}

export default { extractFeaturesFromPRD, loadPRDFile, saveFeatureList };
