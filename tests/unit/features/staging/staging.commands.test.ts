/**
 * L4 — Staging command router tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { routeStagingCommand } from '../../../../src/features/staging/staging.commands.js';
import type { StagingService } from '../../../../src/features/staging/staging.service.js';

function makeStagingService(): StagingService {
  return {
    stage: vi.fn(),
    approve: vi.fn().mockReturnValue({ ok: true, text: 'approved text' }),
    reject: vi.fn().mockReturnValue({ ok: true, message: 'Rejected.' }),
    listPending: vi.fn().mockReturnValue([
      { id: 'abc12345', conversationId: 'c', text: 'action 1', riskLevel: 'medium', status: 'pending', createdAt: new Date().toISOString() },
    ]),
  } as unknown as StagingService;
}

describe('L4: routeStagingCommand', () => {
  it('routes "approve abc12345" to stagingService.approve', () => {
    const service = makeStagingService();
    const result = routeStagingCommand('approve abc12345', service);

    expect(result).not.toBeNull();
    expect(result!.handled).toBe(true);
    expect(service.approve).toHaveBeenCalledWith('abc12345');
  });

  it('returns approved text in reply', () => {
    const service = makeStagingService();
    const result = routeStagingCommand('approve abc12345', service);
    expect(result!.reply).toContain('approved text');
  });

  it('routes "reject abc12345" to stagingService.reject', () => {
    const service = makeStagingService();
    const result = routeStagingCommand('reject abc12345', service);

    expect(result!.handled).toBe(true);
    expect(service.reject).toHaveBeenCalledWith('abc12345');
  });

  it('routes "staged list" to stagingService.listPending', () => {
    const service = makeStagingService();
    const result = routeStagingCommand('staged list', service);

    expect(result!.handled).toBe(true);
    expect(service.listPending).toHaveBeenCalled();
    expect(result!.reply).toContain('abc12345');
  });

  it('returns null for unrecognised text', () => {
    const service = makeStagingService();
    const result = routeStagingCommand('show todos', service);
    expect(result).toBeNull();
  });

  it('handles approve with error from service', () => {
    const service = makeStagingService();
    vi.mocked(service.approve).mockReturnValue({ ok: false, error: 'not found' });
    const result = routeStagingCommand('approve bad-id', service);
    expect(result!.handled).toBe(true);
    expect(result!.reply).toContain('not found');
  });
});
