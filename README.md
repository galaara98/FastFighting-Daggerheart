# FastFighting Daggerheart

> **AI use:** This module used AI in its creation.
> - **Programming:** I am a skilled programmer by profession, but AI was used heavily as a co-pilot.
> - **Strings:** ALL initial strings were proposed by a LLM to get the concepts out, ALL strings were  tracked to make sure they were re-written (for simple or ttrpg/game specific phrases, approved by) a native speaker.

FastFighting Core is a large but fixed set of options: turn orders, rolls, resources, conditions, holds, maneuvers, reactions, summonings and outcomes. Each system helper maps its game onto them. This helper maps Daggerheart, so the Battle Planner simulates Daggerheart fights and **Do it For Real Now** plays them on the Combat Tracker.

- **Foundry:** v14
- **System:** Daggerheart (Foundryborne, `daggerheart`) 2.10 or later
- **Needs:** [FastFighting Core](https://github.com/galaara98/FastFighting) 0.3.0 or later

## Installation

Install FastFighting Core first, then this module. In Foundry, go to **Add-on Modules → Install Module** and paste:

```
https://github.com/galaara98/FastFighting/releases/latest/download/module.json
https://github.com/galaara98/FastFighting-Daggerheart/releases/latest/download/module.json
```

## What it reads

It reads what an action or feature does from its data, not its name, so homebrew plays by what it does.

- **Characters:** traits, Evasion, thresholds, Hit Points, Stress, Hope, scars, Armor Slots, Proficiency, Experiences, gold and consumables; equipped weapons (else an unarmed attack: Proficiency in d4s, Strength or Finesse); and the actions on its features and on the domain cards in its loadout (not the vault).
- **Adversaries:** type, tier, Difficulty, thresholds, Hit Points, Stress, Experiences, motives and tactics, the standard attack, and its features.
- **Actions:** attacks, reaction rolls, damage, Stress damage, healing, summonings, and effects (bonuses to rolls, damage and Evasion; Vulnerable, Hidden, Restrained), with their costs (Hope, Stress, an Armor Slot, the GM's Fear) and uses.

## How Daggerheart maps onto FastFighting

### The spotlight

Daggerheart has no initiative, so the core runs a spotlight instead of a turn order. Each character takes the spotlight in turn. A roll that fails, or succeeds with Fear, hands the spotlight to the GM, so a live battle passes the turn to the adversaries. The GM spotlights the adversary that has waited longest and may spend Fear for more; a Solo with Relentless (X) can take the spotlight X times in a GM turn. The party's other allies, such as a companion, act at the end of each round. In a live battle the Battle Vantage gives the spotlight to whoever FastFighting would pick next, or to whoever the GM picks.

### The Duality Dice

A character rolls its Hope and Fear d12s plus its modifier against the Difficulty (advantage +d6, disadvantage −d6). With Hope it gains a Hope; with Fear the GM gains a Fear; matching dice are a critical success (a Hope, a Stress cleared, critical damage on an attack). Reaction rolls bring neither, and against something taking hold of the body (a spreading sickness) they use Strength, as the SRD's venoms do. Adversaries roll a d20 (advantage: the better of two) and score a critical at their threshold.

### Hope, Fear and Stress

**Hope** is each character's resource. It pays for Hope features, Help an Ally and Experiences. Before rolling, a character spends a Hope on its best Experience when one fits and the bonus is worth it: a big bonus for a conserve **Resources** answer, a fair one for balanced, any for nova. Unless it's nova, it keeps three Hope for its class's Hope feature, except on a roll unlikely to work.

**Fear** is the GM's pool, shared by every adversary, at most 12. Fear features and extra spotlights draw on it. The planner's Daggerheart row sets the **Fear** going in (the world's, to start; Do it For Real Now writes back what's left) and **Spending Fear**: on a GM turn one adversary takes the spotlight, and a Fear brings one more.

- **Sparing:** one more, only while the GM holds more than 4 Fear.
- **Steady** (the default): one more, while the GM holds more than 1.
- **Free:** as many more as there is Fear for.

**Stress** is a second track. Features that cost Stress mark it, and so does Stress damage (the Vampire's Draining Bite). Stress a creature can't mark becomes Hit Points.

### Hit Points, thresholds and Armor Slots

The core deals the damage; the helper turns it into Hit Points marked. Resistance halves damage, immunity ignores it, reduction comes off; then damage under Major marks 1 Hit Point, Major 2, Severe 3, and twice Severe 4 with the system's **Massive Damage** rule. Marking an Armor Slot takes a hit down a step. Armor Slots are Daggerheart's shield, so the **Shields** answer decides how freely a character marks one: against any hit (always), Major or worse (sparingly), or only Severe (never). No Armor Slot lessens direct damage.

### Death moves

When a character's last Hit Point is marked, it chooses a death move as its playstyles lean (a Martyr goes out in a Blaze of Glory, a Brawler Risks It All, a Chicken Avoids Death), else by its nerve: the bravest, and anyone who'd never retreat, Risk It All; the rest Avoid Death.

- **Avoid Death:** out cold; if the Hope die comes up at or under its level, a scar.
- **Risk It All:** the Duality Dice. Hope higher: it clears that many Hit Points and fights on. Fear higher: it dies. Matching: it clears every Hit Point and Stress.
- **Blaze of Glory:** one last action, a critical success, then it dies.

An adversary whose last Hit Point is marked is defeated; one who would kill it kills it.

### Conditions and holds

Daggerheart has three conditions: Vulnerable (hit with advantage), Hidden (hit with disadvantage) and Restrained. The helper writes them onto the sheet and reads them back each turn, so one the GM takes off a token is gone from the fight. FastFighting keeps the core's other conditions (frightened, stunned and the rest) itself. Daggerheart's Restrained means a creature can't move but can still act, so the core's "restrained" and "can't move" both become Restrained.

Restrained is a hold that an action breaks. A character rolls the better of Strength and Agility against the Difficulty of the adversary who laid it, or its tier's typical Difficulty (12 in tier 1); a friend beside it can pull it loose with Strength or Finesse. Either is the spotlight's action and brings Hope or Fear. An adversary clears it when the GM spotlights it, spending that spotlight.

### Maneuvers

The core's maneuvers come from two places:

- Trait moves. A character's Grapple is the core's grapple: Strength against the foe's Difficulty; held, and on a critical, Restrained too (breaking its grip takes 12 + its Strength). Maneuver is the core's feint: Agility against the foe's Difficulty, and the foe is Vulnerable until it next acts. Shove is the core's shove (see Homebrew).
- SRD adversary features. Ground Slam flings, Grab and Drag drags, Earth Eruption trips, the Bear's Bite grapples. Some ride the standard attack: on a hit that marks Hit Points, the Bear's Overwhelming Force knocks the foe back to Very Close. A feature's data doesn't say where a foe lands, so the helper knows these by their SRD compendium entries, which imported or copied adversaries keep.

A moved creature stops at walls and others in the way. Over a ledge it takes the SRD's fall damage: Very Close 1d10+3 physical, Close 1d20+5, Far or more 1d100+15. Daggerheart has no prone, so nobody lands that way. An adversary's knockback stopped short deals the SRD's collision damage, 1d20+5 direct physical; whoever it hits takes nothing.

### Reactions and summoning

An adversary's reaction feature that harms whoever hurt it (Thorny Armor, Burning, Acid Bath ...) is one of the core's reactions: it answers a blow that hurts it, once a round, for its Stress where it costs one.

A feature that summons calls the creatures it names from the system's compendium, within its range and for its cost: as many as its count comes to on average (`@partySize` is the party's size), at most eight of one creature. An SRD summoning whose data leaves out the Fear its words cost (the Head Vampire's The Hunt Is On, the Dryad's Grow Saplings ...) costs that Fear here. Summoned creatures wait for the GM's spotlight.

### Adversaries, companions, NPCs and environments

- **Minion:** falls to any damage. With **Minion (X)**, each X damage fells another of its kind, summoned ones too.
- **Horde:** hits for its lesser damage once it has marked half its Hit Points.
- **Leaders:** adversaries rank by type (a Leader, then a Solo) and tier; characters by Presence.
- **A companion** (a Beastbound ranger's) attacks with its partner's Spellcast and Proficiency, rolls its partner's Duality Dice (Hope to the partner, Fear to the GM) and acts at the end of the round. Any damage marks one of its Stress; at its last, it's out of the fight.
- **An NPC** (a sheet with a Difficulty and no Hit Points) is a bystander: a blow puts it out of the fight, and talking it round or robbing it is against its Difficulty.
- **An environment** (a raging river, a collapsing bridge) is the core's hazard: its action features act on GM turns, with reaction rolls against its Difficulty.

### Talking, hands, ranges and gold

- **Talking:** characters use Presence. An adversary talks with its best Experience (a Social one better), and resists words, and anything else tried on it, with its Difficulty. Beasts don't talk.
- **Hands:** a weapon needs as many free hands as its burden. A natural attack (a beast's, a companion's, or one the system shows with claws, fangs or a tail) needs none; a fist needs one.
- **Ranges** are in feet: Melee 5, Very Close 15, Close 30, Far 60, Very Far 120, or as the system's **Range Measurement** rule sets them.
- **Gold** is the sheet's coins, handfuls, bags and chests; stowed gear is what a character carries and hasn't equipped. Both can be stolen, or offered in a standoff.

### Personality and tactics

The core's four hidden scores (tactical, brave, selfish, loyal) come from the sheet, and the GM sees each reason. A character starts as the usual hero and moves with its traits (against its class's suggested spread), level, domains, subclass, ancestry, community, features, scars and Stress slots: a wizard with its best trait in Strength is braver and less tactical, a Slyborne one more selfish. An adversary starts from its type and tier (a Solo brave and fearless, a Minion faint-hearted); motives such as feeding or hunting make it a beast that fights on instinct and won't talk.

When FastFighting sets a character up by itself, its class's two domains suggest playstyles (Valor a Tank and a Martyr, Midnight a Thief), and an adversary's type does the same (a Skulk a Wallflower and a Thief). "Let this character decide" answers from the sheet where it can, and shows why: a Valor class protects its friends and marks Armor Slots against any hit; a Grace class talks when it could work; a Ranged adversary shoots, casters first. Where the sheet says nothing, the core reads the hidden scores.

Playstyle perks with a Daggerheart twist:

| Perk (playstyles) | In Daggerheart |
| --- | --- |
| Hard to spot (Chicken, Fragile, Wallflower) | Would rather Hide (Finesse against Difficulty 12): Hidden until it attacks. |
| Spoiling (Instigator most) | Would rather Grapple, Maneuver or lay a condition than strike. |
| Helping (Enabler, People-Pleaser, Moralist, Martyr, Redeem-Seeker, Tank) | Help an Ally: a Hope for a d6 on a friend's next action roll, without taking the spotlight. |
| In a hurry (Impatient, Speed-Runner) | Sprints for a foe beyond Close: Agility against Difficulty 12, as its action (made, up to Far). An adversary moves up to Very Far. |
| Acting first (Instigator) | Takes the spotlight first on its side. |
| Lore-Collector | Analyze (Knowledge) or Perceive (Instinct) against the foe's Difficulty; on a success, its next roll against that foe is likelier (the **Lore-Collector advantage** setting). |
| Weak spots (Puzzle-Maniac) | Uses the damage kind (physical, magical) a foe doesn't resist. |
| Healers and casters as targets | A spellcast attack makes a caster; healing (a domain card, a potion) a healer. |
| Thief | Lifts gold or gear: Finesse against 12 + the victim's Instinct. |
| Locked doors (Puzzle-Maniac most) | Smash (Strength) or Tinker (Finesse) against Difficulty 12, or break the door down. |

The **Magic and specialties** answer covers domain cards, class, subclass, ancestry and community features, and anything that casts; weapons, trait moves, Help an Ally and potions are what anyone can do.

## Live battles

Do it For Real Now writes each turn onto the sheets as it's played:

- **A character:** Hit Points and Stress marked, Hope, Armor Slots marked (on its armor), consumables used, a scar, and how it ended (unconscious from Avoid Death, dead).
- **An adversary:** Hit Points and Stress marked; beaten, the status the world's Defeated setting gives adversaries (else Defeated), or Dead when one who would kill beat it; its combatant defeated; hidden when it fled.
- **A companion:** the Stress it marked; out of the fight as the world's Defeated setting says for companions.
- **An NPC:** how it ended.
- **Anyone:** Vulnerable, Hidden and Restrained, put on or taken off by the fight or by the GM in the Battle Vantage; gold or an item given up (a deal, a demand, a theft), to whoever took it.
- **The GM's Fear,** written to the world.

A player's spotlight is read from the system's roll cards: an attack and its damage, healing, and a Presence roll as words for the GM to confirm. A roll with Fear, or one that failed, hands the spotlight to the GM. **Rewind** takes one turn back; **Rewind This Encounter**, all of it.

## Settings

- **Lore-Collector advantage** (1.25× to 3×, default 2.4×): how much likelier a Lore-Collector's next roll against a foe succeeds after it sizes that foe up successfully. The default repays the action spent.
- **Tied up stops spells** (on by default): whether a tied-up creature can cast. The SRD doesn't say which spells need free hands.

It also follows the system's settings: Range Measurement, Massive Damage, the Defeated automation, the GM's Fear and the world's currency.

## Homebrew

Where the SRD doesn't say, this helper rules as follows, kept to the system's own mechanics where it could:

- **Striking a character out cold** from Avoid Death: it rolls the Duality Dice; Fear higher, it dies; otherwise it hangs on, still out cold.
- **Tending a friend out cold:** the better of Instinct and Knowledge against Difficulty 12 keeps it safe from a finishing blow; a critical clears a Hit Point and gets it up.
- **The moves:** which trait each move and each try to break free uses, what Grapple and Maneuver lay, and Difficulty 12 for Hide, Sprint, doors and tending.
- **Shove** (Strength against the foe's Difficulty): out of Melee to Very Close (10 feet); on a critical, to Close (25 feet).
- **Knockback distance:** a feature that knocks foes back to a range pushes them by as much as that range lies past the feature's reach, or from Melee when it already reaches that far (the Banshee's wail, within Close, sends each to the edge of Close); one with a standard attack, to that range's far edge. A pull comes from as far as the feature reaches. Only an adversary feature's knockback is fast enough for a collision.
- **Bonds:** Daggerheart has none, so FastFighting's improvised bonds take Strength or Finesse (an adversary: a d20 and its attack modifier) against two over its tier's typical Difficulty (14 in tier 1). A friend unties them with no roll.
- **Weighing Hope and Stress:** a Hope counts as about a third of a Hit Point, a Stress cleared as a quarter (half again as much with no Stress left to mark), where there's room for them.
- **Dice in a count** are averaged (1d4 Vampires are three). With no party in the world, `@partySize` counts the player characters.
- **An adversary's gold:** a humanoid carries a handful a tier (a Leader or a Solo twice that); a beast or a Minion none.

## Not yet played

Tag Team rolls; beastforms; countdowns and what they summon; an adversary spending Fear on its Experiences; a Minion's Group Attack; adversary passives other than a knockback with the standard attack; adversary reactions that strike back with a standard attack, cost the GM a Fear, add to its own hit or count down; a summoning that answers something (a Red Ooze's Split, the Phoenix's Fireseed); an environment's summonings; summoned creatures acting at once; Hope a foe loses (Terrifying, Dreadhowl); the Stress a heal clears besides Hit Points; a free Hope or Stress gain usable any number of times (Swift Step); a knockback that answers a blow (the Oracle of Doom's Vengeful Fate: only its damage is played); the Elephant's Toss; and a fall the GM says kills outright.

## License

MIT for this module's code. Daggerheart is by Darrington Press; this module plays its rules as the free Daggerheart SRD sets them out, holds none of its text, and isn't affiliated with or endorsed by Darrington Press or Critical Role.

---

Developers: see [CODING_README.md](CODING_README.md), and [FastFighting Core](https://github.com/galaara98/FastFighting) with its [developer docs](https://github.com/galaara98/FastFighting/blob/main/CODING_README.md).
