const { AuditLogEvent } = require('discord.js');
const config = require('./config');

const actionState = new Map();

function isWhitelisted(userId, member) {
  if (config.antinuke.ownerIds.includes(userId)) return true;
  if (config.antinuke.whitelistUserIds.includes(userId)) return true;

  if (member) {
    for (const roleId of config.antinuke.whitelistRoleIds) {
      if (member.roles.cache.has(roleId)) return true;
    }
  }

  return false;
}

function recordAction(ruleName, userId, data) {
  const rule = config.antinuke.rules[ruleName];
  const key = `${ruleName}:${userId}`;
  const now = Date.now();
  const entries = actionState.get(key) || [];
  const recent = entries.filter((e) => now - e.timestamp < rule.windowMs);
  recent.push({ timestamp: now, data });
  actionState.set(key, recent);
  return recent;
}

function clearAction(ruleName, userId) {
  actionState.delete(`${ruleName}:${userId}`);
}

async function logToChannel(guild, message) {
  if (!config.antinuke.logChannelId) return;
  const channel = guild.channels.cache.get(config.antinuke.logChannelId);
  if (channel) await channel.send({ content: message });
}

async function punishUser(guild, userId, punishment, reason, timeoutMs) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  if (punishment === 'ban') {
    await guild.members.ban(userId, { reason }).catch(() => null);
    return;
  }

  if (punishment === 'kick') {
    await member.kick(reason).catch(() => null);
    return;
  }

  if (punishment === 'timeout') {
    await member.timeout(timeoutMs, reason).catch(() => null);
    return;
  }

  const removable = member.roles.cache.filter((r) => r.id !== guild.id && r.editable);
  await member.roles.remove(removable, reason).catch(() => null);
}

async function revertBanAdd(guild, entries) {
  for (const entry of entries) {
    await guild.members.unban(entry.data.userId, 'Antinuke revert').catch(() => null);
  }
}

async function revertChannelDelete(guild, entries) {
  for (const entry of entries) {
    const data = entry.data;
    await guild.channels
      .create({
        name: data.name,
        type: data.type,
        parent: data.parentId || undefined,
        position: data.position,
        permissionOverwrites: data.permissionOverwrites,
      })
      .catch(() => null);
  }
}

async function revertChannelCreate(guild, entries) {
  for (const entry of entries) {
    const channel = guild.channels.cache.get(entry.data.channelId);
    if (channel) await channel.delete('Antinuke revert').catch(() => null);
  }
}

async function revertRoleMention(guild, entries) {
  for (const entry of entries) {
    const channel = guild.channels.cache.get(entry.data.channelId);
    if (!channel) continue;
    const message = await channel.messages.fetch(entry.data.messageId).catch(() => null);
    if (message) await message.delete().catch(() => null);
  }
}

const revertHandlers = {
  banAdd: revertBanAdd,
  channelDelete: revertChannelDelete,
  channelCreate: revertChannelCreate,
  roleMention: revertRoleMention,
};

async function handleRule(ruleName, guild, userId, data) {
  const rule = config.antinuke.rules[ruleName];
  if (!rule || !rule.enabled) return;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (isWhitelisted(userId, member)) return;

  const entries = recordAction(ruleName, userId, data);

  if (entries.length >= rule.limit) {
    await punishUser(guild, userId, rule.punishment, `Antinuke: ${ruleName} limit exceeded`, rule.timeoutMs);

    if (rule.revert && revertHandlers[ruleName]) {
      await revertHandlers[ruleName](guild, entries);
    }

    await logToChannel(
      guild,
      `Antinuke triggered on <@${userId}> for ${ruleName}. Punishment: ${rule.punishment}${rule.revert ? ' (reverted)' : ''}.`
    );

    clearAction(ruleName, userId);
  }
}

async function getExecutorId(guild, auditLogType, targetId) {
  const logs = await guild.fetchAuditLogs({ type: auditLogType, limit: 5 }).catch(() => null);
  if (!logs) return null;

  const entry = logs.entries.find((e) => !targetId || e.target?.id === targetId);
  return entry ? entry.executor.id : null;
}

function setupAntinuke(client) {
  if (!config.antinuke.enabled) return;

  client.on('guildBanAdd', async (ban) => {
    const executorId = await getExecutorId(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    if (executorId) await handleRule('banAdd', ban.guild, executorId, { userId: ban.user.id });
  });

  client.on('guildMemberRemove', async (member) => {
    const executorId = await getExecutorId(member.guild, AuditLogEvent.MemberKick, member.id);
    if (executorId) await handleRule('kick', member.guild, executorId, { memberId: member.id });
  });

  client.on('channelDelete', async (channel) => {
    const executorId = await getExecutorId(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    if (executorId) {
      await handleRule('channelDelete', channel.guild, executorId, {
        name: channel.name,
        type: channel.type,
        parentId: channel.parentId,
        position: channel.position,
        permissionOverwrites: channel.permissionOverwrites.cache.map((o) => ({
          id: o.id,
          type: o.type,
          allow: o.allow,
          deny: o.deny,
        })),
      });
    }
  });

  client.on('channelCreate', async (channel) => {
    const executorId = await getExecutorId(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    if (executorId) {
      await handleRule('channelCreate', channel.guild, executorId, { channelId: channel.id });
    }
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    if (message.mentions.roles.size === 0) return;

    await handleRule('roleMention', message.guild, message.author.id, {
      channelId: message.channel.id,
      messageId: message.id,
    });
  });
}

module.exports = { setupAntinuke };
