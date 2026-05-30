/**
 * Pagination Utilities
 * ====================
 *
 * Provides cursor-based and offset-based pagination for API endpoints
 * with proper type safety and validation.
 *
 * Feature: PCT-WC-052
 */

import { Request } from 'express';

/**
 * Pagination types
 */
export type PaginationType = 'cursor' | 'offset';

export interface PaginationParams {
  type: PaginationType;
  limit: number;
  offset?: number;
  cursor?: string;
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    total?: number;
    count: number;
    limit: number;
    offset?: number;
    cursor?: string;
    nextCursor?: string;
    prevCursor?: string;
    hasMore: boolean;
    page?: number;
    totalPages?: number;
  };
}

export interface CursorConfig {
  field: string; // Field to use for cursor (e.g., 'id', 'createdAt')
  direction?: 'asc' | 'desc'; // Sort direction
}

/**
 * Default pagination configuration
 */
export const PAGINATION_DEFAULTS = {
  limit: 50,
  maxLimit: 100,
  defaultType: 'offset' as PaginationType,
};

/**
 * Extract pagination parameters from request query
 */
export function extractPaginationParams(req: Request): PaginationParams {
  const query = req.query;

  // Determine pagination type
  const type: PaginationType = query.cursor ? 'cursor' : 'offset';

  // Extract and validate limit
  const parsedLimit = parseInt(query.limit as string);
  let limit = isNaN(parsedLimit) ? PAGINATION_DEFAULTS.limit : parsedLimit;
  limit = Math.max(limit, 1); // Minimum 1
  limit = Math.min(limit, PAGINATION_DEFAULTS.maxLimit); // Cap at max

  // Extract offset or cursor
  const offset = type === 'offset' ? parseInt(query.offset as string) || 0 : undefined;
  const cursor = type === 'cursor' ? (query.cursor as string) : undefined;

  return {
    type,
    limit,
    offset,
    cursor,
  };
}

/**
 * Create a cursor from a record
 */
export function createCursor(record: any, config: CursorConfig): string {
  const value = record[config.field];
  if (value === undefined || value === null) {
    throw new Error(`Cursor field '${config.field}' not found in record`);
  }

  // Encode cursor as base64 JSON
  const cursorData = {
    field: config.field,
    value: value,
    direction: config.direction || 'asc',
  };

  return Buffer.from(JSON.stringify(cursorData)).toString('base64');
}

/**
 * Decode a cursor string
 */
export function decodeCursor(cursor: string): { field: string; value: any; direction: 'asc' | 'desc' } {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    const data = JSON.parse(decoded);

    if (!data.field || data.value === undefined) {
      throw new Error('Invalid cursor format');
    }

    return {
      field: data.field,
      value: data.value,
      direction: data.direction || 'asc',
    };
  } catch (error) {
    throw new Error('Invalid cursor: unable to decode');
  }
}

/**
 * Build Prisma cursor query parameters
 */
export function buildCursorQuery(
  cursor: string | undefined,
  config: CursorConfig,
  limit: number
): { cursor?: any; take: number; skip?: number; orderBy: any } {
  const orderBy = { [config.field]: config.direction || 'asc' };

  if (!cursor) {
    return {
      take: limit + 1, // Fetch one extra to check if there's more
      orderBy,
    };
  }

  const decoded = decodeCursor(cursor);

  return {
    cursor: { [decoded.field]: decoded.value },
    take: limit + 1,
    skip: 1, // Skip the cursor itself
    orderBy,
  };
}

/**
 * Build Prisma offset query parameters
 */
export function buildOffsetQuery(
  offset: number,
  limit: number,
  orderBy?: any
): { skip: number; take: number; orderBy?: any } {
  return {
    skip: offset,
    take: limit,
    orderBy: orderBy || { createdAt: 'desc' },
  };
}

/**
 * Create pagination result with cursor-based pagination
 */
export function createCursorPaginationResult<T>(
  records: T[],
  limit: number,
  config: CursorConfig
): PaginationResult<T> {
  const hasMore = records.length > limit;
  const data = hasMore ? records.slice(0, -1) : records;

  let nextCursor: string | undefined;
  let prevCursor: string | undefined;

  if (hasMore && data.length > 0) {
    nextCursor = createCursor(data[data.length - 1], config);
  }

  if (data.length > 0) {
    prevCursor = createCursor(data[0], config);
  }

  return {
    data,
    pagination: {
      count: data.length,
      limit,
      cursor: nextCursor,
      nextCursor,
      prevCursor,
      hasMore,
    },
  };
}

/**
 * Create pagination result with offset-based pagination
 */
export function createOffsetPaginationResult<T>(
  records: T[],
  total: number,
  limit: number,
  offset: number
): PaginationResult<T> {
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;
  const hasMore = offset + records.length < total;

  return {
    data: records,
    pagination: {
      total,
      count: records.length,
      limit,
      offset,
      hasMore,
      page: currentPage,
      totalPages,
    },
  };
}

/**
 * Middleware to add pagination helpers to Express request
 */
export function paginationMiddleware() {
  return (req: Request & { pagination?: PaginationParams }, res: any, next: any) => {
    req.pagination = extractPaginationParams(req);
    next();
  };
}

/**
 * Create a paginated response with proper headers
 */
export function sendPaginatedResponse<T>(
  res: any,
  result: PaginationResult<T>,
  baseUrl: string
) {
  const { data, pagination } = result;

  // Set Link headers for pagination (RFC 5988)
  const links: string[] = [];

  if (pagination.nextCursor) {
    links.push(`<${baseUrl}?cursor=${pagination.nextCursor}&limit=${pagination.limit}>; rel="next"`);
  }

  if (pagination.prevCursor) {
    links.push(`<${baseUrl}?cursor=${pagination.prevCursor}&limit=${pagination.limit}>; rel="prev"`);
  }

  if (pagination.offset !== undefined && pagination.total !== undefined) {
    const nextOffset = pagination.offset + pagination.limit;
    const prevOffset = Math.max(0, pagination.offset - pagination.limit);

    if (pagination.hasMore) {
      links.push(`<${baseUrl}?offset=${nextOffset}&limit=${pagination.limit}>; rel="next"`);
    }

    if (pagination.offset > 0) {
      links.push(`<${baseUrl}?offset=${prevOffset}&limit=${pagination.limit}>; rel="prev"`);
    }

    // First and last page links
    links.push(`<${baseUrl}?offset=0&limit=${pagination.limit}>; rel="first"`);
    const lastOffset = Math.max(0, pagination.total - pagination.limit);
    links.push(`<${baseUrl}?offset=${lastOffset}&limit=${pagination.limit}>; rel="last"`);
  }

  if (links.length > 0) {
    res.setHeader('Link', links.join(', '));
  }

  // Set pagination metadata headers
  res.setHeader('X-Total-Count', pagination.total?.toString() || pagination.count.toString());
  res.setHeader('X-Page-Count', pagination.count.toString());
  res.setHeader('X-Has-More', pagination.hasMore.toString());

  if (pagination.page && pagination.totalPages) {
    res.setHeader('X-Page', pagination.page.toString());
    res.setHeader('X-Total-Pages', pagination.totalPages.toString());
  }

  return res.json(result);
}

/**
 * Example usage with Prisma
 *
 * Cursor-based:
 * ```
 * const params = extractPaginationParams(req);
 * const config: CursorConfig = { field: 'id', direction: 'asc' };
 * const query = buildCursorQuery(params.cursor, config, params.limit);
 *
 * const records = await prisma.user.findMany(query);
 * const result = createCursorPaginationResult(records, params.limit, config);
 *
 * return sendPaginatedResponse(res, result, '/api/users');
 * ```
 *
 * Offset-based:
 * ```
 * const params = extractPaginationParams(req);
 * const query = buildOffsetQuery(params.offset || 0, params.limit);
 *
 * const [records, total] = await Promise.all([
 *   prisma.user.findMany(query),
 *   prisma.user.count()
 * ]);
 *
 * const result = createOffsetPaginationResult(records, total, params.limit, params.offset || 0);
 * return sendPaginatedResponse(res, result, '/api/users');
 * ```
 */
