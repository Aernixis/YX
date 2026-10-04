const { ChannelType, PermissionsBitField } = require('discord.js');
const config = require('./config');

const LOCKABLE_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
]);

function canUse(message) {
  if (config.antinuke.ownerIds.includes(message.author.id)) return true;
  return Boolean(
    message.member && message.member.permissions.has(PermissionsBitField.Flags.Administrator)
  );
}

function getBypassRoles(guild) {
  const ids = new Set(config.lockBypassRoleIds);
  return [...ids].filter((id) => guild.roles.cache.has(id));
}

async function setLocked(channel, lock) {
  const guild = channel.guild;

  if (lock) {
    const bypass = getBypassRoles(guild);

    for (const roleId of bypass) {
      await channel.permissionOverwrites.edit(roleId, {
        SendMessages: true,
        SendMessagesInThreads: true,
      });
    }

    const keep = new Set([...bypass, guild.roles.everyone.id, guild.members.me && guild.members.me.id]);
    const sendFlags = [
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.SendMessagesInThreads,
    ];

    for (const overwrite of channel.permissionOverwrites.cache.values()) {
      if (keep.has(overwrite.id)) continue;
      if (!sendFlags.some((flag) => overwrite.allow.has(flag))) continue;
      await overwrite.edit({
        SendMessages: null,
        SendMessagesInThreads: null,
      });
    }
  }

  await channel.permissionOverwrites.edit(guild.roles.everyone, {
    SendMessages: lock ? false : null,
    SendMessagesInThreads: lock ? false : null,
  });
}

function findLeaks(channel) {
  const guild = channel.guild;
  const bypass = new Set(getBypassRoles(guild));
  const leaks = [];
  for (const role of guild.roles.cache.values()) {
    if (role.id === guild.roles.everyone.id || bypass.has(role.id) || role.managed) continue;
    const perms = channel.permissionsFor(role);
    if (perms && perms.has(PermissionsBitField.Flags.SendMessages)) {
      const admin = role.permissions.has(PermissionsBitField.Flags.Administrator);
      leaks.push(admin ? `${role.name} (Administrator)` : role.name);
    }
  }
  return leaks;
}

async function handleLockCommand(message, args, lock) {
  if (!canUse(message)) return;

  const target = args[0] ? args[0].toLowerCase() : 'here';
  const past = lock ? 'locked' : 'unlocked';
  const cmd = lock ? ',l' : ',ul';

  if (target !== 'here' && target !== 'all') {
    await message.reply(`Use ${cmd}, ${cmd} here or ${cmd} all.`);
    return;
  }

  if (target === 'here') {
    const channel = message.channel;
    if (!LOCKABLE_TYPES.has(channel.type)) {
      await message.reply('This channel cannot be locked.');
      return;
    }

    const status = await message.reply(`${lock ? 'Locking' : 'Unlocking'} this channel...`);
    try {
      await setLocked(channel, lock);
      let text = `Channel ${past}.`;
      if (lock) {
        const leaks = findLeaks(channel);
        if (leaks.length) {
          text += ` Still able to send: ${leaks.join(', ').slice(0, 1500)}`;
        }
      }
      await status.edit(text).catch(() => null);
    } catch (err) {
      console.error(err);
      await status.edit(`Failed to ${lock ? 'lock' : 'unlock'} this channel: ${err.message}`).catch(() => null);
    }
    return;
  }

  const fetched = await message.guild.channels.fetch();
  const targets = fetched.filter(
    (channel) =>
      channel &&
      LOCKABLE_TYPES.has(channel.type) &&
      channel.parentId !== config.lockExcludedCategoryId
  );

  const status = await message.reply(
    `${lock ? 'Locking' : 'Unlocking'} ${targets.size} channels...`
  );

  let done = 0;
  let failed = 0;
  for (const channel of targets.values()) {
    try {
      await setLocked(channel, lock);
      done += 1;
    } catch (err) {
      console.error(err);
      failed += 1;
    }
  }

  const result = failed
    ? `${done} channels ${past}, ${failed} failed.`
    : `${done} channels ${past}.`;
  await status.edit(result).catch(() => null);
}

module.exports = { handleLockCommand };
