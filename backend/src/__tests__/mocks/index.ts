/**
 * CF-WC-028: Mock service layer
 * Mocks for Auth, DB, Payment, and Email services
 * Covers both PCT and Content Factory services
 */

import { vi } from 'vitest';

// ============================================
// Auth Service Mocks
// ============================================

export const mockAuthService = {
  verifyToken: vi.fn().mockResolvedValue({
    userId: 'user-123',
    email: 'test@example.com',
    valid: true,
  }),

  generateToken: vi.fn().mockReturnValue('mock-jwt-token'),

  hashPassword: vi.fn().mockResolvedValue('hashed-password'),

  comparePasswords: vi.fn().mockResolvedValue(true),

  createSession: vi.fn().mockResolvedValue({
    sessionId: 'session-123',
    userId: 'user-123',
    expiresAt: new Date(Date.now() + 3600000),
  }),

  revokeSession: vi.fn().mockResolvedValue(true),
};

// ============================================
// Database Service Mocks
// ============================================

export const mockDatabaseService = {
  brand: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'brand-123', ...data.data })),
    update: vi.fn().mockImplementation((data) => Promise.resolve({ id: data.where.id, ...data.data })),
    delete: vi.fn().mockResolvedValue({ id: 'brand-123' }),
  },

  product: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'product-123', ...data.data })),
    update: vi.fn().mockImplementation((data) => Promise.resolve({ id: data.where.id, ...data.data })),
    delete: vi.fn().mockResolvedValue({ id: 'product-123' }),
  },

  usp: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'usp-123', ...data.data })),
    update: vi.fn().mockImplementation((data) => Promise.resolve({ id: data.where.id, ...data.data })),
    delete: vi.fn().mockResolvedValue({ id: 'usp-123' }),
  },

  hook: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'hook-123', ...data.data })),
    update: vi.fn().mockImplementation((data) => Promise.resolve({ id: data.where.id, ...data.data })),
    delete: vi.fn().mockResolvedValue({ id: 'hook-123' }),
  },

  $connect: vi.fn().mockResolvedValue(undefined),
  $disconnect: vi.fn().mockResolvedValue(undefined),
  $transaction: vi.fn().mockImplementation((callback) => callback(mockDatabaseService)),
};

// ============================================
// Payment Service Mocks (Stripe)
// ============================================

export const mockPaymentService = {
  createCheckoutSession: vi.fn().mockResolvedValue({
    id: 'cs_test_123',
    url: 'https://checkout.stripe.com/test',
    customer: 'cus_test_123',
  }),

  createCustomer: vi.fn().mockResolvedValue({
    id: 'cus_test_123',
    email: 'test@example.com',
  }),

  getCustomer: vi.fn().mockResolvedValue({
    id: 'cus_test_123',
    email: 'test@example.com',
    subscriptions: {
      data: [],
    },
  }),

  createSubscription: vi.fn().mockResolvedValue({
    id: 'sub_test_123',
    customer: 'cus_test_123',
    status: 'active',
    items: {
      data: [{
        price: {
          id: 'price_test_123',
          unit_amount: 9900,
        },
      }],
    },
  }),

  cancelSubscription: vi.fn().mockResolvedValue({
    id: 'sub_test_123',
    status: 'canceled',
  }),

  verifyWebhook: vi.fn().mockReturnValue({
    id: 'evt_test_123',
    type: 'checkout.session.completed',
    data: {
      object: {},
    },
  }),

  getBillingPortalUrl: vi.fn().mockResolvedValue('https://billing.stripe.com/test'),
};

// ============================================
// Email Service Mocks
// ============================================

export const mockEmailService = {
  sendEmail: vi.fn().mockResolvedValue({
    messageId: 'msg-123',
    accepted: ['recipient@example.com'],
    rejected: [],
  }),

  sendWelcomeEmail: vi.fn().mockResolvedValue({
    messageId: 'msg-welcome-123',
    sent: true,
  }),

  sendPasswordResetEmail: vi.fn().mockResolvedValue({
    messageId: 'msg-reset-123',
    sent: true,
  }),

  sendSubscriptionConfirmation: vi.fn().mockResolvedValue({
    messageId: 'msg-sub-123',
    sent: true,
  }),

  sendHookApprovalNotification: vi.fn().mockResolvedValue({
    messageId: 'msg-hook-123',
    sent: true,
  }),

  validateEmail: vi.fn().mockReturnValue(true),

  formatEmailTemplate: vi.fn().mockReturnValue('<html><body>Test Email</body></html>'),
};

// ============================================
// AI Service Mocks (Claude API)
// ============================================

export const mockAIService = {
  generateUSPs: vi.fn().mockResolvedValue([
    'Unique selling point 1',
    'Unique selling point 2',
    'Unique selling point 3',
  ]),

  generateAngles: vi.fn().mockResolvedValue([
    'Marketing angle 1',
    'Marketing angle 2',
    'Marketing angle 3',
  ]),

  generateHooks: vi.fn().mockResolvedValue([
    'Compelling hook 1',
    'Compelling hook 2',
    'Compelling hook 3',
  ]),

  generateVideoScript: vi.fn().mockResolvedValue({
    hook: 'Attention grabbing hook',
    lid: 'Build interest',
    body: 'Main content',
    cta: 'Call to action',
  }),

  scoreUSP: vi.fn().mockResolvedValue(0.85),

  extractPainPoints: vi.fn().mockResolvedValue([
    'Pain point 1',
    'Pain point 2',
  ]),

  extractBenefits: vi.fn().mockResolvedValue([
    'Benefit 1',
    'Benefit 2',
  ]),
};

// ============================================
// Storage Service Mocks (File uploads)
// ============================================

export const mockStorageService = {
  uploadFile: vi.fn().mockResolvedValue({
    url: 'https://storage.example.com/file-123.jpg',
    key: 'uploads/file-123.jpg',
  }),

  deleteFile: vi.fn().mockResolvedValue(true),

  getSignedUrl: vi.fn().mockResolvedValue('https://storage.example.com/signed-url'),

  listFiles: vi.fn().mockResolvedValue([
    { key: 'file-1.jpg', size: 1024 },
    { key: 'file-2.jpg', size: 2048 },
  ]),
};

// ============================================
// Cache Service Mocks (Redis)
// ============================================

export const mockCacheService = {
  get: vi.fn().mockResolvedValue(null),

  set: vi.fn().mockResolvedValue('OK'),

  del: vi.fn().mockResolvedValue(1),

  exists: vi.fn().mockResolvedValue(0),

  expire: vi.fn().mockResolvedValue(1),

  incr: vi.fn().mockResolvedValue(1),

  decr: vi.fn().mockResolvedValue(0),
};

// ============================================
// Queue Service Mocks (BullMQ)
// ============================================

export const mockQueueService = {
  addJob: vi.fn().mockResolvedValue({
    id: 'job-123',
    name: 'generate-hooks',
    data: {},
  }),

  getJob: vi.fn().mockResolvedValue({
    id: 'job-123',
    progress: 50,
    state: 'active',
  }),

  removeJob: vi.fn().mockResolvedValue(true),

  getJobCounts: vi.fn().mockResolvedValue({
    waiting: 0,
    active: 1,
    completed: 10,
    failed: 0,
  }),
};

// ============================================
// Analytics Service Mocks
// ============================================

export const mockAnalyticsService = {
  trackEvent: vi.fn().mockResolvedValue(true),

  trackPageView: vi.fn().mockResolvedValue(true),

  trackConversion: vi.fn().mockResolvedValue(true),

  getMetrics: vi.fn().mockResolvedValue({
    totalUsers: 100,
    totalHooks: 500,
    conversionRate: 0.15,
  }),
};

// ============================================
// Content Factory Service Mocks
// ============================================

// Remotion API Mock (for video/image generation)
export const mockRemotionService = {
  generateNanoBananaImage: vi.fn().mockResolvedValue({
    id: 'img-123',
    url: 'https://storage.test/nano-banana-123.jpg',
    thumbnailUrl: 'https://storage.test/nano-banana-123-thumb.jpg',
  }),

  generateVeoVideo: vi.fn().mockResolvedValue({
    id: 'video-123',
    url: 'https://storage.test/veo-video-123.mp4',
    thumbnailUrl: 'https://storage.test/veo-video-123-thumb.jpg',
    durationSeconds: 8,
  }),

  renderTemplate: vi.fn().mockResolvedValue({
    id: 'render-123',
    url: 'https://storage.test/final-video-123.mp4',
    status: 'complete',
  }),

  getJobStatus: vi.fn().mockResolvedValue({
    id: 'job-123',
    status: 'complete',
    progress: 100,
  }),
};

// TikTok API Mock
export const mockTikTokService = {
  authenticate: vi.fn().mockResolvedValue({
    accessToken: 'tk-access-123',
    refreshToken: 'tk-refresh-123',
    expiresAt: new Date(Date.now() + 3600000),
  }),

  uploadVideo: vi.fn().mockResolvedValue({
    postId: 'tt-12345',
    url: 'https://tiktok.com/@test/video/12345',
  }),

  promote: vi.fn().mockResolvedValue({
    campaignId: 'campaign-123',
    budgetCents: 500,
    status: 'active',
  }),

  getMetrics: vi.fn().mockResolvedValue({
    views: 1250,
    likes: 85,
    comments: 12,
    shares: 8,
    saves: 15,
  }),

  stopPromotion: vi.fn().mockResolvedValue({
    campaignId: 'campaign-123',
    status: 'stopped',
  }),
};

// Instagram API Mock
export const mockInstagramService = {
  authenticate: vi.fn().mockResolvedValue({
    accessToken: 'ig-access-123',
    userId: 'ig-user-123',
  }),

  uploadReel: vi.fn().mockResolvedValue({
    postId: 'ig-reel-123',
    url: 'https://instagram.com/p/abc123',
  }),

  getMetrics: vi.fn().mockResolvedValue({
    views: 2100,
    likes: 142,
    comments: 18,
    shares: 14,
    saves: 28,
  }),
};

// Content Factory Database Mocks
export const mockCFDatabaseService = {
  dossier: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'dossier-123', ...data.data })),
    update: vi.fn().mockImplementation((data) => Promise.resolve({ id: data.where.id, ...data.data })),
    delete: vi.fn().mockResolvedValue({ id: 'dossier-123' }),
  },

  generatedImage: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'img-123', ...data.data })),
    update: vi.fn().mockImplementation((data) => Promise.resolve({ id: data.where.id, ...data.data })),
    delete: vi.fn().mockResolvedValue({ id: 'img-123' }),
  },

  generatedVideo: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'video-123', ...data.data })),
    update: vi.fn().mockImplementation((data) => Promise.resolve({ id: data.where.id, ...data.data })),
    delete: vi.fn().mockResolvedValue({ id: 'video-123' }),
  },

  script: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'script-123', ...data.data })),
    update: vi.fn().mockImplementation((data) => Promise.resolve({ id: data.where.id, ...data.data })),
    delete: vi.fn().mockResolvedValue({ id: 'script-123' }),
  },

  assembledContent: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'content-123', ...data.data })),
    update: vi.fn().mockImplementation((data) => Promise.resolve({ id: data.where.id, ...data.data })),
    delete: vi.fn().mockResolvedValue({ id: 'content-123' }),
  },

  publishedContent: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'published-123', ...data.data })),
    update: vi.fn().mockImplementation((data) => Promise.resolve({ id: data.where.id, ...data.data })),
    delete: vi.fn().mockResolvedValue({ id: 'published-123' }),
  },

  performanceMetric: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'metric-123', ...data.data })),
    upsert: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'metric-123', ...data.create })),
  },

  angleTest: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'test-123', ...data.data })),
    update: vi.fn().mockImplementation((data) => Promise.resolve({ id: data.where.id, ...data.data })),
    delete: vi.fn().mockResolvedValue({ id: 'test-123' }),
  },
};

// ============================================
// Helper function to reset all mocks
// ============================================

export function resetAllMocks() {
  // PCT Service Mocks
  Object.values(mockAuthService).forEach(fn => fn.mockClear());
  Object.values(mockDatabaseService.brand).forEach(fn => fn.mockClear());
  Object.values(mockDatabaseService.product).forEach(fn => fn.mockClear());
  Object.values(mockDatabaseService.usp).forEach(fn => fn.mockClear());
  Object.values(mockDatabaseService.hook).forEach(fn => fn.mockClear());
  Object.values(mockPaymentService).forEach(fn => fn.mockClear());
  Object.values(mockEmailService).forEach(fn => fn.mockClear());
  Object.values(mockAIService).forEach(fn => fn.mockClear());
  Object.values(mockStorageService).forEach(fn => fn.mockClear());
  Object.values(mockCacheService).forEach(fn => fn.mockClear());
  Object.values(mockQueueService).forEach(fn => fn.mockClear());
  Object.values(mockAnalyticsService).forEach(fn => fn.mockClear());

  // Content Factory Service Mocks
  Object.values(mockRemotionService).forEach(fn => fn.mockClear());
  Object.values(mockTikTokService).forEach(fn => fn.mockClear());
  Object.values(mockInstagramService).forEach(fn => fn.mockClear());
  Object.values(mockCFDatabaseService.dossier).forEach(fn => fn.mockClear());
  Object.values(mockCFDatabaseService.generatedImage).forEach(fn => fn.mockClear());
  Object.values(mockCFDatabaseService.generatedVideo).forEach(fn => fn.mockClear());
  Object.values(mockCFDatabaseService.script).forEach(fn => fn.mockClear());
  Object.values(mockCFDatabaseService.assembledContent).forEach(fn => fn.mockClear());
  Object.values(mockCFDatabaseService.publishedContent).forEach(fn => fn.mockClear());
  Object.values(mockCFDatabaseService.performanceMetric).forEach(fn => fn.mockClear());
  Object.values(mockCFDatabaseService.angleTest).forEach(fn => fn.mockClear());
}
