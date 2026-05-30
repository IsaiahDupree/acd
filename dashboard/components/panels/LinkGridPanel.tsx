'use client';

import Link from 'next/link';
import { PanelConfig, LinkItem } from '@/lib/dashboard-config';
import { DashboardPanel } from '@/components/DashboardPanel';

interface LinkGridPanelProps {
  config: PanelConfig;
}

export function LinkGridPanel({ config }: LinkGridPanelProps) {
  const links: LinkItem[] = config.props?.links ?? [];

  return (
    <DashboardPanel title={config.title}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {links.map((link) => {
          const inner = (
            <div className="group flex flex-col gap-1 bg-gray-700/30 hover:bg-gray-700/60 border border-gray-600/30 hover:border-gray-500/50 rounded-lg px-4 py-3 transition-all cursor-pointer">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">
                  {link.label}
                </span>
                {link.badge && (
                  <span className="text-[10px] font-mono bg-gray-600/60 text-gray-400 px-1.5 py-0.5 rounded">
                    {link.badge}
                  </span>
                )}
                {link.external && (
                  <span className="text-[10px] text-gray-500 ml-auto">↗</span>
                )}
              </div>
              {link.description && (
                <p className="text-xs text-gray-500 group-hover:text-gray-400 transition-colors leading-snug">
                  {link.description}
                </p>
              )}
            </div>
          );

          if (link.external) {
            return (
              <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer">
                {inner}
              </a>
            );
          }

          return (
            <Link key={link.label} href={link.url}>
              {inner}
            </Link>
          );
        })}
      </div>
    </DashboardPanel>
  );
}
