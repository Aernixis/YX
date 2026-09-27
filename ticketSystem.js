const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionsBitField,
} = require('discord.js');
const config = require('./config');

const creatingUsers = new Set();
const ticketOwners = new Map();

function buildPanelRow(type) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_create_${type}`)
      .setLabel(`Open ${config.ticketTypes[type].label} Ticket`)
      .setStyle(ButtonStyle.Primary)
  );
}

function buildResolvedRow(type) {
  const row = new ActionRowBuilder();

  if (config.ticketTypes[type].grantsVerifiedRole) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_grant_verified')
        .setLabel('Grant Verified Role')
        .setStyle(ButtonStyle.Success)
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_delete_channel')
      .setLabel('Delete Channel')
      .setStyle(ButtonStyle.Danger)
  );

  return row;
}

async function sendTicketPanel(channel, type) {
  const typeConfig = config.ticketTypes[type];
  if (!typeConfig) return;

  await channel.send({ content: config.panelGifUrl });

  const embed = new EmbedBuilder()
    .setTitle(`Open a ${typeConfig.label} Ticket`)
    .setDescription(typeConfig.description)
    .setColor(typeConfig.color);

  await channel.send({ embeds: [embed], components: [buildPanelRow(type)] });
}

function buildTicketPermissionOverwrites(guild, userId) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: userId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
  ];

  for (const roleId of config.allowedRoleIds) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }

  return overwrites;
}

async function createTicketChannel(interaction, type) {
  const { guild, user } = interaction;
  const typeConfig = config.ticketTypes[type];

  if (creatingUsers.has(user.id)) {
    return interaction.reply({ content: 'You already have a ticket being created.', ephemeral: true });
  }

  creatingUsers.add(user.id);

  try {
    const channel = await guild.channels.create({
      name: `${type}-${user.username}`,
      type: ChannelType.GuildText,
      parent: config.ticketCategoryId,
      permissionOverwrites: buildTicketPermissionOverwrites(guild, user.id),
    });

    ticketOwners.set(channel.id, user.id);

    await channel.send({ content: `<@&${typeConfig.pingRoleId}>` });

    const welcomeEmbed = new EmbedBuilder()
      .setTitle(`${typeConfig.label} Ticket Opened`)
      .setDescription('Please send a screenshot of your Roblox display name to continue.')
      .setColor(typeConfig.color);

    await channel.send({ embeds: [welcomeEmbed], components: [buildResolvedRow(type)] });

    await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
  } finally {
    creatingUsers.delete(user.id);
  }
}

function getTicketTypeFromChannel(channel) {
  for (const type of Object.keys(config.ticketTypes)) {
    if (channel.name.startsWith(`${type}-`)) return type;
  }
  return null;
}

async function grantVerifiedRole(interaction) {
  const { guild, channel } = interaction;
  const ownerId = ticketOwners.get(channel.id);

  if (!ownerId) {
    return interaction.reply({ content: 'Could not resolve the ticket owner.', ephemeral: true });
  }

  const member = await guild.members.fetch(ownerId);
  await member.roles.add(config.verifiedRoleId);

  const grantedEmbed = new EmbedBuilder()
    .setTitle('Verified Role Granted')
    .setDescription(`${member} has been given the verified role.`)
    .setColor(0x43B581);

  await interaction.reply({ embeds: [grantedEmbed] });
}

async function closeTicket(channel) {
  await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
    SendMessages: false,
  });

  for (const roleId of config.allowedRoleIds) {
    await channel.permissionOverwrites.edit(roleId, {
      SendMessages: false,
    });
  }

  await channel.setParent(config.archiveCategoryId, { lockPermissions: false });
}

async function deleteTicketChannel(interaction) {
  await interaction.reply({ content: 'Deleting channel...', ephemeral: true });
  ticketOwners.delete(interaction.channel.id);
  await interaction.channel.delete();
}

async function handleTicketInteraction(interaction) {
  if (!interaction.isButton()) return;

  if (interaction.customId.startsWith('ticket_create_')) {
    const type = interaction.customId.replace('ticket_create_', '');
    return createTicketChannel(interaction, type);
  }

  if (interaction.customId === 'ticket_grant_verified') {
    return grantVerifiedRole(interaction);
  }

  if (interaction.customId === 'ticket_close') {
    await closeTicket(interaction.channel);
    return interaction.reply({ content: 'Ticket closed and archived.', ephemeral: true });
  }

  if (interaction.customId === 'ticket_delete_channel') {
    return deleteTicketChannel(interaction);
  }
}

module.exports = {
  sendTicketPanel,
  handleTicketInteraction,
  closeTicket,
  createTicketChannel,
  grantVerifiedRole,
  deleteTicketChannel,
  getTicketTypeFromChannel,
};
