const { ChannelType, OverwriteType, PermissionsBitField } = require('discord.js');
const config = require('./config');

const LOCKABLE_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
]);

const SEND_FLAGS = [
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.SendMessagesInThreads,
];

const CONCURRENCY = 5;

function canUse(message) {
  if (config.antinuke.ownerIds.includes(message.author.id)) return true;
  return Boolean(
    message.member && message.member.permissions.has(PermissionsBitField.Flags.Administrator)
  );
}

function buildOverwrites(channel, lock) {
  const guild = channel.guild;
  const everyoneId = guild.roles.everyone.id;
  const bypass = new Set(config.lockBypassRoleIds.filter((id) => guild.roles.cache.has(id)));
  const botId = guild.members.me ? guild.members.me.id : null;

  const map = new Map();
  for (const overwrite of channel.permissionOverwrites.cache.values()) {
    map.set(overwrite.id, {
      id: overwrite.id,
      type: overwrite.type,
      allow: new PermissionsBitField(overwrite.allow),
      deny: new PermissionsBitField(overwrite.deny),
    });
  }

  const entry = (id) => {
    if (!map.has(id)) {
      map.set(id, {
        id,
        type: OverwriteType.Role,
        allow: new PermissionsBitField(),
        deny: new PermissionsBitField(),
      });
    }
    return map.get(id);
  };

  if (lock) {
    for (const id of bypass) {
      const e = entry(id);
      e.allow.add(...SEND_FLAGS);
      e.deny.remove(...SEND_FLAGS);
    }

    for (const e of map.values()) {
      if (e.id === everyoneId || e.id === botId || bypass.has(e.id)) continue;
      if (SEND_FLAGS.some((flag) => e.allow.has(flag))) e.allow.remove(...SEND_FLAGS);
    }

    const everyone = entry(everyoneId);
    everyone.allow.remove(...SEND_FLAGS);
    everyone.deny.add(...SEND_FLAGS);
  } else if (map.has(everyoneId)) {
    const everyone = map.get(everyoneId);
    everyone.allow.remove(...SEND_FLAGS);
    everyone.deny.remove(...SEND_FLAGS);
  }

  return [...map.values()];
}

async function setLocked(channel, lock) {
  await channel.permissionOverwrites.set(buildOverwrites(channel, lock));
}

async function runPool(items, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(runners);
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

    try {
      await setLocked(channel, lock);
      await message.reply(lock ? 'Locked.' : 'Unlocked.');
    } catch (err) {
      console.error(err);
      await message.reply(`Failed to ${lock ? 'lock' : 'unlock'} this channel: ${err.message}`).catch(() => null);
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
  await runPool([...targets.values()], async (channel) => {
    try {
      await setLocked(channel, lock);
      done += 1;
    } catch (err) {
      console.error(err);
      failed += 1;
    }
  });

  const result = failed
    ? `${done} channels ${past}, ${failed} failed.`
    : `${done} channels ${past}.`;
  await status.edit(result).catch(() => null);
}

module.exports = { handleLockCommand, setLocked, canUse };
