const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config');
const {
  sendTicketPanel,
  handleTicketInteraction,
  closeTicket,
  getTicketTypeFromChannel,
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

    await closeTicket(message.channel);
    await message.reply('Ticket closed and archived.');
  }
});

client.login(config.token);