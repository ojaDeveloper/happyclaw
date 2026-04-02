import { useEffect, useState } from 'react';
import {
  useExecutionRecordsStore,
  type ExecutionRecord,
  type ExecutionRecordStatus,
  type ToolCallDetail,
} from '../stores/execution-records';
import { RefreshCw, ClipboardList, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { SkeletonCardList } from '@/components/common/Skeletons';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';

const STATUS_LABELS: Record<ExecutionRecordStatus, string> = {
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  interrupted: '已中断',
};

const STATUS_COLORS: Record<ExecutionRecordStatus, string> = {
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed:
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  interrupted:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

const CHANNEL_LABELS: Record<string, string> = {
  web: 'Web',
  feishu: '飞书',
  telegram: 'Telegram',
  qq: 'QQ',
  dingtalk: '钉钉',
};

const FILTER_TABS: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'running', label: '执行中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'interrupted', label: '已中断' },
];

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatCost(usd: number): string {
  if (!usd || usd === 0) return '-';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseToolDetails(json: string): ToolCallDetail[] {
  try {
    return JSON.parse(json) as ToolCallDetail[];
  } catch {
    return [];
  }
}

function StatusBadge({ status }: { status: ExecutionRecordStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {status === 'running' && (
        <span className="relative flex size-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full size-2 bg-blue-500" />
        </span>
      )}
      {STATUS_LABELS[status]}
    </span>
  );
}

function ToolDetailsList({ details }: { details: ToolCallDetail[] }) {
  if (details.length === 0) return <span className="text-muted-foreground text-xs">-</span>;
  return (
    <div className="space-y-1">
      {details.map((d, i) => (
        <div key={i} className="flex items-start gap-1.5 text-xs">
          <span className="shrink-0 px-1.5 py-0.5 rounded bg-muted font-medium text-muted-foreground">
            {d.name}
          </span>
          {d.summary && (
            <span className="text-foreground/70 break-all line-clamp-2" title={d.summary}>
              {d.summary}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function RecordCard({ record }: { record: ExecutionRecord }) {
  const [expanded, setExpanded] = useState(false);
  const details = parseToolDetails(record.tool_details);
  return (
    <div className="border rounded-lg p-4 space-y-2 bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground line-clamp-2">
            {record.description || '(无描述)'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {record.group_name || record.group_folder}
          </p>
        </div>
        <StatusBadge status={record.status} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {record.source_channel && (
          <span>{CHANNEL_LABELS[record.source_channel] || record.source_channel}</span>
        )}
        {record.model && <span>{record.model}</span>}
        {record.duration_ms > 0 && <span>{formatDuration(record.duration_ms)}</span>}
        <span>{formatCost(record.cost_usd)}</span>
        <span>{formatTime(record.started_at)}</span>
      </div>
      {details.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {details.length} 次工具调用
          </button>
          {expanded && (
            <div className="mt-2 pl-2 border-l-2 border-muted">
              <ToolDetailsList details={details} />
            </div>
          )}
        </div>
      )}
      {record.error && (
        <p className="text-xs text-red-500 line-clamp-2">{record.error}</p>
      )}
    </div>
  );
}

function RecordRow({ record, expanded, onToggle }: { record: ExecutionRecord; expanded: boolean; onToggle: () => void }) {
  const details = parseToolDetails(record.tool_details);
  return (
    <>
      <tr className="border-b hover:bg-muted/50 transition-colors cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-3 max-w-xs">
          <p className="text-sm truncate" title={record.description}>
            {record.description || '(无描述)'}
          </p>
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {record.group_name || record.group_folder}
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={record.status} />
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {CHANNEL_LABELS[record.source_channel || ''] || record.source_channel || '-'}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            {details.length > 0 ? (
              <>
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {details.length} 次调用
              </>
            ) : '-'}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {record.model || '-'}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {record.duration_ms > 0 ? formatDuration(record.duration_ms) : '-'}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {formatCost(record.cost_usd)}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
          {formatTime(record.started_at)}
        </td>
      </tr>
      {expanded && details.length > 0 && (
        <tr className="border-b bg-muted/30">
          <td colSpan={9} className="px-6 py-3">
            <ToolDetailsList details={details} />
          </td>
        </tr>
      )}
    </>
  );
}

export function ExecutionRecordsPage() {
  const {
    records,
    loading,
    error,
    total,
    filter,
    page,
    pageSize,
    loadRecords,
    setFilter,
    setPage,
  } = useExecutionRecordsStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // Auto-refresh when there are running records
  const hasRunning = records.some((r) => r.status === 'running');
  useEffect(() => {
    if (!hasRunning) return;
    const interval = setInterval(loadRecords, 5000);
    return () => clearInterval(interval);
  }, [hasRunning, loadRecords]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="min-h-full bg-background p-4 lg:p-8 pb-28 lg:pb-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="执行记录"
          subtitle={`共 ${total} 条记录`}
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadRecords()}
              disabled={loading}
            >
              <RefreshCw
                size={16}
                className={loading ? 'animate-spin' : ''}
              />
              <span className="ml-1.5">刷新</span>
            </Button>
          }
        />

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <span className="text-sm text-destructive">{error}</span>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 overflow-x-auto">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value as typeof filter)}
              className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors ${
                filter === tab.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading && records.length === 0 ? (
          <SkeletonCardList count={4} />
        ) : records.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="还没有执行记录"
            description="当 Agent 使用工具执行任务时，记录将在此显示"
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      描述
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      工作区
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      状态
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      来源
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      工具调用
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      模型
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      耗时
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      费用
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      时间
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <RecordRow
                      key={r.id}
                      record={r}
                      expanded={expandedId === r.id}
                      onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden space-y-3">
              {records.map((r) => (
                <RecordCard key={r.id} record={r} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={16} />
                </Button>
                <span className="text-sm text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
