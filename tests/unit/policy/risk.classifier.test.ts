/**
 * L1 — RiskClassifier tests.
 */

import { describe, it, expect } from 'vitest';
import { classifyRisk } from '../../../src/policy/risk.classifier.js';

describe('L1: classifyRisk', () => {
  describe('low-risk inputs', () => {
    const lowCases = [
      'search for error logs',
      'show todos',
      'summarize this thread',
      'list all alerts',
      'what are the open todos',
      'read the file',
      'find the config',
      'grep for pattern',
    ];

    for (const text of lowCases) {
      it(`classifies "${text}" as low`, () => {
        expect(classifyRisk(text)).toBe('low');
      });
    }

    it('classifies empty text as low', () => {
      expect(classifyRisk('')).toBe('low');
    });

    it('classifies "draft a message" as low', () => {
      expect(classifyRisk('draft a message')).toBe('low');
    });
  });

  describe('medium-risk inputs', () => {
    const mediumCases = [
      'send a message to #channel',
      'post this to Slack',
      'reply to that thread',
      'post an update',
    ];

    for (const text of mediumCases) {
      it(`classifies "${text}" as medium`, () => {
        expect(classifyRisk(text)).toBe('medium');
      });
    }

    it('classifies ambiguous text as medium', () => {
      expect(classifyRisk('do the thing')).toBe('medium');
    });
  });

  describe('high-risk inputs', () => {
    const highCases = [
      'write a file to disk',
      'edit the config file',
      'run bash command',
      'execute the script',
      'delete the record',
      'deploy to production',
    ];

    for (const text of highCases) {
      it(`classifies "${text}" as high`, () => {
        expect(classifyRisk(text)).toBe('high');
      });
    }
  });

  describe('tool trace escalation', () => {
    it('escalates to high when Write tool is in toolTrace', () => {
      expect(classifyRisk('show something', ['Write'])).toBe('high');
    });

    it('escalates to high when Bash tool is in toolTrace', () => {
      expect(classifyRisk('list files', ['Bash'])).toBe('high');
    });

    it('escalates to high when Edit tool is in toolTrace', () => {
      expect(classifyRisk('check the code', ['Edit'])).toBe('high');
    });

    it('does not escalate for read-only tools', () => {
      expect(classifyRisk('search for something', ['Read', 'Glob', 'Grep'])).toBe('low');
    });

    it('empty toolTrace has no escalation effect', () => {
      expect(classifyRisk('show todos', [])).toBe('low');
    });
  });
});
