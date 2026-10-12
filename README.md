# FastFighting Daggerheart

> **AI use:** This module used AI in its creation.
> - **Programming:** I am a skilled programmer by profession, but AI was used heavily as a co-pilot.
> - **Strings:** ALL initial strings were created by AI.

Daggerheart support for [FastFighting Core](https://github.com/galaara98/FastFighting), the Foundry VTT module that simulates a fight (or a tense standoff) thousands of times, tells the story of one fair draw, and commits it to the tokens with **Make it So**.

- **Foundry:** v14
- **System:** Daggerheart (Foundryborne, `daggerheart`) 2.10 or later
- **Needs:** FastFighting Core (API 10)

## Installation

Install FastFighting Core first, then this module. In Foundry, go to **Add-on Modules → Install Module** and paste:

```
https://github.com/galaara98/FastFighting/releases/latest/download/module.json
https://github.com/galaara98/FastFighting-Daggerheart/releases/latest/download/module.json
```

## What it reads

- **Characters:** traits, Evasion, damage thresholds, Hit Points, Stress, Hope (and its most, scars and all), Armor Slots, Proficiency and Experiences; the weapons equipped (else an unarmed attack: Proficiency in d4s, Strength or Finesse); the actions on its features (class, subclass, ancestry, community) and on the domain cards in its loadout (not the vault).
- **Adversaries:** type and tier, Difficulty, thresholds, Hit Points, Stress, Experiences, motives and tactics; the standard attack; and the actions of its action features (reactions and passives aren't played yet). A **Minion** falls to any damage, and with **Minion (X)** each X damage fells another of its kind; a **Horde** hits for its lesser damage once it has marked half its Hit Points; a **Solo** with **Relentless (X)** can take the spotlight X times in a GM turn. A Minion's **Group Attack** isn't played yet.
- **Actions,** from their data, never their names: an attack (its trait, or a spellcast with the character's spellcasting trait; an adversary's attack modifier), a reaction roll it forces (a save against the Difficulty), damage without a roll, healing that clears Hit Points, and effects (bonuses to rolls, damage and Evasion; Vulnerable, Hidden, Restrained). Their costs (Hope, Stress, an Armor Slot, the GM's Fear) and uses carry over. Ranges are the system's, in feet, from its **Range Measurement** rule.
- **Personality:** a character's from its traits (Instinct or Knowledge make a tactician, Strength and Presence a bold one, Presence a loyal one); an adversary's from its type (a Solo bold and fearless, a Skulk cunning, a Minion faint-hearted) and tier; motives such as feeding or hunting make a beast that fights on instinct and won't talk. Leaders: an adversary Leader (then a Solo), a character by its Presence.

## How a fight plays

- **The Duality Dice:** a character rolls its Hope and Fear d12s plus its modifier against the Difficulty (advantage +d6, disadvantage −d6). With Hope, it gains a Hope; with Fear, the GM gains a Fear; matching dice are a critical success (a Hope, a Stress cleared, critical damage on an attack). Reaction rolls bring neither. Before rolling, a character spends a Hope on its best Experience when one fits and it's worth it, keeping three back for its class's Hope feature unless the roll is unlikely to work. Adversaries roll a d20 (advantage: the better of two), a critical at their threshold.
- **The spotlight:** there's no initiative. Each character takes the spotlight in turn; one whose roll fails, or goes with Fear, hands it to the GM, who spotlights an adversary (the one that has waited longest) and may spend Fear for more. The log says when the spotlight swings and when Fear is spent. The party's other friends act at the end of each round.
- **Damage:** resistance halves it, immunity ignores it, reduction comes off; then the thresholds: under Major a Hit Point, Major two, Severe three (twice Severe four, with the system's **Massive Damage** rule). A character marks an Armor Slot to take a hit down a step: always against Major or worse, against a Minor hit while it has more than half its slots left. Stress damage marks Stress; Stress it can't mark becomes Hit Points. Vulnerable foes are hit with advantage, Hidden ones with disadvantage.
- **Death moves:** a character whose last Hit Point is marked chooses as its playstyles lean (Martyr and Redeem-Seeker: **Blaze of Glory**; Wildcard, Impatient, Brawler, Speed-Runner, Instigator, Vengeful, Relentless: **Risk It All**; Chicken, Fragile, Lazy, Mercenary, Diplomat, Peacekeeper, Skeptic, Wallflower: **Avoid Death**), else by its nerve (the bravest, and anyone who'd never retreat, Risk It All; the rest Avoid Death).
  - **Avoid Death:** out cold; if the Hope die comes up at or under its level, a scar.
  - **Risk It All:** the Duality Dice. Hope higher: it clears that many Hit Points and fights on. Fear higher: it dies. Matching: every Hit Point and Stress cleared.
  - **Blaze of Glory:** one last action, a critical success, and then it dies.
  - Adversaries whose last Hit Point is marked are defeated (dead).
- **Talking:** Presence for persuading, threatening and deceiving; an adversary talks with its best Experience (a Social adversary better), and resists with its Difficulty. Beasts don't talk.

## The planner's Daggerheart row

- **Fear:** what the GM has going in. It starts as the world's Fear; Make it So writes back what the fight leaves.
- **Spending Fear:** on a GM turn, one adversary takes the spotlight, and a Fear brings one more:
  - **Sparing:** one more, only while the GM holds more than 4 Fear;
  - **Steady** (the default): one more, while it holds more than 1;
  - **Free:** as many more as there is Fear for.

## Make it So

- A character: Hit Points and Stress marked, Hope, Armor Slots marked (on its armor), a scar, and how it ended (unconscious from Avoid Death, dead).
- An adversary: Hit Points and Stress marked; defeated (dead, and its combatant defeated), or hidden when it fled.
- The GM's Fear, written to the world.

Undo puts it all back.

## Not yet played

Help an Ally, Tag Team rolls, adversary reactions and passives, a Minion's Group Attack, an adversary's Experiences (a Fear each), countdowns, summons, beastforms, and money (gold isn't offered or demanded in a standoff yet).

## Development

The tests import FastFighting Core from a checkout beside this one (`../FastFighting`; override with `FASTFIGHTING_CORE`):

```
npm install
npm test
```

Junction or symlink this folder into Foundry as `Data/modules/fast-fighting-daggerheart`.

Every word this module shows is in `languages/en.json` (or the Daggerheart system's own, where it has one: Hope, Stress, Fear, the death moves, traits and adversary types): the code holds keys, never the English. Translating it takes only a copy of that file (see **Translating** in the core README). `npm run test:reworded` runs the tests again with every word in the language files reworded, so they never depend on the wording.

`hardcoded-toEN.json` lists words that stay in English for now, whatever the reader's language: keys of `languages/en.json` (or a group) whose translation would contradict a game system that isn't translated yet. It has the date it was last updated (`lastUpdated`) and the list (`keys`).

## License

MIT for this module's code. Daggerheart is by Darrington Press; this module plays its rules as the free Daggerheart SRD sets them out, holds none of its text, and isn't affiliated with or endorsed by Darrington Press or Critical Role.
