/**
 * Visual Verification Service
 * ===========================
 * 
 * Uses Puppeteer for automated visual verification of the application.
 * Takes screenshots, compares UI states, and validates visual elements.
 * Integrates with the harness for automated testing checkpoints.
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';

export interface Screenshot {
  id: string;
  projectId: string;
  sessionNumber: number;
  url: string;
  name: string;
  filepath: string;
  timestamp: Date;
  width: number;
  height: number;
  metadata?: {
    featureId?: string;
    checkpoint?: string;
    description?: string;
  };
}

export interface VisualTest {
  id: string;
  projectId: string;
  name: string;
  url: string;
  selector?: string;
  actions?: VisualAction[];
  assertions?: VisualAssertion[];
  status: 'pending' | 'running' | 'passed' | 'failed';
  screenshots: Screenshot[];
  error?: string;
  duration?: number;
  createdAt: Date;
  completedAt?: Date;
}

export interface VisualAction {
  type: 'click' | 'fill' | 'select' | 'hover' | 'wait' | 'scroll' | 'screenshot';
  selector?: string;
  value?: string;
  timeout?: number;
}

export interface VisualAssertion {
  type: 'visible' | 'hidden' | 'text' | 'attribute' | 'screenshot_match';
  selector?: string;
  expected?: string;
  attribute?: string;
  threshold?: number; // For screenshot comparison (0-1)
}

export interface VisualVerificationConfig {
  enabled: boolean;
  screenshotDir: string;
  defaultViewport: { width: number; height: number };
  baseUrl: string;
  autoScreenshot: boolean;
  screenshotOnError: boolean;
  comparisonThreshold: number;
}

const DEFAULT_CONFIG: VisualVerificationConfig = {
  enabled: true,
  screenshotDir: './screenshots',
  defaultViewport: { width: 1280, height: 720 },
  baseUrl: 'http://localhost:8080',
  autoScreenshot: true,
  screenshotOnError: true,
  comparisonThreshold: 0.1,
};

class VisualVerificationService extends EventEmitter {
  private configs: Map<string, VisualVerificationConfig> = new Map();
  private screenshots: Map<string, Screenshot[]> = new Map();
  private tests: Map<string, VisualTest> = new Map();
  private mcpAvailable: boolean = false;

  constructor() {
    super();
    this.checkMcpAvailability();
  }

  private async checkMcpAvailability() {
    // MCP Puppeteer availability is determined by the client
    // This service provides the API layer
    this.mcpAvailable = true;
  }

  /**
   * Get or set configuration for a project
   */
  getConfig(projectId: string): VisualVerificationConfig {
    return this.configs.get(projectId) || { ...DEFAULT_CONFIG };
  }

  setConfig(projectId: string, config: Partial<VisualVerificationConfig>): VisualVerificationConfig {
    const current = this.getConfig(projectId);
    const updated = { ...current, ...config };
    this.configs.set(projectId, updated);
    
    // Ensure screenshot directory exists
    const screenshotPath = path.resolve(updated.screenshotDir, projectId);
    if (!fs.existsSync(screenshotPath)) {
      fs.mkdirSync(screenshotPath, { recursive: true });
    }
    
    return updated;
  }

  /**
   * Create a visual test definition
   */
  createTest(projectId: string, test: Omit<VisualTest, 'id' | 'status' | 'screenshots' | 'createdAt'>): VisualTest {
    const id = `vtest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const visualTest: VisualTest = {
      ...test,
      id,
      projectId,
      status: 'pending',
      screenshots: [],
      createdAt: new Date(),
    };
    
    this.tests.set(id, visualTest);
    return visualTest;
  }

  /**
   * Record a screenshot (called by MCP integration)
   */
  recordScreenshot(
    projectId: string,
    data: {
      name: string;
      url: string;
      base64Data: string;
      width: number;
      height: number;
      sessionNumber?: number;
      metadata?: Screenshot['metadata'];
    }
  ): Screenshot {
    const config = this.getConfig(projectId);
    const id = `ss_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Save screenshot to disk
    const filename = `${data.name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.png`;
    const screenshotDir = path.resolve(config.screenshotDir, projectId);
    
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    
    const filepath = path.join(screenshotDir, filename);
    
    // Decode base64 and save
    const buffer = Buffer.from(data.base64Data, 'base64');
    fs.writeFileSync(filepath, buffer);
    
    const screenshot: Screenshot = {
      id,
      projectId,
      sessionNumber: data.sessionNumber || 0,
      url: data.url,
      name: data.name,
      filepath,
      timestamp: new Date(),
      width: data.width,
      height: data.height,
      metadata: data.metadata,
    };
    
    // Store in memory
    const projectScreenshots = this.screenshots.get(projectId) || [];
    projectScreenshots.push(screenshot);
    this.screenshots.set(projectId, projectScreenshots);
    
    this.emit('screenshot:captured', screenshot);
    
    return screenshot;
  }

  /**
   * Get screenshots for a project
   */
  getScreenshots(projectId: string, limit = 50): Screenshot[] {
    const screenshots = this.screenshots.get(projectId) || [];
    return screenshots.slice(-limit);
  }

  /**
   * Get a specific screenshot
   */
  getScreenshot(screenshotId: string): Screenshot | undefined {
    for (const screenshots of this.screenshots.values()) {
      const found = screenshots.find(s => s.id === screenshotId);
      if (found) return found;
    }
    return undefined;
  }

  /**
   * Get screenshot file as base64
   */
  getScreenshotData(screenshotId: string): string | null {
    const screenshot = this.getScreenshot(screenshotId);
    if (!screenshot || !fs.existsSync(screenshot.filepath)) {
      return null;
    }
    
    const buffer = fs.readFileSync(screenshot.filepath);
    return buffer.toString('base64');
  }

  /**
   * Delete old screenshots
   */
  cleanupScreenshots(projectId: string, maxAge: number = 7 * 24 * 60 * 60 * 1000): number {
    const screenshots = this.screenshots.get(projectId) || [];
    const now = Date.now();
    let deleted = 0;
    
    const remaining = screenshots.filter(s => {
      const age = now - s.timestamp.getTime();
      if (age > maxAge) {
        try {
          if (fs.existsSync(s.filepath)) {
            fs.unlinkSync(s.filepath);
          }
          deleted++;
          return false;
        } catch {
          return true;
        }
      }
      return true;
    });
    
    this.screenshots.set(projectId, remaining);
    return deleted;
  }

  /**
   * Get all tests for a project
   */
  getTests(projectId: string): VisualTest[] {
    return Array.from(this.tests.values())
      .filter(t => t.projectId === projectId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get a specific test
   */
  getTest(testId: string): VisualTest | undefined {
    return this.tests.get(testId);
  }

  /**
   * Update test status
   */
  updateTestStatus(
    testId: string,
    status: VisualTest['status'],
    result?: { error?: string; duration?: number; screenshots?: Screenshot[] }
  ): VisualTest | null {
    const test = this.tests.get(testId);
    if (!test) return null;
    
    test.status = status;
    if (result?.error) test.error = result.error;
    if (result?.duration) test.duration = result.duration;
    if (result?.screenshots) test.screenshots.push(...result.screenshots);
    if (status === 'passed' || status === 'failed') {
      test.completedAt = new Date();
    }
    
    this.emit('test:updated', test);
    return test;
  }

  /**
   * Generate MCP command for taking a screenshot
   */
  generateScreenshotCommand(url: string, name: string, selector?: string): object {
    return {
      tool: 'mcp2_puppeteer_screenshot',
      params: {
        name,
        selector,
        width: 1280,
        height: 720,
        encoded: true,
      },
    };
  }

  /**
   * Generate MCP command for navigation
   */
  generateNavigateCommand(url: string): object {
    return {
      tool: 'mcp2_puppeteer_navigate',
      params: { url },
    };
  }

  /**
   * Generate a visual test plan for a feature
   */
  generateTestPlan(feature: {
    id: string;
    title: string;
    acceptanceCriteria?: string[];
  }, baseUrl: string): VisualTest {
    const actions: VisualAction[] = [
      { type: 'screenshot', value: `${feature.id}_initial` },
    ];
    
    const assertions: VisualAssertion[] = [
      { type: 'visible', selector: 'body' },
    ];
    
    return this.createTest('default', {
      projectId: 'default',
      name: `Visual Test: ${feature.title}`,
      url: baseUrl,
      actions,
      assertions,
    });
  }

  /**
   * Get verification summary for a project
   */
  getSummary(projectId: string): {
    totalScreenshots: number;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    pendingTests: number;
    lastScreenshot?: Screenshot;
  } {
    const screenshots = this.screenshots.get(projectId) || [];
    const tests = this.getTests(projectId);
    
    return {
      totalScreenshots: screenshots.length,
      totalTests: tests.length,
      passedTests: tests.filter(t => t.status === 'passed').length,
      failedTests: tests.filter(t => t.status === 'failed').length,
      pendingTests: tests.filter(t => t.status === 'pending').length,
      lastScreenshot: screenshots[screenshots.length - 1],
    };
  }
}

// Singleton
let instance: VisualVerificationService | null = null;

export function getVisualVerification(): VisualVerificationService {
  if (!instance) {
    instance = new VisualVerificationService();
  }
  return instance;
}

export { VisualVerificationService };
