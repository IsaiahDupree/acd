/**
 * Feature Flags System (CF-WC-109)
 *
 * Remote feature flags for gradual rollouts and A/B testing.
 */

import { env } from './env-config';
import { logger } from './logger';

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  rolloutPercentage?: number;
  variants?: Record<string, any>;
}

class FeatureFlagsService {
  private flags: Map<string, FeatureFlag> = new Map();
  private initialized = false;

  async initialize() {
    if (this.initialized) return;

    try {
      if (env.NEXT_PUBLIC_FEATURE_FLAGS_URL) {
        await this.fetchFlags();
      } else {
        this.loadDefaultFlags();
      }

      this.initialized = true;
      logger.info('Feature flags initialized', {
        flagCount: this.flags.size,
      });
    } catch (error) {
      logger.error('Failed to initialize feature flags', error as Error);
      this.loadDefaultFlags();
    }
  }

  private async fetchFlags() {
    const response = await fetch(env.NEXT_PUBLIC_FEATURE_FLAGS_URL!, {
      headers: {
        Authorization: `Bearer ${env.FEATURE_FLAGS_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch flags: ${response.status}`);
    }

    const data = await response.json();
    this.flags = new Map(data.flags.map((flag: FeatureFlag) => [flag.key, flag]));
  }

  private loadDefaultFlags() {
    // Default flags for local development
    const defaults: FeatureFlag[] = [
      { key: 'content-factory-enabled', enabled: true },
      { key: 'tiktok-integration', enabled: false },
      { key: 'veo-video-generation', enabled: true },
      { key: 'nano-banana-images', enabled: true },
      { key: 'bulk-actions', enabled: true },
      { key: 'command-palette', enabled: true },
      { key: 'dark-mode', enabled: true },
      { key: 'analytics-dashboard', enabled: false },
      { key: 'advanced-editor', enabled: false },
    ];

    this.flags = new Map(defaults.map((flag) => [flag.key, flag]));
  }

  isEnabled(key: string, userId?: string): boolean {
    if (!this.initialized) {
      logger.warn('Feature flags not initialized', { key });
      return false;
    }

    const flag = this.flags.get(key);
    if (!flag) {
      logger.debug('Feature flag not found', { key });
      return false;
    }

    if (!flag.enabled) {
      return false;
    }

    // Check rollout percentage
    if (flag.rolloutPercentage !== undefined && userId) {
      const hash = this.hashUserId(userId);
      const isInRollout = hash < flag.rolloutPercentage;
      return isInRollout;
    }

    return flag.enabled;
  }

  getVariant(key: string, userId?: string): string | null {
    if (!this.initialized) {
      return null;
    }

    const flag = this.flags.get(key);
    if (!flag || !flag.enabled || !flag.variants) {
      return null;
    }

    // Simple A/B testing based on user ID hash
    if (userId) {
      const hash = this.hashUserId(userId);
      const variants = Object.keys(flag.variants);
      const index = hash % variants.length;
      return variants[index];
    }

    return Object.keys(flag.variants)[0];
  }

  getAllFlags(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    this.flags.forEach((flag, key) => {
      result[key] = flag.enabled;
    });
    return result;
  }

  // Simple hash function for consistent user bucketing
  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = (hash << 5) - hash + userId.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash % 100);
  }

  // Refresh flags from remote
  async refresh() {
    if (env.NEXT_PUBLIC_FEATURE_FLAGS_URL) {
      await this.fetchFlags();
      logger.info('Feature flags refreshed');
    }
  }
}

export const featureFlags = new FeatureFlagsService();

// React hook for feature flags
export function useFeatureFlag(key: string, userId?: string): boolean {
  return featureFlags.isEnabled(key, userId);
}

// Higher-order component for feature-gated components
export function withFeatureFlag<P extends object>(
  Component: React.ComponentType<P>,
  flagKey: string
) {
  function FeatureFlagged(props: P) {
    const isEnabled = useFeatureFlag(flagKey);

    if (!isEnabled) {
      return null;
    }

    return <Component {...props} />;
  }
  FeatureFlagged.displayName = `withFeatureFlag(${Component.displayName || Component.name || 'Component'})`;
  return FeatureFlagged;
}
