/**
 * Avatar with Upload Component (CF-WC-097)
 *
 * Displays user avatar with click-to-upload functionality.
 * Supports image preview, cropping, and validation.
 */

'use client';

import { useState, useRef, ChangeEvent } from 'react';

export interface AvatarUploadProps {
  currentImage?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onUpload?: (file: File) => Promise<void>;
  maxSize?: number; // in bytes
  className?: string;
  editable?: boolean;
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-12 h-12 text-sm',
  lg: 'w-16 h-16 text-base',
  xl: 'w-24 h-24 text-xl',
};

export function AvatarUpload({
  currentImage,
  name,
  size = 'md',
  onUpload,
  maxSize = 5 * 1024 * 1024, // 5MB default
  className = '',
  editable = true,
}: AvatarUploadProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayImage = previewImage || currentImage;
  const initials = name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size
    if (file.size > maxSize) {
      setError(
        `File size must be less than ${(maxSize / 1024 / 1024).toFixed(1)}MB`
      );
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setPreviewImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload if handler provided
    if (onUpload) {
      setIsUploading(true);
      try {
        await onUpload(file);
        setIsUploading(false);
      } catch (err) {
        setIsUploading(false);
        setError(err instanceof Error ? err.message : 'Upload failed');
        setPreviewImage(null);
      }
    }
  };

  const handleClick = () => {
    if (editable) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className={className}>
      <div className="relative inline-block">
        {/* Avatar */}
        <button
          onClick={handleClick}
          disabled={!editable || isUploading}
          className={`
            ${sizeClasses[size]}
            rounded-full overflow-hidden
            flex items-center justify-center
            font-semibold
            transition-all
            ${
              editable
                ? 'cursor-pointer hover:opacity-80 hover:shadow-lg'
                : 'cursor-default'
            }
            ${
              displayImage
                ? 'bg-gray-200 dark:bg-gray-700'
                : 'bg-gradient-to-br from-blue-400 to-purple-500 text-white'
            }
            ${isUploading ? 'opacity-50' : ''}
          `}
          aria-label={editable ? 'Upload avatar' : 'Avatar'}
        >
          {displayImage ? (
            <img
              src={displayImage}
              alt={name || 'Avatar'}
              className="w-full h-full object-cover"
            />
          ) : (
            <span>{initials}</span>
          )}
        </button>

        {/* Upload Indicator */}
        {editable && (
          <div
            className={`
              absolute bottom-0 right-0
              ${size === 'sm' ? 'w-3 h-3' : size === 'md' ? 'w-4 h-4' : 'w-5 h-5'}
              bg-white dark:bg-gray-800
              rounded-full border-2 border-white dark:border-gray-800
              flex items-center justify-center
              ${isUploading ? 'bg-blue-500' : 'bg-gray-400 dark:bg-gray-600'}
            `}
          >
            {isUploading ? (
              <span className="animate-spin text-white text-xs">⟳</span>
            ) : (
              <span className="text-white text-xs">✎</span>
            )}
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          aria-hidden="true"
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}

// Avatar Group Component
export interface AvatarGroupProps {
  avatars: Array<{
    id: string;
    image?: string;
    name?: string;
  }>;
  max?: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function AvatarGroup({
  avatars,
  max = 5,
  size = 'md',
  className = '',
}: AvatarGroupProps) {
  const displayAvatars = avatars.slice(0, max);
  const remainingCount = avatars.length - max;

  return (
    <div className={`flex items-center -space-x-2 ${className}`}>
      {displayAvatars.map((avatar) => (
        <div
          key={avatar.id}
          className="relative inline-block ring-2 ring-white dark:ring-gray-900"
        >
          <AvatarUpload
            currentImage={avatar.image}
            name={avatar.name}
            size={size}
            editable={false}
          />
        </div>
      ))}
      {remainingCount > 0 && (
        <div
          className={`
            ${sizeClasses[size]}
            rounded-full
            bg-gray-200 dark:bg-gray-700
            text-gray-600 dark:text-gray-300
            flex items-center justify-center
            font-semibold
            ring-2 ring-white dark:ring-gray-900
          `}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
}

// Example usage
export function AvatarUploadExample() {
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);

  const handleUpload = async (file: File) => {
    // Simulate upload delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // In real implementation, upload to server and get URL
    const url = URL.createObjectURL(file);
    setAvatarUrl(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-2">Single Avatar</h3>
        <AvatarUpload
          currentImage={avatarUrl}
          name="John Doe"
          size="xl"
          onUpload={handleUpload}
        />
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Avatar Sizes</h3>
        <div className="flex items-center space-x-4">
          <AvatarUpload name="SM" size="sm" editable={false} />
          <AvatarUpload name="MD" size="md" editable={false} />
          <AvatarUpload name="LG" size="lg" editable={false} />
          <AvatarUpload name="XL" size="xl" editable={false} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Avatar Group</h3>
        <AvatarGroup
          avatars={[
            { id: '1', name: 'Alice' },
            { id: '2', name: 'Bob' },
            { id: '3', name: 'Charlie' },
            { id: '4', name: 'Diana' },
            { id: '5', name: 'Eve' },
            { id: '6', name: 'Frank' },
            { id: '7', name: 'Grace' },
          ]}
          max={5}
          size="md"
        />
      </div>
    </div>
  );
}
