/**
 * Git Service
 * ===========
 * 
 * Provides Git repository integration for tracking commits,
 * branches, and changes made by the agent harness.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

export interface GitCommit {
  sha: string;
  shortSha: string;
  message: string;
  body?: string;
  author: {
    name: string;
    email: string;
    date: Date;
  };
  committer: {
    name: string;
    email: string;
    date: Date;
  };
  stats?: {
    filesChanged: number;
    additions: number;
    deletions: number;
  };
  files?: GitFileChange[];
  isAgentCommit: boolean;
}

export interface GitFileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions?: number;
  deletions?: number;
  oldPath?: string; // For renames
}

export interface GitBranch {
  name: string;
  current: boolean;
  upstream?: string;
  aheadBehind?: { ahead: number; behind: number };
}

export interface GitStatus {
  branch: string;
  isClean: boolean;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
}

class GitService {
  private agentAuthorPatterns = [
    /claude/i,
    /agent/i,
    /harness/i,
    /automated/i,
    /\[auto\]/i,
  ];

  /**
   * Check if a path is a git repository
   */
  async isGitRepo(repoPath: string): Promise<boolean> {
    try {
      await execAsync('git rev-parse --is-inside-work-tree', { cwd: repoPath });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get commit history
   */
  async getCommits(repoPath: string, options: {
    limit?: number;
    branch?: string;
    since?: Date;
    until?: Date;
    author?: string;
  } = {}): Promise<GitCommit[]> {
    const { limit = 50, branch, since, until, author } = options;

    let command = `git log --format="%H|%h|%s|%an|%ae|%aI|%cn|%ce|%cI" -n ${limit}`;
    
    if (branch) command += ` ${branch}`;
    if (since) command += ` --since="${since.toISOString()}"`;
    if (until) command += ` --until="${until.toISOString()}"`;
    if (author) command += ` --author="${author}"`;

    try {
      const { stdout } = await execAsync(command, { cwd: repoPath });
      const lines = stdout.trim().split('\n').filter(Boolean);

      const commits: GitCommit[] = [];

      for (const line of lines) {
        const [sha, shortSha, message, authorName, authorEmail, authorDate, committerName, committerEmail, committerDate] = line.split('|');

        const commit: GitCommit = {
          sha,
          shortSha,
          message,
          author: {
            name: authorName,
            email: authorEmail,
            date: new Date(authorDate),
          },
          committer: {
            name: committerName,
            email: committerEmail,
            date: new Date(committerDate),
          },
          isAgentCommit: this.isAgentCommit(authorName, authorEmail, message),
        };

        commits.push(commit);
      }

      return commits;
    } catch (error) {
      console.error('Git log error:', error);
      return [];
    }
  }

  /**
   * Get detailed info for a single commit
   */
  async getCommitDetails(repoPath: string, sha: string): Promise<GitCommit | null> {
    try {
      // Get commit info
      const { stdout: infoOutput } = await execAsync(
        `git show --format="%H|%h|%s|%b|%an|%ae|%aI|%cn|%ce|%cI" --stat ${sha}`,
        { cwd: repoPath }
      );

      const lines = infoOutput.trim().split('\n');
      const firstLine = lines[0];
      const [sha_full, shortSha, message, body, authorName, authorEmail, authorDate, committerName, committerEmail, committerDate] = firstLine.split('|');

      // Parse stats from --stat output
      const statsLine = lines.find(l => l.match(/\d+ files? changed/));
      let stats = { filesChanged: 0, additions: 0, deletions: 0 };
      
      if (statsLine) {
        const filesMatch = statsLine.match(/(\d+) files? changed/);
        const addMatch = statsLine.match(/(\d+) insertions?\(\+\)/);
        const delMatch = statsLine.match(/(\d+) deletions?\(-\)/);
        
        stats = {
          filesChanged: filesMatch ? parseInt(filesMatch[1]) : 0,
          additions: addMatch ? parseInt(addMatch[1]) : 0,
          deletions: delMatch ? parseInt(delMatch[1]) : 0,
        };
      }

      // Get changed files
      const { stdout: filesOutput } = await execAsync(
        `git diff-tree --no-commit-id --name-status -r ${sha}`,
        { cwd: repoPath }
      );

      const files: GitFileChange[] = filesOutput.trim().split('\n').filter(Boolean).map(line => {
        const [status, ...pathParts] = line.split('\t');
        const filePath = pathParts.join('\t');
        
        const statusMap: Record<string, GitFileChange['status']> = {
          'A': 'added',
          'M': 'modified',
          'D': 'deleted',
          'R': 'renamed',
        };

        return {
          path: filePath,
          status: statusMap[status.charAt(0)] || 'modified',
        };
      });

      return {
        sha: sha_full,
        shortSha,
        message,
        body: body || undefined,
        author: {
          name: authorName,
          email: authorEmail,
          date: new Date(authorDate),
        },
        committer: {
          name: committerName,
          email: committerEmail,
          date: new Date(committerDate),
        },
        stats,
        files,
        isAgentCommit: this.isAgentCommit(authorName, authorEmail, message),
      };
    } catch (error) {
      console.error('Git show error:', error);
      return null;
    }
  }

  /**
   * Get current branch info
   */
  async getCurrentBranch(repoPath: string): Promise<string> {
    try {
      const { stdout } = await execAsync('git branch --show-current', { cwd: repoPath });
      return stdout.trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get all branches
   */
  async getBranches(repoPath: string): Promise<GitBranch[]> {
    try {
      const { stdout } = await execAsync(
        'git branch -a --format="%(refname:short)|%(HEAD)|%(upstream:short)"',
        { cwd: repoPath }
      );

      return stdout.trim().split('\n').filter(Boolean).map(line => {
        const [name, head, upstream] = line.split('|');
        return {
          name,
          current: head === '*',
          upstream: upstream || undefined,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Get repository status
   */
  async getStatus(repoPath: string): Promise<GitStatus> {
    try {
      const branch = await this.getCurrentBranch(repoPath);
      
      const { stdout } = await execAsync('git status --porcelain', { cwd: repoPath });
      const lines = stdout.trim().split('\n').filter(Boolean);

      const staged: GitFileChange[] = [];
      const unstaged: GitFileChange[] = [];
      const untracked: string[] = [];

      for (const line of lines) {
        const indexStatus = line.charAt(0);
        const workStatus = line.charAt(1);
        const filePath = line.substring(3);

        if (indexStatus === '?' && workStatus === '?') {
          untracked.push(filePath);
        } else {
          if (indexStatus !== ' ' && indexStatus !== '?') {
            staged.push({
              path: filePath,
              status: this.parseStatusChar(indexStatus),
            });
          }
          if (workStatus !== ' ' && workStatus !== '?') {
            unstaged.push({
              path: filePath,
              status: this.parseStatusChar(workStatus),
            });
          }
        }
      }

      return {
        branch,
        isClean: lines.length === 0,
        staged,
        unstaged,
        untracked,
      };
    } catch {
      return {
        branch: 'unknown',
        isClean: true,
        staged: [],
        unstaged: [],
        untracked: [],
      };
    }
  }

  /**
   * Get diff for a file
   */
  async getFileDiff(repoPath: string, filePath: string, staged = false): Promise<string> {
    try {
      const command = staged
        ? `git diff --cached -- "${filePath}"`
        : `git diff -- "${filePath}"`;
      
      const { stdout } = await execAsync(command, { cwd: repoPath });
      return stdout;
    } catch {
      return '';
    }
  }

  /**
   * Get commit count statistics
   */
  async getCommitStats(repoPath: string, since?: Date): Promise<{
    total: number;
    byAuthor: Record<string, number>;
    agentCommits: number;
    userCommits: number;
  }> {
    try {
      let command = 'git log --format="%an|%ae|%s"';
      if (since) command += ` --since="${since.toISOString()}"`;

      const { stdout } = await execAsync(command, { cwd: repoPath });
      const lines = stdout.trim().split('\n').filter(Boolean);

      const byAuthor: Record<string, number> = {};
      let agentCommits = 0;
      let userCommits = 0;

      for (const line of lines) {
        const [name, email, message] = line.split('|');
        byAuthor[name] = (byAuthor[name] || 0) + 1;
        
        if (this.isAgentCommit(name, email, message)) {
          agentCommits++;
        } else {
          userCommits++;
        }
      }

      return {
        total: lines.length,
        byAuthor,
        agentCommits,
        userCommits,
      };
    } catch {
      return {
        total: 0,
        byAuthor: {},
        agentCommits: 0,
        userCommits: 0,
      };
    }
  }

  /**
   * Check if commit is from an agent
   */
  private isAgentCommit(authorName: string, authorEmail: string, message: string): boolean {
    const combined = `${authorName} ${authorEmail} ${message}`;
    return this.agentAuthorPatterns.some(pattern => pattern.test(combined));
  }

  /**
   * Parse git status character
   */
  private parseStatusChar(char: string): GitFileChange['status'] {
    switch (char) {
      case 'A': return 'added';
      case 'M': return 'modified';
      case 'D': return 'deleted';
      case 'R': return 'renamed';
      default: return 'modified';
    }
  }
}

// Singleton
let instance: GitService | null = null;

export function getGitService(): GitService {
  if (!instance) {
    instance = new GitService();
  }
  return instance;
}

export { GitService };
