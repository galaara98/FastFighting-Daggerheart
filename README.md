# FastFighting Daggerheart

> **AI use:** This module used AI in its creation.
> - **Programming:** I am a skilled programmer by profession, but AI was used heavily as a co-pilot.
> - **Strings:** ALL initial strings were created by AI.

Daggerheart support for [FastFighting Core](https://github.com/galaara98/FastFighting), the Foundry VTT module that simulates a fight (or a tense standoff) thousands of times, tells the story of one fair draw, and plays it for real on the Combat Tracker, a turn at a time, with **Do it For Real Now**.

- **Foundry:** v14
- **System:** Daggerheart (Foundryborne, `daggerheart`) 2.10 or later
- **Needs:** FastFighting Core (API 14)

## Installation

Install FastFighting Core first, then this module. In Foundry, go to **Add-on Modules → Install Module** and paste:

```
https://github.com/galaara98/FastFighting/releases/latest/download/module.json
https://github.com/galaara98/FastFighting-Daggerheart/releases/latest/download/module.json
```

## What it reads

- **Characters:** traits, Evasion, damage thresholds, Hit Points, Stress, Hope (and its most, scars and all), Armor Slots, Proficiency and Experiences; the weapons equipped (else an unarmed attack: Proficiency in d4s, Strength or Finesse); the actions on its features (class, subclass, ancestry, community) and on the domain cards in its loadout (not the vault).
- **Adversaries:** type and tier, Difficulty, thresholds, Hit Points, Stress, Experiences, motives and tactics; the standard attack; the actions of its action features (an SRD feature that knocks a foe back, pulls it in, knocks it over or seizes it, known by its compendium id, is played as that maneuver: Ground Slam flings, Grab and Drag drags, Earth Eruption trips, the Bear's Bite grapples); an SRD passive or reaction feature that knocks back or pulls in whoever its standard attack hits rides that attack, on every hit (the Bear's Overwhelming Force and the Vault Guardian Sentinel's Kinetic Slam to Very Close, the Greater Water Elemental's High Tide to Close; the Cursed Merfolk's "Get Over Here!" pulls into Melee; a reaction's Stress isn't paid); and its reaction features that harm whoever hurt it (Thorny Armor, Burning, Acid Bath, Warding Sphere ...), each answering a blow that hurts it, once a round, for its Stress where it costs one. A **Minion** falls to any damage, and with **Minion (X)** each X damage fells another of its kind; a **Horde** hits for its lesser damage once it has marked half its Hit Points; a **Solo** with **Relentless (X)** can take the spotlight X times in a GM turn. A Minion's **Group Attack** isn't played yet. Its talk is its best Experience; anything tried on it (a hand in its pocket too) is against its Difficulty.
- **Companions** (a Beastbound ranger's): Evasion, Experiences and attack (its partner's Spellcast to hit and Proficiency in its dice), fighting beside its partner. Its rolls are its partner's, on the Duality Dice (Hope to the partner, Fear to the GM), and it acts at the end of the round. Any damage marks one of its Stress; at its last, it's out of the fight.
- **NPCs:** bystanders. Nothing to fight with; a blow puts one out of the fight; talking it round, or robbing it, is against its Difficulty.
- **Actions,** from their data, never their names: an attack (its trait, or a spellcast with the character's spellcasting trait; an adversary's attack modifier), a reaction roll it forces (a save against the Difficulty), damage without a roll, healing that clears Hit Points, and effects (bonuses to rolls, damage and Evasion; Vulnerable, Hidden, Restrained). Their costs (Hope, Stress, an Armor Slot, the GM's Fear) and uses carry over. Ranges are the system's, in feet, from its **Range Measurement** rule.
- **Personality:** a character starts as the usual hero, and its whole sheet moves it a little, each part shown in the trait's reason:
  - its traits, against the spread its class suggests (a hero who spread them as its class's guide does moves nothing; a wizard who put its best in Strength is bolder and less of a planner): Knowledge and Instinct make a planner, Strength, Presence and Agility a bold one, Finesse a self-serving one, Presence a loyal one;
  - its level (experience makes a planner);
  - its domains, its class's and its domain cards' (Valor bold and loyal, Blade bold, Bone and Codex planners, Midnight self-serving and secretive, Splendor selfless, Grace warm, Sage giving, Arcana impulsive, Dread ruthless);
  - its subclass (more, the deeper it's gone), ancestry (where its features say so: an infernis fearless, a galapa careful) and community (Slyborne self-serving, Orderborne loyal, Loreborne a planner, Ridgeborne steady ...), known by the system's own ids (the compendium a subclass came from, a lore reference), the name only as a fallback;
  - its features and the domain cards in its loadout, by what their actions do: help aimed at its allies, mending others, striking at a cost in its own Hit Points or at its foes' Hope, calling help, a Rally die;
  - its scars (less nerve) and the Stress slots it took on (more), and whether it's in the party (where the world has one).

  An adversary's from its type (a Solo bold and fearless, a Skulk cunning, a Minion faint-hearted) and tier; motives such as feeding or hunting make a beast that fights on instinct and won't talk; then its features, by what they do, and the damage it's immune to or resists (bolder). A companion is bonded to its partner (loyal, on instinct), an NPC no fighter (timid), each then moved by its features. Leaders: an adversary Leader (then a Solo), a character by its Presence.

## How a fight plays

- **The Duality Dice:** a character rolls its Hope and Fear d12s plus its modifier against the Difficulty (advantage +d6, disadvantage −d6). With Hope, it gains a Hope; with Fear, the GM gains a Fear; matching dice are a critical success (a Hope, a Stress cleared, critical damage on an attack). Reaction rolls bring neither. Before rolling, a character spends a Hope on its best Experience when one fits and it's worth it, keeping three back for its class's Hope feature unless the roll is unlikely to work. Adversaries roll a d20 (advantage: the better of two), a critical at their threshold.
- **The spotlight:** there's no initiative. Each character takes the spotlight in turn; one whose roll fails, or goes with Fear, hands it to the GM, who spotlights an adversary (the one that has waited longest) and may spend Fear for more. The log says when the spotlight swings and when Fear is spent. The party's other friends act at the end of each round.
- **Damage:** resistance halves it, immunity ignores it, reduction comes off; then the thresholds: under Major a Hit Point, Major two, Severe three (twice Severe four, with the system's **Massive Damage** rule). A character marks an Armor Slot to take a hit down a step, as its **Shields** answer says (below). Stress damage marks Stress; Stress it can't mark becomes Hit Points. Vulnerable foes are hit with advantage, Hidden ones with disadvantage.
- **Shoved, knocked back, pulled in:** moved as the core moves anyone (stopped by walls and others in the way). Over a ledge it falls, as the SRD's guide has it by the range fallen: Very Close 1d10+3 physical damage, Close 1d20+5, Far or more 1d100+15. Daggerheart has no prone: nobody lands that way. Knocked back into a wall, or into someone in the way, it takes the SRD's collision damage, 1d20+5 physical; whoever it hits takes nothing. The SRD's collision is direct damage, which an Armor Slot can't lessen; here an Armor Slot still can. A shove or a pull isn't a collision.
- **Death moves:** a character whose last Hit Point is marked chooses as its playstyles lean (Martyr and Redeem-Seeker: **Blaze of Glory**; Wildcard, Impatient, Brawler, Speed-Runner, Instigator, Vengeful, Relentless: **Risk It All**; Chicken, Fragile, Lazy, Mercenary, Diplomat, Peacekeeper, Skeptic, Wallflower: **Avoid Death**), else by its nerve (the bravest, and anyone who'd never retreat, Risk It All; the rest Avoid Death).
  - **Avoid Death:** out cold; if the Hope die comes up at or under its level, a scar.
  - **Risk It All:** the Duality Dice. Hope higher: it clears that many Hit Points and fights on. Fear higher: it dies. Matching: every Hit Point and Stress cleared.
  - **Blaze of Glory:** one last action, a critical success, and then it dies.
  - Adversaries whose last Hit Point is marked are defeated; one who would kill kills them.
- **Talking:** Presence for persuading, threatening and deceiving; an adversary talks with its best Experience (a Social adversary better), and resists with its Difficulty. Beasts don't talk.

## Playstyles in Daggerheart

Every perk a playstyle (or a tactics answer) can switch on does something here. Most play as they do in any system (who a character goes for, when it loses heart, whom it listens to, how it talks). These are Daggerheart's own:

| Perk (playstyles) | In Daggerheart |
| --- | --- |
| Hard to spot (Chicken, Fragile, Wallflower) | Foes' attention slides off it, and it would rather **Hide** (Finesse against Difficulty 12): Hidden, rolls against it at disadvantage, until it attacks. |
| Spoiling (Instigator most; Cruel, Wants to Lead, Wallflower, Puzzle-Maniac) | It would rather **Grapple** (Strength against the foe's Difficulty: held; on a critical, Restrained too) or **Maneuver** (Agility: Vulnerable until the foe next acts), or use a feature that lays a condition, than strike. |
| Helping (Enabler, People-Pleaser, Moralist, Martyr, Redeem-Seeker, Tank) | **Help an Ally**: a Hope for a d6 on a friend's next action roll, without taking the spotlight; friends asking for help are answered. |
| In a hurry (Impatient, Speed-Runner) | **Sprint** for a foe beyond Close range: an Agility roll against Difficulty 12 that takes the spotlight's action (made, up to Far); an adversary moves up to Very Far as its action. |
| Acting first (Instigator) | No initiative here: it takes the spotlight first among the party, and the GM turns to it first among its side. |
| Lore-Collector | Sizes a foe up with **Analyze** (Knowledge) or **Perceive** (Instinct), whichever is better, against the foe's Difficulty; on a success its next roll against that foe is likelier (the **Lore-Collector advantage** setting, 2.4× by default). |
| Weak spots (Puzzle-Maniac) | A foe that resists, or is immune to, one kind of damage (physical, magical) and not the other: it goes for the other. |
| Healers and casters as targets | Anyone with a spellcast attack counts as a caster; anyone with healing (a domain card, a potion) as a healer. |
| Thief | Lifts gold or gear (Finesse against 12 + the victim's Instinct). A character's gold is its sheet's (coins, handfuls, bags, chests); its stowed gear, what it carries and hasn't equipped. |
| Trap avoiders (Thief, Puzzle-Maniac, Skeptic, Lore-Collector, Chicken, Wallflower) | **Environments** (a raging river, a collapsing bridge) are hazards: their action features act on GM turns, reaction rolls against their Difficulty; a trap avoider may spot one and keep clear of it. |
| Finishing the fallen (Cruel) | An adversary whose last Hit Point is marked is **defeated**: the table decides what that means, and Do it For Real Now marks it Defeated; one who would kill (Cruel, or a foe) kills it, and it's marked Dead. A character out cold from Avoid Death can be struck (homebrew, below). |
| Sparing the fallen (Moralist, Peacekeeper, Diplomat; "avoid killing") | Leaves the defeated as they are. |
| Mending, healing (Fragile, Moralist, Martyr, Enabler) | Healing domain cards, and potions (a character's consumables: drunk by whoever carries them, at its potion threshold). |
| Locked doors (Puzzle-Maniac most) | **Smash** (Strength) or **Tinker** (Finesse) against Difficulty 12, or break it down. |
| Death moves | See **How a fight plays**: Martyr and Redeem-Seeker go out in a Blaze of Glory; the bold Risk It All; the careful Avoid Death. |

Tactics answers:

- **Shields** (raise a shield always, sparingly, never): how freely it marks **Armor Slots**: against any hit; against Major or worse; only against Severe. Let this character decide: against any hit for a Valor class or one built on its Armor Slots, else Major or worse (see **Set up by itself**).
- **Resources** (conserve, balanced, nova): how readily it spends a Hope on an Experience (only for a big difference; for a fair one, keeping three for its Hope feature; for any), as well as on its Hope, Stress and Armor Slot features.
- **Potions:** a potion drunk once its Hit Points fall below the threshold.
- **A friend falling** (rescue): it tends a friend out cold (in the fight, and after it), or heals it.
- **Retreat** ("never"): also means Risk It All when its last Hit Point is marked.
- **Magic and specialties** (an Un-Mundane character leans on them): its domain cards and its class, subclass, ancestry and community features (an adversary's, its features), and anything that casts. Its weapons, the trait moves, Help an Ally and potions are what anyone could do.

**Homebrew** (the SRD doesn't say; this module's reading, kept to the system's own mechanics where it could):
- Striking a character out cold from Avoid Death: it rolls the Duality Dice; Fear higher, it dies; otherwise it hangs on, still out cold.
- Tending a friend out cold: an Instinct or Knowledge action roll against Difficulty 12 keeps it safe from a finishing blow; a critical clears a Hit Point and gets it up.
- Which trait each move uses, what Grapple and Maneuver lay on a foe, and Difficulty 12 for Hide, Sprint, doors and tending.
- **Shove** (Strength against the foe's Difficulty): out of Melee to Very Close (10 feet); on a critical, as far as Close (25 feet). The SRD has no shove, only actions a character can attempt.
- How far a knockback goes, in feet: an adversary's feature that knocks foes back to a range sends them as far as that range is past where the feature reaches (from Melee, when it reaches that far already: the Banshee's wail, within Close, sends each to the edge of Close); one that pulls them in, from as far as it reaches. One that comes with a standard attack knocks a foe back until it's at that range's far edge (already there, nowhere).
- A collision at a dangerous speed (the SRD's guide): a knockback by an adversary's feature, stopped short; a character's Shove, or a pull, isn't that fast.
- Breaking free: the traits above; a character's grip is 12 + its Strength to break. FastFighting's improvised bonds (Daggerheart has none) take Strength or Finesse for a character, or a d20 and its attack modifier for an adversary, against two over its tier's typical Difficulty (14 in tier 1); a friend unties them with no roll. The SRD doesn't say which spells need free hands, so the world setting **Tied up stops spells** (on by default) decides whether a creature that's tied up can cast. A weapon always needs as many hands as its burden.
- An adversary's gold: the SRD doesn't count it, so a humanoid adversary is reckoned to carry a handful a tier (a Leader's or a Solo's twice that), a beast or a Minion none: something to steal, or to pay with in a standoff.

## Set up by itself

When FastFighting sets a character up by itself (the first time it sees it: see the core's README), Daggerheart has its say, from data, never names:
- **A character's playstyles, by its class's two domains** (a homebrew class counts as its domains say): Blade a Brawler; Bone a Speed-Runner; Valor a Tank and a Martyr; Midnight a Thief and a Wallflower; Grace a Diplomat and a People-Pleaser; Codex a Lore-Collector; Splendor an Enabler and a Moralist; Sage a Lore-Collector and an Enabler; Arcana Un-Mundane.
- **An adversary's, by its type:** a Bruiser a Brawler and a Tank; a Horde a Brawler, relentless; a Leader leads; a Minion follows; a Ranged one a Wallflower; a Skulk a Wallflower, a Thief, a little cruel; a Social one a Diplomat; a Solo Relentless; a Support an Enabler.
- **A beast** (its motives: hunt, feed and the like) fights on instinct: no talker's pill, and no words.
- **Keywords:** what's said of it counts in full: a character's faith and Experiences, an adversary's description, motives and tactics, and Experiences. Its story counts a little: a character's background (what was written, not the class's questions), an adversary's notes. A character's connections are about the others, so they're left out.

### Let this character decide

What "Let this character decide" stands for is Daggerheart's answer wherever its data says something, and the GM sees why (a domain, a card's or feature's name, a weapon, an adversary's type or attack). Where it says nothing, the core reads the character's hidden scores.

A character, by its build (its player can always choose otherwise):
- **Favorite attack:** its primary weapon.
- **Style:** its class's domains: Valor a protector; Dread, Arcana or Codex a caster; Midnight a skirmisher; Blade the front line; Sage at range; Bone a skirmisher; Splendor a caster. So an Assassin skirmishes and a Witch casts. A front-line or skirmishing class whose primary weapon reaches Far shoots instead, and a Ranger with a Melee or Very Close weapon closes in.
- **Target:** a protector goes for whoever threatens its friends.
- **Retreat:** a protector (Valor) doesn't leave its friends while the fight can be won.
- **Shields (Armor Slots):** a Valor class, or one with a feature or card built on marking them (Iron Will, Brace, Armorer: more marked at once, or slots of its own), marks one against any hit; anyone else with Armor Slots, against Major or worse.
- **Healing others:** with a feature or card that clears others' Hit Points (Mending Touch, Life Support), eagerly for a Splendor class or a Warden of Renewal, else as the fight allows. It goes to a friend who falls, as a Valor class does. A Valor class gets back up and back in.
- **Talking:** a Grace class talks when it could work.
- **Magic and specialties:** a caster with a spell or grimoire it attacks with leans on it hard; anyone with a feature or card it attacks with, some.
- **Potions:** drunk once it has marked as many Hit Points as its best potion clears, so none of it is wasted (with a quarter of them left at the latest).
- **Consumables:** a Hedge witch (Herbal Remedies makes each one clear more) uses them freely.
- **Offer and expect:** a Highborne character buys its way out with a handful of gold (if it has one); a Slyborne one wants paying, a handful a tier.

Where two things on its sheet answer the same question, the surer one stands (an adversary's attack over its type).

An adversary:
- **Its type:** a Bruiser, a Horde or a Minion holds the front line against whoever is nearest; a Leader goes for the most dangerous and runs for help; a Ranged one shoots, casters first; a Skulk flanks the weakest and slips away when hurt; a Social one talks first and gets out when hurt; a Solo holds the front against the most dangerous and never gives up; a Support casts, against whoever threatens its friends.
- **Its standard attack:** one that reaches Far shoots; a Leader's, a Social or a Standard one's that reaches Melee or Very Close holds the front line.
- **Its features:** one that clears others' Hit Points heals (a Support eagerly); one that summons calls the others in (runs for help); with features it attacks with, a Solo or a Leader leans on them hard, anyone else some.
- **Offer:** a Social one with gold buys its way out with a handful.

Left to the core: how freely Hope and Stress are spent, what's nearby, and every other question the above doesn't answer. Motives and tactics and Experiences are words: they go to the keywords, not these answers.

## The planner's Daggerheart row

- **Fear:** what the GM has going in. It starts as the world's Fear; Do it For Real Now writes back what the fight leaves.
- **Spending Fear:** on a GM turn, one adversary takes the spotlight, and a Fear brings one more:
  - **Sparing:** one more, only while the GM holds more than 4 Fear;
  - **Steady** (the default): one more, while it holds more than 1;
  - **Free:** as many more as there is Fear for.

## Do it For Real Now

In a live battle, each turn's changes go onto the sheets as the turn is played:
- A character: Hit Points and Stress marked, Hope, Armor Slots marked (on its armor), a scar, and how it ended (unconscious from Avoid Death, dead).
- An adversary: Hit Points and Stress marked; Defeated (or Dead, when one who would kill beat it), its combatant defeated; hidden when it fled.
- A companion: the Stress it marked; out of the fight as the world's Defeated setting says for companions.
- An NPC: how it ended (it has nothing to mark).
- Consumables used come off what a character carries; gold or an item given up (a deal, a demand, a theft) goes to whoever it went to.
- The GM's Fear, written to the world.
- Conditions put on a creature or taken off it, by the fight or by the GM in the Battle Vantage: Vulnerable, Hidden and Restrained (FastFighting's "can't move" is Restrained too). Each turn the token's conditions are read back, so one the GM takes off the token is gone from the fight as well. What Daggerheart has no condition for (frightened, turned, stunned and the rest) FastFighting keeps.
- Breaking free of Restrained (laid in the fight, or already on the token): a character makes an action roll with the better of Strength and Agility (a friend beside it, pulling it loose, with Strength or Finesse) against the Difficulty of the adversary who laid it, or what's typical for its tier when that isn't known (12 in tier 1). It's the spotlight's action, and it brings Hope or Fear and swings the spotlight like any action roll. An adversary simply clears it when the GM spotlights it, spending that spotlight. Once broken, it comes off the token.

Rewind Turn takes one turn back; Rewind This Encounter, all of it.

## Not yet played

Tag Team rolls, adversary passives (but a knockback with its standard attack), adversary reactions that strike back with a standard attack, cost the GM a Fear, add to its own hit or count down, a Minion's Group Attack, an adversary's Experiences (a Fear each), countdowns, summons and beastforms. A knockback that answers a blow (the Oracle of Doom's Vengeful Fate: its damage is played, not the knockback), the Elephant's Toss (a Fear), direct damage (played as any damage, an Armor Slot and all), and a fall the GM says kills outright.

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
