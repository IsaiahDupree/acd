"""
Agent Orchestrator - Core Python Service
=========================================

This service wraps the Anthropic autonomous-coding quickstart and exposes it
as a job-based system with real-time event streaming.

Usage:
    # As FastAPI server
    uvicorn agent_orchestrator:app --host 0.0.0.0 --port 8000
    
    # Or run worker directly
    python agent_orchestrator.py worker
"""

import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, AsyncGenerator
from dataclasses import dataclass, asdict
from enum import Enum
import uuid

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import redis.asyncio as redis

# ============================================
# CONFIGURATION
# ============================================

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
GENERATIONS_DIR = Path(os.getenv("GENERATIONS_DIR", "./generations"))
DEFAULT_MODEL = "claude-sonnet-4-5-20250929"

# ============================================
# DATA MODELS
# ============================================

class AgentType(str, Enum):
    INITIALIZER = "initializer"
    CODING = "coding"
    PLANNER = "planner"
    QA = "qa"

class RunStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class EventType(str, Enum):
    STATUS = "status"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    MESSAGE = "message"
    FEATURE = "feature"
    COMMIT = "commit"
    TEST = "test"
    ERROR = "error"
    COMPLETE = "complete"

@dataclass
class AgentEvent:
    """Event emitted during agent execution."""
    event_type: EventType
    run_id: str
    project_id: str
    step: int
    data: Dict[str, Any]
    timestamp: str = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow().isoformat()
    
    def to_dict(self):
        return {
            "event": self.event_type.value,
            "runId": self.run_id,
            "projectId": self.project_id,
            "step": self.step,
            "data": self.data,
            "timestamp": self.timestamp
        }

class StartRunRequest(BaseModel):
    project_id: str
    agent_type: AgentType = AgentType.CODING
    target_feature_id: Optional[str] = None
    model: str = DEFAULT_MODEL
    max_iterations: Optional[int] = None
    app_spec_content: Optional[str] = None  # For new projects

class RunResponse(BaseModel):
    run_id: str
    project_id: str
    status: RunStatus
    agent_type: AgentType

# ============================================
# REDIS PUB/SUB FOR EVENTS
# ============================================

class EventPublisher:
    """Publishes agent events to Redis for real-time streaming."""
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
    
    async def publish(self, event: AgentEvent):
        """Publish event to Redis channel."""
        channel = f"agent:events:{event.project_id}"
        await self.redis.publish(channel, json.dumps(event.to_dict()))
        
        # Also store in a list for late subscribers
        await self.redis.lpush(
            f"agent:history:{event.run_id}", 
            json.dumps(event.to_dict())
        )
        await self.redis.expire(f"agent:history:{event.run_id}", 3600)  # 1 hour TTL

class EventSubscriber:
    """Subscribes to agent events for a project."""
    
    def __init__(self, redis_client: redis.Redis, project_id: str):
        self.redis = redis_client
        self.project_id = project_id
        self.pubsub = None
    
    async def subscribe(self) -> AsyncGenerator[AgentEvent, None]:
        """Yield events as they arrive."""
        self.pubsub = self.redis.pubsub()
        channel = f"agent:events:{self.project_id}"
        await self.pubsub.subscribe(channel)
        
        try:
            async for message in self.pubsub.listen():
                if message["type"] == "message":
                    data = json.loads(message["data"])
                    yield data
        finally:
            await self.pubsub.unsubscribe(channel)

# ============================================
# AGENT HARNESS WRAPPER
# ============================================

class AgentHarness:
    """
    Wraps the autonomous-coding quickstart logic.
    
    This is the core that runs Claude Agent SDK sessions
    and emits events for each action.
    """
    
    def __init__(
        self,
        run_id: str,
        project_id: str,
        project_dir: Path,
        publisher: EventPublisher,
        model: str = DEFAULT_MODEL,
        max_iterations: Optional[int] = None
    ):
        self.run_id = run_id
        self.project_id = project_id
        self.project_dir = project_dir
        self.publisher = publisher
        self.model = model
        self.max_iterations = max_iterations
        self.step = 0
        self.status = RunStatus.QUEUED
        self.features_completed = 0
        self.commits_made = 0
    
    async def emit(self, event_type: EventType, data: Dict[str, Any]):
        """Emit an event."""
        self.step += 1
        event = AgentEvent(
            event_type=event_type,
            run_id=self.run_id,
            project_id=self.project_id,
            step=self.step,
            data=data
        )
        await self.publisher.publish(event)
    
    def is_first_run(self) -> bool:
        """Check if this is an initializer run."""
        feature_list = self.project_dir / "feature_list.json"
        return not feature_list.exists()
    
    def get_progress(self) -> Dict[str, Any]:
        """Read progress from feature_list.json."""
        feature_list = self.project_dir / "feature_list.json"
        if not feature_list.exists():
            return {"total": 0, "passing": 0, "pending": 0}
        
        try:
            with open(feature_list) as f:
                data = json.load(f)
            
            if isinstance(data, list):
                total = len(data)
                passing = sum(1 for f in data if f.get("passes", False))
            else:
                total = data.get("total", 0)
                passing = data.get("passing", 0)
            
            return {
                "total": total,
                "passing": passing,
                "pending": total - passing
            }
        except Exception:
            return {"total": 0, "passing": 0, "pending": 0}
    
    async def run_initializer(self):
        """Run the initializer agent (Session 1)."""
        await self.emit(EventType.STATUS, {
            "status": "initializing",
            "message": "Starting initializer agent..."
        })
        
        # In production, this would call the actual Claude Agent SDK
        # For now, simulate the initializer process
        await self._simulate_initializer()
    
    async def run_coding_loop(self):
        """Run the coding agent loop (Sessions 2+)."""
        session = 1
        
        while True:
            if self.max_iterations and session > self.max_iterations:
                await self.emit(EventType.STATUS, {
                    "status": "paused",
                    "message": f"Reached max iterations ({self.max_iterations})"
                })
                break
            
            progress = self.get_progress()
            if progress["pending"] == 0 and progress["total"] > 0:
                await self.emit(EventType.COMPLETE, {
                    "message": "All features passing!",
                    "featuresCompleted": self.features_completed,
                    "commitsMade": self.commits_made,
                    "progress": progress
                })
                break
            
            await self.emit(EventType.STATUS, {
                "status": "running",
                "session": session,
                "progress": progress
            })
            
            # Run one coding session
            await self._run_coding_session(session)
            
            session += 1
            await asyncio.sleep(3)  # Auto-continue delay
    
    async def _simulate_initializer(self):
        """Simulate initializer for demo purposes."""
        steps = [
            ("tool_call", {"name": "bash", "input": "mkdir -p src tests"}),
            ("tool_result", {"output": "Created directories"}),
            ("tool_call", {"name": "write", "input": "Creating feature_list.json with 200 test cases..."}),
            ("tool_result", {"output": "Created feature_list.json"}),
            ("tool_call", {"name": "write", "input": "Creating init.sh..."}),
            ("tool_result", {"output": "Created init.sh"}),
            ("tool_call", {"name": "bash", "input": "git init && git add . && git commit -m 'Initial commit'"}),
            ("tool_result", {"output": "Initialized git repository"}),
        ]
        
        for event_type, data in steps:
            await asyncio.sleep(0.5)
            if event_type == "tool_call":
                await self.emit(EventType.TOOL_CALL, data)
            else:
                await self.emit(EventType.TOOL_RESULT, data)
        
        # Create mock feature_list.json
        feature_list = self.project_dir / "feature_list.json"
        self.project_dir.mkdir(parents=True, exist_ok=True)
        
        features = [
            {"id": i, "name": f"Feature {i}", "passes": False}
            for i in range(1, 201)
        ]
        
        with open(feature_list, "w") as f:
            json.dump(features, f, indent=2)
        
        await self.emit(EventType.STATUS, {
            "status": "initialized",
            "message": "Project initialized with 200 features",
            "progress": self.get_progress()
        })
    
    async def _run_coding_session(self, session: int):
        """Run a single coding session."""
        # Pick next failing feature
        progress = self.get_progress()
        next_feature = progress["passing"] + 1
        
        await self.emit(EventType.FEATURE, {
            "action": "started",
            "featureId": next_feature,
            "name": f"Feature {next_feature}"
        })
        
        # Simulate coding
        steps = [
            ("tool_call", {"name": "read", "input": f"Reading feature #{next_feature} requirements..."}),
            ("tool_result", {"output": "Requirements loaded"}),
            ("tool_call", {"name": "write", "input": f"Implementing feature #{next_feature}..."}),
            ("tool_result", {"output": "Implementation complete"}),
            ("tool_call", {"name": "bash", "input": "npm test"}),
        ]
        
        for event_type, data in steps:
            await asyncio.sleep(0.3)
            if event_type == "tool_call":
                await self.emit(EventType.TOOL_CALL, data)
            else:
                await self.emit(EventType.TOOL_RESULT, data)
        
        # Tests pass
        await self.emit(EventType.TEST, {
            "featureId": next_feature,
            "status": "passed",
            "duration": 1234
        })
        
        # Update feature_list.json
        feature_list = self.project_dir / "feature_list.json"
        with open(feature_list) as f:
            features = json.load(f)
        
        features[next_feature - 1]["passes"] = True
        
        with open(feature_list, "w") as f:
            json.dump(features, f, indent=2)
        
        # Commit
        commit_sha = uuid.uuid4().hex[:7]
        await self.emit(EventType.COMMIT, {
            "sha": commit_sha,
            "message": f"feat: implement feature #{next_feature}",
            "filesChanged": 3
        })
        
        self.features_completed += 1
        self.commits_made += 1
        
        await self.emit(EventType.FEATURE, {
            "action": "completed",
            "featureId": next_feature,
            "status": "passing"
        })
    
    async def run(self):
        """Main entry point."""
        try:
            self.status = RunStatus.RUNNING
            
            if self.is_first_run():
                await self.run_initializer()
            
            await self.run_coding_loop()
            
            self.status = RunStatus.COMPLETED
            
        except Exception as e:
            self.status = RunStatus.FAILED
            await self.emit(EventType.ERROR, {
                "message": str(e),
                "type": type(e).__name__
            })
            raise

# ============================================
# JOB QUEUE
# ============================================

class JobQueue:
    """Simple Redis-based job queue."""
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.queue_key = "agent:jobs:queue"
        self.running_key = "agent:jobs:running"
    
    async def enqueue(self, job: Dict[str, Any]) -> str:
        """Add job to queue."""
        job_id = str(uuid.uuid4())
        job["id"] = job_id
        job["status"] = "queued"
        job["created_at"] = datetime.utcnow().isoformat()
        
        await self.redis.lpush(self.queue_key, json.dumps(job))
        await self.redis.hset(f"agent:job:{job_id}", mapping={
            "data": json.dumps(job),
            "status": "queued"
        })
        
        return job_id
    
    async def dequeue(self) -> Optional[Dict[str, Any]]:
        """Get next job from queue."""
        result = await self.redis.brpop(self.queue_key, timeout=5)
        if result:
            _, job_data = result
            job = json.loads(job_data)
            await self.redis.hset(f"agent:job:{job['id']}", "status", "running")
            return job
        return None
    
    async def complete(self, job_id: str, status: str = "completed"):
        """Mark job as complete."""
        await self.redis.hset(f"agent:job:{job_id}", "status", status)
    
    async def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job by ID."""
        data = await self.redis.hgetall(f"agent:job:{job_id}")
        if data:
            return {
                "id": job_id,
                "status": data.get(b"status", b"unknown").decode(),
                "data": json.loads(data.get(b"data", b"{}"))
            }
        return None

# ============================================
# FASTAPI APPLICATION
# ============================================

app = FastAPI(
    title="Agent Orchestrator",
    description="Autonomous Coding Agent Service",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state (in production, use dependency injection)
redis_client: redis.Redis = None
job_queue: JobQueue = None
publisher: EventPublisher = None

@app.on_event("startup")
async def startup():
    global redis_client, job_queue, publisher
    redis_client = redis.from_url(REDIS_URL)
    job_queue = JobQueue(redis_client)
    publisher = EventPublisher(redis_client)

@app.on_event("shutdown")
async def shutdown():
    if redis_client:
        await redis_client.close()

# ============================================
# API ROUTES
# ============================================

@app.post("/api/agent-runs", response_model=RunResponse)
async def start_agent_run(request: StartRunRequest):
    """Start a new agent run."""
    run_id = str(uuid.uuid4())
    
    job = {
        "run_id": run_id,
        "project_id": request.project_id,
        "agent_type": request.agent_type.value,
        "target_feature_id": request.target_feature_id,
        "model": request.model,
        "max_iterations": request.max_iterations,
        "app_spec_content": request.app_spec_content
    }
    
    await job_queue.enqueue(job)
    
    # Emit initial status
    await publisher.publish(AgentEvent(
        event_type=EventType.STATUS,
        run_id=run_id,
        project_id=request.project_id,
        step=0,
        data={"status": "queued", "message": "Job queued"}
    ))
    
    return RunResponse(
        run_id=run_id,
        project_id=request.project_id,
        status=RunStatus.QUEUED,
        agent_type=request.agent_type
    )

@app.get("/api/agent-runs/{run_id}")
async def get_agent_run(run_id: str):
    """Get agent run status."""
    job = await job_queue.get_job(run_id)
    if not job:
        raise HTTPException(status_code=404, detail="Run not found")
    return job

@app.post("/api/agent-runs/{run_id}/stop")
async def stop_agent_run(run_id: str):
    """Stop a running agent."""
    # In production, this would signal the worker to stop
    await job_queue.complete(run_id, "cancelled")
    return {"status": "cancelled"}

@app.get("/api/agent-runs/{run_id}/events")
async def get_run_events(run_id: str):
    """Get historical events for a run."""
    events = await redis_client.lrange(f"agent:history:{run_id}", 0, -1)
    return [json.loads(e) for e in reversed(events)]

# ============================================
# WEBSOCKET FOR REAL-TIME EVENTS
# ============================================

@app.websocket("/ws/{project_id}")
async def websocket_endpoint(websocket: WebSocket, project_id: str):
    """WebSocket endpoint for real-time agent events."""
    await websocket.accept()
    
    subscriber = EventSubscriber(redis_client, project_id)
    
    try:
        async for event in subscriber.subscribe():
            await websocket.send_json(event)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")

# ============================================
# SERVER-SENT EVENTS (alternative)
# ============================================

from fastapi.responses import StreamingResponse

@app.get("/api/agent-runs/{run_id}/stream")
async def stream_events(run_id: str):
    """SSE endpoint for streaming agent events."""
    job = await job_queue.get_job(run_id)
    if not job:
        raise HTTPException(status_code=404, detail="Run not found")
    
    project_id = job["data"].get("project_id")
    
    async def event_generator():
        subscriber = EventSubscriber(redis_client, project_id)
        async for event in subscriber.subscribe():
            if event.get("runId") == run_id:
                yield f"event: {event['event']}\ndata: {json.dumps(event)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )

# ============================================
# WORKER PROCESS
# ============================================

async def run_worker():
    """Worker process that executes agent jobs."""
    global redis_client, job_queue, publisher
    
    redis_client = redis.from_url(REDIS_URL)
    job_queue = JobQueue(redis_client)
    publisher = EventPublisher(redis_client)
    
    print("Agent worker started, waiting for jobs...")
    
    while True:
        job = await job_queue.dequeue()
        if job is None:
            continue
        
        print(f"Processing job: {job['id']}")
        
        try:
            project_dir = GENERATIONS_DIR / job["project_id"]
            
            harness = AgentHarness(
                run_id=job["run_id"],
                project_id=job["project_id"],
                project_dir=project_dir,
                publisher=publisher,
                model=job.get("model", DEFAULT_MODEL),
                max_iterations=job.get("max_iterations")
            )
            
            await harness.run()
            await job_queue.complete(job["id"], "completed")
            
        except Exception as e:
            print(f"Job failed: {e}")
            await job_queue.complete(job["id"], "failed")

# ============================================
# MAIN
# ============================================

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "worker":
        asyncio.run(run_worker())
    else:
        import uvicorn
        uvicorn.run(app, host="0.0.0.0", port=8000)
