export interface PolicyState {
  ownerUserId: string;
  allowConversationsWithOthers: boolean;
  allowDmFromOthers: boolean;
  allowMentionsFromOthers: boolean;
  allowedUserIds: string[];
  allowedChannelIds: string[];
}

const BOOLEAN_FIELDS = new Set([
  'allowConversationsWithOthers',
  'allowDmFromOthers',
  'allowMentionsFromOthers',
]);

const STRING_LIST_FIELDS = new Set(['allowedUserIds', 'allowedChannelIds']);

const ALLOWED_FIELDS = new Set([
  'ownerUserId',
  ...BOOLEAN_FIELDS,
  ...STRING_LIST_FIELDS,
]);

export interface PolicySetResult {
  ok: boolean;
  error?: string;
}

/**
 * Runtime-mutable access policy store.
 * Initialised from EventRouterConfig at startup; updated by `policy set` commands.
 * The EventRouter reads from this on every request when one is provided.
 */
export class PolicyService {
  private state: PolicyState;

  constructor(initial: PolicyState) {
    this.state = {
      ...initial,
      allowedUserIds: [...initial.allowedUserIds],
      allowedChannelIds: [...initial.allowedChannelIds],
    };
  }

  get(): PolicyState {
    return {
      ...this.state,
      allowedUserIds: [...this.state.allowedUserIds],
      allowedChannelIds: [...this.state.allowedChannelIds],
    };
  }

  set(field: string, rawValue: string): PolicySetResult {
    if (!ALLOWED_FIELDS.has(field)) {
      return {
        ok: false,
        error: `Unknown policy field: \`${field}\`. Allowed: ${[...ALLOWED_FIELDS].join(', ')}`,
      };
    }

    if (BOOLEAN_FIELDS.has(field)) {
      if (rawValue !== 'true' && rawValue !== 'false') {
        return { ok: false, error: `Value for \`${field}\` must be \`true\` or \`false\`.` };
      }
      (this.state as unknown as Record<string, unknown>)[field] = rawValue === 'true';
      return { ok: true };
    }

    if (STRING_LIST_FIELDS.has(field)) {
      this.state[field as 'allowedUserIds' | 'allowedChannelIds'] = rawValue
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
      return { ok: true };
    }

    // ownerUserId — plain string
    this.state.ownerUserId = rawValue.trim();
    return { ok: true };
  }

  format(): string {
    const s = this.state;
    return [
      '*Access Policy:*',
      `• ownerUserId: \`${s.ownerUserId || '(not set)'}\``,
      `• allowConversationsWithOthers: ${s.allowConversationsWithOthers}`,
      `• allowDmFromOthers: ${s.allowDmFromOthers}`,
      `• allowMentionsFromOthers: ${s.allowMentionsFromOthers}`,
      `• allowedUserIds: ${s.allowedUserIds.length > 0 ? s.allowedUserIds.join(', ') : '(none)'}`,
      `• allowedChannelIds: ${s.allowedChannelIds.length > 0 ? s.allowedChannelIds.join(', ') : '(none)'}`,
    ].join('\n');
  }
}
