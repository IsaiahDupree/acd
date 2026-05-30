/**
 * Database Schema Documentation (CF-WC-113)
 *
 * Interactive database schema visualization and documentation.
 */

'use client';

interface SchemaColumn {
  name: string;
  type: string;
  description?: string;
  primaryKey?: boolean;
  foreignKey?: string;
  nullable?: boolean;
  unique?: boolean;
  default?: string;
}

interface SchemaIndex {
  name: string;
  columns: string[];
  unique?: boolean;
}

interface SchemaTable {
  name: string;
  description: string;
  columns: SchemaColumn[];
  indexes?: SchemaIndex[];
}

export default function SchemaDocsPage() {
  const tables: SchemaTable[] = [
    {
      name: 'cf_product_dossiers',
      description: 'Product information and metadata for content generation',
      columns: [
        { name: 'id', type: 'UUID', primaryKey: true, description: 'Unique identifier' },
        { name: 'name', type: 'VARCHAR(255)', nullable: false, description: 'Product name' },
        { name: 'slug', type: 'VARCHAR(255)', unique: true, description: 'URL-friendly identifier' },
        { name: 'category', type: 'VARCHAR(100)', description: 'Product category' },
        { name: 'niche', type: 'VARCHAR(100)', description: 'Specific niche' },
        { name: 'benefits', type: 'TEXT[]', description: 'Product benefits list' },
        { name: 'pain_points', type: 'TEXT[]', description: 'Customer pain points addressed' },
        { name: 'proof_types', type: 'TEXT[]', description: 'Types of social proof' },
        { name: 'tiktok_shop_link', type: 'TEXT', description: 'TikTok Shop URL' },
        { name: 'affiliate_links', type: 'JSONB', description: 'Platform-specific affiliate links' },
        { name: 'status', type: 'VARCHAR(50)', default: "'draft'", description: 'Current status' },
        { name: 'created_at', type: 'TIMESTAMP', default: 'NOW()', description: 'Creation timestamp' },
        { name: 'updated_at', type: 'TIMESTAMP', default: 'NOW()', description: 'Last update timestamp' },
      ],
      indexes: [
        { name: 'idx_dossiers_slug', columns: ['slug'], unique: true },
        { name: 'idx_dossiers_category', columns: ['category'] },
        { name: 'idx_dossiers_status', columns: ['status'] },
      ],
    },
    {
      name: 'cf_generated_images',
      description: 'AI-generated images using Nano Banana',
      columns: [
        { name: 'id', type: 'UUID', primaryKey: true },
        { name: 'dossier_id', type: 'UUID', foreignKey: 'cf_product_dossiers(id)' },
        { name: 'type', type: 'VARCHAR(50)', description: 'before, after, or product' },
        { name: 'image_url', type: 'TEXT', description: 'S3/CDN URL' },
        { name: 'prompt', type: 'TEXT', description: 'Generation prompt' },
        { name: 'model', type: 'VARCHAR(100)', default: "'nano-banana'", description: 'AI model used' },
        { name: 'status', type: 'VARCHAR(50)', default: "'pending'", description: 'Generation status' },
        { name: 'metadata', type: 'JSONB', description: 'Generation parameters and metadata' },
        { name: 'created_at', type: 'TIMESTAMP', default: 'NOW()' },
      ],
      indexes: [
        { name: 'idx_images_dossier', columns: ['dossier_id'] },
        { name: 'idx_images_type', columns: ['type'] },
        { name: 'idx_images_status', columns: ['status'] },
      ],
    },
    {
      name: 'cf_generated_videos',
      description: 'AI-generated video clips using Veo 3.1',
      columns: [
        { name: 'id', type: 'UUID', primaryKey: true },
        { name: 'dossier_id', type: 'UUID', foreignKey: 'cf_product_dossiers(id)' },
        { name: 'source_image_id', type: 'UUID', foreignKey: 'cf_generated_images(id)', nullable: true },
        { name: 'type', type: 'VARCHAR(50)', description: 'Video type' },
        { name: 'video_url', type: 'TEXT', description: 'S3/CDN URL' },
        { name: 'duration', type: 'INTEGER', description: 'Duration in seconds' },
        { name: 'aspect_ratio', type: 'VARCHAR(20)', default: "'9:16'", description: 'Video aspect ratio' },
        { name: 'prompt', type: 'TEXT', description: 'Generation prompt' },
        { name: 'model', type: 'VARCHAR(100)', default: "'veo-3.1'", description: 'AI model used' },
        { name: 'status', type: 'VARCHAR(50)', default: "'pending'" },
        { name: 'metadata', type: 'JSONB' },
        { name: 'created_at', type: 'TIMESTAMP', default: 'NOW()' },
      ],
    },
    {
      name: 'cf_scripts',
      description: 'Marketing scripts at 5 awareness levels',
      columns: [
        { name: 'id', type: 'UUID', primaryKey: true },
        { name: 'dossier_id', type: 'UUID', foreignKey: 'cf_product_dossiers(id)' },
        { name: 'awareness_level', type: 'INTEGER', description: '1-5 (Eugene Schwartz framework)' },
        { name: 'market_sophistication', type: 'INTEGER', description: '1-5' },
        { name: 'hook', type: 'TEXT', description: 'Opening hook' },
        { name: 'body', type: 'TEXT', description: 'Main content' },
        { name: 'cta', type: 'TEXT', description: 'Call to action' },
        { name: 'full_script', type: 'TEXT', description: 'Complete script' },
        { name: 'created_at', type: 'TIMESTAMP', default: 'NOW()' },
      ],
    },
    {
      name: 'cf_assembled_content',
      description: 'Final assembled content pieces ready for publishing',
      columns: [
        { name: 'id', type: 'UUID', primaryKey: true },
        { name: 'dossier_id', type: 'UUID', foreignKey: 'cf_product_dossiers(id)' },
        { name: 'script_id', type: 'UUID', foreignKey: 'cf_scripts(id)' },
        { name: 'video_ids', type: 'UUID[]', description: 'Array of video IDs' },
        { name: 'image_ids', type: 'UUID[]', description: 'Array of image IDs' },
        { name: 'final_video_url', type: 'TEXT', description: 'Rendered video URL' },
        { name: 'platform', type: 'VARCHAR(50)', description: 'Target platform (tiktok, instagram, etc)' },
        { name: 'caption', type: 'TEXT', description: 'Post caption' },
        { name: 'compliance_disclosure', type: 'TEXT', description: 'Legal disclosure text' },
        { name: 'created_at', type: 'TIMESTAMP', default: 'NOW()' },
      ],
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Database Schema
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Content Factory database structure and relationships
        </p>
      </div>

      <div className="space-y-6">
        {tables.map((table) => (
          <div
            key={table.name}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-mono font-bold text-gray-900 dark:text-white">
                {table.name}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {table.description}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Column
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Constraints
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {table.columns.map((column) => (
                    <tr key={column.name}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <code className="text-sm font-mono text-gray-900 dark:text-white">
                          {column.name}
                        </code>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">
                          {column.type}
                        </code>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {column.primaryKey && (
                            <span className="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                              PK
                            </span>
                          )}
                          {column.foreignKey && (
                            <span className="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                              FK
                            </span>
                          )}
                          {column.unique && (
                            <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                              UNIQUE
                            </span>
                          )}
                          {column.nullable === false && (
                            <span className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                              NOT NULL
                            </span>
                          )}
                          {column.default && (
                            <span className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                              DEFAULT
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                        {column.description}
                        {column.foreignKey && (
                          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            → {column.foreignKey}
                          </div>
                        )}
                        {column.default && (
                          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            Default: {column.default}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {table.indexes && table.indexes.length > 0 && (
              <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  Indexes
                </h3>
                <div className="space-y-1">
                  {table.indexes.map((index) => (
                    <div
                      key={index.name}
                      className="text-sm text-gray-600 dark:text-gray-400"
                    >
                      <code className="font-mono">{index.name}</code>
                      {' on '}
                      <code className="font-mono">
                        ({index.columns.join(', ')})
                      </code>
                      {index.unique && (
                        <span className="ml-2 px-2 py-0.5 text-xs rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                          UNIQUE
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
