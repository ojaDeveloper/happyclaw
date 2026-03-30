/**
 * 消息拦截器（Message Interceptors）
 *
 * 提供类似 Web 中间件的可扩展拦截机制：
 *   用户消息 → [InboundInterceptors] → Agent 处理 → [OutboundInterceptors] → 发送给用户
 *
 * 注册拦截器：
 *   messageInterceptorPipeline.use(new MyInterceptor());
 *
 * 拦截器按配置文件中的 order 排序执行，支持热加载（无需重启）。
 * 配置文件路径：data/config/interceptors.json
 */

import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './config.js';
import { logger } from './logger.js';

const CONFIG_PATH = path.join(DATA_DIR, 'config', 'interceptors.json');

export interface InboundContext {
  /** 目标聊天 JID */
  chatJid: string;
  /** 消息内容（可修改） */
  content: string;
  /** 来源渠道：'telegram' | 'feishu' | 'qq' | 'web' */
  source?: string;
  /** 发送者用户 ID */
  userId?: string;
}

export interface OutboundContext {
  /** 目标聊天 JID */
  chatJid: string;
  /** Agent 回复内容（可修改） */
  content: string;
  /** 本轮使用的模型 */
  model?: string;
  /** 本轮 Claude session ID */
  sessionId?: string;
  /** 本轮 token 消耗 */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    costUSD: number;
  };
}

export interface MessageInterceptor {
  /** 拦截器唯一名称，用于配置文件索引 */
  readonly name: string;
  /** 拦截器功能描述（显示在设置页面） */
  readonly description: string;
  /** 拦截入站消息（用户发给 Agent） */
  onInbound?(ctx: InboundContext): Promise<void>;
  /** 拦截出站消息（Agent 回复给用户），在发送前调用 */
  onOutbound?(ctx: OutboundContext): Promise<void>;
}

/** 单个拦截器的配置条目 */
export interface InterceptorConfigEntry {
  name: string;
  enabled: boolean;
  order: number;
}

/** interceptors.json 文件结构 */
interface InterceptorConfigFile {
  interceptors: InterceptorConfigEntry[];
}

/** 注册表条目（拦截器实例 + 当前配置） */
export interface InterceptorRegistryEntry {
  name: string;
  description: string;
  enabled: boolean;
  order: number;
}

class MessageInterceptorPipeline {
  private interceptors: MessageInterceptor[] = [];
  private config: Map<string, InterceptorConfigEntry> = new Map();
  private configWatcher: fs.FSWatcher | null = null;

  /** 注册一个拦截器实例 */
  use(interceptor: MessageInterceptor): this {
    this.interceptors.push(interceptor);
    return this;
  }

  /** 移除指定名称的拦截器 */
  remove(name: string): this {
    this.interceptors = this.interceptors.filter((i) => i.name !== name);
    return this;
  }

  /**
   * 加载热配置文件，并启动 fs.watch 监听变更。
   * 在 index.ts main() 中调用一次即可。
   */
  loadConfig(): void {
    this._readConfig();
    this._startWatcher();
  }

  /**
   * 更新指定拦截器的配置并持久化。
   * 由设置页面 API 调用。
   */
  updateConfig(name: string, patch: Partial<Omit<InterceptorConfigEntry, 'name'>>): void {
    const existing = this.config.get(name) ?? this._defaultEntry(name);
    const updated: InterceptorConfigEntry = { ...existing, ...patch, name };
    this.config.set(name, updated);
    this._writeConfig();
  }

  /**
   * 返回所有已注册拦截器的完整状态（供设置页面使用）。
   */
  getRegistry(): InterceptorRegistryEntry[] {
    return this.interceptors.map((i) => {
      const cfg = this.config.get(i.name) ?? this._defaultEntry(i.name);
      return {
        name: i.name,
        description: i.description,
        enabled: cfg.enabled,
        order: cfg.order,
      };
    });
  }

  /** 依次执行所有入站拦截器（按 order 排序，跳过 disabled） */
  async runInbound(ctx: InboundContext): Promise<void> {
    for (const interceptor of this._sortedEnabled()) {
      if (interceptor.onInbound) {
        await interceptor.onInbound(ctx);
      }
    }
  }

  /** 依次执行所有出站拦截器（按 order 排序，跳过 disabled） */
  async runOutbound(ctx: OutboundContext): Promise<void> {
    for (const interceptor of this._sortedEnabled()) {
      if (interceptor.onOutbound) {
        await interceptor.onOutbound(ctx);
      }
    }
  }

  /** 获取已排序、已过滤的拦截器列表 */
  private _sortedEnabled(): MessageInterceptor[] {
    return this.interceptors
      .filter((i) => {
        const cfg = this.config.get(i.name);
        return cfg ? cfg.enabled : true; // 未配置时默认启用
      })
      .sort((a, b) => {
        const orderA = this.config.get(a.name)?.order ?? 999;
        const orderB = this.config.get(b.name)?.order ?? 999;
        return orderA - orderB;
      });
  }

  private _defaultEntry(name: string): InterceptorConfigEntry {
    return { name, enabled: true, order: 999 };
  }

  private _readConfig(): void {
    try {
      if (!fs.existsSync(CONFIG_PATH)) {
        // 首次运行，根据已注册拦截器生成默认配置
        this._writeConfig();
        return;
      }
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const file: InterceptorConfigFile = JSON.parse(raw);
      this.config.clear();
      for (const entry of file.interceptors ?? []) {
        this.config.set(entry.name, entry);
      }
      logger.info({ count: this.config.size }, 'Interceptor config loaded');
    } catch (err) {
      logger.warn({ err }, 'Failed to read interceptors.json, using defaults');
    }
  }

  private _writeConfig(): void {
    try {
      fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
      // 合并：已有配置 + 新注册但未在配置中的拦截器
      const entries: InterceptorConfigEntry[] = [];
      const seen = new Set<string>();
      // 已在配置文件中的条目（保持原顺序）
      for (const entry of this.config.values()) {
        entries.push(entry);
        seen.add(entry.name);
      }
      // 新注册但未在配置中的拦截器（追加到末尾）
      this.interceptors.forEach((i, idx) => {
        if (!seen.has(i.name)) {
          entries.push({ name: i.name, enabled: true, order: (entries.length + idx + 1) * 10 });
        }
      });
      const file: InterceptorConfigFile = { interceptors: entries };
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(file, null, 2), 'utf-8');
    } catch (err) {
      logger.warn({ err }, 'Failed to write interceptors.json');
    }
  }

  private _startWatcher(): void {
    if (this.configWatcher) return;
    try {
      // 先确保文件存在再 watch
      if (!fs.existsSync(CONFIG_PATH)) this._writeConfig();

      this.configWatcher = fs.watch(CONFIG_PATH, () => {
        logger.info('interceptors.json changed, hot-reloading config');
        this._readConfig();
      });
      this.configWatcher.on('error', (err) => {
        logger.warn({ err }, 'Interceptor config watcher error');
        this.configWatcher = null;
      });
    } catch (err) {
      logger.warn({ err }, 'Failed to start interceptor config watcher');
    }
  }
}

/** 全局消息拦截器管道，在 index.ts 中注册拦截器并调用 loadConfig() */
export const messageInterceptorPipeline = new MessageInterceptorPipeline();
