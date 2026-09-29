const { Client, GatewayIntentBits, Partials, MessageFlags } = require('discord.js');
const config = require('./config');
const {
  sendTicketPanel,
  handleTicketInteraction,
  closeTicket,
  getTicketTypeFromChannel,
  canManageTicket,
  isTicketClosed,
} = require('./ticketSystem');
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

  if (message.content.startsWith(',panel')) {
    if (!message.member.permissions.has('Administrator')) return;

    const type = message.content.split(' ')[1];
    if (!config.ticketTypes[type]) {
      await message.reply(`Unknown ticket type. Valid types: ${Object.keys(config.ticketTypes).join(', ')}`);
      return;
    }

    await sendTicketPanel(message.channel, type);
    return;
  }

  if (message.content === ',close') {
    const type = getTicketTypeFromChannel(message.channel);
    if (!type) return;
    if (!canManageTicket(message.member, message.channel)) return;

    if (isTicketClosed(message.channel)) {
      await message.reply('This ticket is already closed.');
      return;
    }

    try {
      await closeTicket(message.channel);
    } catch (err) {
      console.error(err);
    }
  }
});

client.login(config.token);
