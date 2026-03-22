export interface UpgradeProposal {
  title: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  rollback: string;
  steps: string[];
}

export class UpgradePlannerService {
  /**
   * Format a proposal for output.
   * Draft-only: the owner must apply changes manually — Robin never applies autonomously.
   */
  formatProposal(proposal: UpgradeProposal): string {
    return [
      `*Upgrade Proposal: ${proposal.title}*`,
      `_Risk: ${proposal.risk} | Effort: ${proposal.effort}_`,
      '',
      proposal.description,
      '',
      '*Steps:*',
      ...proposal.steps.map((s, i) => `${i + 1}. ${s}`),
      '',
      `*Rollback:* ${proposal.rollback}`,
      '',
      '_⚠️ This is a proposal only. Robin does not apply upgrades autonomously._',
    ].join('\n');
  }

  buildPhaseHProposal(): UpgradeProposal {
    return {
      title: 'Phase H — Mode and UX Contracts',
      description: 'Implement orchestrated/claude-direct mode switching and full command surface.',
      risk: 'low',
      effort: 'medium',
      rollback: 'Revert command.router.ts to previous version; mode config defaults to orchestrated.',
      steps: [
        'Add mode command with orchestrated/claude-direct variants.',
        'Add policy command surface for viewing/updating access policy.',
        'Extend upgrade plan command to call UpgradePlannerService.',
        'Add mode persistence to session.ts.',
        'Add tests for each new command.',
      ],
    };
  }
}
