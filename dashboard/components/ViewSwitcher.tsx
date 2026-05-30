'use client';

import { ViewConfig } from '@/lib/dashboard-config';

interface ViewSwitcherProps {
  views: ViewConfig[];
  activeId: string;
  onChange: (id: string) => void;
}

export function ViewSwitcher({ views, activeId, onChange }: ViewSwitcherProps) {
  return (
    <div className="flex items-center gap-1 bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-xl p-1">
      {views.map((view) => {
        const isActive = view.id === activeId;
        return (
          <button
            key={view.id}
            onClick={() => onChange(view.id)}
            title={view.description}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              isActive
                ? 'bg-blue-600/80 text-white shadow-sm shadow-blue-500/20'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
            }`}
          >
            {view.icon && <span className="text-base leading-none">{view.icon}</span>}
            {view.name}
          </button>
        );
      })}
    </div>
  );
}
