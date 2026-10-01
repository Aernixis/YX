const fs = require('fs');
const path = require('path');
const { AuditLogEvent } = require('discord.js');
const config = require('./config');

const STATE_FILE = path.join(__dirname, 'antinuke-state.json');
const actionState = new Map();
const AUDIT_MAX_AGE_MS = 10000;
let botId = null;

function loadEnabled() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return typeof data.enabled === 'boolean' ? data.enabled : config.antinuke.enabled;
  } catch (err) {
    return config.antinuke.enabled;
  }
}

let enabled = loadEnabled();

function isAntinukeEnabled() {
  return enabled;
}

function setAntinukeEnabled(value) {
  enabled = value;
  actionState.clear();

  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ enabled }));
  } catch (err) {
    console.error(err);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isWhitelisted(guild, userId, member) {
  if (userId === botId) return true;
  if (guild.ownerId === userId) return true;
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
  if (channel) await channel.send({ content: message }).catch(() => null);
}

async function punishUser(guild, userId, punishment, reason, timeoutMs) {
  try {
    if (punishment === 'ban') {
      await guild.members.ban(userId, { reason });
      return true;
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;

    if (punishment === 'kick') {
      await member.kick(reason);
      return true;
    }

    if (punishment === 'timeout') {
      await member.timeout(timeoutMs || 3600000, reason);
      return true;
    }

    const removable = member.roles.cache.filter((r) => r.id !== guild.id && r.editable);
    await member.roles.remove(removable, reason);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
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
        parent: data.parentId && guild.channels.cache.has(data.parentId) ? data.parentId : undefined,
        position: data.position,
        topic: data.topic,
        nsfw: data.nsfw,
        rateLimitPerUser: data.rateLimitPerUser,
        bitrate: data.bitrate,
        userLimit: data.userLimit,
        permissionOverwrites: data.permissionOverwrites,
        reason: 'Antinuke revert',
      })
      .catch((err) => console.error(err));
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
  if (!enabled) return;
  const rule = config.antinuke.rules[ruleName];
  if (!rule || !rule.enabled) return;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (isWhitelisted(guild, userId, member)) return;

  const entries = recordAction(ruleName, userId, data);

  if (entries.length >= rule.limit) {
    clearAction(ruleName, userId);

    const punished = await punishUser(
      guild,
      userId,
      rule.punishment,
      `Antinuke: ${ruleName} limit exceeded`,
      rule.timeoutMs
    );

    if (rule.revert && revertHandlers[ruleName]) {
      await revertHandlers[ruleName](guild, entries);
    }

    await logToChannel(
      guild,
      `Antinuke triggered on <@${userId}> for ${ruleName}. Punishment: ${rule.punishment}${punished ? '' : ' (FAILED, check role hierarchy and bot permissions)'}${rule.revert ? ' (reverted)' : ''}.`
    );
  }
}

async function getExecutorId(guild, auditLogType, targetId, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    const logs = await guild.fetchAuditLogs({ type: auditLogType, limit: 10 }).catch(() => null);

    if (logs) {
      const now = Date.now();
      const entry = logs.entries.find(
        (e) => (!targetId || e.target?.id === targetId) && now - e.createdTimestamp < AUDIT_MAX_AGE_MS
      );
      if (entry && entry.executor) return entry.executor.id;
    }

    if (i < attempts - 1) await sleep(700);
  }

  return null;
}

function setupAntinuke(client) {
  botId = client.user.id;

  client.on('guildBanAdd', async (ban) => {
    try {
      if (!enabled) return;
      const executorId = await getExecutorId(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
      if (executorId) await handleRule('banAdd', ban.guild, executorId, { userId: ban.user.id });
    } catch (err) {
      console.error(err);
    }
  });

  client.on('guildMemberRemove', async (member) => {
    try {
      if (!enabled) return;
      const executorId = await getExecutorId(member.guild, AuditLogEvent.MemberKick, member.id, 2);
      if (executorId) await handleRule('kick', member.guild, executorId, { memberId: member.id });
    } catch (err) {
      console.error(err);
    }
  });

  client.on('channelDelete', async (channel) => {
    try {
      if (!enabled) return;
      if (!channel.guild) return;
      const executorId = await getExecutorId(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
      if (!executorId) return;

      await handleRule('channelDelete', channel.guild, executorId, {
        name: channel.name,
        type: channel.type,
        parentId: channel.parentId,
        position: channel.position,
        topic: channel.topic ?? undefined,
        nsfw: channel.nsfw ?? undefined,
        rateLimitPerUser: channel.rateLimitPerUser ?? undefined,
        bitrate: channel.bitrate ?? undefined,
        userLimit: channel.userLimit ?? undefined,
        permissionOverwrites: channel.permissionOverwrites.cache.map((o) => ({
          id: o.id,
          type: o.type,
          allow: o.allow,
          deny: o.deny,
        })),
      });
    } catch (err) {
      console.error(err);
    }
  });

  client.on('channelCreate', async (channel) => {
    try {
      if (!enabled) return;
      if (!channel.guild) return;
      const executorId = await getExecutorId(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
      if (executorId) {
        await handleRule('channelCreate', channel.guild, executorId, { channelId: channel.id });
      }
    } catch (err) {
      console.error(err);
    }
  });

  client.on('messageCreate', async (message) => {
    try {
      if (!enabled) return;
      if (message.author.bot || !message.guild) return;
      if (message.mentions.roles.size === 0) return;

      await handleRule('roleMention', message.guild, message.author.id, {
        channelId: message.channel.id,
        messageId: message.id,
      });
    } catch (err) {
      console.error(err);
    }
  });
}

module.exports = { setupAntinuke, setAntinukeEnabled, isAntinukeEnabled };