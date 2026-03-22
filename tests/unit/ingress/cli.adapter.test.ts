import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { IngressEvent } from '../../../src/contracts.js';

// ---------------------------------------------------------------------------
// Mock readline using vi.mock so CliAdapter never touches a real TTY.
// We expose a fake Interface that behaves like an EventEmitter.
// ---------------------------------------------------------------------------

class FakeInterface extends EventEmitter {
  close = vi.fn();
  setPrompt = vi.fn();
  prompt = vi.fn();
}

let fakeRl: FakeInterface;

vi.mock('readline', () => ({
  createInterface: vi.fn(() => {
    fakeRl = new FakeInterface();
    return fakeRl;
  }),
}));

import { CliAdapter } from '../../../src/ingress/cli.adapter.js';

// ---------------------------------------------------------------------------

describe('CliAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Ensure we stop any running adapter so readline mock is cleaned up
  });

  it('emits IngressEvent with source=cli when input is provided', async () => {
    const adapter = new CliAdapter({});
    const received: IngressEvent[] = [];

    await adapter.start(async (ev) => { received.push(ev); });

    // Simulate user typing a line
    fakeRl.emit('line', 'hello robin');

    expect(received).toHaveLength(1);
    expect(received[0].source).toBe('cli');
    expect(received[0].text).toBe('hello robin');
  });

  it('skips empty lines', async () => {
    const adapter = new CliAdapter({});
    const received: IngressEvent[] = [];

    await adapter.start(async (ev) => { received.push(ev); });

    fakeRl.emit('line', '');
    fakeRl.emit('line', '   ');
    fakeRl.emit('line', 'actual input');

    expect(received).toHaveLength(1);
    expect(received[0].text).toBe('actual input');
  });

  it('sets conversationId to cli:local', async () => {
    const adapter = new CliAdapter({});
    const received: IngressEvent[] = [];

    await adapter.start(async (ev) => { received.push(ev); });
    fakeRl.emit('line', 'test message');

    expect(received[0].conversationId).toBe('cli:local');
  });

  it('uses the actorId from constructor option', async () => {
    const adapter = new CliAdapter({ actorId: 'ninaad' });
    const received: IngressEvent[] = [];

    await adapter.start(async (ev) => { received.push(ev); });
    fakeRl.emit('line', 'hello');

    expect(received[0].actorId).toBe('ninaad');
  });

  it('defaults actorId to owner when not provided', async () => {
    const adapter = new CliAdapter({});
    const received: IngressEvent[] = [];

    await adapter.start(async (ev) => { received.push(ev); });
    fakeRl.emit('line', 'hello');

    expect(received[0].actorId).toBe('owner');
  });

  it('assigns a unique id to each event', async () => {
    const adapter = new CliAdapter({});
    const received: IngressEvent[] = [];

    await adapter.start(async (ev) => { received.push(ev); });
    fakeRl.emit('line', 'first');
    fakeRl.emit('line', 'second');

    expect(received).toHaveLength(2);
    expect(received[0].id).toBeTruthy();
    expect(received[1].id).toBeTruthy();
    expect(received[0].id).not.toBe(received[1].id);
  });

  it('stop() closes the readline interface', async () => {
    const adapter = new CliAdapter({});
    await adapter.start(async () => {});
    await adapter.stop();
    expect(fakeRl.close).toHaveBeenCalledOnce();
  });
});
