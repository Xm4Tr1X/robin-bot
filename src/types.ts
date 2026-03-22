export type Mode = 'observe' | 'reply' | 'draft';
export type AssistantMode = 'orchestrated' | 'claude-direct';
export type Priority = 'high' | 'medium' | 'low';
export type TodoStatus = 'todo' | 'in-progress' | 'done' | 'blocked';
export type Bucket = 'short-term' | 'long-term';
export type TodoSource = 'cli' | 'slack' | 'web';

export interface TodoItem {
  id: string;
  task: string;
  owner: string;
  priority: Priority;
  eta?: string;
  status: TodoStatus;
  bucket: Bucket;
  source?: TodoSource;
  slackChannel?: string;
  slackTs?: string;
  createdAt?: string;
}

export interface SessionMemory {
  objective?: string;
  constraints: string[];
  decisions: string[];
  pendingActions: string[];
}

export interface Session {
  threadId: string;
  channelId: string;
  mode: Mode;
  assistantMode: AssistantMode;
  agentSessionId?: string;  // Claude Code session ID — enables conversation resumption
  memory: SessionMemory;
}

export interface Snapshot {
  todos: TodoItem[];
  sessionSummary?: string;
  timestamp: string;
}
