const { Client, GatewayIntentBits, Partials, MessageFlags } = require('discord.js');
const config = require('./config');
const { sendTicketPanel, handleTicketInteraction } = require('./ticketSystem');
const { setupAntinuke } = require('./antinuke');

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
