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
    for (const roleId of getBypassRoles(guild)) {
      await channel.permissionOverwrites.edit(roleId, {
        SendMessages: true,
        SendMessagesInThreads: true,
      });
    }
  }

  await channel.permissionOverwrites.edit(guild.roles.everyone, {
    SendMessages: lock ? false : null,
    SendMessagesInThreads: lock ? false : null,
  });
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
      await status.edit(`Channel ${past}.`).catch(() => null);
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
