/**
 * Studio API Routes — APS-012
 *
 * Proxies all /api/studio/* requests to the studio-coordinator service
 * running on port 3434. This allows the backend to serve studio endpoints
 * alongside existing routes.
 *
 * Route prefix: /api/studio
 */

import { Router, Request, Response } from 'express';

const STUDIO_URL = process.env.STUDIO_URL || 'http://localhost:3434';

const router = Router();

// Health check
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const response = await fetch(`${STUDIO_URL}/api/studio/health`);
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(503).json({ ok: false, error: 'Studio coordinator not reachable' });
  }
});

// Generic proxy for all studio routes
const proxyToStudio = async (req: Request, res: Response) => {
  const studioPath = `/api/studio${req.path}`;
  const url = new URL(studioPath, STUDIO_URL);

  // Forward query params
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === 'string') url.searchParams.set(key, value);
  }

  try {
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (req.method === 'POST' && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(url.toString(), fetchOptions);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Studio coordinator unreachable', details: String(err) });
  }
};

// Signal routes
router.get('/signals', proxyToStudio);
router.post('/signals', proxyToStudio);

// Capability routes
router.get('/capabilities', proxyToStudio);
router.post('/capabilities/index', proxyToStudio);

// Opportunity routes
router.get('/opportunities', proxyToStudio);
router.post('/opportunities/generate', proxyToStudio);

// Decision routes
router.get('/decisions', proxyToStudio);
router.post('/decisions/prioritize', proxyToStudio);

// PRD routes
router.post('/prd/compose', proxyToStudio);

// Technical plan routes
router.post('/technical-plan', proxyToStudio);

// Positioning routes
router.post('/positioning', proxyToStudio);

// Campaign routes
router.get('/campaigns', proxyToStudio);
router.post('/campaigns/brief', proxyToStudio);

// Performance routes
router.get('/performance', proxyToStudio);

// Learning routes
router.get('/learnings', proxyToStudio);
router.post('/learnings/evaluate', proxyToStudio);

// Status
router.get('/status', proxyToStudio);

// Run full cycle
router.post('/run', proxyToStudio);

// Approval/rejection
router.post('/approve/:id', async (req: Request, res: Response) => {
  try {
    const response = await fetch(`${STUDIO_URL}/api/studio/approve/${req.params.id}`, { method: 'POST' });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

router.post('/reject/:id', async (req: Request, res: Response) => {
  try {
    const response = await fetch(`${STUDIO_URL}/api/studio/reject/${req.params.id}`, { method: 'POST' });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

export default router;
