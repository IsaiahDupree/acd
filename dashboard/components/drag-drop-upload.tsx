/**
 * Drag-and-Drop Upload Component (CF-WC-093)
 *
 * Provides a drag-drop zone for file uploads with validation and progress tracking.
 */

'use client';

import { useState, useRef, DragEvent, ChangeEvent } from 'react';

export interface FileUploadConfig {
  maxSize?: number; // in bytes
  acceptedTypes?: string[]; // MIME types
  maxFiles?: number;
}

export interface UploadedFile {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
}

export interface DragDropUploadProps {
  config?: FileUploadConfig;
  onFilesSelected?: (files: File[]) => void;
  onUpload?: (files: File[]) => Promise<void>;
  className?: string;
}

const DEFAULT_CONFIG: FileUploadConfig = {
  maxSize: 10 * 1024 * 1024, // 10MB
  acceptedTypes: ['image/*', 'video/*'],
  maxFiles: 5,
};

export function DragDropUpload({
  config = DEFAULT_CONFIG,
  onFilesSelected,
  onUpload,
  className = '',
}: DragDropUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    // Check file size
    if (config.maxSize && file.size > config.maxSize) {
      return `File size exceeds ${(config.maxSize / 1024 / 1024).toFixed(1)}MB`;
    }

    // Check file type
    if (config.acceptedTypes && config.acceptedTypes.length > 0) {
      const isValidType = config.acceptedTypes.some((type) => {
        if (type.endsWith('/*')) {
          const category = type.split('/')[0];
          return file.type.startsWith(category + '/');
        }
        return file.type === type;
      });

      if (!isValidType) {
        return `File type not accepted. Allowed: ${config.acceptedTypes.join(', ')}`;
      }
    }

    return null;
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setError(null);
    const fileArray = Array.from(files);

    // Check max files
    if (config.maxFiles && fileArray.length > config.maxFiles) {
      setError(`Maximum ${config.maxFiles} files allowed`);
      return;
    }

    // Validate all files
    const validFiles: File[] = [];
    const errors: string[] = [];

    fileArray.forEach((file) => {
      const validationError = validateFile(file);
      if (validationError) {
        errors.push(`${file.name}: ${validationError}`);
      } else {
        validFiles.push(file);
      }
    });

    if (errors.length > 0) {
      setError(errors.join('\n'));
    }

    if (validFiles.length > 0) {
      // Create uploaded file entries
      const newFiles: UploadedFile[] = validFiles.map((file) => ({
        file,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        progress: 0,
        status: 'pending',
      }));

      setUploadedFiles((prev) => [...prev, ...newFiles]);
      onFilesSelected?.(validFiles);

      // Trigger upload if handler provided
      if (onUpload) {
        uploadFiles(newFiles);
      }
    }
  };

  const uploadFiles = async (files: UploadedFile[]) => {
    for (const fileEntry of files) {
      try {
        // Update status to uploading
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === fileEntry.id ? { ...f, status: 'uploading' } : f
          )
        );

        // Simulate upload progress (in real implementation, this would track actual upload)
        if (onUpload) {
          await onUpload([fileEntry.file]);
        }

        // Update to complete
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === fileEntry.id ? { ...f, status: 'complete', progress: 100 } : f
          )
        );
      } catch (err) {
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === fileEntry.id
              ? {
                  ...f,
                  status: 'error',
                  error: err instanceof Error ? err.message : 'Upload failed',
                }
              : f
          )
        );
      }
    }
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    handleFiles(files);
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div className={className}>
      {/* Drop Zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-all duration-200
          ${
            isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
          }
        `}
        role="button"
        tabIndex={0}
        aria-label="Upload files"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple={config.maxFiles !== 1}
          accept={config.acceptedTypes?.join(',')}
          onChange={handleFileInputChange}
          className="hidden"
          aria-hidden="true"
        />

        <div className="space-y-2">
          <div className="text-4xl">📁</div>
          <div className="text-gray-700 dark:text-gray-300 font-medium">
            {isDragging ? 'Drop files here' : 'Drag and drop files here'}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            or click to browse
          </div>
          {config.acceptedTypes && (
            <div className="text-xs text-gray-400 dark:text-gray-500">
              Accepted: {config.acceptedTypes.join(', ')}
            </div>
          )}
          {config.maxSize && (
            <div className="text-xs text-gray-400 dark:text-gray-500">
              Max size: {(config.maxSize / 1024 / 1024).toFixed(1)}MB
            </div>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* File List */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          {uploadedFiles.map((fileEntry) => (
            <div
              key={fileEntry.id}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {fileEntry.file.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {(fileEntry.file.size / 1024).toFixed(1)} KB
                </div>

                {/* Progress Bar */}
                {fileEntry.status === 'uploading' && (
                  <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${fileEntry.progress}%` }}
                    />
                  </div>
                )}

                {/* Error Message */}
                {fileEntry.error && (
                  <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {fileEntry.error}
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-2 ml-4">
                {/* Status Indicator */}
                {fileEntry.status === 'complete' && (
                  <span className="text-green-500" aria-label="Upload complete">
                    ✓
                  </span>
                )}
                {fileEntry.status === 'uploading' && (
                  <span className="text-blue-500" aria-label="Uploading">
                    ⟳
                  </span>
                )}
                {fileEntry.status === 'error' && (
                  <span className="text-red-500" aria-label="Upload failed">
                    ✗
                  </span>
                )}

                {/* Remove Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(fileEntry.id);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  aria-label={`Remove ${fileEntry.file.name}`}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
