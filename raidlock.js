const config = require('./config');
const { setLocked, canUse } = require('./lock');

async function handleRaidLockCommand(message) {
  if (!canUse(message)) return;

  const channel = await message.guild.channels.fetch(config.raidLockChannelId).catch(() => null);
  if (!channel) {
    await message.reply('Raid lock channel was not found.');
    return;
  }

  try {
    await setLocked(channel, true);
    await channel.send(`# ONGOING RAID <#${config.raidChannelId}>`);
  } catch (err) {
    console.error(err);
    await message.reply(`Failed to lock the channel: ${err.message}`).catch(() => null);
    return;
  }

  if (message.channel.id !== channel.id) {
    await message.reply('Locked.').catch(() => null);
  }
}

module.exports = { handleRaidLockCommand };
