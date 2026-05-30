'use client';

import { useEffect, useState } from 'react';
import { DashboardConfig, ViewConfig, loadDashboardConfig } from '@/lib/dashboard-config';
import { ViewSwitcher } from '@/components/ViewSwitcher';
import { PanelRenderer } from '@/components/PanelRegistry';

const SPAN_CLASS: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-1 lg:col-span-2',
  3: 'col-span-1 lg:col-span-3',
};

function ViewPanel({ view }: { view: ViewConfig }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {view.panels.map((panel) => (
        <div key={panel.id} className={SPAN_CLASS[panel.span ?? 3] ?? SPAN_CLASS[3]}>
          <PanelRenderer config={panel} />
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [activeViewId, setActiveViewId] = useState<string>('');

  useEffect(() => {
    loadDashboardConfig().then((cfg) => {
      setConfig(cfg);
      setActiveViewId(cfg.views[0]?.id ?? '');
    });
  }, []);

  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-gray-400 text-sm animate-pulse">
        Loading dashboard…
      </div>
    );
  }

  const activeView = config.views.find((v) => v.id === activeViewId) ?? config.views[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      <div className="container mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">{config.title}</h1>
            {config.subtitle && (
              <p className="text-gray-400 text-sm mt-1">{config.subtitle}</p>
            )}
            {activeView?.description && (
              <p className="text-gray-500 text-xs mt-1">{activeView.description}</p>
            )}
          </div>
          <div className="shrink-0 text-xs text-gray-600 mt-1">
            Edit <code className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">dashboard.config.json</code> to add views & panels
          </div>
        </header>

        {/* View switcher */}
        {config.views.length > 1 && (
          <ViewSwitcher
            views={config.views}
            activeId={activeViewId}
            onChange={setActiveViewId}
          />
        )}

        {/* Active view panels */}
        {activeView && <ViewPanel view={activeView} />}
      </div>
    </div>
  );
}
