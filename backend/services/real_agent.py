"""
Real Claude Agent Implementation
================================

This module integrates the actual Claude Agent SDK from Anthropic's
autonomous-coding quickstart pattern.

Usage:
    from real_agent import RealAgentHarness
    
    harness = RealAgentHarness(project_dir, publisher)
    await harness.run()
"""

import asyncio
import json
import os
from pathlib import Path
from typing import Optional, Dict, Any
from dataclasses import dataclass

# Import Claude Agent SDK (when available)
try:
    from claude_code_sdk import ClaudeSDKClient
    CLAUDE_SDK_AVAILABLE = True
except ImportError:
    CLAUDE_SDK_AVAILABLE = False
    print("Warning: claude_code_sdk not installed. Using mock mode.")

# ============================================
# PROMPTS (from autonomous-coding quickstart)
# ============================================

INITIALIZER_PROMPT = """You are an expert software engineer tasked with building a complete application from scratch.

You have access to:
- app_spec.txt: The complete specification for what to build
- File system tools to create and modify files
- Shell/bash for running commands
- Git for version control

Your goal for this FIRST SESSION:
1. Read app_spec.txt carefully
2. Create feature_list.json with ~200 individual test cases/features
3. Set up the project structure (package.json, tsconfig, etc)
4. Create init.sh that installs dependencies and runs tests
5. Initialize git and make the first commit

The feature_list.json format should be:
[
  {"id": 1, "name": "Feature name", "description": "What to test", "passes": false},
  ...
]

Start by reading the app_spec.txt file, then proceed systematically."""

CODING_PROMPT = """You are continuing work on an application. Previous sessions have made progress.

Your artifacts:
- app_spec.txt: The spec (read if needed)
- feature_list.json: The features/tests (this is your source of truth)
- claude-progress.txt: Notes from previous sessions

Your workflow for THIS SESSION:
1. Run init.sh to see current test status
2. Read feature_list.json to find the next failing feature
3. Implement the feature
4. Update tests to pass
5. Run init.sh again to verify
6. Update feature_list.json marking the feature as passes: true
7. Commit your changes with a descriptive message
8. Note your progress in claude-progress.txt

Continue until all tests pass or you've made good progress."""

# ============================================
# SECURITY HOOK (from autonomous-coding quickstart)
# ============================================

ALLOWED_COMMANDS = {
    # File inspection
    'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'find',
    # Node.js
    'npm', 'node', 'npx',
    # Version control
    'git',
    # Process management (limited)
    'ps', 'lsof', 'sleep', 'pkill',
    # Build tools
    'tsc', 'vite', 'webpack',
}

def validate_bash_command(command: str) -> tuple[bool, str]:
    """Validate that a bash command is in the allowlist."""
    # Extract the base command
    parts = command.strip().split()
    if not parts:
        return False, "Empty command"
    
    base_cmd = parts[0]
    
    # Check direct match
    if base_cmd in ALLOWED_COMMANDS:
        return True, ""
    
    # Check if it's a path to an allowed command
    if '/' in base_cmd:
        base_cmd = base_cmd.split('/')[-1]
        if base_cmd in ALLOWED_COMMANDS:
            return True, ""
    
    return False, f"Command '{base_cmd}' not in allowlist. Allowed: {', '.join(sorted(ALLOWED_COMMANDS))}"

# ============================================
# SDK CLIENT FACTORY
# ============================================

def create_claude_client(
    project_dir: Path,
    model: str = "claude-sonnet-4-5-20250929"
) -> Optional[Any]:
    """Create a Claude SDK client with security hooks."""
    if not CLAUDE_SDK_AVAILABLE:
        return None
    
    # Try to get API key from environment or Claude Code
    api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("CLAUDE_CODE_OAUTH_TOKEN")
    if not api_key:
        # Try to source from Claude Code desktop app
        import subprocess
        try:
            script_path = Path(__file__).parent.parent.parent / "scripts" / "get-claude-key.sh"
            if script_path.exists():
                result = subprocess.run(
                    ["bash", str(script_path)],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0 and result.stdout.strip():
                    api_key = result.stdout.strip()
        except Exception:
            pass
    
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN environment variable not set, and could not source from Claude Code")
    
    # Security settings
    security_settings = {
        "allowed_commands": list(ALLOWED_COMMANDS),
        "working_directory": str(project_dir),
        "sandbox": True,
    }
    
    # Create client with security hook
    client = ClaudeSDKClient(
        api_key=api_key,
        model=model,
        cwd=str(project_dir),
        security_hook=lambda cmd: validate_bash_command(cmd),
        settings=security_settings,
    )
    
    return client

# ============================================
# REAL AGENT HARNESS
# ============================================

class RealAgentHarness:
    """
    Real implementation using Claude Agent SDK.
    
    This replaces the simulation with actual Claude API calls.
    """
    
    def __init__(
        self,
        run_id: str,
        project_id: str,
        project_dir: Path,
        publisher: Any,  # EventPublisher
        model: str = "claude-sonnet-4-5-20250929",
        max_iterations: Optional[int] = None,
        app_spec_content: Optional[str] = None
    ):
        self.run_id = run_id
        self.project_id = project_id
        self.project_dir = project_dir
        self.publisher = publisher
        self.model = model
        self.max_iterations = max_iterations
        self.app_spec_content = app_spec_content
        self.step = 0
        self.features_completed = 0
        self.commits_made = 0
    
    async def emit(self, event_type: str, data: Dict[str, Any]):
        """Emit event to subscribers."""
        from agent_orchestrator import AgentEvent, EventType
        
        self.step += 1
        event = AgentEvent(
            event_type=EventType(event_type),
            run_id=self.run_id,
            project_id=self.project_id,
            step=self.step,
            data=data
        )
        await self.publisher.publish(event)
    
    def is_first_run(self) -> bool:
        """Check if feature_list.json exists."""
        return not (self.project_dir / "feature_list.json").exists()
    
    def get_progress(self) -> Dict[str, Any]:
        """Read progress from feature_list.json."""
        feature_list = self.project_dir / "feature_list.json"
        if not feature_list.exists():
            return {"total": 0, "passing": 0, "pending": 0}
        
        try:
            with open(feature_list) as f:
                data = json.load(f)
            
            features = data if isinstance(data, list) else data.get("features", [])
            total = len(features)
            passing = sum(1 for f in features if f.get("passes", False))
            
            return {"total": total, "passing": passing, "pending": total - passing}
        except Exception:
            return {"total": 0, "passing": 0, "pending": 0}
    
    async def setup_project(self):
        """Initialize project directory with app_spec.txt."""
        self.project_dir.mkdir(parents=True, exist_ok=True)
        
        if self.app_spec_content:
            spec_path = self.project_dir / "app_spec.txt"
            with open(spec_path, "w") as f:
                f.write(self.app_spec_content)
            
            await self.emit("status", {
                "status": "setup",
                "message": "Created app_spec.txt"
            })
    
    async def run_agent_session(
        self,
        prompt: str,
        session_number: int
    ) -> tuple[str, str]:
        """Run a single agent session with Claude SDK."""
        
        if not CLAUDE_SDK_AVAILABLE:
            # Fall back to simulation
            await self.emit("status", {
                "status": "simulating",
                "message": "Claude SDK not available, using simulation"
            })
            return await self._simulate_session(prompt, session_number)
        
        # Create client
        client = create_claude_client(self.project_dir, self.model)
        if not client:
            raise RuntimeError("Failed to create Claude client")
        
        await self.emit("status", {
            "status": "running",
            "session": session_number,
            "message": "Sending prompt to Claude..."
        })
        
        try:
            # Send prompt
            await client.query(prompt)
            
            response_text = ""
            
            # Process response stream
            async for msg in client.receive_response():
                msg_type = type(msg).__name__
                
                # Handle assistant messages
                if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                    for block in msg.content:
                        block_type = type(block).__name__
                        
                        if block_type == "TextBlock" and hasattr(block, "text"):
                            response_text += block.text
                            await self.emit("message", {"text": block.text})
                        
                        elif block_type == "ToolUseBlock" and hasattr(block, "name"):
                            tool_input = str(block.input)[:200] if hasattr(block, "input") else ""
                            await self.emit("tool_call", {
                                "name": block.name,
                                "input": tool_input
                            })
                
                # Handle tool results
                elif msg_type == "UserMessage" and hasattr(msg, "content"):
                    for block in msg.content:
                        if type(block).__name__ == "ToolResultBlock":
                            result = str(getattr(block, "content", ""))[:500]
                            is_error = getattr(block, "is_error", False)
                            
                            if "blocked" in result.lower():
                                await self.emit("tool_result", {
                                    "blocked": True,
                                    "output": result
                                })
                            elif is_error:
                                await self.emit("error", {"output": result})
                            else:
                                await self.emit("tool_result", {"output": "Done"})
            
            return "continue", response_text
            
        except Exception as e:
            await self.emit("error", {
                "message": str(e),
                "type": type(e).__name__
            })
            return "error", str(e)
        
        finally:
            await client.close()
    
    async def _simulate_session(self, prompt: str, session_number: int) -> tuple[str, str]:
        """Fallback simulation when SDK not available."""
        # Import from main orchestrator
        from agent_orchestrator import AgentHarness
        
        # Use the existing simulation logic
        mock_harness = AgentHarness(
            run_id=self.run_id,
            project_id=self.project_id,
            project_dir=self.project_dir,
            publisher=self.publisher,
            model=self.model,
            max_iterations=1  # Just one iteration
        )
        
        if "first session" in prompt.lower() or "initializer" in prompt.lower():
            await mock_harness._simulate_initializer()
        else:
            await mock_harness._run_coding_session(session_number)
        
        self.features_completed = mock_harness.features_completed
        self.commits_made = mock_harness.commits_made
        
        return "continue", ""
    
    async def run(self):
        """Main entry point - runs the full agent loop."""
        await self.setup_project()
        
        is_first = self.is_first_run()
        session = 0
        
        while True:
            session += 1
            
            # Check iteration limit
            if self.max_iterations and session > self.max_iterations:
                await self.emit("status", {
                    "status": "paused",
                    "message": f"Reached max iterations ({self.max_iterations})"
                })
                break
            
            # Check if all passing
            progress = self.get_progress()
            if progress["pending"] == 0 and progress["total"] > 0:
                await self.emit("complete", {
                    "message": "All features passing!",
                    "featuresCompleted": self.features_completed,
                    "commitsMade": self.commits_made,
                    "progress": progress
                })
                break
            
            # Choose prompt
            if is_first and session == 1:
                prompt = INITIALIZER_PROMPT
            else:
                prompt = CODING_PROMPT
            
            await self.emit("status", {
                "status": "running",
                "session": session,
                "progress": progress,
                "isInitializer": is_first and session == 1
            })
            
            # Run session
            status, response = await self.run_agent_session(prompt, session)
            
            if status == "error":
                await self.emit("status", {
                    "status": "error",
                    "message": "Session failed, will retry..."
                })
                await asyncio.sleep(3)
                continue
            
            # Auto-continue delay
            await self.emit("status", {
                "status": "continuing",
                "message": f"Session {session} complete, continuing in 3s..."
            })
            await asyncio.sleep(3)
        
        await self.emit("status", {
            "status": "complete",
            "totalSessions": session,
            "progress": self.get_progress()
        })
