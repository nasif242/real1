
# Card Addition Guide

This guide explains how to properly add new cards to the game. Follow these instructions for consistent card creation.

## Card ID Format

All cards should have an ID field given from the requester.

## File Structure

Cards are defined in two main files:
- **cards.js** - Primary cards (main story characters), Ships, and Artifacts
- **morecards.js** - Secondary cards (early arc and side characters)
- **crews.js** - Faculty/crew definitions and their ranks
- **marines.js** - Marine organization characters

## How Stats Work

**You do not write stat values.** Power, health, speed, attack_min, and attack_max are all **automatically generated at runtime** from the card's `rank` field using a seeded random algorithm. The same card always gets the same stats (seeded by its ID), so stats are stable across restarts.

Special attack damage (min_atk / max_atk) is also **auto-generated** — approximately 1.5× attack_min and 2× attack_max. You only write the attack name and gif.

The only fields you write are: `id`, `rank`, `attribute`, `emoji`, `image_url`, and optional fields like `title`, `special_attack` (name + gif only), `effect`, `count`, `scount`, `boost`.

---

## Rank Modifiers

Any rank can be followed by `-` or `+` to place the card in the lower or upper portion of that rank's stat range:

| Suffix | Sub-band | Example (S power range 20–30) |
|--------|----------|-------------------------------|
| `-`    | Bottom 25 % of the band | 20 – 22 |
| *(none)* | Middle 50 % of the band | 22 – 27 |
| `+`    | Top 25 % of the band | 27 – 30 |

```javascript
rank: 'S-'   // lower-end S card (20–22 power)
rank: 'S'    // mid S card (22–27 power)
rank: 'S+'   // high-end S card (27–30 power)
```

Modifiers work on all ranks: `B-`, `A+`, `SS-`, `UR+`, etc.

---

## Source Layout

Both `cards.js` and `morecards.js` use the same **grouped format**:

```
Faculty block
  └── Character block  (character name + aliases — shared by all cards below)
        └── Card block   (id, rank, emoji, image, optional special attack…)
        └── Card block
        …
  └── Character block
        └── Card block
        …
Faculty block
  └── …
```

### Faculty Block

```javascript
{
  faculty: 'Strawhat Pirates',   // string, or null for no-faculty characters
  characters: [ … ]
}
```

### Character Block

```javascript
{
  character: 'Monkey D. Luffy',
  alias: ['luffy', 'monkey d luffy', 'strawhat'],  // all lowercase
  cards: [ … ]
}
```

- `character` and `alias` are **shared** by every card nested inside — do not repeat them per card.
- Aliases must be lowercase.
- `pullable: true` is **not needed** — every card is pullable by default.

### Card Block (normal fighter)

```javascript
{
  title: 'Gum-Gum Pistol',      // card display name (omit for untitled base forms)
  id: '0002',                    // unique string id
  attribute: 'STR',              // STR | QCK | INT | DEX | PSY
  rank: 'B',                     // D | C | B | A | S | SS | UR  (optional +/-)
  emoji: '<:Luffygumgumpistol:1492353926257971341>',
  image_url: 'https://...',
  special_attack: {              // optional; include for A rank and above
    name: 'Gum-Gum Pistol',
    gif: 'https://media1.tenor.com/m/eTo-ytFNLX8AAAAC/luffy-pistol.gif'
    // min_atk / max_atk are NOT written — auto-generated from rank
  },
  effect: 'stun',               // see Status Effects section below (optional)
  effectDuration: 1
}
```

### Card Block (boost type)

Some characters don't fight (doctors, cooks, etc.) — use a boost card:

```javascript
{
  title: 'Barmaid of the Partys Bar',
  id: '9999',
  attribute: 'PSY',
  rank: 'C',
  // Stats auto-generated; boost cards always have attack_min/max = 0
  boost: 'Monkey D. Luffy (5%), Figarland Shanks (5%)',
  emoji: '<:Makino:1234567890>',
  image_url: null
}
```

Boost cards have **NO** `special_attack`.

---

## Full Example (two characters, same faculty)

```javascript
{
  faculty: 'Strawhat Pirates',
  characters: [
    {
      character: 'Monkey D. Luffy',
      alias: ['luffy', 'monkey d luffy', 'strawhat'],
      cards: [
        {
          id: '0001',
          attribute: 'STR',
          rank: 'C',
          emoji: '<:MonkeyD:1492353158960124037>',
          image_url: 'https://2shankz.github.io/optc-db.github.io/api/images/full/transparent/0/000/0001.png',
          special_attack: {
            name: 'Gum-Gum Pistol',
            gif: 'https://media1.tenor.com/m/eTo-ytFNLX8AAAAC/luffy-pistol.gif'
          },
          effect: 'stun', effectDuration: 1
        },
        {
          title: 'Gum-Gum Pistol',
          id: '0002',
          attribute: 'STR',
          rank: 'B',
          emoji: '<:Luffygumgumpistol:1492353926257971341>',
          image_url: 'https://2shankz.github.io/optc-db.github.io/api/images/full/transparent/0/000/0002.png',
          special_attack: {
            name: 'Gum-Gum Pistol',
            gif: 'https://media1.tenor.com/m/eTo-ytFNLX8AAAAC/luffy-pistol.gif'
          },
          effect: 'stun', effectDuration: 1
        }
      ]
    },
    {
      character: 'Roronoa Zoro',
      alias: ['zoro', 'roronoa zoro', 'pirate hunter'],
      cards: [
        {
          id: '0005',
          attribute: 'DEX',
          rank: 'B',
          emoji: '<:0005:1492532805434081510>',
          image_url: 'https://2shankz.github.io/optc-db.github.io/api/images/full/transparent/0/000/0005.png'
        }
      ]
    }
  ]
}
```

---

## Grouping Rules

- **All cards for the same character must be inside the same character block.**
- **All characters in the same faculty must be inside the same faculty block.**
- **Faculty takes priority** — if a character could belong to two faculties, put them in the one that best fits their primary affiliation.
- Characters with no faculty use `faculty: null`.
- When a character only appears in `morecards.js`, their character block lives there (keep the two files separate).

---

## Rank Reference

| Rank | Power Generated | When to Use |
|------|-----------------|-------------|
| D    | 0 – 5           | Background characters, weak enemies |
| C    | 5 – 10          | Early arc characters, weak fighters |
| B    | 10 – 15         | Solid crew members, average fighters |
| A    | 15 – 20         | Strong crew members, commanders |
| S    | 20 – 30         | Very strong characters, senior leaders |
| SS   | 30 – 50         | Elite level, major characters |
| UR   | 50 – 80         | Peak tier, protagonists |

Use `rank: 'S+'` (or similar) to push a card to the top of its band without moving up a full tier.

---

## Special Attacks

- Include `special_attack` for A rank and above (required for SS+)
- Only write `name` and `gif` — damage is auto-generated (≈ 1.5× and 2× the card's attack stats)
- All special attacks should include a status effect:
  - Weaker cards: confuse, attackdown, defensedown
  - Stronger cards: stun, freeze, bleed, undead
  - Elite/Yonko level: undead, stun, or bleed with high duration/amount

---

## Multi-target (`count` / `scount`)

- `count: 2` or `count: 3` — splits normal attack across that many targets
- `scount: 2` or `scount: 3` — splits special attack across that many targets
- Only add these when the card input explicitly includes a leading target token (2, 3, -2, -3)
- Matching `countIcon` / `scountIcon` are set automatically at flatten-time — do NOT add them manually

---

## Attributes

| Color | Icon Letter | Attribute | Examples |
|-------|-------------|-----------|---------|
| Red | S | STR | Luffy, Zoro, Whitebeard |
| Green | D | DEX | Sanji, Nami, Usopp |
| Blue | Q | QCK | Luffy (QCK forms), Yassopp |
| Yellow | P | PSY | Chopper, Robin |
| Purple | I | INT | Nami, Robin |

---

## Faculty Management

If a character belongs to a crew not yet in `crews.js`, add it:

```javascript
{
  name: "Crew/Faculty Name",
  icon: '<:FacultyEmoji:1234567890>',
  rank: 'A'
}
```

Crew ranks:
- D: Small/minor crews
- C: Notable but small crews
- B: Mid-tier crews
- A: Major pirate crews, strong factions
- S: Yonko crews, top-tier organizations
- SS: Only for Yonko + Marines combo

---

## Placeholder Values

Use `null` (never a placeholder string) for missing assets:

- `image_url: null`
- `emoji: null`
- `gif: null` inside special_attack

---

## Valid Status Effects

- **stun** — Prevents action for duration
- **freeze** — Prevents action, unfrozen by taking damage
- **cut** — 1 HP damage per turn
- **bleed** — 2 HP damage per turn
- **regen** — Restores percentage of max HP per turn
- **confusion** — Chance to miss attacks (use `effectChance` for miss %)
- **attackup** — Increases attack by percentage
- **attackdown** — Decreases attack by percentage
- **defenseup** — Increases defense by percentage
- **defensedown** — Decreases defense by percentage
- **truesight** — Dodges all incoming attacks
- **undead** — Card remains alive at 0 HP
- **reflect** — Reflects opponent's attack back

⚠️ **Does NOT exist:** `burn`, `poison`, `speeddown`, `paralysis`

---

## Pre-submission Checklist

- [ ] All required fields are filled (`id`, `rank`, `emoji`, `image_url`)
- [ ] Use `null` for missing assets, never placeholder strings
- [ ] Character block is inside the correct faculty block
- [ ] All cards for the same character are grouped in the same character block
- [ ] Aliases are lowercase
- [ ] Attributes match character abilities
- [ ] Ranks are appropriate for anime importance (use +/- to fine-tune)
- [ ] SS+ rank cards have special attacks with status effects
- [ ] Special attacks only include `name` and `gif` — NO stat values
- [ ] Status effects are from the valid list only
- [ ] Stronger cards have stronger/more impactful status effects
- [ ] Non-combat support characters use `boost` field (no special_attack)
- [ ] All effect names are lowercase (attackdown, not "Attack Down")
- [ ] Effect durations are reasonable (1–5 turns)
- [ ] `pullable: true` is NOT written (not needed)
- [ ] All faculties exist in crews.js
