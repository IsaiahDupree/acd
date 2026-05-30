'use client';

import React from 'react';
import { PanelConfig } from '@/lib/dashboard-config';
import { DashboardPanel } from '@/components/DashboardPanel';
import { MetricCardPanel } from '@/components/panels/MetricCardPanel';
import { LinkGridPanel } from '@/components/panels/LinkGridPanel';
import { ProjectsHarnessPanel } from '@/components/panels/ProjectsHarnessPanel';
import { StatsPanel } from '@/components/panels/StatsPanel';
import { CronJobsPanel } from '@/components/panels/CronJobsPanel';
import ParallelWorkerGrid from '@/components/ParallelWorkerGrid';
import PrdCoveragePanel from '@/components/PrdCoveragePanel';

type PanelComponent = React.ComponentType<{ config: PanelConfig }>;

const REGISTRY: Record<string, PanelComponent> = {
  'worker-grid': ({ config }) => (
    <ParallelWorkerGrid
      slugFilter={config.props?.slugFilter}
      tagFilter={config.props?.tagFilter}
    />
  ),
  'prd-coverage': ({ config }) => (
    <DashboardPanel title={config.title} noPad>
      <PrdCoveragePanel />
    </DashboardPanel>
  ),
  'stats': () => <StatsPanel />,
  'cron-jobs': () => <CronJobsPanel />,
  'projects-harness': () => <ProjectsHarnessPanel />,
  'metric-card': ({ config }) => <MetricCardPanel config={config} />,
  'link-grid': ({ config }) => <LinkGridPanel config={config} />,
};

interface PanelRendererProps {
  config: PanelConfig;
}

export function PanelRenderer({ config }: PanelRendererProps) {
  const Component = REGISTRY[config.type];

  if (!Component) {
    return (
      <DashboardPanel title={config.title ?? config.type}>
        <div className="text-sm text-gray-500 italic py-4 text-center">
          Unknown panel type: <code className="bg-gray-700/50 px-1 py-0.5 rounded text-xs">{config.type}</code>
        </div>
      </DashboardPanel>
    );
  }

  return <Component config={config} />;
}

export function registerPanel(type: string, component: PanelComponent) {
  REGISTRY[type] = component;
}
