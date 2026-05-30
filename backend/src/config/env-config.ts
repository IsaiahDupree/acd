/**
 * Enhanced Environment Variable Configuration
 * 
 * Centralized, highly configurable system for environment variables.
 * Supports:
 * - Customizable variable names
 * - Default values
 * - Validation rules
 * - Type conversion
 * - Multiple fallback sources
 * - Environment-specific configs
 * - JSON config file support
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables from multiple locations
dotenv.config(); // Load from .env in root
dotenv.config({ path: path.join(__dirname, '..', '.env') }); // Load from backend/.env
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') }); // Load from root .env

export type EnvVarType = 'string' | 'number' | 'boolean' | 'json';

export interface EnvVarDefinition {
  // Variable name configuration
  envVarName: string;              // The actual env var name to use
  configVarName?: string;          // Config var name (ENV_VAR_CONFIG_*)
  
  // Value configuration
  defaultValue?: string | number | boolean;  // Default value if not set
  required?: boolean;              // Whether this variable is required
  type?: EnvVarType;               // Type conversion to apply
  
  // Validation
  validator?: (value: any) => boolean;  // Custom validation function
  allowedValues?: (string | number)[];   // Allowed values (for enums)
  min?: number;                    // Minimum value (for numbers)
  max?: number;                    // Maximum value (for numbers)
  pattern?: RegExp;                // Pattern to match (for strings)
  
  // Fallback sources
  fallbackVars?: string[];         // Alternative env var names to try
  fallbackFile?: string;            // File path to read value from
  fallbackCommand?: string;        // Command to run to get value
  
  // Environment-specific overrides
  envOverrides?: {
    development?: string | number | boolean;
    staging?: string | number | boolean;
    production?: string | number | boolean;
    test?: string | number | boolean;
  };
  
  // Metadata
  description?: string;            // Description for documentation
  example?: string;                // Example value
}

export interface EnvConfig {
  // Claude API authentication
  claudeOAuthToken: EnvVarDefinition;
  claudeApiKey: EnvVarDefinition;
  
  // Database
  databaseUrl: EnvVarDefinition;
  
  // Redis
  redisUrl: EnvVarDefinition;
  
  // Server ports
  backendPort: EnvVarDefinition;
  dashboardPort: EnvVarDefinition;
  
  // Agent service
  agentServiceUrl: EnvVarDefinition;
  
  // Node environment
  nodeEnv: EnvVarDefinition;
  
  // Additional configurable vars
  [key: string]: EnvVarDefinition;
}

/**
 * Default environment variable definitions
 */
const DEFAULT_ENV_DEFINITIONS: EnvConfig = {
  claudeOAuthToken: {
    envVarName: 'CLAUDE_CODE_OAUTH_TOKEN',
    configVarName: 'ENV_VAR_CONFIG_CLAUDE_OAUTH_TOKEN',
    required: false,
    type: 'string',
    fallbackVars: ['ANTHROPIC_API_KEY'],
    description: 'Claude Code OAuth token (preferred)',
    example: 'sk-ant-oat01-...',
  },
  claudeApiKey: {
    envVarName: 'ANTHROPIC_API_KEY',
    configVarName: 'ENV_VAR_CONFIG_CLAUDE_API_KEY',
    required: false,
    type: 'string',
    description: 'Anthropic API key (alternative to OAuth token)',
    example: 'sk-ant-api03-...',
  },
  databaseUrl: {
    envVarName: 'DATABASE_URL',
    configVarName: 'ENV_VAR_CONFIG_DATABASE_URL',
    required: false,
    type: 'string',
    defaultValue: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    pattern: /^postgresql:\/\//,
    description: 'PostgreSQL database connection string',
    example: 'postgresql://user:pass@host:port/db',
  },
  redisUrl: {
    envVarName: 'REDIS_URL',
    configVarName: 'ENV_VAR_CONFIG_REDIS_URL',
    required: false,
    type: 'string',
    defaultValue: 'redis://localhost:6379',
    pattern: /^redis:\/\//,
    description: 'Redis connection string',
    example: 'redis://localhost:6379',
  },
  backendPort: {
    envVarName: 'PORT',
    configVarName: 'ENV_VAR_CONFIG_BACKEND_PORT',
    required: false,
    type: 'number',
    defaultValue: 3434,
    min: 1,
    max: 65535,
    description: 'Backend server port',
    example: '3434',
  },
  dashboardPort: {
    envVarName: 'DASHBOARD_PORT',
    configVarName: 'ENV_VAR_CONFIG_DASHBOARD_PORT',
    required: false,
    type: 'number',
    defaultValue: 3535,
    min: 1,
    max: 65535,
    description: 'Dashboard server port',
    example: '3535',
  },
  agentServiceUrl: {
    envVarName: 'AGENT_SERVICE_URL',
    configVarName: 'ENV_VAR_CONFIG_AGENT_SERVICE_URL',
    required: false,
    type: 'string',
    defaultValue: 'http://localhost:8000',
    pattern: /^https?:\/\//,
    description: 'Python agent service URL',
    example: 'http://localhost:8000',
  },
  nodeEnv: {
    envVarName: 'NODE_ENV',
    configVarName: 'ENV_VAR_CONFIG_NODE_ENV',
    required: false,
    type: 'string',
    defaultValue: 'development',
    allowedValues: ['development', 'staging', 'production', 'test'],
    description: 'Node.js environment',
    example: 'development',
  },
};

/**
 * Load JSON config file if it exists
 */
function loadJsonConfig(): Partial<EnvConfig> | null {
  const configPaths = [
    path.join(__dirname, '..', '..', 'env-config.json'),
    path.join(__dirname, '..', 'env-config.json'),
    path.join(process.cwd(), 'env-config.json'),
  ];
  
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        console.warn(`Failed to parse config file ${configPath}:`, error);
      }
    }
  }
  
  return null;
}

/**
 * Get environment variable definitions with overrides applied
 */
function getEnvVarDefinitions(): EnvConfig {
  const jsonConfig = loadJsonConfig();
  const currentEnv = process.env.NODE_ENV || 'development';
  
  const definitions: EnvConfig = { ...DEFAULT_ENV_DEFINITIONS };
  
  // Apply JSON config overrides
  if (jsonConfig) {
    Object.keys(jsonConfig).forEach(key => {
      if (definitions[key]) {
        definitions[key] = { ...definitions[key], ...jsonConfig[key] };
      }
    });
  }
  
  // Apply environment variable name overrides
  Object.keys(definitions).forEach(key => {
    const def = definitions[key];
    const override = def.configVarName ? process.env[def.configVarName] : undefined;
    if (override) {
      def.envVarName = override;
    }
  });
  
  // Apply environment-specific overrides
  Object.keys(definitions).forEach(key => {
    const def = definitions[key];
    if (def.envOverrides && def.envOverrides[currentEnv as keyof typeof def.envOverrides]) {
      def.defaultValue = def.envOverrides[currentEnv as keyof typeof def.envOverrides];
    }
  });
  
  return definitions;
}

/**
 * Convert value to specified type
 */
function convertType(value: string, type: EnvVarType): any {
  if (!value) return value;
  
  switch (type) {
    case 'number':
      const num = Number(value);
      if (isNaN(num)) throw new Error(`Invalid number: ${value}`);
      return num;
    case 'boolean':
      const lower = value.toLowerCase();
      if (lower === 'true' || lower === '1' || lower === 'yes') return true;
      if (lower === 'false' || lower === '0' || lower === 'no') return false;
      throw new Error(`Invalid boolean: ${value}`);
    case 'json':
      try {
        return JSON.parse(value);
      } catch (e) {
        throw new Error(`Invalid JSON: ${value}`);
      }
    default:
      return value;
  }
}

/**
 * Validate value against definition
 */
function validateValue(value: any, def: EnvVarDefinition): boolean {
  if (def.validator && !def.validator(value)) {
    return false;
  }
  
  if (def.allowedValues && !def.allowedValues.includes(value)) {
    return false;
  }
  
  if (def.type === 'number') {
    const num = Number(value);
    if (isNaN(num)) return false;
    if (def.min !== undefined && num < def.min) return false;
    if (def.max !== undefined && num > def.max) return false;
  }
  
  if (def.type === 'string' && def.pattern && !def.pattern.test(String(value))) {
    return false;
  }
  
  return true;
}

/**
 * Get value from fallback sources
 */
function getFallbackValue(def: EnvVarDefinition): string | null {
  // Try fallback environment variables
  if (def.fallbackVars) {
    for (const fallbackVar of def.fallbackVars) {
      const value = process.env[fallbackVar];
      if (value) return value;
    }
  }
  
  // Try fallback file
  if (def.fallbackFile) {
    const filePath = path.isAbsolute(def.fallbackFile) 
      ? def.fallbackFile 
      : path.join(process.cwd(), def.fallbackFile);
    
    if (fs.existsSync(filePath)) {
      try {
        return fs.readFileSync(filePath, 'utf-8').trim();
      } catch (e) {
        // Ignore read errors
      }
    }
  }
  
  // Try fallback command
  if (def.fallbackCommand) {
    try {
      const { execSync } = require('child_process');
      const result = execSync(def.fallbackCommand, { encoding: 'utf-8', timeout: 5000 });
      return result.trim();
    } catch (e) {
      // Ignore command errors
    }
  }
  
  return null;
}

/**
 * Get environment variable value with full configuration support
 */
export function getEnvValue(key: keyof EnvConfig): any {
  const definitions = getEnvVarDefinitions();
  const def = definitions[key];
  
  if (!def) {
    throw new Error(`Unknown environment variable key: ${key}`);
  }
  
  // Try primary env var
  let value: string | null = process.env[def.envVarName] || null;
  
  // Try fallbacks if not found
  if (!value) {
    value = getFallbackValue(def);
  }
  
  // Use default if still not found
  if (!value && def.defaultValue !== undefined) {
    value = String(def.defaultValue);
  }
  
  // Check required
  if (!value && def.required) {
    throw new Error(
      `Required environment variable ${def.envVarName} is not set. ` +
      (def.description ? `(${def.description})` : '')
    );
  }
  
  // Convert type
  if (value && def.type) {
    try {
      value = convertType(value, def.type);
    } catch (error: any) {
      throw new Error(`Invalid value for ${def.envVarName}: ${error.message}`);
    }
  }
  
  // Validate
  if (value && !validateValue(value, def)) {
    const errors: string[] = [];
    if (def.allowedValues) errors.push(`must be one of: ${def.allowedValues.join(', ')}`);
    if (def.pattern) errors.push(`must match pattern: ${def.pattern}`);
    if (def.min !== undefined || def.max !== undefined) {
      errors.push(`must be between ${def.min ?? 'any'} and ${def.max ?? 'any'}`);
    }
    throw new Error(`Invalid value for ${def.envVarName}: ${errors.join(', ')}`);
  }
  
  return value;
}

/**
 * Get the configured Claude API key/token
 * Tries OAuth token first, then API key
 */
export function getClaudeApiKey(): string {
  const oauthToken = getEnvValue('claudeOAuthToken');
  if (oauthToken) return String(oauthToken);
  
  const apiKey = getEnvValue('claudeApiKey');
  return apiKey ? String(apiKey) : '';
}

/**
 * Check if using OAuth token (vs API key)
 */
export function isOAuthToken(): boolean {
  const apiKey = getClaudeApiKey();
  return apiKey.startsWith('sk-ant-oat01-');
}

/**
 * Get environment variable value by configured name (backward compatibility)
 */
export function getEnv(name: keyof EnvConfig, defaultValue?: string): string {
  try {
    const value = getEnvValue(name);
    return value ? String(value) : (defaultValue || '');
  } catch (e) {
    return defaultValue || '';
  }
}

/**
 * Get all environment variable definitions (for reference)
 */
export function getAllEnvVarDefinitions(): EnvConfig {
  return getEnvVarDefinitions();
}

/**
 * Get environment variable names only (backward compatibility)
 */
export function getEnvVarNames(): Record<string, string> {
  const definitions = getEnvVarDefinitions();
  const names: Record<string, string> = {};
  
  Object.keys(definitions).forEach(key => {
    names[key] = definitions[key].envVarName;
  });
  
  return names as any;
}

/**
 * Get environment config (backward compatibility)
 */
export function getEnvConfig(): Record<string, string> {
  return getEnvVarNames();
}

/**
 * Validate all required environment variables
 */
export function validateEnvConfig(): { valid: boolean; errors: string[] } {
  const definitions = getEnvVarDefinitions();
  const errors: string[] = [];
  
  Object.keys(definitions).forEach(key => {
    try {
      getEnvValue(key as keyof EnvConfig);
    } catch (error: any) {
      errors.push(error.message);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
