# Autonomous Coding Dashboard

A comprehensive Next.js dashboard for monitoring and controlling Claude autonomous coding agents.

## Features

- **Project Management**: View and manage all your autonomous coding projects
- **Real-time Monitoring**: Live updates on agent status, feature progress, and harness logs
- **Harness Control**: Start, stop, and configure agent harnesses
- **Usage Analytics**: Track costs, token usage, and session statistics
- **Feature Tracking**: Monitor feature completion progress with visual indicators
- **Recent Activity**: View recent agent actions and events

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local and set NEXT_PUBLIC_API_URL to your backend URL
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Open your browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## Backend Requirements

This dashboard requires the backend API to be running. Make sure:

1. The backend server is running on `http://localhost:3001` (or update `NEXT_PUBLIC_API_URL`)
2. The backend has the following endpoints available:
   - `/api/projects` - List and manage projects
   - `/api/projects/:id/harness/*` - Harness control
   - `/api/projects/:id/analytics` - Analytics data
   - `/api/projects/:id/costs` - Cost tracking
   - `/api/projects/:id/features` - Feature tracking
   - `/api/projects/:id/agent-runs` - Agent run history

## Usage

1. **Select a Project**: Click on any project card to view its details
2. **Start Harness**: Configure and start an autonomous coding harness
3. **Monitor Progress**: Watch feature completion and agent activity in real-time
4. **View Logs**: Check harness logs for detailed execution information
5. **Track Usage**: Monitor costs and token usage across sessions

## Components

- `ProjectCard`: Displays project summary and status
- `DashboardStats`: Shows overall statistics
- `HarnessControl`: Start/stop harness with configuration
- `AgentStatus`: Real-time agent and feature status
- `UsageChart`: Visual cost and usage breakdown
- `RecentActivity`: Timeline of recent events

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

## Integration with Claude Harness

The dashboard integrates with the Claude autonomous coding harness from:
https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding

Make sure you have:
1. Claude Code subscription
2. Claude CLI installed (`claude` command available)
3. Backend API running and configured

## License

MIT
