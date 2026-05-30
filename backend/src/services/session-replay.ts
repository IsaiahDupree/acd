/**
 * Session Replay Service
 * ======================
 * 
 * Records and replays agent harness sessions for debugging.
 * Captures events, tool calls, file changes, and allows step-through replay.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

export interface SessionEvent {
  id: string;
  timestamp: Date;
  type: 'tool_call' | 'tool_result' | 'message' | 'file_change' | 'error' | 'checkpoint' | 'approval' | 'test_run';
  data: {
    tool?: string;
    args?: Record<string, any>;
    result?: any;
    message?: string;
    file?: string;
    diff?: string;
    error?: string;
    [key: string]: any;
  };
  duration?: number;
}

export interface SessionRecording {
  id: string;
  projectId: string;
  sessionNumber: number;
  type: 'initializer' | 'coding';
  status: 'recording' | 'completed' | 'error';
  events: SessionEvent[];
  metadata: {
    startedAt: Date;
    endedAt?: Date;
    duration?: number;
    featuresAttempted: string[];
    featuresCompleted: string[];
    errorCount: number;
    toolCallCount: number;
    fileChanges: number;
  };
  summary?: {
    totalEvents: number;
    eventsByType: Record<string, number>;
    timeline: { time: number; event: string }[];
  };
}

export interface ReplayState {
  recordingId: string;
  currentIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
  filters: {
    eventTypes?: SessionEvent['type'][];
    searchText?: string;
  };
}

class SessionReplayService extends EventEmitter {
  private recordings: Map<string, SessionRecording> = new Map();
  private activeRecordings: Map<string, string> = new Map(); // projectId -> recordingId
  private replayStates: Map<string, ReplayState> = new Map();
  private storageDir: string;

  constructor(storageDir = './session-recordings') {
    super();
    this.storageDir = storageDir;
    this.ensureStorageDir();
  }

  private ensureStorageDir() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * Start recording a new session
   */
  startRecording(
    projectId: string,
    sessionNumber: number,
    type: 'initializer' | 'coding'
  ): SessionRecording {
    const id = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const recording: SessionRecording = {
      id,
      projectId,
      sessionNumber,
      type,
      status: 'recording',
      events: [],
      metadata: {
        startedAt: new Date(),
        featuresAttempted: [],
        featuresCompleted: [],
        errorCount: 0,
        toolCallCount: 0,
        fileChanges: 0,
      },
    };
    
    this.recordings.set(id, recording);
    this.activeRecordings.set(projectId, id);
    
    this.emit('recording:started', recording);
    
    return recording;
  }

  /**
   * Record an event
   */
  recordEvent(
    projectId: string,
    type: SessionEvent['type'],
    data: SessionEvent['data'],
    duration?: number
  ): SessionEvent | null {
    const recordingId = this.activeRecordings.get(projectId);
    if (!recordingId) return null;
    
    const recording = this.recordings.get(recordingId);
    if (!recording || recording.status !== 'recording') return null;
    
    const event: SessionEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      type,
      data,
      duration,
    };
    
    recording.events.push(event);
    
    // Update metadata
    if (type === 'tool_call') recording.metadata.toolCallCount++;
    if (type === 'error') recording.metadata.errorCount++;
    if (type === 'file_change') recording.metadata.fileChanges++;
    
    this.emit('event:recorded', { recordingId, event });
    
    return event;
  }

  /**
   * Stop recording
   */
  stopRecording(projectId: string, status: 'completed' | 'error' = 'completed'): SessionRecording | null {
    const recordingId = this.activeRecordings.get(projectId);
    if (!recordingId) return null;
    
    const recording = this.recordings.get(recordingId);
    if (!recording) return null;
    
    recording.status = status;
    recording.metadata.endedAt = new Date();
    recording.metadata.duration = recording.metadata.endedAt.getTime() - recording.metadata.startedAt.getTime();
    
    // Generate summary
    recording.summary = this.generateSummary(recording);
    
    this.activeRecordings.delete(projectId);
    
    // Save to disk
    this.saveRecording(recording);
    
    this.emit('recording:stopped', recording);
    
    return recording;
  }

  /**
   * Generate summary for a recording
   */
  private generateSummary(recording: SessionRecording): SessionRecording['summary'] {
    const eventsByType: Record<string, number> = {};
    const timeline: { time: number; event: string }[] = [];
    
    const startTime = recording.metadata.startedAt.getTime();
    
    for (const event of recording.events) {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      
      timeline.push({
        time: event.timestamp.getTime() - startTime,
        event: event.type,
      });
    }
    
    return {
      totalEvents: recording.events.length,
      eventsByType,
      timeline,
    };
  }

  /**
   * Save recording to disk
   */
  private saveRecording(recording: SessionRecording): void {
    const filename = `${recording.id}.json`;
    const filepath = path.join(this.storageDir, recording.projectId);
    
    if (!fs.existsSync(filepath)) {
      fs.mkdirSync(filepath, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(filepath, filename),
      JSON.stringify(recording, null, 2)
    );
  }

  /**
   * Load recording from disk
   */
  loadRecording(recordingId: string, projectId: string): SessionRecording | null {
    const filename = `${recordingId}.json`;
    const filepath = path.join(this.storageDir, projectId, filename);
    
    if (!fs.existsSync(filepath)) return null;
    
    const data = fs.readFileSync(filepath, 'utf-8');
    const recording = JSON.parse(data) as SessionRecording;
    
    // Restore dates
    recording.metadata.startedAt = new Date(recording.metadata.startedAt);
    if (recording.metadata.endedAt) {
      recording.metadata.endedAt = new Date(recording.metadata.endedAt);
    }
    recording.events.forEach(e => {
      e.timestamp = new Date(e.timestamp);
    });
    
    this.recordings.set(recordingId, recording);
    return recording;
  }

  /**
   * Get a recording
   */
  getRecording(recordingId: string): SessionRecording | undefined {
    return this.recordings.get(recordingId);
  }

  /**
   * Get recordings for a project
   */
  getRecordings(projectId: string): SessionRecording[] {
    // Check memory first
    const memoryRecordings = Array.from(this.recordings.values())
      .filter(r => r.projectId === projectId);
    
    // Check disk
    const diskPath = path.join(this.storageDir, projectId);
    if (fs.existsSync(diskPath)) {
      const files = fs.readdirSync(diskPath).filter(f => f.endsWith('.json'));
      
      for (const file of files) {
        const recordingId = file.replace('.json', '');
        if (!this.recordings.has(recordingId)) {
          this.loadRecording(recordingId, projectId);
        }
      }
    }
    
    return Array.from(this.recordings.values())
      .filter(r => r.projectId === projectId)
      .sort((a, b) => b.metadata.startedAt.getTime() - a.metadata.startedAt.getTime());
  }

  /**
   * Start replay mode
   */
  startReplay(recordingId: string): ReplayState | null {
    const recording = this.recordings.get(recordingId);
    if (!recording) return null;
    
    const state: ReplayState = {
      recordingId,
      currentIndex: 0,
      isPlaying: false,
      playbackSpeed: 1,
      filters: {},
    };
    
    this.replayStates.set(recordingId, state);
    this.emit('replay:started', { recordingId, state });
    
    return state;
  }

  /**
   * Get filtered events for replay
   */
  getFilteredEvents(recordingId: string): SessionEvent[] {
    const recording = this.recordings.get(recordingId);
    const state = this.replayStates.get(recordingId);
    
    if (!recording || !state) return [];
    
    let events = recording.events;
    
    if (state.filters.eventTypes && state.filters.eventTypes.length > 0) {
      events = events.filter(e => state.filters.eventTypes!.includes(e.type));
    }
    
    if (state.filters.searchText) {
      const searchLower = state.filters.searchText.toLowerCase();
      events = events.filter(e => 
        JSON.stringify(e.data).toLowerCase().includes(searchLower)
      );
    }
    
    return events;
  }

  /**
   * Step through replay
   */
  stepReplay(recordingId: string, direction: 'forward' | 'backward' = 'forward'): SessionEvent | null {
    const state = this.replayStates.get(recordingId);
    if (!state) return null;
    
    const events = this.getFilteredEvents(recordingId);
    
    if (direction === 'forward' && state.currentIndex < events.length - 1) {
      state.currentIndex++;
    } else if (direction === 'backward' && state.currentIndex > 0) {
      state.currentIndex--;
    }
    
    const currentEvent = events[state.currentIndex];
    this.emit('replay:step', { recordingId, event: currentEvent, index: state.currentIndex });
    
    return currentEvent;
  }

  /**
   * Jump to specific event
   */
  jumpToEvent(recordingId: string, index: number): SessionEvent | null {
    const state = this.replayStates.get(recordingId);
    if (!state) return null;
    
    const events = this.getFilteredEvents(recordingId);
    
    if (index >= 0 && index < events.length) {
      state.currentIndex = index;
      const currentEvent = events[index];
      this.emit('replay:jump', { recordingId, event: currentEvent, index });
      return currentEvent;
    }
    
    return null;
  }

  /**
   * Set replay filters
   */
  setFilters(recordingId: string, filters: ReplayState['filters']): void {
    const state = this.replayStates.get(recordingId);
    if (!state) return;
    
    state.filters = filters;
    state.currentIndex = 0;
    this.emit('replay:filters', { recordingId, filters });
  }

  /**
   * Get replay state
   */
  getReplayState(recordingId: string): ReplayState | undefined {
    return this.replayStates.get(recordingId);
  }

  /**
   * Stop replay
   */
  stopReplay(recordingId: string): void {
    this.replayStates.delete(recordingId);
    this.emit('replay:stopped', { recordingId });
  }

  /**
   * Export recording for debugging
   */
  exportRecording(recordingId: string, format: 'json' | 'markdown' = 'json'): string | null {
    const recording = this.recordings.get(recordingId);
    if (!recording) return null;
    
    if (format === 'json') {
      return JSON.stringify(recording, null, 2);
    }
    
    // Markdown format
    let md = `# Session Recording: ${recording.id}\n\n`;
    md += `**Project:** ${recording.projectId}\n`;
    md += `**Session:** #${recording.sessionNumber} (${recording.type})\n`;
    md += `**Status:** ${recording.status}\n`;
    md += `**Started:** ${recording.metadata.startedAt.toISOString()}\n`;
    if (recording.metadata.endedAt) {
      md += `**Ended:** ${recording.metadata.endedAt.toISOString()}\n`;
      md += `**Duration:** ${Math.round(recording.metadata.duration! / 1000)}s\n`;
    }
    md += `\n## Summary\n\n`;
    md += `- Total Events: ${recording.events.length}\n`;
    md += `- Tool Calls: ${recording.metadata.toolCallCount}\n`;
    md += `- Errors: ${recording.metadata.errorCount}\n`;
    md += `- File Changes: ${recording.metadata.fileChanges}\n`;
    md += `\n## Events\n\n`;
    
    for (const event of recording.events) {
      md += `### ${event.timestamp.toISOString()} - ${event.type}\n`;
      md += `\`\`\`json\n${JSON.stringify(event.data, null, 2)}\n\`\`\`\n\n`;
    }
    
    return md;
  }

  /**
   * Get active recording for a project
   */
  getActiveRecording(projectId: string): SessionRecording | null {
    const recordingId = this.activeRecordings.get(projectId);
    if (!recordingId) return null;
    return this.recordings.get(recordingId) || null;
  }
}

// Singleton
let instance: SessionReplayService | null = null;

export function getSessionReplay(): SessionReplayService {
  if (!instance) {
    instance = new SessionReplayService();
  }
  return instance;
}

export { SessionReplayService };
