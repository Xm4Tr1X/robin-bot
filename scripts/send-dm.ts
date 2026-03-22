#!/usr/bin/env node
/**
 * Quick script to send a DM to the owner via Slack
 */
import { SlackAdapter } from '../src/ingress/slack.adapter';
import { getConfig } from '../src/config';

async function sendDm() {
  const config = getConfig();

  const adapter = new SlackAdapter({
    token: config.secrets.slackBotToken,
    appToken: config.secrets.slackAppToken,
    ownerUserId: config.settings.ownerUserId,
  });

  // Start the adapter briefly to send the message
  await adapter.start(async () => {
    // We don't need to handle events for this script
  });

  // Send the DM (in Slack, you can use the user ID as the channel for DMs)
  await adapter.postMessage(config.settings.ownerUserId, 'hi');

  console.log(`✓ Sent "hi" to ${config.settings.ownerUserId}`);

  // Stop the adapter
  await adapter.stop();
  process.exit(0);
}

sendDm().catch((err) => {
  console.error('Failed to send DM:', err);
  process.exit(1);
});
