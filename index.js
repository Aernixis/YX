const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config');
const { sendTicketPanel, handleTicketInteraction } = require('./ticketSystem');
const { setupAntinuke } = require('./antinuke');

const commandToType = {};
for (const [type, typeConfig] of Object.entries(config.ticketTypes)) {
  commandToType[typeConfig.command] = type;
}

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

  const type = commandToType[message.content.trim()];
  if (!type) return;
  if (!message.member.permissions.has('Administrator')) return;

  try {
    await sendTicketPanel(message.channel, type);
  } catch (err) {
    console.error(err);
  }
});

client.login(config.token);
