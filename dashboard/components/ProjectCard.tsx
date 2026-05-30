'use client';

import { Project } from '@/lib/api';

interface ProjectCardProps {
  project: Project;
  isSelected: boolean;
  onClick: () => void;
}

export default function ProjectCard({ project, isSelected, onClick }: ProjectCardProps) {
  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-lg border cursor-pointer transition-all ${
        isSelected
          ? 'bg-blue-500/20 border-blue-500 ring-2 ring-blue-500'
          : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold">{project.name}</h3>
        <span className={`px-2 py-1 rounded text-xs ${
          project.status === 'active' ? 'bg-green-500/20 text-green-400' :
          project.status === 'paused' ? 'bg-yellow-500/20 text-yellow-400' :
          project.status === 'complete' ? 'bg-blue-500/20 text-blue-400' :
          'bg-gray-500/20 text-gray-400'
        }`}>
          {project.status}
        </span>
      </div>
      {project.description && (
        <p className="text-sm text-gray-400 mb-2">{project.description}</p>
      )}
      {project._count && (
        <div className="flex gap-4 text-sm text-gray-500">
          <span>{project._count.features} features</span>
          <span>{project._count.workItems} work items</span>
        </div>
      )}
    </div>
  );
}

