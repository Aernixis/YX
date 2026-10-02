require('dotenv').config();

if (!process.env.BOT_TOKEN) {
  throw new Error('BOT_TOKEN is missing. Add it to your .env file or the server environment variables.');
}

module.exports = {
  token: process.env.BOT_TOKEN,
  guildId: '1553686123115450389',
  ticketCategoryId: '1553847153099673673',
  archiveCategoryId: '1553847178269696080',
  lockExcludedCategoryId: '1555128162797752371',
  allowedRoleIds: [
    '1553741876060749957',
    '1553741844775436340',
    '1553741777603924010',
    '1553732191480188948',
  ],
  panelGifUrl: 'https://cdn.discordapp.com/attachments/1553686125334499372/1553824421888659576/0CC31915-6394-481F-BCA4-BA25E2BAFCA8.gif?ex=6abaa742&is=6ab955c2&hm=8ee169c01476adef9ce07d275890f8c7c894d00fae24a35d65a36f6b5eb12a09&',
  ticketOrder: ['verify', 'raid', 'staff'],
  panelAliases: {
    pv: 'verify',
    ps: 'staff',
    pr: 'raid',
  },
  ticketTypes: {
    verify: {
      label: 'Verify',
      title: 'YX Verification',
      description: 'Open a ticket to go through a verification to become a YX member.',
      color: 0x8A5CF6,
      pingRoleId: '1553752363590750218',
      choices: null,
      grants: [
        {
          key: 'verified',
          name: 'Verified',
          label: 'Verify',
          roleIds: ['1553778553827622922', '1553778532264583370'],
          removeRoleIds: ['1553778505785937984'],
        },
      ],
    },
    staff: {
      label: 'Staff',
      title: 'Staff Applications',
      description: 'Open a ticket to apply for a staff position.\n\nNeeded staffs:\nEnglish | Arabic | Russian Staffs',
      color: 0x5C6BC0,
      pingRoleId: '1553752363590750218',
      dropdown: {
        placeholder: 'Select a language to open a staff ticket',
      },
      choices: [
        {
          key: 'eng',
          pingRoleId: '1554073618441306122',
          label: 'English',
          description: 'Open an English staff ticket',
          emoji: '\u{1F1EC}\u{1F1E7}',
          welcomeTitle: 'Staff Ticket Opened',
          welcomeText: 'Please answer the following questions:\n\n1. How old are you?\n2. How long have you been in YX?\n3. Why do you want to become a staff member?',
        },
        {
          key: 'arab',
          pingRoleId: '1554073712003645552',
          label: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629',
          description: '\u0627\u0641\u062A\u062D \u062A\u0630\u0643\u0631\u0629 \u0625\u062F\u0627\u0631\u0629 \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629',
          emoji: '\u{1F1F8}\u{1F1E6}',
          welcomeTitle: '\u062A\u0645 \u0641\u062A\u062D \u062A\u0630\u0643\u0631\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629',
          welcomeText: '\u064A\u0631\u062C\u0649 \u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u0639\u0646 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u062A\u0627\u0644\u064A\u0629:\n\n1. \u0643\u0645 \u0639\u0645\u0631\u0643\u061F\n2. \u0645\u0646\u0630 \u0645\u062A\u0649 \u0648\u0623\u0646\u062A \u0641\u064A YX\u061F\n3. \u0644\u0645\u0627\u0630\u0627 \u062A\u0631\u064A\u062F \u0623\u0646 \u062A\u0635\u0628\u062D \u0639\u0636\u0648\u064B\u0627 \u0641\u064A \u0627\u0644\u0625\u062F\u0627\u0631\u0629\u061F',
        },
        {
          key: 'rus',
          pingRoleId: '1554073657465376788',
          label: '\u0420\u0443\u0441\u0441\u043A\u0438\u0439',
          description: '\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0440\u0443\u0441\u0441\u043A\u0438\u0439 \u0442\u0438\u043A\u0435\u0442 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u0430',
          emoji: '\u{1F1F7}\u{1F1FA}',
          welcomeTitle: '\u0422\u0438\u043A\u0435\u0442 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u0430 \u043E\u0442\u043A\u0440\u044B\u0442',
          welcomeText: '\u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u043E\u0442\u0432\u0435\u0442\u044C\u0442\u0435 \u043D\u0430 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0435 \u0432\u043E\u043F\u0440\u043E\u0441\u044B:\n\n1. \u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0432\u0430\u043C \u043B\u0435\u0442?\n2. \u041A\u0430\u043A \u0434\u0430\u0432\u043D\u043E \u0432\u044B \u0432 YX?\n3. \u041F\u043E\u0447\u0435\u043C\u0443 \u0432\u044B \u0445\u043E\u0442\u0438\u0442\u0435 \u0441\u0442\u0430\u0442\u044C \u0447\u043B\u0435\u043D\u043E\u043C \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u0430?',
        },
      ],
      grants: [
        {
          key: 'staff',
          name: 'Staff',
          label: 'Grant Staff',
          roleIds: ['1553742179032109188', '1553752363590750218'],
          byChoice: {
            eng: '1554073618441306122',
            arab: '1554073712003645552',
            rus: '1554073657465376788',
          },
        },
      ],
    },
    raid: {
      label: 'Raid Manager / Tryout Host',
      title: 'Raid Manager / Tryout Host Applications',
      description: 'Open a ticket to apply for either Raid Manager or Tryout Host.',
      color: 0xE53935,
      pingRoleId: '1553752363590750218',
      welcomeText: 'Please answer the following questions:\n\n1. How long have you been in YX?\n2. Why do you want to be Tryout Host or Raid Manager?',
      choices: [
        { key: 'raidmanager', label: 'Raid Manager' },
        { key: 'tryouthost', label: 'Tryout Host' },
      ],
      grants: [
        { key: 'raidmanager', name: 'Raid Manager', label: 'Grant Raid Manager', roleIds: ['1553808721703075860'] },
        { key: 'tryouthost', name: 'Tryout Host', label: 'Grant Tryout Host', roleIds: ['1553954172485894174'] },
      ],
    },
  },
  antinuke: {
    enabled: true,
    ownerIds: ['1370120381695922346', '1283217337084018749'],
    whitelistUserIds: [],
    whitelistRoleIds: [],
    logChannelId: '1553850076408053910',
    rules: {
      banAdd: {
        enabled: true,
        limit: 2,
        windowMs: 60000,
        punishment: 'stripRoles',
        revert: true,
      },
      kick: {
        enabled: true,
        limit: 2,
        windowMs: 60000,
        punishment: 'stripRoles',
        revert: false,
      },
      channelDelete: {
        enabled: true,
        limit: 1,
        windowMs: 60000,
        punishment: 'stripRoles',
        revert: true,
      },
      channelCreate: {
        enabled: true,
        limit: 1,
        windowMs: 60000,
        punishment: 'stripRoles',
        revert: true,
      },
      roleMention: {
        enabled: true,
        limit: 3,
        windowMs: 240000,
        punishment: 'timeout',
        timeoutMs: 7200000,
        revert: true,
      },
    },
  },
};
