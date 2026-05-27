const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');
const Crew = require('../models/Crew');
const { getCardById, searchCards } = require('../utils/cards');
const { resolveStats } = require('../utils/statResolver');
const { getDamageMultiplier } = require('../utils/attributeSystem');
const { calculateUserDamage, hasStatusLock, getStatusLockReason } = require('../src/battle/statusManager');
const { RANK_MAX_LEVEL } = require('../utils/starLevel');

// channelId -> raid state
const raidStates = new Map();

const BELI_BY_RANK = { D: 100, C: 300, B: 700, A: 1200, S: 2000, SS: 2800, UR: 3500 };
const RAID_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_PLAYERS = 10;
const MIN_PLAYERS = 3;
const GOD_TOKEN_EMOJI = '<:godtoken:1499957056650608753>';

// ─── Utility helpers ──────────────────────────────────────────────────────────

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function findItemCount(items, itemId) {
  if (!Array.isArray(items)) return 0;
  const it = items.find(i => i.itemId === itemId);
  return it ? (it.quantity || 0) : 0;
}

function removeItem(items, itemId, count) {
  if (!Array.isArray(items) || count <= 0) return items;
  const idx = items.findIndex(i => i.itemId === itemId);
  if (idx === -1) return items;
  items[idx].quantity = (items[idx].quantity || 0) - count;
  if (items[idx].quantity <= 0) items.splice(idx, 1);
  return items;
}

function hpBar(current, max) {
  if (max <= 0 || current <= 0) {
    return '<:Healthemptyleft:1481750325151928391>'
      + '<:Healthemptymiddle:1481750341489004596>'.repeat(6)
      + '<:healthemptyright:1481750363286667334>';
  }
  const pct = Math.max(0, Math.min(1, current / max));
  const filled = Math.floor(pct * 6);
  let bar = '<:Healthfullleft:1481750264074469437>';
  for (let i = 0; i < filled; i++) bar += '<:healthfullmiddle:1481750286795149435>';
  for (let i = filled; i < 6; i++) bar += '<:Healthemptymiddle:1481750341489004596>';
  bar += filled === 6 ? '<:healthfullright:1481750302679105710>' : '<:healthemptyright:1481750363286667334>';
  return bar;
}

function energyDisplay(energy) {
  if (!energy || energy <= 0) return '0';
  return '<:energy:1478051414558118052>'.repeat(Math.min(energy, 3));
}

function findCardByQuery(query) {
  if (!query) return null;
  const byId = getCardById(query.trim());
  if (byId) return byId;
  const results = searchCards(query.trim());
  return results && results.length > 0 ? results[0] : null;
}

function getEmojiId(emoji) {
  if (!emoji) return null;
  const m = emoji.match(/<a?:[^:]+:(\d+)>/);
  return m ? m[1] : null;
}

// reply helper: handles both interaction (ephemeral) and message
async function reply(ctx, content, ephemeral = true) {
  if (typeof content === 'string') content = { content };
  if (ctx.interaction) {
    if (ctx.interaction.deferred || ctx.interaction.replied) {
      return ctx.interaction.followUp({ ...content, ephemeral }).catch(() => {});
    }
    return ctx.interaction.reply({ ...content, ephemeral }).catch(() => {});
  }
  if (ctx.message) return ctx.message.reply(content).catch(() => {});
}

// send a public message to the channel
async function send(ctx, payload) {
  if (ctx.interaction) {
    if (ctx.interaction.deferred || ctx.interaction.replied) {
      return ctx.interaction.followUp(payload).catch(() => {});
    }
    return ctx.interaction.reply({ ...payload, fetchReply: true }).catch(() => {});
  }
  if (ctx.message) return ctx.message.channel.send(payload).catch(() => {});
}

// ─── Boss / card builders ─────────────────────────────────────────────────────

function buildBossFromDef(def) {
  const baseMin = typeof def.attack_min === 'number' ? def.attack_min : (def.power || 20);
  const baseMax = typeof def.attack_max === 'number' ? def.attack_max : baseMin;
  const hp = def.health || def.hp || 100;
  return {
    name: def.character || 'Boss',
    title: def.title || '',
    emoji: def.emoji || '',
    image: def.image_url || def.image || null,
    cardId: def.id,
    rank: def.rank || 'D',
    attribute: def.attribute || 'STR',
    maxHP: Math.floor(hp * 5),
    currentHP: Math.floor(hp * 5),
    attack_min: Math.floor(baseMin * 2),
    attack_max: Math.max(Math.floor(baseMin * 2), Math.floor(baseMax * 2)),
    status: []
  };
}

function buildPlayerCard(def, userEntry, ownedCards) {
  const scaled = resolveStats(userEntry, ownedCards);
  const maxHP = scaled ? scaled.health : (def.health || def.hp || 100);
  return {
    def,
    userEntry,
    scaled,
    maxHP,
    currentHP: maxHP,
    energy: 3,
    alive: true,
    status: [],
    turnsUntilRecharge: 0
  };
}

// ─── Round queue helpers ──────────────────────────────────────────────────────

function rebuildRoundQueue(state) {
  state.roundQueue = [...state.players]
    .filter(p => p.card && p.card.alive)
    .sort((a, b) => (b.card?.def?.speed || 0) - (a.card?.def?.speed || 0))
    .map(p => p.userId);
  state.roundIndex = 0;
}

function currentPlayerInRound(state) {
  const uid = state.roundQueue[state.roundIndex];
  return uid ? state.players.find(p => p.userId === uid) : null;
}

// ─── Embed builders ───────────────────────────────────────────────────────────

function buildLobbyEmbed(state) {
  const boss = state.boss;
  const title = `${boss.name}${boss.title ? ` - ${boss.title}` : ''} | Boss Raid`;
  const embed = new EmbedBuilder().setColor('#FFFFFF').setTitle(title);

  if (boss.image) embed.setImage(boss.image);
  const emojiId = getEmojiId(boss.emoji);
  if (emojiId) embed.setThumbnail(`https://cdn.discordapp.com/emojis/${emojiId}.png`);

  embed.addFields({
    name: `${boss.emoji || ''} **${boss.name}**`.trim(),
    value: `${hpBar(boss.currentHP, boss.maxHP)}\n${boss.name} | Raid boss\n${boss.currentHP}/${boss.maxHP}`,
    inline: false
  });

  embed.addFields({ name: '__________________', value: '        ', inline: false });

  if (state.players.length === 0) {
    embed.addFields({ name: '  ', value: 'no cards added yet ..', inline: false });
  } else {
    const sorted = [...state.players].sort((a, b) => (b.card?.def?.speed || 0) - (a.card?.def?.speed || 0));
    for (const p of sorted) {
      if (!p.card) continue;
      embed.addFields({
        name: `${p.card.def.emoji || ''} ${p.username}`.trim(),
        value: `${p.card.def.character} | Lv. ${p.entry ? p.entry.level : 1} | Spd: ${p.card.def.speed || 0}\n${hpBar(p.card.currentHP, p.card.maxHP)}\n${p.card.currentHP}/${p.card.maxHP} ${energyDisplay(p.card.energy)}`,
        inline: true
      });
    }
  }

  embed.setFooter({ text: `add a card with \`op raid add <card>\` or \`/raid add\` • ${state.players.length}/${MAX_PLAYERS} players` });
  return embed;
}

function buildBattleEmbed(state) {
  const boss = state.boss;
  const title = `${boss.name}${boss.title ? ` - ${boss.title}` : ''} | Boss Raid`;
  const embed = new EmbedBuilder().setColor('#FFFFFF').setTitle(title);

  if (boss.image) embed.setImage(boss.image);
  const emojiId = getEmojiId(boss.emoji);
  if (emojiId) embed.setThumbnail(`https://cdn.discordapp.com/emojis/${emojiId}.png`);

  embed.addFields({
    name: `${boss.emoji || ''} **${boss.name}**`.trim(),
    value: `${hpBar(boss.currentHP, boss.maxHP)}\n${boss.name} | Raid boss\n${boss.currentHP}/${boss.maxHP}`,
    inline: false
  });

  embed.addFields({ name: '__________________', value: '        ', inline: false });

  const currentPlayer = currentPlayerInRound(state);
  const sorted = [...state.players].sort((a, b) => (b.card?.def?.speed || 0) - (a.card?.def?.speed || 0));

  for (const p of sorted) {
    if (!p.card) continue;
    const isTurn = !state.finished && currentPlayer && p.userId === currentPlayer.userId;
    const alive = p.card.alive;
    let val;
    if (alive) {
      val = `${hpBar(p.card.currentHP, p.card.maxHP)}\nLv. ${p.entry ? p.entry.level : 1} | ${energyDisplay(p.card.energy)}`;
    } else {
      val = `**KO'd**\n${hpBar(0, p.card.maxHP)}`;
    }
    embed.addFields({
      name: `${isTurn ? '▶ ' : ''}${p.card.def.emoji || ''} ${p.username} — ${p.card.def.character}`.trim(),
      value: val,
      inline: true
    });
  }

  if (state.lastAction) {
    embed.addFields({ name: 'Battle Log', value: state.lastAction.slice(-1024), inline: false });
  }

  if (!state.finished && state.phase === 'battle' && currentPlayer) {
    embed.setFooter({ text: `It's ${currentPlayer.username}'s turn!` });
  }

  return embed;
}

function makeLobbyComponents() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('raid_start').setLabel('Start raid').setStyle(ButtonStyle.Danger)
  )];
}

function makeBattleComponents(state) {
  if (state.finished) return [];
  const cp = currentPlayerInRound(state);
  if (!cp || !cp.card || !cp.card.alive) return [];

  const card = cp.card;
  const locked = hasStatusLock(card);

  const row = new ActionRowBuilder();
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('raid_action:attack')
      .setLabel('Attack')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(locked || card.energy < 1)
  );

  const { isSpecialAttackUnlocked } = require('../utils/starLevel');
  if (card.def.special_attack && isSpecialAttackUnlocked(card.userEntry?.starLevel)) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('raid_action:special')
        .setLabel('Special Attack')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(locked || card.energy < 3)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId('raid_action:rest')
      .setLabel('Rest')
      .setStyle(ButtonStyle.Success)
  );

  return [row];
}

// ─── Message updater ──────────────────────────────────────────────────────────

async function updateRaidMessage(state) {
  try {
    const channel = state.channel;
    if (!channel) return;
    const msg = await channel.messages.fetch(state.messageId).catch(() => null);
    if (!msg) return;

    const embed = state.phase === 'lobby' ? buildLobbyEmbed(state) : buildBattleEmbed(state);
    const components = state.phase === 'lobby' ? makeLobbyComponents() : makeBattleComponents(state);
    await msg.edit({ embeds: [embed], components });
  } catch (e) {
    if (e.code !== 10008) console.error('[raid] updateRaidMessage error:', e);
  }
}

// ─── Battle logic ─────────────────────────────────────────────────────────────

async function startRaidBattle(state) {
  state.phase = 'battle';
  if (state.startTimeoutId) { clearTimeout(state.startTimeoutId); state.startTimeoutId = null; }

  rebuildRoundQueue(state);
  state.lastAction = '⚔️ The raid has begun! Players attack in order of speed.';
  await updateRaidMessage(state);
}

async function processBossAttack(state) {
  const alive = state.players.filter(p => p.card && p.card.alive);
  if (!alive.length) return;

  const target = alive[Math.floor(Math.random() * alive.length)];
  const atk = randomInt(state.boss.attack_min, state.boss.attack_max);
  const mult = getDamageMultiplier(state.boss.attribute, target.card.def.attribute);
  const dmg = Math.max(1, Math.floor(atk * mult));

  target.card.currentHP = Math.max(0, target.card.currentHP - dmg);
  if (target.card.currentHP <= 0) {
    target.card.alive = false;
    target.card.currentHP = 0;
    target.card.energy = 0;
  }

  const effStr = mult > 1 ? ' (Effective!)' : mult < 1 ? ' (Weak)' : '';
  const koStr = !target.card.alive ? ` **${target.card.def.character} is KO'd!**` : '';
  state.lastAction = `${state.boss.emoji || '⚔️'} **${state.boss.name}** strikes **${target.username}**'s ${target.card.def.character} for **${dmg} DMG**${effStr}!${koStr}`;
}

async function advanceTurn(state) {
  // Move to next position in the current round queue
  state.roundIndex++;

  if (state.roundIndex >= state.roundQueue.length) {
    // End of round — boss attacks
    await processBossAttack(state);

    if (state.players.every(p => !p.card || !p.card.alive)) {
      await handleDefeat(state);
      return;
    }

    // Recharge energy for alive players at round start
    for (const p of state.players) {
      if (p.card && p.card.alive) {
        if (p.card.turnsUntilRecharge > 0) {
          p.card.turnsUntilRecharge--;
        } else {
          p.card.energy = Math.min(3, (p.card.energy || 0) + 1);
        }
      }
    }

    // Rebuild queue for next round (only alive players)
    rebuildRoundQueue(state);

    if (state.roundQueue.length === 0) {
      await handleDefeat(state);
      return;
    }
  } else {
    // Skip any dead players that were alive when queue was built but died mid-round
    while (state.roundIndex < state.roundQueue.length) {
      const pid = state.roundQueue[state.roundIndex];
      const pp = state.players.find(p => p.userId === pid);
      if (pp && pp.card && pp.card.alive) break;
      state.roundIndex++;
    }
    // If we exhausted the queue mid-round, trigger boss turn immediately
    if (state.roundIndex >= state.roundQueue.length) {
      await processBossAttack(state);

      if (state.players.every(p => !p.card || !p.card.alive)) {
        await handleDefeat(state);
        return;
      }

      for (const p of state.players) {
        if (p.card && p.card.alive) {
          if (p.card.turnsUntilRecharge > 0) {
            p.card.turnsUntilRecharge--;
          } else {
            p.card.energy = Math.min(3, (p.card.energy || 0) + 1);
          }
        }
      }

      rebuildRoundQueue(state);
    }
  }

  await updateRaidMessage(state);
}

async function handleVictory(state) {
  state.finished = true;
  state.phase = 'finished';

  const beli = BELI_BY_RANK[state.boss.rank] || 100;
  const cardId = state.boss.cardId;
  const rewardLines = [];

  for (const p of state.players) {
    try {
      const user = await User.findOne({ userId: p.userId });
      if (!user) continue;
      user.balance = (user.balance || 0) + beli;

      const owned = user.ownedCards.find(e => e.cardId === cardId);
      if (!owned) {
        user.ownedCards.push({ cardId, level: 1, xp: 0, starLevel: 0 });
        rewardLines.push(`**${p.username}**: received **${state.boss.name}** card + **${beli.toLocaleString()} Beli**`);
      } else {
        const def = getCardById(cardId);
        const maxLevel = def ? (RANK_MAX_LEVEL[def.rank] || 10) : 10;
        const oldLevel = owned.level || 1;
        owned.level = Math.min(maxLevel, oldLevel + 10);
        owned.xp = 0;
        rewardLines.push(`**${p.username}**: ${state.boss.name} Lv. ${oldLevel} → **${owned.level}** + **${beli.toLocaleString()} Beli**`);
      }

      await user.save();
    } catch (e) {
      console.error('[raid] reward error:', e);
    }
  }

  const embed = buildBattleEmbed(state);
  embed.setTitle(`🏆 Victory! ${state.boss.name} defeated!`);
  embed.setColor('#FFD700');
  embed.addFields({ name: '🎁 Rewards', value: rewardLines.join('\n') || 'No surviving players.', inline: false });

  try {
    const msg = await state.channel.messages.fetch(state.messageId).catch(() => null);
    if (msg) await msg.edit({ embeds: [embed], components: [] });
  } catch (e) { console.error('[raid] victory edit error:', e); }

  raidStates.delete(state.channelId);
}

async function handleDefeat(state) {
  state.finished = true;
  state.phase = 'finished';

  const embed = buildBattleEmbed(state);
  embed.setTitle(`💀 Raid Failed! ${state.boss.name} was victorious!`);
  embed.setColor('#000000');
  embed.addFields({ name: 'Result', value: 'All player cards were KO\'d. Better luck next time!', inline: false });

  try {
    const msg = await state.channel.messages.fetch(state.messageId).catch(() => null);
    if (msg) await msg.edit({ embeds: [embed], components: [] });
  } catch (e) { console.error('[raid] defeat edit error:', e); }

  raidStates.delete(state.channelId);
}

// ─── Command sub-handlers ─────────────────────────────────────────────────────

async function execStart(ctx, bossQuery) {
  const channelId = ctx.channelId;
  const userId = ctx.userId;
  const username = ctx.username;
  const channel = ctx.channel;

  if (!bossQuery) return reply(ctx, 'Please provide a boss card name or ID. e.g. `op raid luffy` or `/raid boss luffy`');

  if (raidStates.has(channelId)) {
    return reply(ctx, 'There is already an active raid in this channel!');
  }

  const user = await User.findOne({ userId });
  if (!user) return reply(ctx, 'You need an account first. Use `/start` or `op start` to register.');

  if (findItemCount(user.items || [], 'god_token') < 1) {
    return reply(ctx, `${GOD_TOKEN_EMOJI} You need **1 God Token** to start a raid! You currently have 0.`);
  }

  const def = findCardByQuery(bossQuery);
  if (!def || def.ship || def.artifact) {
    return reply(ctx, `Could not find a card matching **${bossQuery}**.`);
  }

  const crew = await Crew.findOne({ members: userId });
  if (!crew) {
    return reply(ctx, 'You must be in a crew to start a raid! Only crew members can join.');
  }

  user.items = removeItem(user.items || [], 'god_token', 1);
  await user.save();

  const boss = buildBossFromDef(def);
  const state = {
    channelId,
    messageId: null,
    channel,
    ownerId: userId,
    crewId: crew.crewId,
    crewMembers: [...(crew.members || [])],
    phase: 'lobby',
    boss,
    players: [],
    roundQueue: [],
    roundIndex: 0,
    finished: false,
    lastAction: '',
    startTimeoutId: null
  };

  raidStates.set(channelId, state);

  const embed = buildLobbyEmbed(state);
  let sentMsg;
  if (ctx.interaction) {
    sentMsg = await ctx.interaction.reply({ embeds: [embed], components: makeLobbyComponents(), fetchReply: true });
  } else {
    sentMsg = await channel.send({ embeds: [embed], components: makeLobbyComponents() });
  }
  state.messageId = sentMsg.id;

  // 3-minute auto-start
  state.startTimeoutId = setTimeout(async () => {
    const s = raidStates.get(channelId);
    if (!s || s.phase !== 'lobby') return;

    if (s.players.length < MIN_PLAYERS) {
      try {
        const msg = await channel.messages.fetch(s.messageId).catch(() => null);
        if (msg) {
          const cancelEmbed = buildLobbyEmbed(s);
          cancelEmbed.setTitle(`${s.boss.name} | Raid Cancelled`);
          cancelEmbed.setColor('#888888');
          cancelEmbed.setFooter({ text: `Not enough players joined (${s.players.length}/${MIN_PLAYERS} required). Raid cancelled — God Token refunded.` });
          await msg.edit({ embeds: [cancelEmbed], components: [] });
        }
      } catch (e) {}
      // Refund god token to raid owner
      try {
        const ownerUser = await User.findOne({ userId: s.ownerId });
        if (ownerUser) {
          const gt = ownerUser.items.find(i => i.itemId === 'god_token');
          if (gt) { gt.quantity = (gt.quantity || 0) + 1; }
          else { ownerUser.items.push({ itemId: 'god_token', quantity: 1 }); }
          await ownerUser.save();
        }
      } catch (e) { console.error('[raid] refund error:', e); }
      raidStates.delete(channelId);
      return;
    }

    await startRaidBattle(s);
  }, RAID_TIMEOUT_MS);
}

async function execAdd(ctx, cardQuery) {
  const channelId = ctx.channelId;
  const userId = ctx.userId;
  const username = ctx.username;
  const channel = ctx.channel;

  if (!cardQuery) return reply(ctx, 'Please specify a card name or ID. e.g. `op raid add zoro` or `/raid add zoro`');

  const state = raidStates.get(channelId);
  if (!state || state.phase !== 'lobby') {
    return reply(ctx, 'There is no active raid lobby in this channel.');
  }

  if (!state.crewMembers.includes(userId)) {
    return reply(ctx, 'Only members of the raid crew can join!');
  }

  if (state.players.length >= MAX_PLAYERS) {
    return reply(ctx, `The raid is full! (${MAX_PLAYERS} players max)`);
  }

  if (state.players.find(p => p.userId === userId)) {
    return reply(ctx, 'You are already in this raid. Use `op raid remove` or `/raid remove` to leave first.');
  }

  const def = findCardByQuery(cardQuery);
  if (!def || def.ship || def.artifact) {
    return reply(ctx, `Could not find a card matching **${cardQuery}**.`);
  }

  const user = await User.findOne({ userId });
  if (!user) return reply(ctx, 'You need an account first.');

  const entry = (user.ownedCards || []).find(e => e.cardId === def.id);
  if (!entry) {
    return reply(ctx, `You don't own **${def.character}**!`);
  }

  const card = buildPlayerCard(def, entry, user.ownedCards);
  state.players.push({ userId, username, entry, card });

  await updateRaidMessage(state);

  if (ctx.interaction) {
    return ctx.interaction.reply({ content: `${def.emoji || ''} **${def.character}** joined the raid!`.trim(), ephemeral: false });
  } else {
    return channel.send(`${def.emoji || ''} **${ctx.username}**'s **${def.character}** joined the raid!`.trim());
  }
}

async function execRemove(ctx) {
  const channelId = ctx.channelId;
  const userId = ctx.userId;

  const state = raidStates.get(channelId);
  if (!state || state.phase !== 'lobby') {
    return reply(ctx, 'There is no active raid lobby in this channel.');
  }

  const idx = state.players.findIndex(p => p.userId === userId);
  if (idx === -1) return reply(ctx, 'You are not currently in this raid.');

  const removed = state.players.splice(idx, 1)[0];
  await updateRaidMessage(state);
  return reply(ctx, `Removed **${removed.card?.def?.character || 'your card'}** from the raid.`);
}

async function execForceStart(ctx) {
  const channelId = ctx.channelId;
  const userId = ctx.userId;

  const state = raidStates.get(channelId);
  if (!state || state.phase !== 'lobby') {
    return reply(ctx, 'There is no active raid lobby in this channel.');
  }

  if (state.ownerId !== userId) {
    return reply(ctx, 'Only the raid owner can force-start the raid early.');
  }

  if (state.players.length === 0) {
    return reply(ctx, 'No players have joined yet! Add your card with `op raid add <card>` or `/raid add <card>`.');
  }

  if (state.startTimeoutId) { clearTimeout(state.startTimeoutId); state.startTimeoutId = null; }

  if (ctx.interaction) {
    await ctx.interaction.reply({ content: '⚔️ Starting the raid!', ephemeral: true });
  } else {
    await ctx.channel.send('⚔️ Starting the raid!');
  }

  await startRaidBattle(state);
}

// ─── Main execute (slash + prefix) ───────────────────────────────────────────

module.exports = {
  name: 'raid',

  async execute({ message, interaction, args }) {
    const userId = message ? message.author.id : interaction.user.id;
    const username = message ? message.author.username : interaction.user.username;
    const channelId = message ? message.channelId : interaction.channelId;
    const channel = message ? message.channel : interaction.channel;

    const ctx = { message, interaction, userId, username, channelId, channel };

    if (interaction) {
      // Slash command
      const sub = interaction.options.getSubcommand(false);
      if (!sub || sub === 'boss') {
        return execStart(ctx, interaction.options.getString('boss'));
      }
      if (sub === 'add') return execAdd(ctx, interaction.options.getString('card'));
      if (sub === 'remove') return execRemove(ctx);
      if (sub === 'start') return execForceStart(ctx);
      return;
    }

    // Prefix command: op raid [subcommand] [args...]
    const firstArg = (args?.[0] || '').toLowerCase();

    if (firstArg === 'add') {
      return execAdd(ctx, args.slice(1).join(' ').trim());
    }
    if (firstArg === 'remove') {
      return execRemove(ctx);
    }
    if (firstArg === 'start') {
      return execForceStart(ctx);
    }

    // Otherwise: treat entire args as boss name
    const bossQuery = args.join(' ').trim();
    return execStart(ctx, bossQuery);
  },

  // ─── Button handler (called from index.js) ────────────────────────────────

  async handleButton(interaction, customId) {
    const channelId = interaction.channelId;
    const userId = interaction.user.id;
    const state = raidStates.get(channelId);

    if (!state) {
      return interaction.reply({ content: 'This raid is no longer active.', ephemeral: true });
    }

    // ── Lobby: Start button ────────────────────────────────────────────────
    if (customId === 'raid_start') {
      if (state.ownerId !== userId) {
        return interaction.reply({ content: 'Only the raid owner can start the raid early.', ephemeral: true });
      }
      if (state.phase !== 'lobby') {
        return interaction.reply({ content: 'The raid has already started.', ephemeral: true });
      }
      if (state.players.length === 0) {
        return interaction.reply({ content: 'No players have joined yet!', ephemeral: true });
      }
      if (state.startTimeoutId) { clearTimeout(state.startTimeoutId); state.startTimeoutId = null; }
      await interaction.deferUpdate();
      await startRaidBattle(state);
      return;
    }

    // ── Battle: Action buttons ─────────────────────────────────────────────
    if (!customId.startsWith('raid_action:')) return;

    if (state.phase !== 'battle') {
      return interaction.reply({ content: 'The raid has not started yet.', ephemeral: true });
    }
    if (state.finished) {
      return interaction.reply({ content: 'The raid is already over.', ephemeral: true });
    }

    const cp = currentPlayerInRound(state);
    if (!cp || cp.userId !== userId) {
      return interaction.reply({ content: "It's not your turn!", ephemeral: true });
    }

    const card = cp.card;
    if (!card || !card.alive) {
      return interaction.reply({ content: "Your card has been KO'd!", ephemeral: true });
    }

    const action = customId.split(':')[1];
    await interaction.deferUpdate();

    if (action === 'rest') {
      if (card.turnsUntilRecharge > 0) {
        card.turnsUntilRecharge = Math.max(0, card.turnsUntilRecharge - 1);
      } else {
        card.energy = Math.min(3, (card.energy || 0) + 1);
      }
      state.lastAction = `${card.def.emoji || ''} **${cp.username}**'s ${card.def.character} rests. ${energyDisplay(card.energy)}`.trim();
      await advanceTurn(state);
      return;
    }

    if (action === 'attack' || action === 'special') {
      const cost = action === 'special' ? 3 : 1;

      if (card.energy < cost) {
        return interaction.followUp({ content: `Not enough energy! (Need ${cost}, have ${card.energy})`, ephemeral: true });
      }

      if (hasStatusLock(card)) {
        const reason = getStatusLockReason(card);
        card.energy = Math.max(0, card.energy - cost);
        card.turnsUntilRecharge = 2;
        state.lastAction = `${card.def.emoji || ''} **${cp.username}**'s ${card.def.character} is ${reason} and cannot act!`.trim();
        await advanceTurn(state);
        return;
      }

      card.energy = Math.max(0, card.energy - cost);
      card.turnsUntilRecharge = 2;

      const baseDmg = calculateUserDamage(card, action);
      const mult = getDamageMultiplier(card.def.attribute, state.boss.attribute);
      const dmg = Math.max(1, Math.floor(baseDmg * mult));
      state.boss.currentHP = Math.max(0, state.boss.currentHP - dmg);

      const effStr = mult > 1 ? ' (Effective!)' : mult < 1 ? ' (Weak)' : '';
      const atkLabel = action === 'special' ? (card.def.special_attack || 'Special') : 'attacks';
      state.lastAction = `${card.def.emoji || ''} **${cp.username}**'s ${card.def.character} ${atkLabel} **${state.boss.name}** for **${dmg} DMG**${effStr}!`.trim();

      if (state.boss.currentHP <= 0) {
        state.boss.currentHP = 0;
        await handleVictory(state);
        return;
      }

      await advanceTurn(state);
      return;
    }
  },

  getRaidState(channelId) {
    return raidStates.get(channelId);
  }
};
