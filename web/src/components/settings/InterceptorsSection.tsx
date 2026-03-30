/**
 * 消息拦截器管理页面
 * 列出所有已注册的消息拦截器，支持启用/禁用和调整执行顺序（热加载，无需重启）。
 */

import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { getErrorMessage } from './types';

interface InterceptorEntry {
  name: string;
  description: string;
  enabled: boolean;
  order: number;
}

export function InterceptorsSection() {
  const [interceptors, setInterceptors] = useState<InterceptorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [orderDraft, setOrderDraft] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<{ interceptors: InterceptorEntry[] }>('/api/interceptors');
      setInterceptors(data.interceptors);
      const draft: Record<string, string> = {};
      for (const item of data.interceptors) {
        draft[item.name] = String(item.order);
      }
      setOrderDraft(draft);
    } catch (err) {
      toast.error(getErrorMessage(err, '加载拦截器列表失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggle = async (name: string, enabled: boolean) => {
    setSaving((s) => ({ ...s, [name]: true }));
    try {
      const result = await api.put<{ interceptor: InterceptorEntry }>(
        `/api/interceptors/${encodeURIComponent(name)}`,
        { enabled },
      );
      setInterceptors((prev) =>
        prev.map((i) => (i.name === name ? result.interceptor : i)),
      );
      toast.success(`拦截器「${name}」已${enabled ? '启用' : '禁用'}，立即生效`);
    } catch (err) {
      toast.error(getErrorMessage(err, '更新失败'));
    } finally {
      setSaving((s) => ({ ...s, [name]: false }));
    }
  };

  const handleOrderSave = async (name: string) => {
    const raw = orderDraft[name];
    const order = parseInt(raw, 10);
    if (isNaN(order) || order < 1 || order > 9999) {
      toast.error('执行顺序必须为 1-9999 的整数');
      return;
    }
    setSaving((s) => ({ ...s, [`${name}_order`]: true }));
    try {
      const result = await api.put<{ interceptor: InterceptorEntry }>(
        `/api/interceptors/${encodeURIComponent(name)}`,
        { order },
      );
      setInterceptors((prev) =>
        prev.map((i) => (i.name === name ? result.interceptor : i)),
      );
      toast.success(`拦截器「${name}」顺序已更新，立即生效`);
    } catch (err) {
      toast.error(getErrorMessage(err, '更新失败'));
    } finally {
      setSaving((s) => ({ ...s, [`${name}_order`]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            拦截器在 Agent 发送消息前/后自动执行，可修改消息内容。配置变更即时生效，无需重启服务。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="shrink-0">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          刷新
        </Button>
      </div>

      {interceptors.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          暂无已注册的拦截器
        </div>
      ) : (
        <div className="space-y-3">
          {[...interceptors]
            .sort((a, b) => a.order - b.order)
            .map((item) => (
              <div
                key={item.name}
                className="flex flex-col sm:flex-row sm:items-start gap-4 p-4 rounded-lg border border-border bg-card"
              >
                {/* Icon + Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-medium text-sm text-foreground">{item.name}</span>
                    <Badge
                      variant={item.enabled ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {item.enabled ? '运行中' : '已禁用'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed pl-6">
                    {item.description}
                  </p>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-4 shrink-0">
                  {/* Order */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">顺序</span>
                    <Input
                      type="number"
                      min={1}
                      max={9999}
                      className="w-16 h-7 text-xs text-center"
                      value={orderDraft[item.name] ?? item.order}
                      onChange={(e) =>
                        setOrderDraft((d) => ({ ...d, [item.name]: e.target.value }))
                      }
                      onBlur={() => {
                        if (orderDraft[item.name] !== String(item.order)) {
                          handleOrderSave(item.name);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleOrderSave(item.name);
                      }}
                    />
                    {saving[`${item.name}_order`] && (
                      <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                    )}
                  </div>

                  {/* Toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {item.enabled ? '启用' : '禁用'}
                    </span>
                    <Switch
                      checked={item.enabled}
                      disabled={saving[item.name]}
                      onCheckedChange={(checked) => handleToggle(item.name, checked)}
                    />
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        提示：执行顺序数字越小越先执行。修改顺序后按 Enter 或失焦即时保存。
      </p>
    </div>
  );
}
