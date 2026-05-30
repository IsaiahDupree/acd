'use client';

import { PanelConfig } from '@/lib/dashboard-config';
import { usePanelData, getNestedValue } from '@/lib/use-panel-data';
import { DashboardPanel } from '@/components/DashboardPanel';

const COLOR_MAP: Record<string, string> = {
  blue:   'text-blue-300 bg-blue-500/10 border-blue-500/30',
  green:  'text-green-300 bg-green-500/10 border-green-500/30',
  violet: 'text-violet-300 bg-violet-500/10 border-violet-500/30',
  orange: 'text-orange-300 bg-orange-500/10 border-orange-500/30',
  yellow: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/30',
  red:    'text-red-300 bg-red-500/10 border-red-500/30',
  gray:   'text-gray-300 bg-gray-700/30 border-gray-600/30',
};

function formatValue(value: any, type?: string, suffix?: string): string {
  if (value === null || value === undefined) return '—';
  if (type === 'time' && value) {
    try { return new Date(value).toLocaleTimeString(); } catch { return String(value); }
  }
  if (type === 'number') return Number(value).toLocaleString();
  if (typeof value === 'boolean') return value ? '✓ Yes' : '✗ No';
  if (typeof value === 'number') return `${value.toLocaleString()}${suffix ?? ''}`;
  if (typeof value === 'string' && value.startsWith('prd-')) {
    return value.replace(/^prd-\d+-/, '').replace(/-/g, ' ');
  }
  return `${String(value)}${suffix ?? ''}`;
}

interface MetricCardPanelProps {
  config: PanelConfig;
}

export function MetricCardPanel({ config }: MetricCardPanelProps) {
  const { data, loading, error, lastUpdated, refresh } = usePanelData(
    config.endpoint,
    config.refreshInterval ?? 15000,
  );

  const fields = config.props?.fields ?? [];
  const listKey = config.props?.listKey;
  const listFields: string[] = config.props?.listFields ?? [];
  const listTitle = config.props?.listTitle;
  const fallback = config.props?.fallbackMessage;

  const listItems: any[] = listKey && data ? getNestedValue(data, listKey) ?? [] : [];

  return (
    <DashboardPanel
      title={config.title}
      loading={loading}
      error={error ? (fallback ?? error) : null}
      lastUpdated={lastUpdated}
      onRefresh={refresh}
    >
      {data && (
        <>
          {fields.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              {fields.map((field) => {
                const val = getNestedValue(data, field.key);
                const color = COLOR_MAP[field.color ?? 'gray'] ?? COLOR_MAP.gray;
                return (
                  <div key={field.key} className={`rounded-lg border px-3 py-2 ${color}`}>
                    <div className="text-xs opacity-60 mb-1">{field.label}</div>
                    <div className="text-lg font-semibold leading-tight">
                      {formatValue(val, field.type, field.suffix)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {listKey && listItems.length > 0 && (
            <>
              {listTitle && (
                <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">{listTitle}</div>
              )}
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {listItems.slice(0, 20).map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-gray-700/30 last:border-0">
                    {listFields.map((f) => (
                      <span key={f} className="text-gray-300 truncate max-w-[60%]">
                        {formatValue(getNestedValue(item, f))}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {!data && !loading && !error && (
        <div className="text-sm text-gray-500 italic">{fallback ?? 'No data available.'}</div>
      )}
    </DashboardPanel>
  );
}
