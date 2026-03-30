/**
 * HeaderInjector — 消息拦截器：自动在 Agent 回复前注入标准 header
 *
 * Header 格式：
 *   回答序号：N
 *   我正在使用【XXX】模型回答你的问题。
 *   上一轮（序号N-1）：输入 X tokens + 缓存读取 X + 缓存写入 X + 输出 X tokens，费用 $X.XX。本次消耗统计中。
 *
 * 序号从数据库持久化，重启后不归零，同一 IM 会话全程递增。
 */

import {
  MessageInterceptor,
  OutboundContext,
} from '../message-interceptors.js';
import {
  incrementAndGetAnswerCount,
  getLastAgentMessageUsage,
} from '../db.js';

/** 模型别名 → 展示名称映射 */
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'claude-opus-4-6': 'Claude Opus 4.6',
  'claude-opus-4-6[1m]': 'Claude Opus 4.6 (1M context)',
  'opus[1m]': 'Claude Opus 4.6 (1M context)',
  opus: 'Claude Opus 4.6',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  sonnet: 'Claude Sonnet 4.6',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
  haiku: 'Claude Haiku 4.5',
};

function formatModelName(model?: string): string {
  if (!model) return '未知模型';
  return MODEL_DISPLAY_NAMES[model] ?? model;
}

function formatCost(costUSD: number): string {
  return `$${costUSD.toFixed(2)}`;
}

export class HeaderInjector implements MessageInterceptor {
  readonly name = 'HeaderInjector';

  readonly description =
    '在每条 Agent 回复前自动注入三行标准 header：回答序号（DB 持久化，重启不归零）、' +
    '当前模型名称、以及上一轮的 token 消耗明细和费用。' +
    '启用后 Agent 无需手动遵守行为准则前三条。';

  /** 每个 chatJid 最近一次回复使用的模型（从 usage 回调更新） */
  private readonly lastKnownModel = new Map<string, string>();

  /**
   * 当 usage 记录写入后调用此方法更新模型信息。
   * 在 index.ts 的 writeUsageRecords() 之后调用。
   */
  notifyUsageRecorded(chatJid: string, model: string): void {
    if (model && model !== 'unknown') {
      this.lastKnownModel.set(chatJid, model);
    }
  }

  async onOutbound(ctx: OutboundContext): Promise<void> {
    // 查询上一轮的 usage（在当前轮 usage 写入之前执行，所以 DB 里是前一轮的）
    const lastUsage = getLastAgentMessageUsage(ctx.chatJid);

    // 递增序号，获取当前回答序号 N
    const currentN = incrementAndGetAnswerCount(ctx.chatJid);
    const prevN = currentN - 1;

    // 模型名称：优先 ctx.model，其次内存缓存，最后 lastUsage 中的 model
    const modelRaw =
      ctx.model ??
      this.lastKnownModel.get(ctx.chatJid) ??
      lastUsage?.model;
    const modelDisplay = formatModelName(modelRaw);

    // 构建三行 header
    const line1 = `回答序号：${currentN}`;
    const line2 = `我正在使用【${modelDisplay}】模型回答你的问题。`;

    let line3: string;
    if (prevN <= 0 || !lastUsage) {
      line3 = '新会话首条，无上一轮 token 数据。本次消耗统计中。';
    } else {
      line3 =
        `上一轮（序号${prevN}）：输入 ${lastUsage.inputTokens} tokens` +
        ` + 缓存读取 ${lastUsage.cacheReadInputTokens}` +
        ` + 缓存写入 ${lastUsage.cacheCreationInputTokens}` +
        ` + 输出 ${lastUsage.outputTokens} tokens，费用 ${formatCost(lastUsage.costUSD)}。本次消耗统计中。`;
    }

    const sessionLine = ctx.sessionId ? `本次 session_id：${ctx.sessionId}` : null;
    const header = sessionLine
      ? `${line1}\n${line2}\n${line3}\n${sessionLine}`
      : `${line1}\n${line2}\n${line3}`;
    ctx.content = `${header}\n\n${ctx.content}`;
  }
}

/** 全局单例，供 index.ts 注册和 writeUsageRecords 回调使用 */
export const headerInjector = new HeaderInjector();
