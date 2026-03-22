/**
 * ActivityBus — zero-dependency singleton event bus for CLI live display.
 *
 * No-op by default. Modules emit events without knowing who listens.
 * CLI startup subscribes a renderer; Slack-only mode and tests don't.
 */

export type ActivityEventKind =
  | 'ingress'        // event entered the router (active: slack mention, cli, web)
  | 'shadow'         // passive slack observation
  | 'runner_start'   // LLM runner invoked — start the spinner
  | 'tool_call'      // LLM used a tool
  | 'completing'     // LLM runner loop finished, assembling reply
  | 'reply';         // final reply going out

export interface ActivityEvent {
  kind: ActivityEventKind;
  source?: string;       // 'slack' | 'cli' | 'web' | 'slack_shadow'
  channel?: string;      // slack channel id or name
  text?: string;         // message text (truncated)
  tool?: string;         // tool name for tool_call events
  toolInput?: string;    // tool input summary
  durationMs?: number;   // for completing events
  model?: string;        // e.g. 'kimi-k2p5' or 'claude-sonnet-4-6'
  provider?: string;     // 'fireworks' | 'claude'
  displayName?: string;  // e.g. 'kimi-k2p5 · fireworks'
  threadId?: string;     // Slack thread ts — for posting ack to the right thread
}

type Handler = (event: ActivityEvent) => void;

class ActivityBus {
  private handlers: Handler[] = [];

  emit(event: ActivityEvent): void {
    for (const h of this.handlers) {
      try { h(event); } catch { /* never crash on display errors */ }
    }
  }

  subscribe(handler: Handler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  get hasSubscribers(): boolean {
    return this.handlers.length > 0;
  }
}

export const activityBus = new ActivityBus();
