const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  OverwriteType,
  PermissionsBitField,
  StringSelectMenuBuilder,
} = require('discord.js');
const config = require('./config');

console.log('[ticketSystem] loaded build grant-delete-button-v2');

const creatingUsers = new Set();
const busyChannels = new Set();
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
  const payload = { content, embeds: [], components: [] };
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.update(payload);
}

async function withTicketLock(interaction, task) {
  const channelId = interaction.channel.id;

  if (busyChannels.has(channelId)) {
    return interaction.reply({ content: 'This ticket is already being processed.', flags: ephemeral });
  }

  busyChannels.add(channelId);

  try {
    return await task();
  } finally {
    busyChannels.delete(channelId);
  }
}

let sortChain = Promise.resolve();

async function runTicketSort(guild) {
  const rank = (channel) => {
    const index = config.ticketOrder.indexOf(getTicketTypeFromChannel(channel));
    return index === -1 ? config.ticketOrder.length : index;
  };

  const sorted = [...guild.channels.cache.values()]
    .filter((c) => c.parentId === config.ticketCategoryId && c.type === ChannelType.GuildText)
    .sort((a, b) => rank(a) - rank(b) || a.createdTimestamp - b.createdTimestamp);

  if (sorted.length < 2) return;

  const base = Math.min(...sorted.map((c) => c.rawPosition));
  const updates = [];

  sorted.forEach((channel, index) => {
    if (channel.rawPosition !== base + index) {
      updates.push({ channel: channel.id, position: base + index });
    }
  });

  if (updates.length) await guild.channels.setPositions(updates);
}

function sortTicketChannels(guild) {
  sortChain = sortChain.then(() => runTicketSort(guild)).catch((err) => console.error(err));
  return sortChain;
}

function buildPanelRow(type) {
  const typeConfig = config.ticketTypes[type];

  if (typeConfig.dropdown) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`ticket_select_${type}`)
      .setPlaceholder(typeConfig.dropdown.placeholder)
      .addOptions(
        typeConfig.choices.map((choice) => ({
          label: choice.label,
          description: choice.description,
          value: choice.key,
          emoji: choice.emoji,
        }))
      );

    return new ActionRowBuilder().addComponents(menu);
  }

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_create_${type}`)
      .setLabel(`Open ${typeConfig.label} Ticket`)
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

function buildConfirmRow(type) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_confirm_${type}`)
      .setLabel('Yes, open ticket')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('ticket_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildTicketRow(type) {
  if (config.ticketTypes[type].buttons === false) return null;

  const row = new ActionRowBuilder();

  for (const grant of config.ticketTypes[type].grants) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_grant_${grant.key}`)
        .setLabel(grant.label)
        .setStyle(ButtonStyle.Success)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Secondary)
  );

  return row;
}

function buildDeleteRow(label = 'Delete Channel') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_delete_channel')
      .setLabel(label)
      .setStyle(ButtonStyle.Danger)
  );
}

async function sendTicketPanel(channel, type) {
  const typeConfig = config.ticketTypes[type];
  if (!typeConfig) return;

  const gifEmbed = new EmbedBuilder()
    .setColor(typeConfig.color)
    .setImage(config.panelGifUrl);

  await channel.send({ embeds: [gifEmbed] });

  const embed = new EmbedBuilder()
    .setTitle(typeConfig.title)
    .setDescription(typeConfig.description)
    .setColor(typeConfig.color);

  await channel.send({ embeds: [embed], components: [buildPanelRow(type)] });
}

function getStaffViewRoleIds(type, choice) {
  const typeConfig = config.ticketTypes[type];
  const ids = new Set(config.allowedRoleIds);
  if (typeConfig && typeConfig.pingRoleId) ids.add(typeConfig.pingRoleId);
  if (choice && choice.pingRoleId) ids.add(choice.pingRoleId);
  return [...ids];
}

function getChoiceFromInfo(info) {
  if (!info || !info.choiceKey) return null;
  const typeConfig = config.ticketTypes[info.type];
  if (!typeConfig || !typeConfig.choices) return null;
  return typeConfig.choices.find((c) => c.key === info.choiceKey) || null;
}

function buildTicketPermissionOverwrites(guild, userId, type, choice) {
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

  for (const roleId of getStaffViewRoleIds(type, choice)) {
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
  if (!typeConfig || typeConfig.dropdown) return;

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

  const confirmEmbed = new EmbedBuilder()
    .setTitle('Are you sure?')
    .setDescription(`Do you want to open a ${typeConfig.label} ticket?`)
    .setColor(typeConfig.color);

  return interaction.reply({
    embeds: [confirmEmbed],
    components: [buildConfirmRow(type)],
    flags: ephemeral,
  });
}

async function createTicketChannel(interaction, type, choice) {
  const { guild, user } = interaction;
  const typeConfig = config.ticketTypes[type];
  if (!typeConfig) return;

  if (interaction.isStringSelectMenu()) {
    await interaction.deferReply({ flags: ephemeral });
    await interaction.message.edit({ components: [buildPanelRow(type)] }).catch(() => null);
  } else {
    await interaction.deferUpdate();
  }

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
      permissionOverwrites: buildTicketPermissionOverwrites(guild, user.id, type, choice),
    });

    const lines = [];
    if (choice && !choice.welcomeText) lines.push(`Applying for: **${choice.label}**`);
    lines.push(
      (choice && choice.welcomeText) ||
        typeConfig.welcomeText ||
        'Please send a screenshot of your Roblox display name to continue.'
    );

    const welcomeEmbed = new EmbedBuilder()
      .setTitle((choice && choice.welcomeTitle) || `${typeConfig.label} Ticket Opened`)
      .setDescription(lines.join('\n'))
      .setColor(typeConfig.color);

    await channel.send({
      content: `<@&${(choice && choice.pingRoleId) || typeConfig.pingRoleId}> ${user}`,
      embeds: [welcomeEmbed],
      components: buildTicketRow(type) ? [buildTicketRow(type)] : [],
    });

    await sortTicketChannels(guild);

    return respond(interaction, `Ticket created: ${channel}`);
  } finally {
    creatingUsers.delete(user.id);
  }
}

async function grantRole(interaction, key) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: 'Only staff can use this button.', flags: ephemeral });
  }

  return withTicketLock(interaction, () => processGrant(interaction, key));
}

async function processGrant(interaction, key) {
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

  const addIds = [...(grant.roleIds || [])];
  if (grant.byChoice && info.choiceKey && grant.byChoice[info.choiceKey]) {
    addIds.push(grant.byChoice[info.choiceKey]);
  }

  if (addIds.length && addIds.every((roleId) => member.roles.cache.has(roleId))) {
    return interaction.reply({
      content: `${member.displayName} already has the ${grant.name} role.`,
      flags: ephemeral,
    });
  }

  if (isTicketClosed(interaction.channel)) {
    return interaction.reply({
      content: 'This ticket is already closed, so no more roles can be granted.',
      flags: ephemeral,
    });
  }

  const reason = `Granted by ${interaction.user.tag}`;

  try {
    if (grant.removeRoleIds && grant.removeRoleIds.length) {
      await member.roles.remove(grant.removeRoleIds, reason);
    }
    await member.roles.add(addIds, reason);
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

  await interaction.reply({ embeds: [grantedEmbed], components: [buildDeleteRow('Delete Ticket')] });
  console.log(`[ticket] ${grant.name} granted to ${member.displayName} by ${interaction.user.tag}, archiving ${interaction.channel.name}`);

  try {
    await closeTicket(interaction.channel, { announce: false });
    console.log(`[ticket] archived ${interaction.channel.name}`);
  } catch (err) {
    console.error(err);
    await interaction
      .followUp({
        content: `The role was granted but the ticket could not be archived: ${err.message}`,
        flags: ephemeral,
      })
      .catch(() => null);
  }
}

async function closeTicket(channel, options = {}) {
  const archiveCategory = await channel.guild.channels.fetch(config.archiveCategoryId).catch(() => null);
  if (!archiveCategory || archiveCategory.type !== ChannelType.GuildCategory) {
    throw new Error(
      'Archive category not found. Check archiveCategoryId in config.js and make sure the bot can view and manage that category.'
    );
  }

  try {
    let notice = null;

    if (options.announce !== false) {
      const closedEmbed = new EmbedBuilder()
        .setTitle('Ticket Closed')
        .setDescription('This ticket has been closed and archived. Staff can delete the channel below.')
        .setColor(0xE53935);

      notice = await channel.send({ embeds: [closedEmbed] }).catch(() => null);
    }

    const botId = channel.client.user.id;
    for (const overwrite of [...channel.permissionOverwrites.cache.values()]) {
      if (overwrite.type === OverwriteType.Member && overwrite.id !== botId) {
        await overwrite.delete('Ticket closed').catch((err) => console.error(err));
      }
    }

    await channel.permissionOverwrites
      .edit(channel.guild.roles.everyone, { ViewChannel: false, SendMessages: false })
      .catch((err) => console.error(err));

    const closedInfo = parseTicket(channel);
    const closedRoleIds = closedInfo
      ? getStaffViewRoleIds(closedInfo.type, getChoiceFromInfo(closedInfo))
      : config.allowedRoleIds;

    for (const roleId of closedRoleIds) {
      await channel.permissionOverwrites
        .edit(roleId, { ViewChannel: true, ReadMessageHistory: true, SendMessages: false })
        .catch((err) => console.error(`Could not update overwrite for role ${roleId}:`, err.message));
    }

    await channel.setParent(config.archiveCategoryId, { lockPermissions: false });

    if (notice) await notice.edit({ components: [buildDeleteRow()] }).catch(() => null);
  } catch (err) {
    if (err && err.code === 10003) return;
    throw err;
  }
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

async function repairTicketAccess(guild) {
  const channels = await guild.channels.fetch().catch(() => null);
  if (!channels) return;

  let repaired = 0;

  for (const channel of channels.values()) {
    if (!channel || channel.type !== ChannelType.GuildText) continue;
    if (channel.parentId !== config.ticketCategoryId) continue;

    const info = parseTicket(channel);
    if (!info) continue;

    const roleIds = getStaffViewRoleIds(info.type, getChoiceFromInfo(info));

    for (const roleId of roleIds) {
      const existing = channel.permissionOverwrites.cache.get(roleId);
      const hasView = existing && existing.allow.has(PermissionsBitField.Flags.ViewChannel);
      if (hasView) continue;

      await channel.permissionOverwrites
        .edit(roleId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true })
        .then(() => {
          repaired += 1;
        })
        .catch((err) => console.error(`Could not repair access for role ${roleId} in ${channel.name}:`, err.message));
    }
  }

  if (repaired) console.log(`[ticket] repaired ${repaired} staff access overwrites on open tickets`);
}

async function handleTicketInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

  const id = interaction.customId;
  const selectPrefix = 'ticket_select_';
  const createPrefix = 'ticket_create_';
  const choosePrefix = 'ticket_choose_';
  const confirmPrefix = 'ticket_confirm_';
  const grantPrefix = 'ticket_grant_';

  if (interaction.isStringSelectMenu()) {
    if (!id.startsWith(selectPrefix)) return;
    const type = id.slice(selectPrefix.length);
    const typeConfig = config.ticketTypes[type];
    const choice =
      typeConfig && typeConfig.choices && typeConfig.choices.find((c) => c.key === interaction.values[0]);
    if (!choice) {
      return interaction.reply({ content: 'Invalid choice.', flags: ephemeral });
    }
    return createTicketChannel(interaction, type, choice);
  }

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

  if (id.startsWith(confirmPrefix)) {
    const type = id.slice(confirmPrefix.length);
    if (!config.ticketTypes[type] || config.ticketTypes[type].choices) {
      return respond(interaction, 'Invalid ticket type.');
    }
    return createTicketChannel(interaction, type, null);
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

    return withTicketLock(interaction, async () => {
      await interaction.deferReply({ flags: ephemeral });
      try {
        await closeTicket(interaction.channel);
      } catch (err) {
        console.error(err);
        return interaction.editReply({ content: `Could not close the ticket: ${err.message}` }).catch(() => null);
      }
      return interaction.editReply({ content: 'Ticket closed and archived.' }).catch(() => null);
    });
  }

  if (id === 'ticket_delete_channel') {
    return withTicketLock(interaction, () => deleteTicketChannel(interaction));
  }
}

module.exports = {
  sendTicketPanel,
  handleTicketInteraction,
  repairTicketAccess,
  closeTicket,
  createTicketChannel,
  sortTicketChannels,
  deleteTicketChannel,
  getTicketTypeFromChannel,
  canManageTicket,
  isTicketClosed,
};