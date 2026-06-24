/**
 * bot/registerCommands.ts — register slash commands with
 * the Discord API. Called on bot ready (guild-scoped for
 * instant updates) and from a CLI script (global for prod).
 */

import { REST, Routes, type RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import { logger } from '../../utils/http/logger.js';
import type { BotConfig } from './discordBot.js';
import { askCommandData, executeAsk } from './commands/ask.js';
import { searchCommandData, executeSearch } from './commands/search.js';
import { statusCommandData, executeStatus } from './commands/status.js';
import { helpCommandData, executeHelp } from './commands/help.js';
import { ticketsCommandData, executeTickets } from './commands/tickets.js';
import { resolveCommandData, executeResolve } from './commands/resolve.js';
import { banCommandData, executeBan } from './commands/ban.js';
import { broadcastCommandData, executeBroadcast } from './commands/broadcast.js';
import { adminCommandData, executeAdmin } from './commands/admin.js';

function buildCommandList(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return [
    askCommandData,
    searchCommandData,
    statusCommandData,
    helpCommandData,
    ticketsCommandData,
    resolveCommandData,
    banCommandData,
    broadcastCommandData,
    adminCommandData,
  ];
}

export async function registerCommands(
  config: BotConfig & { scope: 'guild' | 'global' }
): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.botToken);
  const body = buildCommandList();
  const route = config.scope === 'guild'
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  try {
    logger.info(`[bot] registering ${body.length} ${config.scope} slash commands...`);
    const result = await rest.put(route, { body });
    logger.info(`[bot] registered ${Array.isArray(result) ? result.length : body.length} commands`);
  } catch (err) {
    logger.error(`[bot] command registration failed: ${(err as Error).message}`);
    throw err;
  }
}

// CLI helper: `npx tsx src/integrations/discord/registerCommands.ts global` etc.
if (process.argv[1]?.endsWith('registerCommands.ts') || process.argv[1]?.endsWith('registerCommands.js')) {
  const scope = (process.argv[2] as 'guild' | 'global') ?? 'guild';
  const config = (await import('./discordBot.js')).loadBotConfig();
  if (!config) {
    logger.error('DISCORD_BOT_TOKEN / DISCORD_CLIENT_ID / DISCORD_GUILD_ID not set.');
    process.exit(1);
  }
  await registerCommands({ ...config, scope });
}
