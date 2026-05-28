
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

## Source Layout

Both `cards.js` and `morecards.js` use the same **grouped format**:

```
Faculty block
  └── Character block  (character name + aliases — shared by all cards below)
        └── Card block   (id, stats, emoji, image, optional special attack…)
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
  rank: 'B',                     // D | C | B | A | S | SS | UR
  power: 12, health: 18, speed: 4,
  attack_min: 3, attack_max: 4,
  emoji: '<:Luffygumgumpistol:1492353926257971341>',
  image_url: 'https://2shankz.github.io/optc-db.github.io/api/images/full/transparent/0/000/0002.png',
  special_attack: {              // optional; required for SS rank and above
    name: 'Gum-Gum Pistol',
    min_atk: 6, max_atk: 9,
    gif: 'https://media1.tenor.com/m/eTo-ytFNLX8AAAAC/luffy-pistol.gif'
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
  power: 1, health: 8, speed: 1,
  attack_min: 0, attack_max: 0,
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
          power: 8, health: 50, speed: 3,
          attack_min: 2, attack_max: 3,
          emoji: '<:MonkeyD:1492353158960124037>',
          image_url: 'https://2shankz.github.io/optc-db.github.io/api/images/full/transparent/0/000/0001.png',
          special_attack: {
            name: 'Gum-Gum Pistol',
            min_atk: 6, max_atk: 9,
            gif: 'https://media1.tenor.com/m/eTo-ytFNLX8AAAAC/luffy-pistol.gif'
          },
          effect: 'stun', effectDuration: 1
        },
        {
          title: 'Gum-Gum Pistol',
          id: '0002',
          attribute: 'STR',
          rank: 'B',
          power: 12, health: 18, speed: 4,
          attack_min: 3, attack_max: 4,
          emoji: '<:Luffygumgumpistol:1492353926257971341>',
          image_url: 'https://2shankz.github.io/optc-db.github.io/api/images/full/transparent/0/000/0002.png',
          special_attack: {
            name: 'Gum-Gum Pistol',
            min_atk: 6, max_atk: 9,
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
          power: 14, health: 22, speed: 4,
          attack_min: 3, attack_max: 4,
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

| Rank | Examples | Power Range | When to Use |
|------|----------|-------------|------------|
| D | Background characters, weak enemies | 5-15 power | Truly insignificant roles |
| C | Early arc characters, weak fighters | 8-20 power | Weak but notable |
| B | Solid crew members, early arcs | 12-30 power | Normal fighter level |
| A | Strong crew members, commanders | 16-35 power | Notable fighters |
| S | Very strong characters, senior leaders | 24-50 power | Powerful fighters |
| SS | Elite level, major characters | 45-60+ power | Very powerful |
| UR | Peak tier, protagonists | 50+ power | Extremely powerful |

---

## Special Attacks

- **Required for:** SS rank and above only
- **Damage scaling:** Special attack max ≈ 2–3× normal attack_max
- **All special attacks must include a status effect**
- **Status effect strength scales with card importance:**
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

- [ ] All required fields are filled (use `null` for missing assets, never placeholder strings)
- [ ] Character block is inside the correct faculty block
- [ ] All cards for the same character are grouped in the same character block
- [ ] Aliases are lowercase
- [ ] Attributes match character abilities
- [ ] Ranks are appropriate for anime importance
- [ ] SS+ rank cards have special attacks with status effects
- [ ] Special attack damage ≈ 2× normal attack
- [ ] Status effects are from the valid list only
- [ ] Stronger cards have stronger/more impactful status effects
- [ ] Non-combat support characters use boost type (attack_min/max: 0, boost field set)
- [ ] All effect names are lowercase (attackdown, not "Attack Down")
- [ ] Effect durations are reasonable (1–5 turns)
- [ ] `pullable: true` is NOT written (not needed)
- [ ] All faculties exist in crews.js
