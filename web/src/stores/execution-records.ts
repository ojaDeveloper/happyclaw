import { create } from 'zustand';
import { api } from '../api/client';
import { extractErrorMessage } from '../utils/error';

export type ExecutionRecordStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'interrupted';

export interface ToolCallDetail {
  name: string;
  summary: string;
  toolUseId?: string;
}

export interface ExecutionRecord {
  id: string;
  turn_id: string;
  session_id: string | null;
  user_id: string;
  chat_jid: string;
  group_folder: string;
  group_name: string | null;
  source_channel: string | null;
  description: string;
  status: ExecutionRecordStatus;
  tools_used: string; // JSON array of deduplicated tool names
  tool_details: string; // JSON array of ToolCallDetail
  tool_count: number;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number;
  started_at: string;
  completed_at: string | null;
  agent_id: string | null;
  error: string | null;
}

type StatusFilter = 'all' | ExecutionRecordStatus;

interface ExecutionRecordsState {
  records: ExecutionRecord[];
  loading: boolean;
  error: string | null;
  total: number;
  filter: StatusFilter;
  page: number;
  pageSize: number;

  loadRecords: () => Promise<void>;
  setFilter: (status: StatusFilter) => void;
  setPage: (page: number) => void;
  handleRecordUpdate: (record: ExecutionRecord) => void;
}

export const useExecutionRecordsStore = create<ExecutionRecordsState>(
  (set, get) => ({
    records: [],
    loading: false,
    error: null,
    total: 0,
    filter: 'all',
    page: 1,
    pageSize: 20,

    loadRecords: async () => {
      const { filter, page, pageSize } = get();
      set({ loading: true, error: null });
      try {
        const params = new URLSearchParams();
        if (filter !== 'all') params.append('status', filter);
        params.append('limit', String(pageSize));
        params.append('offset', String((page - 1) * pageSize));

        const data = await api.get<{
          records: ExecutionRecord[];
          total: number;
        }>(`/api/execution-records?${params}`);

        set({
          records: data.records,
          total: data.total,
          loading: false,
        });
      } catch (err) {
        set({
          loading: false,
          error: extractErrorMessage(err),
        });
      }
    },

    setFilter: (status: StatusFilter) => {
      set({ filter: status, page: 1 });
      get().loadRecords();
    },

    setPage: (page: number) => {
      set({ page });
      get().loadRecords();
    },

    handleRecordUpdate: (record: ExecutionRecord) => {
      set((state) => {
        const idx = state.records.findIndex((r) => r.id === record.id);
        if (idx >= 0) {
          // Update existing record
          const updated = [...state.records];
          updated[idx] = record;
          return { records: updated };
        }
        // New record — prepend if it matches filter
        const { filter } = state;
        if (filter !== 'all' && record.status !== filter) {
          return {};
        }
        return {
          records: [record, ...state.records],
          total: state.total + 1,
        };
      });
    },
  }),
);
