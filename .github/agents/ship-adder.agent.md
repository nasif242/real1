---
name: ship-adder
description: Add new ship cards to data/shipcards.js
---

Purpose:
- Generate valid ship card objects and append them to the `ships` array in `data/shipcards.js`.

## Ship ID Format
- IDs follow the pattern `sNNN` (e.g., `s001`, `s017`).
- Check `data/shipcards.js` for the highest existing ID and increment by 1.

## Required Fields
| Field | Type | Notes |
|---|---|---|
| `character` | string | Display name of the ship (used by sail reward lookups — must match `ship_card` in `data/sailStages.js`) |
| `alias` | string[] | Lowercase search aliases |
| `id` | string | Unique `sNNN` identifier |
| `ship` | `true` | Must always be `true` |
| `pullable` | boolean | `true` if obtainable via pulls; `false` if reward/event-only |
| `title` | string | Short descriptive title |
| `faculty` | string \| null | Crew affiliation, or `null` |
| `rank` | string | One of: `D`, `C`, `B`, `A`, `S` |
| `color` | string | Hex color for the embed (e.g., `'#ffbb00'`) |
| `incomeMultiplier` | number | Passive Beli income rate (e.g., `1.00350`) |
| `capacity` | number | Max Beli the ship can hold |
| `cola` | number | Starting cola fuel amount |
| `maxCola` | number | Maximum cola capacity |
| `image_url` | string \| null | Direct image URL for the ship card |

## Rank ↔ Stat Guidelines
| Rank | incomeMultiplier range | capacity range | cola range |
|---|---|---|---|
| D | 1.0001 – 1.0002 | 50 – 100 | 3 – 5 |
| C | 1.0003 – 1.0005 | 100 – 500 | 10 – 25 |
| B | 1.0005 – 1.001 | 500 – 800 | 25 – 40 |
| A | 1.001 – 1.002 | 800 – 2000 | 40 – 60 |
| S | 1.002 – 1.005 | 2000 – 5000 | 75 – 150 |

## Validation Rules
- `id` must not collide with any existing ID in `data/shipcards.js`.
- `incomeMultiplier` must be > 1.
- `cola` must equal `maxCola` on creation (players start with a full tank).
- `rank` must be one of the known rank letters above.
- If the ship is awarded as a sail stage reward, its `character` value must exactly match the `ship_card` string in `data/sailStages.js`.

## Output
- Append the new ship object to the `exports.ships` array in `data/shipcards.js`.
- Do NOT modify `data/cards.js` — ships are automatically merged via `require('./shipcards')`.
- If the ship is a sail reward, verify `data/sailStages.js` already references it by `character` name; update if needed.
