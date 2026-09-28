const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config');
const { sendTicketPanel, handleTicketInteraction } = require('./ticketSystem');
const { setupAntinuke, setAntinukeEnabled, isAntinukeEnabled } = require('./antinuke');

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
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim().toLowerCase();
  const [command, argument] = content.split(/\s+/);

  try {
    if (command === ',n' || command === ',nuke') {
      await handleNukeCommand(message, argument);
      return;
    }

    const type = commandToType[content];
    if (!type) return;
    if (!message.member.permissions.has('Administrator')) return;

    await sendTicketPanel(message.channel, type);
  } catch (err) {
    console.error(err);
  }
});

client.login(config.token);
