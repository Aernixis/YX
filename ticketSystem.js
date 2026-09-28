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

const MEMBER_PERMISSIONS = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.ReadMessageHistory,
];

function getTicketTypeFromChannel(channel) {
  for (const type of Object.keys(config.ticketTypes)) {
    if (channel.name.startsWith(`${type}-`)) return type;
  }
  return null;
}

function isStaff(member, typeConfig) {
  return typeConfig.allowedRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

function buildPanelRow(type) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_create_${type}`)
      .setLabel(`Open ${config.ticketTypes[type].label} Ticket`)
      .setStyle(ButtonStyle.Primary)
  );
}

function buildTicketRow(type) {
  const typeConfig = config.ticketTypes[type];
  const row = new ActionRowBuilder();

  if (typeConfig.grantRoleId) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_grant')
        .setLabel(typeConfig.grantLabel)
        .setStyle(ButtonStyle.Success)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Secondary)
  );

  if (typeConfig.showDelete) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_delete_channel')
        .setLabel('Delete Channel')
        .setStyle(ButtonStyle.Danger)
    );
  }

  return row;
}

async function sendTicketPanel(channel, type) {
  const typeConfig = config.ticketTypes[type];
  if (!typeConfig) return;

  await channel.send({ content: typeConfig.gifUrl });

  const embed = new EmbedBuilder()
    .setTitle(`Open a ${typeConfig.label} Ticket`)
    .setDescription(typeConfig.description)
    .setColor(typeConfig.color);

  await channel.send({ embeds: [embed], components: [buildPanelRow(type)] });
}

function buildTicketPermissionOverwrites(guild, userId, typeConfig) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: userId,
      allow: MEMBER_PERMISSIONS,
    },
  ];

  for (const roleId of typeConfig.allowedRoleIds) {
    overwrites.push({
      id: roleId,
      allow: MEMBER_PERMISSIONS,
    });
  }

  return overwrites;
}

async function createTicketChannel(interaction, type) {
  const typeConfig = config.ticketTypes[type];
  if (!typeConfig) return;

  const { guild, user } = interaction;

  if (creatingUsers.has(user.id)) {
    return interaction.reply({ content: 'Your ticket is already being created.', ephemeral: true });
  }

  creatingUsers.add(user.id);

  try {
    await interaction.deferReply({ ephemeral: true });

    const channel = await guild.channels.create({
      name: `${type}-${user.username}`,
      type: ChannelType.GuildText,
      parent: config.ticketCategoryId,
      topic: user.id,
      permissionOverwrites: buildTicketPermissionOverwrites(guild, user.id, typeConfig),
    });

    await channel.send({ content: `<@&${typeConfig.pingRoleId}>` });

    const welcomeEmbed = new EmbedBuilder()
      .setTitle(`${typeConfig.label} Ticket Opened`)
      .setDescription(typeConfig.welcomeText)
      .setColor(typeConfig.color);

    await channel.send({ embeds: [welcomeEmbed], components: [buildTicketRow(type)] });

    await interaction.editReply({ content: `Ticket created: ${channel}` });
  } catch (err) {
    console.error(err);
    await interaction.editReply({ content: 'Could not create the ticket.' }).catch(() => null);
  } finally {
    creatingUsers.delete(user.id);
  }
}

async function grantRole(interaction) {
  const { guild, channel, member: clicker } = interaction;
  const type = getTicketTypeFromChannel(channel);
  const typeConfig = type ? config.ticketTypes[type] : null;

  if (!typeConfig || !typeConfig.grantRoleId) {
    return interaction.reply({ content: 'There is no role to grant in this ticket.', ephemeral: true });
  }

  if (!isStaff(clicker, typeConfig)) {
    return interaction.reply({ content: 'Only staff can do this.', ephemeral: true });
  }

  const target = await guild.members.fetch(channel.topic).catch(() => null);

  if (!target) {
    return interaction.reply({ content: 'Could not find the ticket owner.', ephemeral: true });
  }

  try {
    await target.roles.add(typeConfig.grantRoleId);
  } catch (err) {
    console.error(err);
    return interaction.reply({ content: 'Could not grant the role. Check the bot role position.', ephemeral: true });
  }

  const grantedEmbed = new EmbedBuilder()
    .setTitle('Role Granted')
    .setDescription(`${target} has been given <@&${typeConfig.grantRoleId}>.`)
    .setColor(0x43B581);

  await interaction.reply({ embeds: [grantedEmbed] });
}

async function closeTicket(channel, type) {
  const typeConfig = config.ticketTypes[type];

  await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
    SendMessages: false,
  });

  if (channel.topic) {
    await channel.permissionOverwrites.edit(channel.topic, { SendMessages: false }).catch(() => null);
  }

  for (const roleId of typeConfig.allowedRoleIds) {
    await channel.permissionOverwrites.edit(roleId, {
      SendMessages: false,
    });
  }

  await channel.setParent(config.archiveCategoryId, { lockPermissions: false });
}

async function closeTicketFromButton(interaction) {
  const { channel } = interaction;
  const type = getTicketTypeFromChannel(channel);

  if (!type) {
    return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
  }

  if (channel.parentId === config.archiveCategoryId) {
    return interaction.reply({ content: 'This ticket is already archived.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  await closeTicket(channel, type);
  await interaction.editReply({ content: 'Ticket closed and archived.' });
}

async function deleteTicketChannel(interaction) {
  const type = getTicketTypeFromChannel(interaction.channel);
  const typeConfig = type ? config.ticketTypes[type] : null;

  if (!typeConfig) return;

  if (!isStaff(interaction.member, typeConfig)) {
    return interaction.reply({ content: 'Only staff can do this.', ephemeral: true });
  }

  await interaction.reply({ content: 'Deleting channel...', ephemeral: true });
  await interaction.channel.delete();
}

async function handleTicketInteraction(interaction) {
  if (!interaction.isButton()) return;

  const id = interaction.customId;

  if (id.startsWith('ticket_create_')) {
    return createTicketChannel(interaction, id.replace('ticket_create_', ''));
  }

  if (id === 'ticket_grant') return grantRole(interaction);
  if (id === 'ticket_close') return closeTicketFromButton(interaction);
  if (id === 'ticket_delete_channel') return deleteTicketChannel(interaction);
}

module.exports = {
  sendTicketPanel,
  handleTicketInteraction,
};
