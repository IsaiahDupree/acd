export interface PanelField {
  key: string;
  label: string;
  color?: string;
  suffix?: string;
  type?: 'text' | 'time' | 'number' | 'badge';
}

export interface LinkItem {
  label: string;
  url: string;
  description?: string;
  badge?: string;
  external?: boolean;
}

export interface PanelConfig {
  id: string;
  type: string;
  title?: string;
  span?: 1 | 2 | 3;
  endpoint?: string;
  refreshInterval?: number;
  props?: {
    tagFilter?: string;
    slugFilter?: string[];
    fields?: PanelField[];
    listKey?: string;
    listFields?: string[];
    listTitle?: string;
    links?: LinkItem[];
    fallbackMessage?: string;
    [key: string]: any;
  };
}

export interface ViewConfig {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  panels: PanelConfig[];
}

export interface DashboardConfig {
  title: string;
  subtitle?: string;
  views: ViewConfig[];
}

export const DEFAULT_CONFIG: DashboardConfig = {
  title: 'Autonomous Coding Dashboard',
  views: [
    {
      id: 'acd',
      name: 'ACD',
      icon: '⚙',
      description: 'Autonomous Coding Dashboard',
      panels: [
        { id: 'live-agents', type: 'worker-grid', title: 'Live Agent Status', span: 3 },
        { id: 'prd-coverage', type: 'prd-coverage', title: 'PRD Coverage', span: 3 },
        { id: 'projects-control', type: 'projects-harness', title: 'Projects', span: 3 },
      ],
    },
  ],
};

export async function loadDashboardConfig(): Promise<DashboardConfig> {
  try {
    const res = await fetch('/dashboard.config.json', { cache: 'no-store' });
    if (!res.ok) return DEFAULT_CONFIG;
    return (await res.json()) as DashboardConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}
