# Card Stat Ranges Reference

## Auto-generated Stats

Stats are **not written in the card source data**. They are generated at runtime from the card's `rank` field using a seeded random number generator (seeded by the card ID). The same card always produces the same stats across bot restarts.

Fields that are auto-generated and must NOT be written in source:
- `power`
- `health`
- `speed`
- `attack_min` / `attack_max`
- `min_atk` / `max_atk` (inside special_attack — generated from attack stats)

---

## Stat Ranges by Rank

Each rank has a full band. The active sub-band depends on whether the rank has a modifier (`-` / `+`).

### Modifier Sub-bands

| Modifier | Sub-band |
|----------|----------|
| `-`      | Bottom 25 % of the full band |
| *(none)* | Middle 50 % of the full band |
| `+`      | Top 25 % of the full band |

**Example — S rank power (full band 20–30):**
- `S-` → 20–22
- `S`  → 22–27
- `S+` → 27–30

---

### D Rank
- **Power:** 0 – 5
- **Health:** 1 – 8
- **Speed:** 1
- **Attack Min/Max:** 1

### C Rank
- **Power:** 5 – 10
- **Health:** 8 – 15
- **Speed:** 1 – 3
- **Attack Min/Max:** 1 – 3

### B Rank
- **Power:** 10 – 15
- **Health:** 15 – 26
- **Speed:** 1 – 5
- **Attack Min/Max:** 1 – 5

### A Rank
- **Power:** 15 – 20
- **Health:** 26 – 35
- **Speed:** 3 – 8
- **Attack Min/Max:** 3 – 8

### S Rank
- **Power:** 20 – 30
- **Health:** 35 – 50
- **Speed:** 6 – 12
- **Attack Min/Max:** 6 – 12

### SS Rank
- **Power:** 30 – 50
- **Health:** 50 – 80
- **Speed:** 10 – 20
- **Attack Min/Max:** 10 – 20

### UR Rank
- **Power:** 50 – 80
- **Health:** 75 – 120
- **Speed:** 18 – 30
- **Attack Min:** 15 – 25
- **Attack Max:** 25 – 40

---

## Special Attack Damage

If a card has `special_attack: { name, gif }`, damage is auto-generated:

```
min_atk = ceil(attack_min × 1.5)
max_atk = ceil(attack_max × 2)
```

---

## Artifacts

Artifacts (boost cards) generate `power`, `health`, and `speed` from rank but always have `attack_min = 0` and `attack_max = 0`.

---

## Card Object Structure (what you write)

```javascript
{
  id: 'character-u1',          // Unique ID
  rank: 'S',                   // D | C | B | A | S | SS | UR  (optional +/-)
  attribute: 'STR',            // STR | QCK | INT | DEX | PSY
  emoji: '<:...:...>',
  image_url: 'https://...',
  // Optional fields:
  title: 'Card Title',
  special_attack: {
    name: 'Attack Name',
    gif: 'https://...'
    // NO min_atk / max_atk here
  },
  effect: 'stun',
  effectDuration: 1,
  effectAmount: 0,
  effectChance: 0,
  count: 2,                    // multi-target normal attack
  scount: 2,                   // multi-target special attack
  boost: 'Character (15%)',    // boost cards only
}
```
