import type { CommandResult } from '../../contracts';
import type { UpgradePlannerService } from './upgrade.service';

export function routeUpgradeCommand(
  text: string,
  svc: UpgradePlannerService,
): CommandResult | null {
  if (/^upgrade plan/i.test(text)) {
    const proposal = svc.buildPhaseHProposal();
    return { handled: true, commandType: 'upgrade', reply: svc.formatProposal(proposal) };
  }

  if (/^upgrade help/i.test(text)) {
    return {
      handled: true,
      commandType: 'upgrade',
      reply: '_Available upgrade commands:\n• `upgrade plan` — generate a Phase H implementation proposal_',
    };
  }

  return null;
}
