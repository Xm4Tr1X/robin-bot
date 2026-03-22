/**
 * CLI renderer — Claude Code-style live display for Robin.
 *
 * Subscribes to ActivityBus and renders events to stdout/stderr:
 *
 *   [shadow]   #general  ninaad: "hey team can someone…"
 *   [slack]    #devex    mention: "robin can you summarize…"
 *   [cli]      "show todos"
 *     ⚙  Read  path=src/config.ts
 *     ⚙  Grep  pattern="shadowChannels"
 *     ✓  done (1.4s)
 *   robin: Here are your todos…
 *
 * Uses ANSI escape codes — no external dependencies.
 */

import type { ActivityEvent } from './activity.bus';
import { activityBus } from './activity.bus';

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const RESET  = '\x1b[0m';
const DIM    = '\x1b[2m';
const BOLD   = '\x1b[1m';
const CYAN   = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BLUE   = '\x1b[34m';
const GREEN  = '\x1b[32m';
const GRAY   = '\x1b[90m';
const WHITE  = '\x1b[37m';

function dim(s: string)    { return `${DIM}${s}${RESET}`; }
function cyan(s: string)   { return `${CYAN}${s}${RESET}`; }
function yellow(s: string) { return `${YELLOW}${s}${RESET}`; }
function blue(s: string)   { return `${BLUE}${s}${RESET}`; }
function green(s: string)  { return `${GREEN}${s}${RESET}`; }
function gray(s: string)   { return `${GRAY}${s}${RESET}`; }
function bold(s: string)   { return `${BOLD}${s}${RESET}`; }
function white(s: string)  { return `${WHITE}${s}${RESET}`; }

// ---------------------------------------------------------------------------
// Spinner state
// ---------------------------------------------------------------------------

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerInterval: ReturnType<typeof setInterval> | null = null;
let spinnerFrame = 0;
let spinnerActive = false;
let runnerStartMs = 0;

function startSpinner(label: string): void {
  if (spinnerActive) return;
  spinnerActive = true;
  runnerStartMs = Date.now();
  spinnerFrame = 0;

  // Move to next line before starting spinner
  process.stdout.write('\n');

  spinnerInterval = setInterval(() => {
    const frame = SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length];
    spinnerFrame++;
    const elapsed = ((Date.now() - runnerStartMs) / 1000).toFixed(1);
    process.stdout.write(`\r${yellow(frame)} ${dim(label)} ${gray(`${elapsed}s`)}   `);
  }, 80);
}

function stopSpinner(): void {
  if (!spinnerActive) return;
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
  }
  // Clear the spinner line
  process.stdout.write('\r\x1b[2K');
  spinnerActive = false;
}

// ---------------------------------------------------------------------------
// Truncate helper
// ---------------------------------------------------------------------------

function trunc(s: string, n = 72): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ---------------------------------------------------------------------------
// Source badge
// ---------------------------------------------------------------------------

function sourceBadge(source: string): string {
  switch (source) {
    case 'slack_shadow': return dim(gray('[shadow]  '));
    case 'slack':        return cyan('[slack]   ');
    case 'cli':          return white('[cli]     ');
    case 'web':          return blue('[web]     ');
    default:             return dim(`[${source}] `);
  }
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

function render(event: ActivityEvent): void {
  switch (event.kind) {
    case 'shadow': {
      // Passive observation — dim and subtle, don't interrupt the flow
      const ch = event.channel ? gray(`#${event.channel} `) : '';
      const txt = event.text ? gray(`"${trunc(event.text)}"`) : '';
      process.stdout.write(`${dim(gray('[shadow]'))}  ${ch}${txt}\n`);
      break;
    }

    case 'ingress': {
      const source = event.source ?? 'unknown';
      const badge = sourceBadge(source);
      const ch = event.channel ? `${GRAY}#${event.channel}${RESET}  ` : '';
      const txt = event.text ? `${dim('"')}${trunc(event.text)}${dim('"')}` : '';
      process.stdout.write(`${badge}${ch}${txt}\n`);
      break;
    }

    case 'tool_call': {
      // Stop spinner momentarily, print tool, restart
      stopSpinner();
      const tool = bold(event.tool ?? 'tool');
      const input = event.toolInput ? `  ${gray(trunc(event.toolInput, 60))}` : '';
      process.stdout.write(`  ${yellow('⚙')}  ${tool}${input}\n`);
      startSpinner('thinking');
      break;
    }

    case 'completing': {
      stopSpinner();
      const ms = event.durationMs != null ? `${(event.durationMs / 1000).toFixed(1)}s` : '';
      process.stdout.write(`  ${green('✓')}  ${dim(`done${ms ? ` (${ms})` : ''}`)}\n`);
      break;
    }

    case 'runner_start':
    case 'reply': {
      // runner_start: spinner handled in subscriber above
      // reply: printed by the adapter directly
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let started = false;

/**
 * Wire the CLI renderer to the activity bus.
 * Call once at CLI startup — idempotent.
 */
export function startCliRenderer(): () => void {
  if (started) return () => {};
  started = true;

  // Hook into runner start: the first tool_call or completing implies LLM is running
  let runnerRunning = false;

  const unsubscribe = activityBus.subscribe((event) => {
    if (event.kind === 'ingress' || event.kind === 'shadow') {
      // Pause spinner momentarily so ingress events are readable
      const wasSpinning = spinnerActive;
      if (wasSpinning) stopSpinner();
      render(event);
      if (wasSpinning) startSpinner('thinking');
      return;
    }

    if (event.kind === 'runner_start') {
      if (!runnerRunning) {
        runnerRunning = true;
        // Show which model is handling this request
        const label = event.displayName ?? event.model ?? 'thinking';
        if (event.displayName) {
          const providerColor = event.provider === 'fireworks' ? yellow : dim;
          process.stdout.write(`  ${providerColor('▸')}  ${dim(label)}\n`);
        }
        startSpinner('thinking');
      }
      return;
    }

    if (event.kind === 'tool_call') {
      // Spinner already started by runner_start; just render the tool line
      render(event);
      return;
    }

    if (event.kind === 'completing') {
      runnerRunning = false;
      render(event);
      return;
    }

    render(event);
  });

  // Also handle the case where LLM runs without tool calls (just start spinner on first use)
  return () => {
    stopSpinner();
    unsubscribe();
    started = false;
  };
}

/**
 * Emit a spinner while the LLM runner is active (call before runner.run()).
 * Automatically stopped by the 'completing' event.
 */
export function notifyRunnerStart(): void {
  startSpinner('thinking');
}
