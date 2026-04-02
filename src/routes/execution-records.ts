import { Hono } from 'hono';
import type { Variables } from '../web-context.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  getExecutionRecords,
  countExecutionRecords,
  getExecutionRecordById,
} from '../db.js';
import type { AuthUser, ExecutionRecordStatus } from '../types.js';

const executionRecordsRoutes = new Hono<{ Variables: Variables }>();

executionRecordsRoutes.use('*', authMiddleware);

/**
 * Resolve userId for queries:
 * - Admin can filter by any userId or see all (undefined = all)
 * - Member always sees only their own data
 */
function resolveUserId(
  user: AuthUser,
  requestedUserId?: string,
): string | undefined {
  if (user.role === 'admin') {
    return requestedUserId || undefined;
  }
  return user.id;
}

const VALID_STATUSES = new Set([
  'running',
  'completed',
  'failed',
  'interrupted',
]);

/**
 * GET /api/execution-records
 * List execution records with pagination and filters.
 */
executionRecordsRoutes.get('/', (c) => {
  const user = c.get('user') as AuthUser;
  const userId = resolveUserId(user, c.req.query('userId') || undefined);
  const statusParam = c.req.query('status');
  const status =
    statusParam && VALID_STATUSES.has(statusParam)
      ? (statusParam as ExecutionRecordStatus)
      : undefined;
  const chatJid = c.req.query('chatJid') || undefined;
  const limit = Math.min(
    Math.max(parseInt(c.req.query('limit') || '50', 10) || 50, 1),
    200,
  );
  const offset = Math.max(
    parseInt(c.req.query('offset') || '0', 10) || 0,
    0,
  );

  const records = getExecutionRecords({ userId, status, chatJid, limit, offset });
  const total = countExecutionRecords({ userId, status, chatJid });

  return c.json({ records, total, limit, offset });
});

/**
 * GET /api/execution-records/:id
 * Get a single execution record by ID.
 */
executionRecordsRoutes.get('/:id', (c) => {
  const user = c.get('user') as AuthUser;
  const record = getExecutionRecordById(c.req.param('id'));
  if (!record) {
    return c.json({ error: 'Not found' }, 404);
  }
  // Members can only see their own records
  if (user.role !== 'admin' && record.user_id !== user.id) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json({ record });
});

export default executionRecordsRoutes;
