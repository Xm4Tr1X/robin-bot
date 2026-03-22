import type { CommandResult } from '../../contracts';
import type { MCPService } from './mcp.service';

export function routeMcpCommand(text: string, svc: MCPService): CommandResult | null {
  if (/^mcp list/i.test(text) || /^show mcp/i.test(text)) {
    return { handled: true, commandType: 'mcp', reply: svc.format(svc.listAll()) };
  }

  const addMatch = /^mcp add\s+(\S+)\s+(\S+)/i.exec(text);
  if (addMatch) {
    const conn = svc.add(addMatch[1], addMatch[2]);
    return {
      handled: true,
      commandType: 'mcp',
      reply: `_Added MCP connection \`${conn.name}\` [\`${conn.id.slice(0, 8)}\`] — pending validation._`,
    };
  }

  const validateMatch = /^mcp validate\s+(\S+)/i.exec(text);
  if (validateMatch) {
    const updated = svc.validate(validateMatch[1]);
    if (!updated) {
      return {
        handled: true,
        commandType: 'mcp',
        reply: `_MCP connection \`${validateMatch[1]}\` not found._`,
      };
    }
    if (updated.status === 'failed') {
      return {
        handled: true,
        commandType: 'mcp',
        reply: `_Validation failed for \`${updated.id.slice(0, 8)}\`: ${updated.lastError}_`,
      };
    }
    return {
      handled: true,
      commandType: 'mcp',
      reply: `_Validated \`${updated.id.slice(0, 8)}\` — status: ${updated.status}._`,
    };
  }

  const testMatch = /^mcp test\s+(\S+)/i.exec(text);
  if (testMatch) {
    const updated = svc.test(testMatch[1]);
    if (!updated) {
      return {
        handled: true,
        commandType: 'mcp',
        reply: `_MCP connection \`${testMatch[1]}\` not found._`,
      };
    }
    if (updated.status === 'failed') {
      return {
        handled: true,
        commandType: 'mcp',
        reply: `_Test failed for \`${updated.id.slice(0, 8)}\`: ${updated.lastError}_`,
      };
    }
    return {
      handled: true,
      commandType: 'mcp',
      reply: `_Tested \`${updated.id.slice(0, 8)}\` — status: ${updated.status}._`,
    };
  }

  const enableMatch = /^mcp enable\s+(\S+)/i.exec(text);
  if (enableMatch) {
    const updated = svc.enable(enableMatch[1]);
    if (!updated) {
      return {
        handled: true,
        commandType: 'mcp',
        reply: `_MCP connection \`${enableMatch[1]}\` not found._`,
      };
    }
    if (updated.lastError && updated.status !== 'enabled') {
      return {
        handled: true,
        commandType: 'mcp',
        reply: `_Cannot enable \`${updated.id.slice(0, 8)}\`: ${updated.lastError}_`,
      };
    }
    return {
      handled: true,
      commandType: 'mcp',
      reply: `_Enabled \`${updated.id.slice(0, 8)}\`._`,
    };
  }

  const disableMatch = /^mcp disable\s+(\S+)/i.exec(text);
  if (disableMatch) {
    const updated = svc.disable(disableMatch[1]);
    if (!updated) {
      return {
        handled: true,
        commandType: 'mcp',
        reply: `_MCP connection \`${disableMatch[1]}\` not found._`,
      };
    }
    return {
      handled: true,
      commandType: 'mcp',
      reply: `_Disabled \`${updated.id.slice(0, 8)}\`._`,
    };
  }

  return null;
}
