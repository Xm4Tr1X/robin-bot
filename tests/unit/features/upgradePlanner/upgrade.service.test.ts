import { describe, it, expect } from 'vitest';
import { UpgradePlannerService } from '../../../../src/features/upgradePlanner/upgrade.service.js';

describe('UpgradePlannerService', () => {
  const svc = new UpgradePlannerService();

  // ---------------------------------------------------------------------------
  // buildPhaseHProposal()
  // ---------------------------------------------------------------------------

  describe('buildPhaseHProposal()', () => {
    it('returns a proposal with a non-empty title', () => {
      const p = svc.buildPhaseHProposal();
      expect(p.title).toBeTruthy();
      expect(p.title).toContain('Phase H');
    });

    it('returns risk=low and effort=medium', () => {
      const p = svc.buildPhaseHProposal();
      expect(p.risk).toBe('low');
      expect(p.effort).toBe('medium');
    });

    it('returns a non-empty steps array', () => {
      const p = svc.buildPhaseHProposal();
      expect(Array.isArray(p.steps)).toBe(true);
      expect(p.steps.length).toBeGreaterThan(0);
    });

    it('returns a non-empty rollback string', () => {
      const p = svc.buildPhaseHProposal();
      expect(p.rollback).toBeTruthy();
    });

    it('returns a non-empty description', () => {
      const p = svc.buildPhaseHProposal();
      expect(p.description).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // formatProposal()
  // ---------------------------------------------------------------------------

  describe('formatProposal()', () => {
    const proposal = {
      title: 'Test Upgrade',
      description: 'This is a test proposal.',
      risk: 'low' as const,
      effort: 'medium' as const,
      rollback: 'Revert the change.',
      steps: ['Step one', 'Step two', 'Step three'],
    };

    it('returns a string', () => {
      expect(typeof svc.formatProposal(proposal)).toBe('string');
    });

    it('includes the title', () => {
      expect(svc.formatProposal(proposal)).toContain('Test Upgrade');
    });

    it('includes risk and effort', () => {
      const output = svc.formatProposal(proposal);
      expect(output).toContain('low');
      expect(output).toContain('medium');
    });

    it('numbers all steps', () => {
      const output = svc.formatProposal(proposal);
      expect(output).toContain('1. Step one');
      expect(output).toContain('2. Step two');
      expect(output).toContain('3. Step three');
    });

    it('includes the rollback section', () => {
      expect(svc.formatProposal(proposal)).toContain('Revert the change.');
    });

    it('includes the autonomy disclaimer', () => {
      expect(svc.formatProposal(proposal)).toContain('proposal only');
      expect(svc.formatProposal(proposal)).toContain('autonomously');
    });
  });
});
