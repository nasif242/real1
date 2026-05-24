const { ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder, ComponentType, EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Crew = require('../models/Crew');
const { generateLeaderboardImage } = require('../utils/leaderboardImage');

const categories = {
  wealth: {
    label: 'Wealth',
    leaderboardName: 'Global Leaderboard - Wealth',
    sort: (a, b) => (b.balance || 0) - (a.balance || 0),
    valueFn: (user) => user.balance || 0,
    format: (value) => `${value.toLocaleString()} Beli`
  },
  bounty: {
    label: 'Bounty',
    leaderboardName: 'Global Leaderboard - Bounty',
    sort: (a, b) => (b.bounty ?? 100) - (a.bounty ?? 100),
    valueFn: (user) => user.bounty ?? 100,
    format: (value) => `Bounty: ${value.toLocaleString()}`
  },
  dex: {
    label: 'Dex',
    leaderboardName: 'Global Leaderboard - Dex',
    sort: (a, b) => (b.ownedCards?.length || 0) - (a.ownedCards?.length || 0),
    valueFn: (user) => user.ownedCards?.length || 0,
    format: (value) => `${value.toLocaleString()} unique cards`
  },
  fishers: {
    label: 'Fishers',
    leaderboardName: 'Global Leaderboard - Top Fishers',
    sort: (a, b) => (b.totalFishCaught || 0) - (a.totalFishCaught || 0),
    valueFn: (user) => user.totalFishCaught || 0,
    format: (value) => `${value.toLocaleString()} times fished`
  },
  voters: {
    label: 'Voters',
    leaderboardName: 'Global Leaderboard - Top Voters',
    sort: (a, b) => (b.totalVotes || 0) - (a.totalVotes || 0),
    valueFn: (user) => user.totalVotes || 0,
    format: (value) => `${value.toLocaleString()} total votes`
  },
  crews: {
    label: 'Crews',
    isCrew: true
  }
};

async function buildCrewLeaderboardEmbed() {
  const allCrews = await Crew.find({});
  if (!allCrews.length) {
    return new EmbedBuilder()
      .setTitle('🏆  Crew Leaderboard')
      .setColor('#FFD700')
      .setDescription('No crews have been created yet.');
  }
  const ranked = await Promise.all(allCrews.map(async crew => {
    const memberUsers = await User.find({ userId: { $in: crew.members } }, 'bounty');
    const totalBounty = memberUsers.reduce((sum, u) => sum + (u.bounty ?? 100), 0);
    return { crew, totalBounty };
  }));
  ranked.sort((a, b) => b.totalBounty - a.totalBounty);
  const medals = ['🥇', '🥈', '🥉'];
  const lines = ranked.slice(0, 10).map(({ crew, totalBounty }, i) => {
    const pos = medals[i] || `**${i + 1}.**`;
    return `${pos} **${crew.name}** — ${totalBounty.toLocaleString()} bounty · ${crew.members.length} members`;
  });
  return new EmbedBuilder()
    .setTitle('🏆  Crew Leaderboard')
    .setColor('#FFD700')
    .setDescription(lines.join('\n'));
}

function resolveCategory({ message, interaction, args }) {
  const requested = interaction?.options?.getString?.('category')?.toLowerCase() || (args?.[0] || '').toLowerCase();
  if (!requested) return 'wealth';
  if (categories[requested]) return requested;
  if (requested.startsWith('w')) return 'wealth';
  if (requested.startsWith('b')) return 'bounty';
  if (requested.startsWith('d')) return 'dex';
  if (requested.startsWith('f')) return 'fishers';
  if (requested.startsWith('v')) return 'voters';
  if (requested.startsWith('c')) return 'crews';
  return 'wealth';
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function buildLeaderboardPayload({ allUsers, categoryKey, userId, client }) {
  const config = categories[categoryKey];
  const sortedUsers = [...allUsers].sort(config.sort);
  const topUsers = sortedUsers.slice(0, 10).map((user) => ({
    userId: user.userId,
    valueNumber: config.valueFn(user)
  }));

  const idsToFetch = new Set(topUsers.map((user) => user.userId));
  idsToFetch.add(userId);

  const userMap = {};
  await Promise.all(Array.from(idsToFetch).map((id) =>
    client.users.fetch(id)
      .then((discordUser) => { userMap[id] = { username: discordUser.username, avatarUrl: discordUser.displayAvatarURL({ extension: 'png', size: 256 }) }; })
      .catch(() => { userMap[id] = { username: id, avatarUrl: null }; })
  ));

  const currentIndex = sortedUsers.findIndex((user) => user.userId === userId);
  const currentUserDb = currentIndex >= 0 ? sortedUsers[currentIndex] : { userId, balance: 0, bounty: 100, ownedCards: [] };
  const currentValueNumber = config.valueFn(currentUserDb);
  const currentRank = currentIndex >= 0 ? currentIndex + 1 : sortedUsers.length + 1;
  const aboveValue = currentRank > 1 ? config.valueFn(sortedUsers[currentRank - 2]) : currentValueNumber;
  const belowValue = currentRank >= 0 && currentRank < sortedUsers.length ? config.valueFn(sortedUsers[currentRank]) : currentValueNumber;
  const surpassAmount = currentRank > 1 ? Math.max(0, aboveValue - currentValueNumber) : 0;
  const closeness = currentRank > 1 && currentRank < sortedUsers.length
    ? clamp((currentValueNumber - belowValue) / Math.max(1, aboveValue - belowValue), 0, 1)
    : 1;

  return {
    imagePayload: {
      leaderboardName: config.leaderboardName,
      categoryName: config.label,
      topUsers: topUsers.map((rowUser) => ({
        userId: rowUser.userId,
        username: userMap[rowUser.userId]?.username || rowUser.userId,
        value: config.format(rowUser.valueNumber)
      })),
      currentUser: {
        username: userMap[userId]?.username || 'Unknown',
        avatarUrl: userMap[userId]?.avatarUrl || null
      },
      currentRank,
      currentValue: config.format(currentValueNumber),
      surpassAmount,
      totalPlayers: sortedUsers.length,
      closeness
    },
    selectedCategoryKey: categoryKey,
    selectedCategoryLabel: config.label
  };
}

function buildSelectRow(selectedCategory) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('leaderboard_category')
      .setPlaceholder('Choose a leaderboard category')
      .addOptions(Object.entries(categories).map(([key, config]) => ({
        label: config.label,
        value: key,
        description: `Sort by ${config.label}`,
        default: key === selectedCategory
      })))
  );
}

async function sendLeaderboardReply({ categoryKey, allUsers, userId, client, channel, message, interaction }) {
  const config = categories[categoryKey];
  const row = buildSelectRow(categoryKey);

  if (config.isCrew) {
    const embed = await buildCrewLeaderboardEmbed();
    if (message) return channel.send({ embeds: [embed], components: [row] });
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
    return interaction.editReply({ embeds: [embed], components: [row], fetchReply: true });
  }

  const { imagePayload } = await buildLeaderboardPayload({ allUsers, categoryKey, userId, client });
  const imageBuffer = await generateLeaderboardImage(imagePayload);
  const attachment = new AttachmentBuilder(imageBuffer, { name: 'leaderboard.png' });
  if (message) return channel.send({ files: [attachment], components: [row] });
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
  return interaction.editReply({ files: [attachment], components: [row], fetchReply: true });
}

module.exports = {
  name: 'leaderboard',
  description: 'View global leaderboards',
  async execute({ message, interaction, args = [] }) {
    const userId = message ? message.author.id : interaction.user.id;
    const channel = message ? message.channel : interaction.channel;
    const client = message ? message.client : interaction.client;
    const categoryKey = resolveCategory({ message, interaction, args });

    const allUsers = await User.find({});
    const sentMessage = await sendLeaderboardReply({ categoryKey, allUsers, userId, client, channel, message, interaction });

    const collector = sentMessage.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 90000 });

    collector.on('collect', async (selectInteraction) => {
      if (selectInteraction.user.id !== userId) {
        return selectInteraction.reply({ content: 'You can\'t use this menu.', ephemeral: true });
      }
      const selected = selectInteraction.values?.[0];
      if (!categories[selected]) {
        return selectInteraction.reply({ content: 'Invalid category selected.', ephemeral: true });
      }
      const nextRow = buildSelectRow(selected);
      const nextConfig = categories[selected];
      try {
        let updatePayload;
        if (nextConfig.isCrew) {
          const embed = await buildCrewLeaderboardEmbed();
          updatePayload = { embeds: [embed], files: [], components: [nextRow] };
        } else {
          const { imagePayload: nextPayload } = await buildLeaderboardPayload({ allUsers, categoryKey: selected, userId, client });
          const nextImageBuffer = await generateLeaderboardImage(nextPayload);
          const nextAttachment = new AttachmentBuilder(nextImageBuffer, { name: 'leaderboard.png' });
          updatePayload = { embeds: [], files: [nextAttachment], components: [nextRow] };
        }
        if (global && typeof global.safeUpdate === 'function') {
          await global.safeUpdate(selectInteraction, updatePayload);
        } else {
          await selectInteraction.update(updatePayload);
        }
      } catch (e) {
        if (!(e && e.code === 10062)) console.error('Failed to update leaderboard select interaction:', e);
        try { await selectInteraction.reply({ content: 'Unable to update selection (interaction expired).', ephemeral: true }); } catch (e2) {}
      }
    });

    collector.on('end', () => {
      const disabledRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('leaderboard_category')
          .setPlaceholder('Choose a leaderboard category')
          .setDisabled(true)
          .addOptions(Object.entries(categories).map(([key, config]) => ({
            label: config.label,
            value: key,
            description: config.isCrew ? 'Top crews by bounty' : `Sort by ${config.label}`,
            default: key === categoryKey
          })))
      );
      sentMessage.edit({ components: [disabledRow] }).catch(() => {});
    });
  }
};
