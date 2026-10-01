require('dotenv').config();
const { Client, GatewayIntentBits, Partials, MessageFlags } = require('discord.js');
const config = require('./config');
const { sendTicketPanel, handleTicketInteraction } = require('./ticketSystem');
const {
  setupAntinuke,
  setAntinukeEnabled,
  isAntinukeEnabled,
  toggleWhitelist,
} = require('./antinuke');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildWebhooks,
  ],
  partials: [Partials.Channel],
});

function extractUserId(text) {
  if (!text) return null;
  const match = text.match(/^<@!?(\d{17,20})>$/) || text.match(/^(\d{17,20})$/);
  return match ? match[1] : null;
}

async function handleNukeCommand(message, args) {
  if (!config.antinuke.ownerIds.includes(message.author.id)) return;

  const sub = args[0] ? args[0].toLowerCase() : undefined;

  if (sub === 'wl') {
    const userId = extractUserId(args[1]);
    if (!userId) {
      await message.reply('Use ,anuke wl followed by a mention or user ID.');
      return;
    }

    const added = toggleWhitelist(userId);
    await message.reply({
      content: added
        ? `<@${userId}> was added to the antinuke whitelist.`
        : `<@${userId}> was removed from the antinuke whitelist.`,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (sub === 'on' || sub === 'off') {
    setAntinukeEnabled(sub === 'on');
  } else if (sub) {
    await message.reply('Use ,anuke on, ,anuke off or ,anuke wl <user>.');
    return;
  }

  await message.reply(`Antinuke is ${isAntinukeEnabled() ? 'on' : 'off'}.`);
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  setupAntinuke(client);
});

client.on('interactionCreate', async (interaction) => {
  try {
    await handleTicketInteraction(interaction);
  } catch (err) {
    console.error(err);
    const payload = { content: 'Something went wrong.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => null);
    } else if (interaction.isRepliable()) {
      await interaction.reply(payload).catch(() => null);
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  if (!message.content.startsWith(',')) return;

  const [command, ...args] = message.content.trim().split(/\s+/);
  const lowered = command.toLowerCase();
  if (lowered === ',anuke' || lowered === ',antinuke') {
    try {
      await handleNukeCommand(message, args);
    } catch (err) {
      console.error(err);
    }
    return;
  }

  const name = message.content.slice(1).split(' ')[0];
  if (!Object.prototype.hasOwnProperty.call(config.panelAliases || {}, name)) return;
  if (!message.member || !message.member.permissions.has('Administrator')) return;

  try {
    await sendTicketPanel(message.channel, config.panelAliases[name]);
    await message.delete().catch(() => null);
  } catch (err) {
    console.error(err);
    await message.reply(`Failed to send the panel: ${err.message}`).catch(() => null);
  }
});

process.on('unhandledRejection', (err) => console.error(err));

client.login(config.token);
