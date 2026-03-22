import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so these variables exist before vi.mock hoists the factory.
const { mockSetAssistantMode, mockGetAssistantMode } = vi.hoisted(() => ({
  mockSetAssistantMode: vi.fn(),
  mockGetAssistantMode: vi.fn(() => 'orchestrated' as const),
}));

vi.mock('../../../../src/session.js', () => ({
  setAssistantMode: mockSetAssistantMode,
  getAssistantMode: mockGetAssistantMode,
  getSession: vi.fn(() => ({ mode: 'observe', assistantMode: 'orchestrated' })),
}));

import { routeAssistantModeCommand } from '../../../../src/features/mode/mode.commands.js';

const CONV = 'C_TEST:T_TEST';

describe('routeAssistantModeCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAssistantMode.mockReturnValue('orchestrated');
  });

  // ---------------------------------------------------------------------------
  // mode orchestrated
  // ---------------------------------------------------------------------------

  describe('mode orchestrated', () => {
    it('calls setAssistantMode with orchestrated', () => {
      routeAssistantModeCommand('mode orchestrated', CONV);
      expect(mockSetAssistantMode).toHaveBeenCalledWith('C_TEST', 'T_TEST', 'orchestrated');
    });

    it('returns handled=true with confirmation reply', () => {
      const result = routeAssistantModeCommand('mode orchestrated', CONV);
      expect(result?.handled).toBe(true);
      expect(result?.reply).toContain('orchestrated');
    });

    it('sets commandType=mode', () => {
      const result = routeAssistantModeCommand('mode orchestrated', CONV);
      expect(result?.commandType).toBe('mode');
    });

    it('matches case-insensitively', () => {
      const result = routeAssistantModeCommand('Mode Orchestrated', CONV);
      expect(result).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // mode claude-direct
  // ---------------------------------------------------------------------------

  describe('mode claude-direct', () => {
    it('calls setAssistantMode with claude-direct', () => {
      routeAssistantModeCommand('mode claude-direct', CONV);
      expect(mockSetAssistantMode).toHaveBeenCalledWith('C_TEST', 'T_TEST', 'claude-direct');
    });

    it('returns handled=true with safety-gate warning in reply', () => {
      const result = routeAssistantModeCommand('mode claude-direct', CONV);
      expect(result?.handled).toBe(true);
      expect(result?.reply).toContain('claude-direct');
      expect(result?.reply).toContain('safety');
    });
  });

  // ---------------------------------------------------------------------------
  // mode status
  // ---------------------------------------------------------------------------

  describe('mode status', () => {
    it('calls getAssistantMode and includes result in reply', () => {
      mockGetAssistantMode.mockReturnValue('claude-direct');
      const result = routeAssistantModeCommand('mode status', CONV);
      expect(mockGetAssistantMode).toHaveBeenCalledWith('C_TEST', 'T_TEST');
      expect(result?.reply).toContain('claude-direct');
    });

    it('returns handled=true', () => {
      const result = routeAssistantModeCommand('mode status', CONV);
      expect(result?.handled).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // conversationId without threadId
  // ---------------------------------------------------------------------------

  it('handles conversationId without colon (no threadId)', () => {
    const result = routeAssistantModeCommand('mode orchestrated', 'C_ONLY');
    expect(mockSetAssistantMode).toHaveBeenCalledWith('C_ONLY', '', 'orchestrated');
    expect(result?.handled).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // no match
  // ---------------------------------------------------------------------------

  it('returns null for unrelated text', () => {
    expect(routeAssistantModeCommand('show todos', CONV)).toBeNull();
    expect(routeAssistantModeCommand('mode something-else', CONV)).toBeNull();
    expect(routeAssistantModeCommand('reply mode', CONV)).toBeNull();
  });
});
