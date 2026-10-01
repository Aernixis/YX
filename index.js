require('dotenv').config();
const { Client, GatewayIntentBits, Partials, MessageFlags } = require('discord.js');
const config = require('./config');
const { sendTicketPanel, handleTicketInteraction } = require('./ticketSystem');
const { setupAntinuke, setAntinukeEnabled, isAntinukeEnabled } = require('./antinuke');

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

async function handleNukeCommand(message, argument) {
  if (!config.antinuke.ownerIds.includes(message.author.id)) return;

  if (argument === 'on' || argument === 'off') {
    setAntinukeEnabled(argument === 'on');
  } else if (argument) {
    await message.reply('Use ,n on or ,n off.');
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

  const [command, argument] = message.content.trim().toLowerCase().split(/\s+/);
  if (command === ',n' || command === ',nuke') {
    try {
      await handleNukeCommand(message, argument);
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