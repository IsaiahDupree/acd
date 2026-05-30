/**
 * Project Manager Service
 * =======================
 * 
 * Manages multiple projects for the agent harness dashboard.
 * Handles project CRUD, settings, and aggregated statistics.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

export interface Project {
  id: string;
  name: string;
  description?: string;
  path: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
  createdAt: Date;
  updatedAt: Date;
  settings: ProjectSettings;
  stats: ProjectStats;
  tags: string[];
  teamMembers: string[];
}

export interface ProjectSettings {
  harnessEnabled: boolean;
  autoStart: boolean;
  maxConcurrentSessions: number;
  defaultModel: string;
  notificationsEnabled: boolean;
  webhookIds: string[];
  budgetConfig?: {
    dailyLimit?: number;
    monthlyLimit?: number;
    alertThreshold: number;
  };
  approvalGatesEnabled: boolean;
  gitIntegrationEnabled: boolean;
}

export interface ProjectStats {
  totalSessions: number;
  completedFeatures: number;
  totalFeatures: number;
  totalCost: number;
  lastActivity?: Date;
  successRate: number;
  avgSessionDuration: number;
}

export interface ProjectFilter {
  status?: Project['status'][];
  tags?: string[];
  search?: string;
  teamMember?: string;
}

const DEFAULT_SETTINGS: ProjectSettings = {
  harnessEnabled: true,
  autoStart: false,
  maxConcurrentSessions: 1,
  defaultModel: 'claude-sonnet-4-20250514',
  notificationsEnabled: true,
  webhookIds: [],
  approvalGatesEnabled: true,
  gitIntegrationEnabled: true,
};

const DEFAULT_STATS: ProjectStats = {
  totalSessions: 0,
  completedFeatures: 0,
  totalFeatures: 0,
  totalCost: 0,
  successRate: 0,
  avgSessionDuration: 0,
};

class ProjectManagerService extends EventEmitter {
  private projects: Map<string, Project> = new Map();
  private storageFile: string;

  constructor(storageFile = './projects.json') {
    super();
    this.storageFile = storageFile;
    this.loadProjects();
  }

  private loadProjects(): void {
    try {
      if (fs.existsSync(this.storageFile)) {
        const data = fs.readFileSync(this.storageFile, 'utf-8');
        const parsed = JSON.parse(data);
        
        for (const project of parsed.projects || []) {
          project.createdAt = new Date(project.createdAt);
          project.updatedAt = new Date(project.updatedAt);
          if (project.stats?.lastActivity) {
            project.stats.lastActivity = new Date(project.stats.lastActivity);
          }
          this.projects.set(project.id, project);
        }
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  }

  private saveProjects(): void {
    try {
      const data = {
        version: 1,
        projects: Array.from(this.projects.values()),
      };
      fs.writeFileSync(this.storageFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save projects:', error);
    }
  }

  /**
   * Create a new project
   */
  createProject(data: {
    name: string;
    description?: string;
    path: string;
    tags?: string[];
    settings?: Partial<ProjectSettings>;
  }): Project {
    const id = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const project: Project = {
      id,
      name: data.name,
      description: data.description,
      path: data.path,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      settings: { ...DEFAULT_SETTINGS, ...data.settings },
      stats: { ...DEFAULT_STATS },
      tags: data.tags || [],
      teamMembers: [],
    };
    
    this.projects.set(id, project);
    this.saveProjects();
    this.emit('project:created', project);
    
    return project;
  }

  /**
   * Get a project by ID
   */
  getProject(id: string): Project | undefined {
    return this.projects.get(id);
  }

  /**
   * Get all projects with optional filtering
   */
  getProjects(filter?: ProjectFilter): Project[] {
    let projects = Array.from(this.projects.values());
    
    if (filter?.status && filter.status.length > 0) {
      projects = projects.filter(p => filter.status!.includes(p.status));
    }
    
    if (filter?.tags && filter.tags.length > 0) {
      projects = projects.filter(p => 
        filter.tags!.some(tag => p.tags.includes(tag))
      );
    }
    
    if (filter?.teamMember) {
      projects = projects.filter(p => 
        p.teamMembers.includes(filter.teamMember!)
      );
    }
    
    if (filter?.search) {
      const searchLower = filter.search.toLowerCase();
      projects = projects.filter(p => 
        p.name.toLowerCase().includes(searchLower) ||
        p.description?.toLowerCase().includes(searchLower) ||
        p.path.toLowerCase().includes(searchLower)
      );
    }
    
    return projects.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /**
   * Update a project
   */
  updateProject(id: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>): Project | null {
    const project = this.projects.get(id);
    if (!project) return null;
    
    Object.assign(project, updates, { updatedAt: new Date() });
    this.saveProjects();
    this.emit('project:updated', project);
    
    return project;
  }

  /**
   * Update project settings
   */
  updateSettings(id: string, settings: Partial<ProjectSettings>): Project | null {
    const project = this.projects.get(id);
    if (!project) return null;
    
    project.settings = { ...project.settings, ...settings };
    project.updatedAt = new Date();
    this.saveProjects();
    this.emit('project:settings', project);
    
    return project;
  }

  /**
   * Update project stats
   */
  updateStats(id: string, stats: Partial<ProjectStats>): Project | null {
    const project = this.projects.get(id);
    if (!project) return null;
    
    project.stats = { ...project.stats, ...stats };
    project.updatedAt = new Date();
    this.saveProjects();
    
    return project;
  }

  /**
   * Delete a project
   */
  deleteProject(id: string): boolean {
    const project = this.projects.get(id);
    if (!project) return false;
    
    this.projects.delete(id);
    this.saveProjects();
    this.emit('project:deleted', { id });
    
    return true;
  }

  /**
   * Archive a project
   */
  archiveProject(id: string): Project | null {
    return this.updateProject(id, { status: 'archived' });
  }

  /**
   * Add team member to project
   */
  addTeamMember(id: string, userId: string): Project | null {
    const project = this.projects.get(id);
    if (!project) return null;
    
    if (!project.teamMembers.includes(userId)) {
      project.teamMembers.push(userId);
      project.updatedAt = new Date();
      this.saveProjects();
      this.emit('project:member_added', { projectId: id, userId });
    }
    
    return project;
  }

  /**
   * Remove team member from project
   */
  removeTeamMember(id: string, userId: string): Project | null {
    const project = this.projects.get(id);
    if (!project) return null;
    
    const index = project.teamMembers.indexOf(userId);
    if (index > -1) {
      project.teamMembers.splice(index, 1);
      project.updatedAt = new Date();
      this.saveProjects();
      this.emit('project:member_removed', { projectId: id, userId });
    }
    
    return project;
  }

  /**
   * Get aggregated dashboard stats
   */
  getDashboardStats(): {
    totalProjects: number;
    activeProjects: number;
    totalFeatures: number;
    completedFeatures: number;
    totalCost: number;
    totalSessions: number;
    avgSuccessRate: number;
  } {
    const projects = Array.from(this.projects.values());
    
    const stats = {
      totalProjects: projects.length,
      activeProjects: projects.filter(p => p.status === 'active').length,
      totalFeatures: 0,
      completedFeatures: 0,
      totalCost: 0,
      totalSessions: 0,
      avgSuccessRate: 0,
    };
    
    let successRateSum = 0;
    let successRateCount = 0;
    
    for (const project of projects) {
      stats.totalFeatures += project.stats.totalFeatures;
      stats.completedFeatures += project.stats.completedFeatures;
      stats.totalCost += project.stats.totalCost;
      stats.totalSessions += project.stats.totalSessions;
      
      if (project.stats.successRate > 0) {
        successRateSum += project.stats.successRate;
        successRateCount++;
      }
    }
    
    stats.avgSuccessRate = successRateCount > 0 
      ? Math.round(successRateSum / successRateCount) 
      : 0;
    
    return stats;
  }

  /**
   * Get all unique tags
   */
  getAllTags(): string[] {
    const tags = new Set<string>();
    for (const project of this.projects.values()) {
      project.tags.forEach(tag => tags.add(tag));
    }
    return Array.from(tags).sort();
  }

  /**
   * Import project from path
   */
  importFromPath(projectPath: string): Project | null {
    if (!fs.existsSync(projectPath)) {
      return null;
    }
    
    // Try to get project name from package.json or directory name
    let name = path.basename(projectPath);
    let description = '';
    
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        name = pkg.name || name;
        description = pkg.description || '';
      } catch {}
    }
    
    // Check for feature_list.json to get feature count
    let totalFeatures = 0;
    let completedFeatures = 0;
    const featureListPath = path.join(projectPath, 'feature_list.json');
    if (fs.existsSync(featureListPath)) {
      try {
        const features = JSON.parse(fs.readFileSync(featureListPath, 'utf-8'));
        if (features.features) {
          totalFeatures = features.features.length;
          completedFeatures = features.features.filter((f: any) => f.passes).length;
        }
      } catch {}
    }
    
    return this.createProject({
      name,
      description,
      path: projectPath,
      settings: {
        ...DEFAULT_SETTINGS,
        gitIntegrationEnabled: fs.existsSync(path.join(projectPath, '.git')),
      },
    });
  }

  /**
   * Scan directory for projects
   */
  scanDirectory(dirPath: string, depth = 1): string[] {
    const projectPaths: string[] = [];
    
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        
        const fullPath = path.join(dirPath, entry.name);
        
        // Check if it looks like a project
        const hasPackageJson = fs.existsSync(path.join(fullPath, 'package.json'));
        const hasFeatureList = fs.existsSync(path.join(fullPath, 'feature_list.json'));
        const hasGit = fs.existsSync(path.join(fullPath, '.git'));
        
        if (hasPackageJson || hasFeatureList || hasGit) {
          projectPaths.push(fullPath);
        } else if (depth > 1) {
          projectPaths.push(...this.scanDirectory(fullPath, depth - 1));
        }
      }
    } catch (error) {
      console.error('Failed to scan directory:', error);
    }
    
    return projectPaths;
  }
}

// Singleton
let instance: ProjectManagerService | null = null;

export function getProjectManager(): ProjectManagerService {
  if (!instance) {
    instance = new ProjectManagerService();
  }
  return instance;
}

export { ProjectManagerService };
