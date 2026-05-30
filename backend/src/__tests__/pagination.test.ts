/**
 * Pagination Tests
 * ================
 *
 * Tests for PCT-WC-052: Cursor/offset pagination
 */

import { describe, it, expect } from 'vitest';
import {
  extractPaginationParams,
  createCursor,
  decodeCursor,
  buildCursorQuery,
  buildOffsetQuery,
  createCursorPaginationResult,
  createOffsetPaginationResult,
  PAGINATION_DEFAULTS,
} from '../utils/pagination';
import { Request } from 'express';

describe('Pagination Utilities (PCT-WC-052)', () => {
  describe('extractPaginationParams', () => {
    it('should extract offset pagination params from query', () => {
      const req = {
        query: { offset: '10', limit: '20' },
      } as unknown as Request;

      const params = extractPaginationParams(req);

      expect(params.type).toBe('offset');
      expect(params.offset).toBe(10);
      expect(params.limit).toBe(20);
    });

    it('should extract cursor pagination params from query', () => {
      const req = {
        query: { cursor: 'abc123', limit: '25' },
      } as unknown as Request;

      const params = extractPaginationParams(req);

      expect(params.type).toBe('cursor');
      expect(params.cursor).toBe('abc123');
      expect(params.limit).toBe(25);
    });

    it('should use default limit if not provided', () => {
      const req = {
        query: {},
      } as unknown as Request;

      const params = extractPaginationParams(req);

      expect(params.limit).toBe(PAGINATION_DEFAULTS.limit);
      expect(params.type).toBe('offset');
      expect(params.offset).toBe(0);
    });

    it('should cap limit at maximum', () => {
      const req = {
        query: { limit: '1000' },
      } as unknown as Request;

      const params = extractPaginationParams(req);

      expect(params.limit).toBe(PAGINATION_DEFAULTS.maxLimit);
    });

    it('should enforce minimum limit of 1', () => {
      const req = {
        query: { limit: '0' },
      } as unknown as Request;

      const params = extractPaginationParams(req);

      expect(params.limit).toBe(1);
    });

    it('should handle invalid numeric values', () => {
      const req = {
        query: { limit: 'invalid', offset: 'bad' },
      } as unknown as Request;

      const params = extractPaginationParams(req);

      expect(params.limit).toBe(PAGINATION_DEFAULTS.limit);
      expect(params.offset).toBe(0);
    });
  });

  describe('createCursor and decodeCursor', () => {
    it('should create and decode cursor for ID field', () => {
      const record = { id: '123', name: 'Test' };
      const config = { field: 'id', direction: 'asc' as const };

      const cursor = createCursor(record, config);
      const decoded = decodeCursor(cursor);

      expect(decoded.field).toBe('id');
      expect(decoded.value).toBe('123');
      expect(decoded.direction).toBe('asc');
    });

    it('should create and decode cursor for timestamp field', () => {
      const record = { id: 1, createdAt: new Date('2023-01-01') };
      const config = { field: 'createdAt', direction: 'desc' as const };

      const cursor = createCursor(record, config);
      const decoded = decodeCursor(cursor);

      expect(decoded.field).toBe('createdAt');
      expect(decoded.direction).toBe('desc');
    });

    it('should create cursor with default direction', () => {
      const record = { id: 42 };
      const config = { field: 'id' };

      const cursor = createCursor(record, config);
      const decoded = decodeCursor(cursor);

      expect(decoded.direction).toBe('asc');
    });

    it('should throw error if cursor field not found', () => {
      const record = { id: 1, name: 'Test' };
      const config = { field: 'missingField' };

      expect(() => createCursor(record, config)).toThrow(
        "Cursor field 'missingField' not found in record"
      );
    });

    it('should throw error for invalid cursor string', () => {
      expect(() => decodeCursor('invalid-cursor')).toThrow('Invalid cursor');
    });

    it('should throw error for malformed cursor data', () => {
      const invalidCursor = Buffer.from(JSON.stringify({ invalid: true })).toString('base64');
      expect(() => decodeCursor(invalidCursor)).toThrow('Invalid cursor');
    });
  });

  describe('buildCursorQuery', () => {
    it('should build initial cursor query without cursor', () => {
      const config = { field: 'id', direction: 'asc' as const };
      const limit = 10;

      const query = buildCursorQuery(undefined, config, limit);

      expect(query.take).toBe(11); // limit + 1
      expect(query.orderBy).toEqual({ id: 'asc' });
      expect(query.cursor).toBeUndefined();
      expect(query.skip).toBeUndefined();
    });

    it('should build cursor query with cursor', () => {
      const record = { id: 100 };
      const config = { field: 'id', direction: 'asc' as const };
      const cursor = createCursor(record, config);
      const limit = 10;

      const query = buildCursorQuery(cursor, config, limit);

      expect(query.take).toBe(11);
      expect(query.skip).toBe(1);
      expect(query.cursor).toEqual({ id: 100 });
      expect(query.orderBy).toEqual({ id: 'asc' });
    });

    it('should build descending cursor query', () => {
      const record = { createdAt: new Date('2023-01-01') };
      const config = { field: 'createdAt', direction: 'desc' as const };
      const cursor = createCursor(record, config);

      const query = buildCursorQuery(cursor, config, 20);

      expect(query.orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('buildOffsetQuery', () => {
    it('should build offset query with default order', () => {
      const query = buildOffsetQuery(0, 10);

      expect(query.skip).toBe(0);
      expect(query.take).toBe(10);
      expect(query.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('should build offset query with custom order', () => {
      const orderBy = { name: 'asc' };
      const query = buildOffsetQuery(20, 15, orderBy);

      expect(query.skip).toBe(20);
      expect(query.take).toBe(15);
      expect(query.orderBy).toEqual(orderBy);
    });

    it('should handle zero offset', () => {
      const query = buildOffsetQuery(0, 50);

      expect(query.skip).toBe(0);
      expect(query.take).toBe(50);
    });
  });

  describe('createCursorPaginationResult', () => {
    const config = { field: 'id', direction: 'asc' as const };

    it('should create result with more pages', () => {
      const records = Array.from({ length: 11 }, (_, i) => ({ id: i + 1 }));
      const limit = 10;

      const result = createCursorPaginationResult(records, limit, config);

      expect(result.data.length).toBe(10);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.count).toBe(10);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.nextCursor).toBeDefined();
    });

    it('should create result without more pages', () => {
      const records = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));
      const limit = 10;

      const result = createCursorPaginationResult(records, limit, config);

      expect(result.data.length).toBe(5);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.count).toBe(5);
      expect(result.pagination.nextCursor).toBeUndefined();
    });

    it('should create cursors for prev and next', () => {
      const records = Array.from({ length: 11 }, (_, i) => ({ id: i + 1 }));
      const limit = 10;

      const result = createCursorPaginationResult(records, limit, config);

      expect(result.pagination.prevCursor).toBeDefined();
      expect(result.pagination.nextCursor).toBeDefined();

      const prevDecoded = decodeCursor(result.pagination.prevCursor!);
      const nextDecoded = decodeCursor(result.pagination.nextCursor!);

      expect(prevDecoded.value).toBe(1); // First record
      expect(nextDecoded.value).toBe(10); // Last record (before extra)
    });

    it('should handle empty results', () => {
      const records: any[] = [];
      const limit = 10;

      const result = createCursorPaginationResult(records, limit, config);

      expect(result.data.length).toBe(0);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeUndefined();
      expect(result.pagination.prevCursor).toBeUndefined();
    });
  });

  describe('createOffsetPaginationResult', () => {
    it('should create result for first page', () => {
      const records = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
      const total = 50;
      const limit = 10;
      const offset = 0;

      const result = createOffsetPaginationResult(records, total, limit, offset);

      expect(result.data.length).toBe(10);
      expect(result.pagination.total).toBe(50);
      expect(result.pagination.count).toBe(10);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.offset).toBe(0);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.totalPages).toBe(5);
    });

    it('should create result for middle page', () => {
      const records = Array.from({ length: 10 }, (_, i) => ({ id: i + 11 }));
      const total = 50;
      const limit = 10;
      const offset = 10;

      const result = createOffsetPaginationResult(records, total, limit, offset);

      expect(result.pagination.page).toBe(2);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.totalPages).toBe(5);
    });

    it('should create result for last page', () => {
      const records = Array.from({ length: 10 }, (_, i) => ({ id: i + 41 }));
      const total = 50;
      const limit = 10;
      const offset = 40;

      const result = createOffsetPaginationResult(records, total, limit, offset);

      expect(result.pagination.page).toBe(5);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.totalPages).toBe(5);
    });

    it('should handle partial last page', () => {
      const records = Array.from({ length: 3 }, (_, i) => ({ id: i + 48 }));
      const total = 50;
      const limit = 10;
      const offset = 47;

      const result = createOffsetPaginationResult(records, total, limit, offset);

      expect(result.pagination.count).toBe(3);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('should handle empty results', () => {
      const records: any[] = [];
      const total = 0;
      const limit = 10;
      const offset = 0;

      const result = createOffsetPaginationResult(records, total, limit, offset);

      expect(result.data.length).toBe(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.totalPages).toBe(0);
    });
  });
});
