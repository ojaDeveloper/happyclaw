/**
 * 消息拦截器管理 API
 *
 * GET  /api/interceptors         — 列出所有已注册的拦截器（name, description, enabled, order）
 * PUT  /api/interceptors/:name   — 更新拦截器配置（enabled, order），热加载无需重启
 */

import { Hono } from 'hono';
import { z } from 'zod/v4';
import type { Variables } from '../web-context.js';
import { authMiddleware } from '../middleware/auth.js';
import { messageInterceptorPipeline } from '../message-interceptors.js';

const interceptorsRoutes = new Hono<{ Variables: Variables }>();

// 所有接口需要登录
interceptorsRoutes.use('*', authMiddleware);

/**
 * GET /api/interceptors
 * 返回所有已注册拦截器的状态列表。
 */
interceptorsRoutes.get('/', (c) => {
  const registry = messageInterceptorPipeline.getRegistry();
  return c.json({ interceptors: registry });
});

/**
 * PUT /api/interceptors/:name
 * 更新指定拦截器的 enabled / order，立即热加载生效。
 */
const UpdateSchema = z.object({
  enabled: z.boolean().optional(),
  order: z.number().int().min(1).max(9999).optional(),
});

interceptorsRoutes.put('/:name', async (c) => {
  const name = c.req.param('name');
  const registry = messageInterceptorPipeline.getRegistry();
  if (!registry.find((r) => r.name === name)) {
    return c.json({ error: `Interceptor '${name}' not found` }, 404);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.message }, 400);
  }

  messageInterceptorPipeline.updateConfig(name, parsed.data);

  const updated = messageInterceptorPipeline.getRegistry().find((r) => r.name === name);
  return c.json({ interceptor: updated });
});

export { interceptorsRoutes };
