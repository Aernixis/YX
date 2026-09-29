const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  OverwriteType,
  PermissionsBitField,
} = require('discord.js');
const config = require('./config');

const creatingUsers = new Set();
const ephemeral = MessageFlags.Ephemeral;

function encodeTopic(ownerId, type, choiceKey) {
  return `${ownerId}|${type}|${choiceKey || ''}`;
}

function parseTicket(channel) {
  if (!channel || !channel.topic) return null;
  const [ownerId, type, choiceKey] = channel.topic.split('|');
  if (!ownerId || !/^\d+$/.test(ownerId) || !config.ticketTypes[type]) return null;
  return { ownerId, type, choiceKey: choiceKey || null };
}

function getTicketTypeFromChannel(channel) {
  const info = parseTicket(channel);
  if (info) return info.type;
  for (const type of Object.keys(config.ticketTypes)) {
    if (channel.name.startsWith(`${type}-`)) return type;
  }
  return null;
}

function isTicketClosed(channel) {
  return channel.parentId === config.archiveCategoryId;
}

function isStaff(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  return config.allowedRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

function canManageTicket(member, channel) {
  if (isStaff(member)) return true;
  const info = parseTicket(channel);
  return Boolean(info && member && info.ownerId === member.id);
}

function respond(interaction, content) {
  if (interaction.customId.startsWith('ticket_choose_')) {
    return interaction.update({ content, embeds: [], components: [] });
  }
  return interaction.reply({ content, flags: ephemeral });
}

function buildPanelRow(type) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_create_${type}`)
      .setLabel(`Open ${config.ticketTypes[type].label} Ticket`)
      .setStyle(ButtonStyle.Primary)
  );
}

function buildChoiceRow(type) {
  const row = new ActionRowBuilder();

  for (const choice of config.ticketTypes[type].choices) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_choose_${type}_${choice.key}`)
        .setLabel(choice.label)
        .setStyle(ButtonStyle.Primary)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  return row;
}

function buildTicketRow(type) {
  const row = new ActionRowBuilder();

  for (const grant of config.ticketTypes[type].grants) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_grant_${grant.key}`)
        .setLabel(`Grant ${grant.name} Role`)
        .setStyle(ButtonStyle.Success)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ticket_delete_channel')
      .setLabel('Delete Channel')
      .setStyle(ButtonStyle.Danger)
  );

  return row;
}

function buildDeleteRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_delete_channel')
      .setLabel('Delete Channel')
      .setStyle(ButtonStyle.Danger)
  );
}

async function sendTicketPanel(channel, type) {
  const typeConfig = config.ticketTypes[type];
  if (!typeConfig) return;

  await channel.send({ content: config.panelGifUrl });

  const embed = new EmbedBuilder()
    .setTitle(typeConfig.title)
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

async function promptCreate(interaction, type) {
  const typeConfig = config.ticketTypes[type];
  if (!typeConfig) return;

  if (typeConfig.choices) {
    const embed = new EmbedBuilder()
      .setTitle('Confirm Your Choice')
      .setDescription('Which position are you applying for? Select one to open your ticket.')
      .setColor(typeConfig.color);

    return interaction.reply({
      embeds: [embed],
      components: [buildChoiceRow(type)],
      flags: ephemeral,
    });
  }

  return createTicketChannel(interaction, type, null);
}

async function createTicketChannel(interaction, type, choice) {
  const { guild, user } = interaction;
  const typeConfig = config.ticketTypes[type];
  if (!typeConfig) return;

  if (creatingUsers.has(user.id)) {
    return respond(interaction, 'You already have a ticket being created.');
  }

  creatingUsers.add(user.id);

  try {
    const existing = guild.channels.cache.find((c) => {
      if (c.parentId !== config.ticketCategoryId) return false;
      const info = parseTicket(c);
      return info && info.ownerId === user.id && info.type === type;
    });

    if (existing) {
      return respond(interaction, `You already have an open ticket: ${existing}`);
    }

    const channel = await guild.channels.create({
      name: `${type}-${user.username}`,
      type: ChannelType.GuildText,
      parent: config.ticketCategoryId,
      topic: encodeTopic(user.id, type, choice ? choice.key : null),
      permissionOverwrites: buildTicketPermissionOverwrites(guild, user.id),
    });

    const lines = [];
    if (choice) lines.push(`Applying for: **${choice.label}**`);
    lines.push('Please send a screenshot of your Roblox display name to continue.');

    const welcomeEmbed = new EmbedBuilder()
      .setTitle(`${typeConfig.label} Ticket Opened`)
      .setDescription(lines.join('\n'))
      .setColor(typeConfig.color);

    await channel.send({
      content: `<@&${typeConfig.pingRoleId}> ${user}`,
      embeds: [welcomeEmbed],
      components: [buildTicketRow(type)],
    });

    return respond(interaction, `Ticket created: ${channel}`);
  } finally {
    creatingUsers.delete(user.id);
  }
}

async function grantRole(interaction, key) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: 'Only staff can use this button.', flags: ephemeral });
  }

  const info = parseTicket(interaction.channel);
  if (!info) {
    return interaction.reply({ content: 'Could not resolve the ticket owner.', flags: ephemeral });
  }

  const grant = config.ticketTypes[info.type].grants.find((g) => g.key === key);
  if (!grant) {
    return interaction.reply({ content: 'This action is not available for this ticket.', flags: ephemeral });
  }

  const member = await interaction.guild.members.fetch(info.ownerId).catch(() => null);
  if (!member) {
    return interaction.reply({ content: 'The ticket owner is no longer in the server.', flags: ephemeral });
  }

  try {
    await member.roles.add(grant.roleId, `Granted by ${interaction.user.tag}`);
  } catch (err) {
    console.error(err);
    return interaction.reply({
      content: 'Failed to grant the role. Make sure the bot role is above the role being granted.',
      flags: ephemeral,
    });
  }

  const grantedEmbed = new EmbedBuilder()
    .setTitle(`${grant.name} Role Granted`)
    .setDescription(`${member} has been given the ${grant.name} role.`)
    .setColor(0x43B581);

  return interaction.reply({ embeds: [grantedEmbed] });
}

async function closeTicket(channel) {
  const closedEmbed = new EmbedBuilder()
    .setTitle('Ticket Closed')
    .setDescription('This ticket has been closed and archived. Staff can delete the channel below.')
    .setColor(0xE53935);

  await channel.send({ embeds: [closedEmbed], components: [buildDeleteRow()] }).catch(() => null);

  const botId = channel.client.user.id;
  for (const overwrite of channel.permissionOverwrites.cache.values()) {
    if (overwrite.type === OverwriteType.Member && overwrite.id !== botId) {
      await overwrite.delete('Ticket closed').catch(() => null);
    }
  }

  await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
    ViewChannel: false,
    SendMessages: false,
  });

  for (const roleId of config.allowedRoleIds) {
    await channel.permissionOverwrites.edit(roleId, {
      ViewChannel: true,
      ReadMessageHistory: true,
      SendMessages: false,
    });
  }

  await channel.setParent(config.archiveCategoryId, { lockPermissions: false });
}

async function deleteTicketChannel(interaction) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: 'Only staff can delete ticket channels.', flags: ephemeral });
  }

  if (!getTicketTypeFromChannel(interaction.channel)) {
    return interaction.reply({ content: 'This is not a ticket channel.', flags: ephemeral });
  }

  await interaction.reply({ content: 'Deleting channel...', flags: ephemeral });

  try {
    await interaction.channel.delete(`Ticket deleted by ${interaction.user.tag}`);
  } catch (err) {
    console.error(err);
    await interaction
      .editReply({ content: 'Failed to delete the channel. Check the bot has Manage Channels permission.' })
      .catch(() => null);
  }
}

async function handleTicketInteraction(interaction) {
  if (!interaction.isButton()) return;

  const id = interaction.customId;
  const createPrefix = 'ticket_create_';
  const choosePrefix = 'ticket_choose_';
  const grantPrefix = 'ticket_grant_';

  if (id.startsWith(createPrefix)) {
    return promptCreate(interaction, id.slice(createPrefix.length));
  }

  if (id.startsWith(choosePrefix)) {
    const [type, choiceKey] = id.slice(choosePrefix.length).split('_');
    const typeConfig = config.ticketTypes[type];
    const choice = typeConfig && typeConfig.choices && typeConfig.choices.find((c) => c.key === choiceKey);
    if (!choice) return respond(interaction, 'Invalid choice.');
    return createTicketChannel(interaction, type, choice);
  }

  if (id === 'ticket_cancel') {
    return interaction.update({ content: 'Cancelled.', embeds: [], components: [] });
  }

  if (id.startsWith(grantPrefix)) {
    return grantRole(interaction, id.slice(grantPrefix.length));
  }

  if (id === 'ticket_close') {
    if (!canManageTicket(interaction.member, interaction.channel)) {
      return interaction.reply({ content: 'You cannot close this ticket.', flags: ephemeral });
    }
    if (isTicketClosed(interaction.channel)) {
      return interaction.reply({ content: 'This ticket is already closed.', flags: ephemeral });
    }
    await interaction.deferReply({ flags: ephemeral });
    await closeTicket(interaction.channel);
    return interaction.editReply({ content: 'Ticket closed and archived.' }).catch(() => null);
  }

  if (id === 'ticket_delete_channel') {
    return deleteTicketChannel(interaction);
  }
}

module.exports = {
  sendTicketPanel,
  handleTicketInteraction,
  closeTicket,
  createTicketChannel,
  deleteTicketChannel,
  getTicketTypeFromChannel,
  canManageTicket,
  isTicketClosed,
};
