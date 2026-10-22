/**
 * Daggerheart adapter: reads the Foundryborne Daggerheart system's characters and adversaries into CombatantSpecs, and
 * writes a live battle back onto them, a turn at a time. Written against the system's 2.10 on Foundry v14.
 *
 * A character: its traits, Evasion, damage thresholds, Hit Points, Stress, Hope (and its most), Armor Slots, Proficiency,
 * Experiences; the weapons it has equipped (else unarmed: its Proficiency in d4s), and the actions on its features and
 * the domain cards in its loadout. It rolls the Duality Dice.
 * An adversary: its type and tier, Difficulty, thresholds, Hit Points, Stress, its standard attack (a Horde's lesser one
 * once it has marked half its Hit Points), the actions of its action features (a Fear feature costs the GM a Fear; one
 * of the SRD's that knocks a foe back, pulls it in, knocks it over or seizes it is a maneuver: actions.js featureMove;
 * one that knocks back or pulls in whoever its standard attack hits, a rider on that attack: attackMove),
 * and its reaction features that harm whoever hurt it (actions.js toReactionSpec). A natural attack (a beast's, or one
 * shown with its claws, fangs or fists: actions.js bodyIcon) needs no free hands. A summon action, on an adversary's,
 * an environment's or a character's feature, calls the creatures it names (#summonOf). A Minion falls to any damage
 * (Minion (X): each X damage another of its kind falls too); a Solo with Relentless (X) can be spotlit X times a GM
 * turn. It rolls a d20.
 * A companion (a Beastbound ranger's): its Evasion, Experiences and attack (its partner's Spellcast and Proficiency),
 * fighting beside its partner; any damage marks one of its Stress, and at its last it's out of the fight. Its rolls are
 * its partner's: the Duality Dice. An NPC (a sheet with a Difficulty and no Hit Points) is a bystander: nothing to
 * fight with, and out of the fight at the first blow.
 * The encounter (the planner's Daggerheart row): the GM's Fear going in (the world's), and how freely the GM spends it.
 * An environment (a raging river, a collapsing bridge) is a hazard: its action features act on GM turns.
 * For the playstyles: a character's gold and stowed gear (to steal, or bargain with), its consumables (a potion to
 * drink), the trait moves anyone can make (Grapple, Shove, Maneuver, Hide), Help an Ally, sizing a foe up (Analyze or
 * Perceive), tending a friend out cold, doors (Smash, Tinker), the damage type a foe resists less (its weak spot), and
 * the kinds of gear to ask for (weapons, armor, consumables, loot).
 * For breaking free (rules.js breakFree): a character's better trait for it, an adversary's attack modifier (for
 * bonds), how hard each one's own grip is to break, and how many hands each weapon takes (its burden).
 * Who it is (traits.js): a character from its whole sheet (traits against its class's guide, level, domains and cards,
 * subclass, ancestry, community, what its features do, scars, Stress slots, party); an adversary from its type, tier,
 * motives, features and the damage it resists.
 * What it would do (auto.js daggerheartTactics: "Let this character decide"): a character's class domains, subclass,
 * primary weapon, Armor Slots, potions, the features and cards in its loadout, its community; an adversary's type,
 * standard attack and action features.
 */
import { SystemAdapter, meanPart } from "./core.js";
import { daggerheartRules, FEAR_MAX, FEAR_SPENDING } from "./rules.js";
import { tiedStopsSpells } from "./tied-up.js";
import { toActionSpec, toReactionSpec, toSummonSpec, summonCount, bodyIcon, fistIcon, traitMoves, featureMove, attackMove, helpAnAlly, mendsOthers, RANGES, CONDITION_KEYS, conditionKeysOf, num, experienceList, SOCIAL_WORDS } from "./actions.js";
import { loreBoost } from "./lore.js";
import { deriveDaggerheartTraits, rankDaggerheartLeaders, isBeast, subclassKey, loreKey, aptitudesOf } from "./traits.js";
import { daggerheartHints, daggerheartTactics, biographyOf, tierOf } from "./auto.js";
import { commitDaggerheartChanges, commitFearTurn, describeDaggerheartOutcome, describeFear, commitDaggerheartConcession, applyDaggerheartDamage } from "./commit.js";
import { readDaggerheartTurn, readDaggerheartDamage } from "./read-turn.js";
import { rollDaggerheartStrike } from "./strike-roll.js";
import { rollDaggerheartSave, rollDaggerheartCheck } from "./check-roll.js";
import { useDaggerheartAction, rollDaggerheartDamage } from "./action-card.js";
import { t, systemWord, resourceWord } from "./words.js";

const SYSTEM = "daggerheart";
const TRAITS = Object.freeze(["agility", "strength", "finesse", "instinct", "presence", "knowledge"]);
/** What it carries that can change hands (a deal, a theft): the system's item types for gear. */
const GOODS = Object.freeze(["weapon", "armor", "consumable", "loot"]);
/** An adversary's tier, as the level of a character of that tier (for what's typical). */
const TIER_LEVEL = Object.freeze({ 1: 1, 2: 3, 3: 6, 4: 9 });
/** The pools it names itself in the planner (resourceLabel); an item's is its action's name. */
const LABELLED = Object.freeze(["hope", "stress", "fear", "armor"]);

const setting = key => {
  try {
    return game.settings.get(SYSTEM, key);
  } catch ( err ) {
    return null;
  }
};
const plain = v => (typeof v?.toObject === "function" ? v.toObject() : v);

/** The system's ranges, in feet: its Range Measurement rule's, where it's on. */
function ranges() {
  const rule = plain(setting("VariantRules"))?.rangeMeasurement;
  if ( !rule?.enabled ) return { ...RANGES };
  return { ...RANGES, melee: num(rule.melee) || RANGES.melee, veryClose: num(rule.veryClose) || RANGES.veryClose, close: num(rule.close) || RANGES.close, far: num(rule.far) || RANGES.far, veryFar: Math.max(num(rule.far) * 2, RANGES.veryFar) };
}
const massiveDamage = () => !!plain(setting("VariantRules"))?.massiveDamage?.enabled;
/** The GM's Fear now (the world's). */
export const fearNow = () => Math.max(0, Math.min(FEAR_MAX, num(setting("ResourcesFear"))));

const traitName = k => systemWord(`DAGGERHEART.CONFIG.Traits.${k}.name`, `Trait.${k}`);
/** A trait's verb ("Grapple", the system's word for what Strength does). */
const verbName = (trait, verb) => systemWord(`DAGGERHEART.CONFIG.Traits.${trait}.verb.${verb}`, `Verb.${verb}`);
const conditionName = k => systemWord(`DAGGERHEART.CONFIG.Condition.${k}.name`, `Condition.${k}`);
/** The better of these traits for a roll (the first, when they're even): {mod, label, trait (its key)}. */
function bestTrait(traits, keys) {
  const k = keys.reduce((best, key) => (traits[key] > traits[best] ? key : best));
  return { mod: traits[k], label: traitName(k), trait: k };
}

/**
 * Gold, by the world's currency (its homebrew settings): coins (when they're on), handfuls, bags and chests, ten of
 * each to the next. The smallest it counts in, and each one's worth in it, largest first.
 */
function currency() {
  const c = plain(setting("Homebrew"))?.currency ?? {};
  const on = k => c[k]?.enabled !== false;
  const kinds = ["chests", "bags", "handfuls", ...(on("coins") ? ["coins"] : [])];
  const unit = kinds.length - 1;
  return kinds.filter(on).map(k => ({ key: k, label: c[k]?.label || systemWord(`DAGGERHEART.CONFIG.Gold.${k}`, `Gold.${k}`), value: 10 ** (unit - kinds.indexOf(k)) }));
}
export const goldValue = (gold = {}, kinds = currency()) => kinds.reduce((s, k) => s + num(gold[k.key]) * k.value, 0);

/**
 * The world's name for its money: its homebrew settings' (where the GM renamed it from the system's own), else the
 * system's word (Gold).
 */
function moneyWord() {
  const title = plain(setting("Homebrew"))?.currency?.title;
  const initial = globalThis.game?.settings?.settings?.get?.(`${SYSTEM}.Homebrew`)?.type?.schema?.getField?.("currency.title")?.initial;
  return title && title !== initial ? title : systemWord("DAGGERHEART.CONFIG.Gold.title", "Gold.title");
}

/** Things it carries but isn't using (a consumable, loot, a weapon or armor not equipped): to give up, or have stolen. */
function stowedOf(actor) {
  const out = [];
  for ( const item of actor.items ) {
    if ( !GOODS.includes(item.type) || !(num(item.system.quantity ?? 1) > 0) || item.system.equipped ) continue;
    out.push({ id: item.id, name: item.name, value: num(item.system.tier) || 1, category: item.type, rarity: "" });
  }
  return out;
}

/**
 * The damage type a foe resists less than the other (resistant or immune to one, not the other): its weak spot, as the
 * playstyles see it (a Puzzle-Maniac goes for it). Nothing comes off or adds on because of it: it only says where to aim
 * (iwr.exploit, not a weakness: a Lore-Collector who has sized it up gains no more for it).
 */
export function weakSpot(sys) {
  const r = sys.resistance ?? {};
  const guards = k => !!(r[k]?.resistance || r[k]?.immunity);
  if ( guards("physical") && !guards("magical") ) return { magical: 1 };
  if ( guards("magical") && !guards("physical") ) return { physical: 1 };
  return {};
}

/** An adversary's gold (homebrew: the SRD doesn't count it): a handful a tier, a Leader's or a Solo's twice that; none for a beast or a Minion. */
function adversaryGold(type, tier, beast, kinds = currency()) {
  if ( beast || type === "minion" ) return 0;
  const handful = kinds.find(k => k.key === "handfuls")?.value ?? 1;
  return handful * tier * (type === "leader" || type === "solo" ? 2 : 1);
}
const typeName = k => systemWord(`DAGGERHEART.CONFIG.AdversaryType.${k}.label`, `Type.${k}`);
/** A kind of sheet, as the system calls it (Companion, NPC). */
const actorTypeName = k => systemWord(`TYPES.Actor.${k}`, `ActorType.${k}`);

/** Its Experiences worth a bonus, best first: [{name, value}]. */
const experiencesOf = sys => experienceList(sys).map(({ name, value }) => ({ name, value }));

/** An item's effects, by id: {statuses, changes, duration}. */
function effectsOf(item) {
  return new Map([...(item?.effects ?? [])].map(e => [e.id, { statuses: [...(e.statuses ?? [])], changes: e.system?.changes ?? e.changes ?? [], duration: e.system?.duration ?? e.duration }]));
}

/** Damage resistance, immunity and reduction, by type, as the engine's applyIwr reads them. */
function harmOf(sys, { thresholds, armor = 0, minion = 0 } = {}) {
  const r = sys.resistance ?? {};
  const red = sys.rules?.damageReduction ?? {};
  return {
    immune: [], weak: {}, resist: {},
    dh: {
      thresholds: { major: num(thresholds?.major), severe: num(thresholds?.severe) },
      physical: { resistance: !!r.physical?.resistance, immunity: !!r.physical?.immunity, reduction: num(r.physical?.reduction) },
      magical: { resistance: !!r.magical?.resistance, immunity: !!r.magical?.immunity, reduction: num(r.magical?.reduction) },
      reduce: { physical: num(red.reduceSeverity?.physical), magical: num(red.reduceSeverity?.magical) },
      minorImmune: !!red.thresholdImmunities?.minor,
      massive: massiveDamage(),
      armor,
      minion,
      multiplier: num(sys.rules?.attack?.damage?.hpDamageTakenMultiplier) || 1
    }
  };
}

/** Conditions it's immune to (the sheet's rules). */
const conditionImmune = sys => Object.entries(sys.rules?.conditionImmunities ?? {}).filter(([, v]) => v).map(([k]) => k);

/**
 * Conditions it has (Vulnerable, Hidden, Restrained), as the engine's keys (actions.js CONDITION_KEYS: Restrained is
 * the engine's restrained and immobilized). Read at the start, and again each turn of a live battle (readLiveState).
 */
function startingConditions(actor) {
  const out = {};
  for ( const s of actor.statuses ?? [] ) for ( const k of conditionKeysOf(s) ) out[k] = 1;
  return out;
}

/** The engine's keys Daggerheart's sheets carry: those of its conditions. */
const CARRIED = new Set(Object.values(CONDITION_KEYS).flat());

/** A domain's name, the system's (DAGGERHEART.GENERAL.Domain.valor.label), else this module's. */
const domainName = k => systemWord(`DAGGERHEART.GENERAL.Domain.${k}.label`, `Domain.${k}`);

/** The compendium entry an item was made from ("Compendium.daggerheart.subclasses.Item.<id>"), if it says. */
const sourceOf = item => item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId ?? null;

/** A collection's values, a list's items, or an object's values (actions as the database keeps them, by id). */
const valuesOf = v => (v == null ? [] : typeof v[Symbol.iterator] === "function" ? [...v] : Object.values(v));

/** What a feature or domain card does, as plain data for traits.js featureLeans: its form, its actions, its effects' changes. */
function doingOf(item) {
  const changes = valuesOf(item.effects).flatMap(e => valuesOf(e?.system?.changes ?? e?.changes).map(c => c?.key).filter(Boolean));
  return { name: item.name, form: item.system?.featureForm ?? null, actions: valuesOf(item.system?.actions).map(plain), changes };
}

/** An effect's changes, wherever the system keeps them. */
const changesOf = e => valuesOf(e?.system?.changes ?? e?.changes);

/**
 * Is a feature or card built on marking Armor Slots: more of them marked against one hit (Iron Will, Brace), or Armor
 * Slots of its own for good (Armorer, Bare Bones; not a spell's, for a while)?
 */
function buildsOnArmor(item) {
  return valuesOf(item?.effects).some(e => changesOf(e).some(c => /(?:^|\.)damageReduction\.maxArmorMarked(?:\.|$)/.test(String(c?.key ?? ""))
    || (c?.type === "armor" && !e?.system?.duration?.type)));
}

/** Does a feature or card clear someone else's Hit Points (actions.js mendsOthers)? */
const healsOthers = item => valuesOf(item?.system?.actions).some(a => mendsOthers(plain(a)));

/** Does a feature summon others (a summons, as an action of its own)? */
const summons = item => valuesOf(item?.system?.actions).some(a => a?.type === "summon");

/**
 * Its own features and cards the engine plays against a foe (an attack, a reaction roll it forces, a condition it lays),
 * each once: its specialties, as its CombatantSpec has them.
 */
function specialtiesOf(actor, spec) {
  const items = [...(actor.items ?? [])];
  const out = [];
  for ( const a of spec?.actions ?? [] ) {
    if ( !a?.feature || ["heal", "buff"].includes(a.kind) ) continue;
    // (Its id: the token's, the item's, the action's.)
    const item = items.find(i => i.id === String(a.id).split(".")[1]);
    if ( item && !out.includes(item) ) out.push(item);
  }
  return out;
}

/** "Minion (3)", "Relentless (2)": the number a feature's name carries. */
const countIn = name => Number(/\((\d+)\)\s*$/.exec(String(name ?? ""))?.[1]) || 0;

/** Does a feature count down to what it does (a countdown among its actions)? Then that comes when it runs out. */
const countsDown = item => valuesOf(item?.system?.actions).some(a => a?.type === "countdown");

/** A document by its UUID (Foundry's own lookup), or null. */
async function byUuid(uuid) {
  try {
    const find = globalThis.foundry?.utils?.fromUuid ?? globalThis.fromUuid;
    return uuid && find ? await find(uuid) : null;
  } catch ( err ) {
    return null;
  }
}

/** The party's size, as a summoning counts it (@partySize): the system's party's members, else the world's player characters. */
function partySize() {
  const members = globalThis.game?.actors?.party?.system?.partyMembers?.length;
  if ( members > 0 ) return members;
  return globalThis.game?.actors?.filter?.(a => a.type === "character" && a.hasPlayerOwner)?.length ?? 0;
}

export class DaggerheartAdapter extends SystemAdapter {
  static systemId = SYSTEM;

  get label() {
    return t("Label");
  }

  get rules() {
    return daggerheartRules;
  }

  /**
   * The same rules for the planner's background workers (the core's API 22): rules.js and what it imports touch nothing
   * of Foundry's; the one world setting they read (tied-up.js) goes along as data (rules.js daggerheartRulesFor).
   */
  workerRules() {
    return { url: new URL("./rules.js", import.meta.url).href, exportName: "daggerheartRulesFor", data: { tiedStopsSpells: tiedStopsSpells() } };
  }

  canHandle(actor) {
    return !!actor && ["character", "adversary", "environment", "companion", "npc"].includes(actor.type);
  }

  /**
   * @param {TokenDocument} tokenDoc
   * @param {object} [options]
   * @param {boolean} [options.summoned]   a creature a summoning calls (#summonOf), which calls nobody in turn
   */
  async toCombatantSpec(tokenDoc, { summoned = false } = {}) {
    const actor = tokenDoc.actor;
    if ( !this.canHandle(actor) ) return null;
    switch ( actor.type ) {
      case "character": return this.#character(tokenDoc, actor, summoned);
      case "environment": return this.#environment(tokenDoc, actor, summoned);
      case "companion": return this.#companion(tokenDoc, actor);
      case "npc": return this.#npc(tokenDoc, actor);
      default: return this.#adversary(tokenDoc, actor, summoned);
    }
  }

  /**
   * A summon action (the system's "summon": the creatures it names, and a count of each) as the core's summoning
   * (actions.js toSummonSpec): each creature read like any other from where the action keeps it (the system's
   * compendium, or the world), as many as its count comes to (actions.js summonCount, the party's size for @partySize).
   * A creature summoned calls nobody in turn (a Ravenous Mockery reveals another of its kind, not a third). Null when it
   * calls nobody this module can read.
   * @param {object} data   the action's data
   * @param {object} ctx    {id, label, ranges, feature (its feature's id)}
   */
  async #summonOf(data, ctx) {
    const creatures = [];
    for ( const entry of valuesOf(data.summon) ) {
      const n = summonCount(entry?.count, { partySize: partySize() });
      const src = n > 0 ? await byUuid(entry?.actorUUID) : null;
      if ( !this.canHandle(src) ) continue;
      const token = { actor: src, id: `summon-${src.id}`, name: src.prototypeToken?.name ?? src.name, texture: { src: src.prototypeToken?.texture?.src ?? src.img } };
      const spec = await this.toCombatantSpec(token, { summoned: true });
      if ( !spec ) continue;
      // (Where a live battle places it from; its kind as its copies in the world know it, for Minion (X).)
      spec.sourceUuid = src.uuid;
      if ( src.pack ) spec.kinKey = src.uuid;
      creatures.push(...Array.from({ length: n }, () => spec));
    }
    return toSummonSpec(data, { ...ctx, ranges: ctx.ranges ?? ranges() }, creatures);
  }

  async #character(tokenDoc, actor, summoned = false) {
    const sys = actor.system;
    const r = ranges();
    const traits = Object.fromEntries(TRAITS.map(k => [k, num(sys.traits?.[k]?.value)]));
    const level = num(sys.levelData?.level?.current) || 1;
    const hp = sys.resources?.hitPoints ?? {};
    const stress = sys.resources?.stress ?? {};
    const hope = sys.resources?.hope ?? {};
    const armorMax = num(sys.armorScore?.max);
    const armorMarked = num(sys.armorScore?.value);
    const proficiency = Math.max(1, num(sys.proficiency));
    const spellcast = sys.spellcastModifierTrait?.key ?? null;
    const id = tokenDoc.id;
    const actions = [];
    const common = { pc: true, traits, spellcast, proficiency, ranges: r };
    // Its weapons (else unarmed: its Proficiency in d4s, Strength or Finesse), each in as many hands as its burden.
    for ( const w of [sys.primaryWeapon, sys.secondaryWeapon].filter(Boolean) ) {
      const spec = toActionSpec(plain(w.system.attack), { ...common, id: `${id}.${w.id}`, label: w.name, effectsById: effectsOf(w) });
      if ( spec ) actions.push({ ...spec, hands: w.system.burden === "twoHanded" ? 2 : 1 });
    }
    if ( !actions.length ) {
      const trait = traits.finesse > traits.strength ? "finesse" : "strength";
      actions.push(toActionSpec({ type: "attack", range: "melee", roll: { type: "attack", trait }, damage: { main: { type: ["physical"], value: { dice: "d4", multiplier: "prof", flatMultiplier: 1, bonus: 0 } } } },
        { ...common, id: `${id}.unarmed`, label: systemWord("DAGGERHEART.GENERAL.unarmedAttack", "Unarmed") }));
    }
    // Its features' actions, and its loadout's domain cards'.
    for ( const item of actor.items ) {
      if ( item.type === "domainCard" ? item.system.inVault : item.type !== "feature" ) continue;
      for ( const a of item.system.actions ?? [] ) {
        const label = a.name && a.name !== item.name ? `${item.name}: ${a.name}` : item.name;
        // (A summoning, unless a countdown brings it, or it was summoned itself.)
        if ( a.type === "summon" ) {
          const spec = summoned || countsDown(item) ? null : await this.#summonOf(plain(a), { id: `${id}.${item.id}.${a.id ?? a._id}`, label, ranges: r, feature: item.id });
          if ( spec ) actions.push({ ...spec, feature: true });
          continue;
        }
        const spec = toActionSpec(plain(a), { ...common, id: `${id}.${item.id}.${a.id ?? a._id}`, label, effectsById: effectsOf(item) });
        // (Its own: a class, subclass, ancestry or community feature, a domain card. What "magic and specialties" means.)
        if ( spec ) actions.push({ ...spec, feature: true });
      }
    }
    // Its consumables: as many uses as it has of each (a potion to drink).
    const items = {};
    for ( const item of actor.items ) {
      if ( item.type !== "consumable" || !(num(item.system.quantity) > 0) ) continue;
      for ( const a of item.system.actions ?? [] ) {
        const spec = toActionSpec(plain(a), { ...common, id: `${id}.${item.id}.${a.id ?? a._id}`, label: item.name, effectsById: effectsOf(item) });
        if ( !spec ) continue;
        items[`item:${item.id}`] = num(item.system.quantity);
        // (A potion: drunk by whoever carries it.)
        actions.push({ ...spec, resource: `item:${item.id}`, resourceCost: 1, shared: undefined, consumable: true, ...(spec.kind === "heal" ? { selfOnly: true } : {}) });
      }
    }
    // The moves anyone can make with a trait, and Help an Ally. (Shove is no verb of the system's: this module's word.)
    actions.push(...traitMoves({ id, traits, ranges: r, names: {
      grapple: verbName("strength", "grapple"), shove: t("Verb.shove"), maneuver: verbName("agility", "maneuver"), hide: verbName("finesse", "hide"),
      restrained: conditionName("restrained"), vulnerable: conditionName("vulnerable"), hidden: conditionName("hidden")
    } }));
    actions.push(helpAnAlly({ id, label: t("HelpAnAlly"), given: t("Helped"), ranges: r }));
    const experiences = experiencesOf(sys);
    const kinds = currency();
    const wits = traits.knowledge >= traits.instinct ? "knowledge" : "instinct";
    const derived = this.deriveTraits(actor);
    return {
      id, tokenId: id, actorId: actor.id, actorUuid: actor.uuid,
      name: tokenDoc.name ?? actor.name,
      img: tokenDoc.texture?.src ?? actor.img,
      kind: "pc",
      actorType: actor.type,
      duality: true,
      level,
      hp: { value: Math.max(0, num(hp.max) - num(hp.value)), max: num(hp.max), temp: 0 },
      defenses: { ac: num(sys.evasion), ...traits },
      initiative: { mod: traits.instinct },
      speeds: { walk: r.close },
      // (Farther than Close: Sprint, an Agility roll that takes the spotlight's action.)
      sprint: { range: r.far, mod: traits.agility },
      actions,
      iwr: { ...harmOf(sys, { thresholds: sys.damageThresholds, armor: armorMax }), exploit: weakSpot(sys) },
      resources: { hope: num(hope.value), stress: Math.max(0, num(stress.max) - num(stress.value)), armor: Math.max(0, armorMax - armorMarked), ...items },
      hopeMax: num(hope.max) || 6,
      stressMax: num(stress.max),
      armorMax,
      hopeReserve: actions.some(a => a.resource === "hope" && (a.resourceCost ?? 1) >= 3) ? 3 : 0,
      experiences,
      conditionImmune: conditionImmune(sys),
      conditions: startingConditions(actor),
      traits: Object.fromEntries(Object.entries(derived.traits).map(([k, v]) => [k, { base: v, fudge: 0 }])),
      traitReasons: derived.reasons,
      flags: { ...derived.flags },
      // (What it's like, on the core's hidden scale: traits.js aptitudesOf, from its traits. Core API 23.)
      aptitudes: aptitudesOf(traits),
      diesAtZero: false,
      perception: traits.instinct,
      creatureTraits: ["humanoid"],
      // Sizing a foe up (a Lore-Collector): Analyze (Knowledge) or Perceive (Instinct), against its Difficulty.
      sizeUp: { mod: traits[wits], label: verbName(wits, wits === "knowledge" ? "analyze" : "perceive"), boost: loreBoost(), uses: 1 },
      // Tending a friend out cold: the same, against Difficulty 12 (rules.firstAid).
      firstAid: { mod: traits[wits] },
      // Lifting something off someone: Finesse.
      theft: { skill: traitName("finesse"), mod: traits.finesse },
      doorWork: { force: { mod: traits.strength }, pick: { mod: traits.finesse } },
      // Breaking free (rules.breakFree): out of a grip, a net or a web, Strength or Agility; out of bonds, or freeing a
      // friend, Strength or Finesse. Its own grip: 12 + its Strength to break, as this module's other rolls against it.
      escapeWork: { ...bestTrait(traits, ["strength", "agility"]), bonds: bestTrait(traits, ["strength", "finesse"]) },
      escapeDC: 12 + Math.max(0, traits.strength),
      valuables: { money: goldValue(sys.gold, kinds), denominations: kinds.map(k => ({ label: k.label, value: k.value })), stowed: stowedOf(actor), wielded: [] },
      social: {
        pitches: Object.fromEntries(["persuade", "intimidate", "deceive"].map(k => [k, { skill: traitName("presence"), mod: traits.presence }])),
        resist: {
          ...Object.fromEntries(["persuade", "intimidate", "deceive"].map(k => [k, { dc: 12 + Math.max(0, traits.presence), label: traitName("presence") }])),
          steal: { dc: 12 + Math.max(0, traits.instinct), label: traitName("instinct") }
        },
        resolve: traits.presence,
        languages: ["common"]
      },
      leadership: { id, name: actor.name, presence: traits.presence, pc: true }
    };
  }

  async #adversary(tokenDoc, actor, summoned = false) {
    const sys = actor.system;
    const r = ranges();
    const id = tokenDoc.id;
    const type = sys.type ?? "standard";
    const tier = num(sys.tier) || 1;
    const hp = sys.resources?.hitPoints ?? {};
    const stress = sys.resources?.stress ?? {};
    const features = actor.items.filter(i => i.type === "feature" && !i.system.inactive);
    const minion = type === "minion" ? countIn(features.find(f => countIn(f.name) && !(f.system.actions?.size ?? f.system.actions?.length))?.name) : 0;
    const relentless = type === "solo" ? countIn(features.find(f => countIn(f.name) && [...(f.system.actions ?? [])].some(a => [...(a.cost ?? [])].some(c => c.key === "fear")))?.name) : 0;
    const attackBonus = num(sys.attack?.roll?.bonus);
    const common = { pc: false, attackBonus, difficulty: num(sys.difficulty), critOn: num(sys.criticalThreshold) || 20, ranges: r };
    const beast = isBeast(sys.motivesAndTactics, sys.type);
    // (A natural attack needs no free hands: a beast's, or one shown with its own body, claws or fangs; a fist is a hand.)
    const hands = img => (fistIcon(img) ? { hands: 1 } : beast || bodyIcon(img) ? { hands: 0 } : {});
    const actions = [];
    if ( sys.attack ) {
      const attack = plain(sys.attack);
      // (One of the SRD's features that knocks back or pulls in whoever its standard attack hits, by its id: a rider on it.)
      const moves = features.map(f => attackMove(f.id, attack, r, f.name)).filter(Boolean);
      const riding = spec => (spec && moves.length && ["strike", "spell-attack"].includes(spec.kind) ? { ...spec, effects: [...(spec.effects ?? []), ...moves] } : spec);
      const horde = type === "horde" && sys.typeData?.hordeDamage;
      const full = riding(toActionSpec(attack, { ...common, id: `${id}.attack`, label: attack.name, horde: horde ? "full" : null }));
      if ( full ) actions.push({ ...full, ...hands(attack.img) });
      if ( horde ) {
        const lesser = { ...attack, damage: { ...attack.damage, main: { ...attack.damage.main, value: { custom: { enabled: true, formula: sys.typeData.hordeDamage } } } } };
        const spec = riding(toActionSpec(lesser, { ...common, id: `${id}.attack.horde`, label: attack.name, horde: "reduced" }));
        if ( spec ) actions.push({ ...spec, ...hands(attack.img) });
      }
    }
    const reactions = [];
    for ( const item of features ) {
      const form = item.system.featureForm;
      // (A passive feature is on its sheet already, its effects in its numbers; what its actions do comes about as its
      // words say, which the engine can't tell; one of the SRD's that moves whoever its standard attack hits is on that
      // attack, above. A reaction feature counting down to something isn't an answer to a blow.)
      if ( form === "reaction" ) {
        const all = [...(item.system.actions ?? [])].map(plain);
        if ( all.some(a => a.type === "countdown") ) continue;
        for ( const data of all ) {
          const spec = toReactionSpec(data, { id: `${id}.${item.id}.${data._id}`, label: item.name, difficulty: common.difficulty, ranges: r });
          if ( spec ) reactions.push(spec);
        }
        continue;
      }
      if ( form !== "action" ) continue;
      for ( const a of item.system.actions ?? [] ) {
        const data = plain(a);
        // (A Minion's Group Attack, many as one for a Fear, isn't played: each one attacks on its own. Nor is three of
        // them made one for a Fear, Form Up.)
        if ( type === "minion" && [...(data.cost ?? [])].some(c => c.key === "fear") ) continue;
        // (A summoning: the creatures it calls; unless a countdown brings them, or it was summoned itself.)
        if ( data.type === "summon" ) {
          const spec = summoned || countsDown(item) ? null : await this.#summonOf(data, { id: `${id}.${item.id}.${data._id}`, label: item.name, ranges: r, feature: item.id });
          if ( spec ) actions.push({ ...spec, feature: true });
          continue;
        }
        // (One of the SRD's that knocks a foe back, pulls it in, knocks it over or seizes it, by its id: a maneuver.)
        const moves = featureMove(item.id, data, r);
        const spec = toActionSpec(data, { ...common, id: `${id}.${item.id}.${data._id}`, label: item.name, effectsById: effectsOf(item), moves });
        // (An adversary's own features: its specialties.)
        if ( spec ) actions.push({ ...spec, feature: true, ...hands(data.img) });
      }
    }
    const derived = this.deriveTraits(actor);
    // (Its best Experience: what it brings to a roll that isn't an attack, a pitch or noticing a fight.)
    const best = experiencesOf(sys)[0] ?? null;
    const thresholds = sys.damageThresholds ?? {};
    const difficulty = systemWord("DAGGERHEART.GENERAL.difficulty", "Difficulty");
    return {
      id, tokenId: id, actorId: actor.id, actorUuid: actor.uuid,
      name: tokenDoc.name ?? actor.name,
      img: tokenDoc.texture?.src ?? actor.img,
      kind: "npc",
      actorType: actor.type,
      level: TIER_LEVEL[tier] ?? 1,
      tier,
      adversaryType: type,
      kinKey: actor._stats?.compendiumSource ?? actor.id,
      minion,
      relentless,
      hordeHp: type === "horde" ? num(sys.typeData?.hordeHP) : 0,
      hp: { value: Math.max(0, num(hp.max) - num(hp.value)), max: Math.max(1, num(hp.max)), temp: 0 },
      defenses: { ac: num(sys.difficulty), ...Object.fromEntries(TRAITS.map(k => [k, 0])) },
      initiative: { mod: 0 },
      speeds: { walk: r.close },
      // (Farther than Close, up to Very Far: a separate action.)
      sprint: { range: r.veryFar },
      actions,
      reactions: reactions.length ? reactions : undefined,
      iwr: { ...harmOf(sys, { thresholds: type === "minion" ? { major: 0, severe: 0 } : thresholds, minion }), exploit: weakSpot(sys) },
      resources: { stress: Math.max(0, num(stress.max) - num(stress.value)) },
      stressMax: num(stress.max),
      conditionImmune: conditionImmune(sys),
      conditions: startingConditions(actor),
      traits: Object.fromEntries(Object.entries(derived.traits).map(([k, v]) => [k, { base: v, fudge: 0 }])),
      traitReasons: derived.reasons,
      flags: { ...derived.flags },
      diesAtZero: true,
      perception: best?.value ?? 0,
      creatureTraits: [type],
      creatureKind: typeName(type),
      social: {
        // (Its words: its best Experience, by its name; with none, its type's.)
        pitches: beast ? {} : Object.fromEntries(["persuade", "intimidate", "deceive"].map(k => [k, { skill: best?.name || typeName(type), mod: (best?.value ?? 0) + (type === "social" ? SOCIAL_WORDS : 0) }])),
        // (Anything tried on it, a hand in its pocket too, is against its Difficulty.)
        resist: Object.fromEntries(["persuade", "intimidate", "deceive", "steal"].map(k => [k, { dc: num(sys.difficulty), label: difficulty }])),
        resolve: tier - 1,
        languages: beast ? [] : ["common"]
      },
      valuables: { money: adversaryGold(type, tier, beast), denominations: currency().map(k => ({ label: k.label, value: k.value })), stowed: [], wielded: [] },
      // Breaking free (rules.breakFree): out of a hold, the GM spends its spotlight on it, no roll; out of bonds, the d20
      // and its attack modifier. Its own grip: its Difficulty to break, like any roll against it.
      escapeWork: { mod: attackBonus },
      escapeDC: num(sys.difficulty),
      leadership: { id, name: actor.name, type, typeName: typeName(type), tier, pc: false }
    };
  }

  /**
   * An environment (a raging river, a collapsing bridge, a haunted grove): a hazard that acts on GM turns, with its action
   * features (a Fear each, for its Fear features), reaction rolls against its Difficulty. Nobody attacks it.
   */
  async #environment(tokenDoc, actor, summoned = false) {
    const sys = actor.system;
    const r = ranges();
    const id = tokenDoc.id;
    const tier = num(sys.tier) || 1;
    const common = { pc: false, attackBonus: 0, difficulty: num(sys.difficulty), ranges: r };
    const actions = [];
    for ( const item of actor.items ) {
      // (Its reaction features answer what the party does there, which the engine doesn't play: nobody hurts a place.)
      if ( item.type !== "feature" || item.system.featureForm !== "action" ) continue;
      for ( const a of item.system.actions ?? [] ) {
        const data = plain(a);
        // (What it summons, unless a countdown brings them. The core's hazards don't summon yet: it's there for when they do.)
        if ( data.type === "summon" ) {
          const spec = summoned || countsDown(item) ? null : await this.#summonOf(data, { id: `${id}.${item.id}.${data._id}`, label: item.name, ranges: r, feature: item.id });
          if ( spec ) actions.push({ ...spec, feature: true });
          continue;
        }
        const spec = toActionSpec(data, { ...common, id: `${id}.${item.id}.${data._id}`, label: item.name, effectsById: effectsOf(item) });
        if ( spec ) actions.push({ ...spec, feature: true });
      }
    }
    return {
      id, tokenId: id, actorId: actor.id, actorUuid: actor.uuid,
      name: tokenDoc.name ?? actor.name,
      img: tokenDoc.texture?.src ?? actor.img,
      kind: "hazard",
      actorType: actor.type,
      hazard: { once: false },
      untargetable: true,
      level: TIER_LEVEL[tier] ?? 1,
      tier,
      hp: { value: 1, max: 1, temp: 0 },
      defenses: { ac: num(sys.difficulty) },
      initiative: { mod: 0 },
      speeds: {},
      actions,
      iwr: { immune: [], resist: {}, weak: {} },
      resources: {},
      // (What it holds fast: its Difficulty to break.)
      escapeDC: num(sys.difficulty),
      traits: { tactical: { base: 20, fudge: 0 }, brave: { base: 100, fudge: 0 }, selfish: { base: 50, fudge: 0 }, loyal: { base: 50, fudge: 0 } },
      flags: { fearless: true, mindless: true },
      diesAtZero: false,
      social: { mindless: true, languages: [], pitches: {}, resist: {} },
      leadership: null
    };
  }

  /**
   * A companion (a Beastbound ranger's), fighting beside its partner: its Evasion, its Experiences, its attack (its
   * partner's Spellcast to hit, its partner's Proficiency in its damage dice, with what its level-ups made of them). Any
   * damage marks one of its Stress, whatever the damage (its Stress is its Hit Points here); at its last, it's out of the
   * fight. Its rolls are its partner's, on the Duality Dice (rules.js).
   */
  #companion(tokenDoc, actor) {
    const sys = actor.system;
    const r = ranges();
    const id = tokenDoc.id;
    const partner = sys.partner ?? null;
    const stress = sys.resources?.stress ?? {};
    const max = Math.max(1, num(stress.max));
    const actions = [];
    if ( sys.attack ) {
      // (Its attack as prepared: its partner's Spellcast to hit, the dice and range its level-ups make of it.)
      const source = plain(sys.attack);
      const attack = { ...source, range: sys.attack.range, roll: { ...source.roll, bonus: num(sys.attack.roll?.bonus) }, damage: sys.attack.damage };
      const spec = toActionSpec(attack, { pc: false, proficiency: Math.max(1, num(sys.proficiency)), ranges: r, id: `${id}.attack`, label: attack.name });
      // (An animal's: its own body, no free hands.)
      if ( spec ) actions.push({ ...spec, hands: 0 });
    }
    const experiences = experiencesOf(sys);
    const derived = this.deriveTraits(actor);
    return {
      id, tokenId: id, actorId: actor.id, actorUuid: actor.uuid,
      name: tokenDoc.name ?? actor.name,
      img: tokenDoc.texture?.src ?? actor.img,
      kind: "companion",
      actorType: actor.type,
      companionRoll: true,
      level: num(partner?.system?.levelData?.level?.current) || num(sys.levelData?.level?.current) || 1,
      hp: { value: Math.max(0, max - num(stress.value)), max, temp: 0 },
      defenses: { ac: num(sys.evasion) || 10, ...Object.fromEntries(TRAITS.map(k => [k, 0])) },
      initiative: { mod: 0 },
      speeds: { walk: r.close },
      actions,
      iwr: { immune: [], resist: {}, weak: {}, dh: { companion: true, thresholds: {}, physical: {}, magical: {}, reduce: {} } },
      resources: {},
      experiences,
      conditionImmune: conditionImmune(sys),
      conditions: startingConditions(actor),
      traits: Object.fromEntries(Object.entries(derived.traits).map(([k, v]) => [k, { base: v, fudge: 0 }])),
      traitReasons: derived.reasons,
      // (Its partner: the core finds its token on the field, and the companion stands by it.)
      flags: { ...derived.flags, masterActorId: partner?.id ?? null },
      diesAtZero: false,
      // Breaking free: its partner's Duality Dice, no trait to add (an Experience, for its partner's Hope). Its own grip:
      // 12 to break, a character's with no Strength to add.
      escapeWork: { mod: 0, bonds: { mod: 0 } },
      escapeDC: 12,
      perception: experiences[0]?.value ?? 0,
      creatureKind: actorTypeName("companion"),
      social: { languages: [], pitches: {}, resist: {} },
      leadership: null
    };
  }

  /**
   * An NPC: someone the story needs, not a fighter (its sheet has a Difficulty, a description, motives, features, and no
   * Hit Points). A bystander: nothing to fight with; a blow puts it out of the fight; talking it round, or robbing it,
   * is against its Difficulty.
   */
  #npc(tokenDoc, actor) {
    const sys = actor.system;
    const r = ranges();
    const id = tokenDoc.id;
    const dc = num(sys.difficulty) || daggerheartRules.typical.dc(1);
    const derived = this.deriveTraits(actor);
    const difficulty = systemWord("DAGGERHEART.GENERAL.difficulty", "Difficulty");
    return {
      id, tokenId: id, actorId: actor.id, actorUuid: actor.uuid,
      name: tokenDoc.name ?? actor.name,
      img: tokenDoc.texture?.src ?? actor.img,
      kind: "npc",
      actorType: actor.type,
      level: 1,
      hp: { value: 1, max: 1, temp: 0 },
      defenses: { ac: dc, ...Object.fromEntries(TRAITS.map(k => [k, 0])) },
      initiative: { mod: 0 },
      speeds: { walk: r.close },
      actions: [],
      iwr: { immune: [], resist: {}, weak: {} },
      resources: {},
      traits: Object.fromEntries(Object.entries(derived.traits).map(([k, v]) => [k, { base: v, fudge: 0 }])),
      traitReasons: derived.reasons,
      flags: { ...derived.flags },
      diesAtZero: false,
      // (Breaking free: as an adversary does, with nothing to add. Its grip: its Difficulty.)
      escapeWork: { mod: 0 },
      escapeDC: dc,
      perception: 0,
      creatureKind: actorTypeName("npc"),
      social: {
        pitches: {},
        resist: Object.fromEntries(["persuade", "intimidate", "deceive", "steal"].map(k => [k, { dc, label: difficulty }])),
        resolve: 0,
        languages: ["common"]
      },
      valuables: { money: 0, denominations: currency().map(k => ({ label: k.label, value: k.value })), stowed: [], wielded: [] },
      leadership: null
    };
  }

  /** What a character's system says for setting it up by itself: its class's domains, an adversary's type, a beast's motives. */
  #facts(actor) {
    const pc = actor.type === "character";
    const domains = pc ? [...new Set(actor.items.filter(i => i.type === "class").flatMap(i => [...(i.system.domains ?? [])]))] : [];
    return { pc, domains, type: pc ? null : actor.system.type ?? null, beast: !pc && isBeast(actor.system.motivesAndTactics, actor.system.type) };
  }

  /** The playstyles Daggerheart says fit it (auto.js): a class by its domains, an adversary by its type, a beast. */
  playstyleHints(actor) {
    if ( !["character", "adversary"].includes(actor?.type) ) return {};
    return daggerheartHints(this.#facts(actor));
  }

  /**
   * What it would do (auto.js daggerheartTactics), each answer with its reason: a character's by its class's domains,
   * subclass, primary weapon, Armor Slots, potions, the features and cards in its loadout (what they do) and its
   * community; an adversary's by its type, its standard attack and what its features do. Nothing for an environment, a
   * companion (its partner's call) or an NPC.
   */
  tacticHints(actor, spec) {
    if ( !["character", "adversary"].includes(actor?.type) ) return {};
    return daggerheartTactics(this.#tacticFacts(actor, spec));
  }

  /** What its sheet says for its answers, as plain data (auto.js daggerheartTactics). */
  #tacticFacts(actor, spec) {
    const sys = actor.system ?? {};
    const items = [...(actor.items ?? [])];
    const kinds = currency();
    const handful = kinds.find(k => k.key === "handfuls")?.value ?? 1;
    const talks = (spec?.social?.languages?.length ?? 0) > 0;
    const specialties = specialtiesOf(actor, spec);
    if ( actor.type === "character" ) {
      const own = type => items.find(i => i.type === type && !i.system?.isMulticlass);
      const cls = own("class");
      const subclass = own("subclass");
      const community = items.find(i => i.type === "community");
      const domains = [...(cls?.system?.domains ?? [])];
      // (Its features as the system has them on, and the domain cards in its loadout.)
      const available = i => sys.isItemAvailable?.(i) !== false;
      const doing = items.filter(i => (i.type === "feature" && available(i)) || (i.type === "domainCard" && !i.system?.inVault));
      const weapon = sys.primaryWeapon;
      // (Its own drinks: a consumable that clears its Hit Points, and how many on average.)
      const potions = (spec?.actions ?? []).filter(a => a.consumable && a.kind === "heal" && a.selfOnly)
        .map(a => ({ name: a.name, heals: (a.heal ?? []).reduce((s, p) => s + Math.max(0, meanPart(p)), 0) })).filter(p => p.heals > 0);
      return {
        pc: true,
        talks,
        domains,
        subclass: subclass ? subclassKey({ source: sourceOf(subclass), name: subclass.name }) : null,
        weapon: weapon ? { name: weapon.name, range: weapon.system?.attack?.range ?? null, action: spec?.actions?.find(a => a.id === `${spec.id}.${weapon.id}`)?.id ?? null } : null,
        potions,
        hpMax: num(spec?.hp?.max),
        armor: num(sys.armorScore?.max),
        armorBuilders: doing.filter(buildsOnArmor).map(i => i.name),
        healers: doing.filter(healsOthers).map(i => i.name),
        specialties: specialties.map(i => ({ name: i.name, spell: i.type === "domainCard" && ["spell", "grimoire"].includes(i.system?.type) })),
        community: community ? { key: loreKey({ ref: community.system?.loreReference, name: community.name }), name: community.name } : null,
        purse: { money: goldValue(sys.gold, kinds), handful, tier: tierOf(num(sys.levelData?.level?.current) || 1) },
        names: { domains: Object.fromEntries(domains.map(k => [k, domainName(k)])), armor: resourceWord("armor"), subclass: subclass?.name ?? "" }
      };
    }
    const type = sys.type ?? "standard";
    // (Its action features: what it does in the spotlight.)
    const acts = items.filter(i => i.type === "feature" && !i.system?.inactive && i.system?.featureForm === "action");
    return {
      pc: false,
      talks,
      type,
      attack: sys.attack ? { name: sys.attack.name, range: sys.attack.range ?? null } : null,
      healers: acts.filter(healsOthers).map(i => i.name),
      summons: acts.filter(summons).map(i => i.name),
      specialties: specialties.map(i => i.name),
      purse: { money: num(spec?.valuables?.money), handful },
      names: { type: typeName(type) }
    };
  }

  /**
   * Its biography (auto.js biographyOf): a character's faith and Experiences are about it, its background (what was
   * written, not the class's questions) its story, its connections (about the others) left out; an adversary's
   * description, motives and Experiences are about it, the GM's notes its story; an environment's, its description and
   * impulses; an NPC's, its description and motives; a companion's, its Experiences.
   */
  biography(actor) {
    const sys = actor?.system ?? {};
    if ( actor?.type === "character" ) return biographyOf({ pc: true, bio: sys.biography, experiences: sys.experiences });
    return biographyOf({ description: sys.description, motives: sys.motivesAndTactics ?? sys.impulses ?? sys.motives, notes: sys.notes, experiences: sys.experiences });
  }

  /**
   * Its personality (traits.js): a character from its whole sheet, an adversary from its type, tier and features, a
   * companion and an NPC from what they are and their features.
   */
  deriveTraits(actor) {
    switch ( actor.type ) {
      case "character": return deriveDaggerheartTraits(this.#pcSheet(actor));
      case "companion":
      case "npc": return deriveDaggerheartTraits(this.#otherSheet(actor));
      default: return deriveDaggerheartTraits(this.#adversarySheet(actor));
    }
  }

  /**
   * What a character's sheet says of who it is, as plain data (traits.js deriveDaggerheartTraits): its traits and its
   * class's suggested ones, level, Stress slots, scars, party; its class's domains and its domain cards; its subclass,
   * ancestry and community, with the ids they're known by; its features and loadout cards, with what they do.
   */
  #pcSheet(actor) {
    const sys = actor.system;
    const items = [...(actor.items ?? [])];
    const own = (type, multi = false) => items.find(i => i.type === type && !!i.system?.isMulticlass === multi);
    const cls = own("class");
    const multiclass = own("class", true);
    const cards = items.filter(i => i.type === "domainCard");
    // (Its features as the system has them on: a subclass's specialization and mastery only once it's reached them.)
    const available = i => sys.isItemAvailable?.(i) !== false;
    const doing = items.filter(i => (i.type === "feature" && available(i)) || (i.type === "domainCard" && !i.system?.inVault));
    const subclass = s => (s ? { source: sourceOf(s), name: s.name, state: num(s.system?.featureState) || 1 } : null);
    const lore = i => (i ? { ref: i.system?.loreReference ?? null, name: i.name } : null);
    const domains = [...new Set([...(cls?.system?.domains ?? []), ...(multiclass?.system?.domains ?? []), ...cards.map(c => c.system?.domain)].filter(Boolean))];
    // (Out of the party only where the world has one.)
    const parties = globalThis.game?.actors?.filter?.(a => a.type === "party") ?? [];
    return {
      pc: true,
      traits: Object.fromEntries(TRAITS.map(k => [k, num(sys.traits?.[k]?.value)])),
      usual: plain(cls?.system?.characterGuide?.suggestedTraits) ?? null,
      level: num(sys.levelData?.level?.current) || 1,
      stressMax: num(sys.resources?.stress?.max),
      scars: num(sys.scars),
      inParty: parties.length ? (actor.parties instanceof Set ? actor.parties.size > 0 : undefined) : undefined,
      domains: [...(cls?.system?.domains ?? [])],
      multiclassDomains: [...(multiclass?.system?.domains ?? [])],
      cards: cards.map(c => ({ domain: c.system?.domain })),
      subclass: subclass(own("subclass")),
      multiclassSubclass: subclass(own("subclass", true)),
      ancestry: lore(items.find(i => i.type === "ancestry")),
      community: lore(items.find(i => i.type === "community")),
      items: doing.map(doingOf),
      names: {
        traits: Object.fromEntries(TRAITS.map(k => [k, traitName(k)])),
        cls: cls?.name,
        level: systemWord("DAGGERHEART.GENERAL.level", "Level"),
        stress: resourceWord("stress"),
        scars: systemWord("DAGGERHEART.GENERAL.scars", "Scars"),
        domains: Object.fromEntries(domains.map(k => [k, domainName(k)]))
      }
    };
  }

  /** What an adversary's sheet says (traits.js): its type, tier and motives, its features with what they do, what harms it less. */
  #adversarySheet(actor) {
    const sys = actor.system;
    const harm = k => systemWord(`DAGGERHEART.GENERAL.DamageResistance.${k}.label`, `Harm.${k}`);
    return {
      pc: false,
      type: sys.type,
      tier: sys.tier,
      motives: sys.motivesAndTactics,
      items: [...(actor.items ?? [])].filter(i => i.type === "feature" && !i.system?.inactive).map(doingOf),
      resistance: plain(sys.resistance) ?? {},
      names: { type: typeName(sys.type), harm: Object.fromEntries(["physicalImmunity", "physicalResistance", "magicalImmunity", "magicalResistance"].map(k => [k, harm(k)])) }
    };
  }

  /** What a companion's or an NPC's sheet says (traits.js): what it is, its partner, its features with what they do. */
  #otherSheet(actor) {
    const companion = actor.type === "companion";
    return {
      pc: false,
      [companion ? "companion" : "npc"]: true,
      items: [...(actor.items ?? [])].filter(i => i.type === "feature").map(doingOf),
      names: { kind: actorTypeName(actor.type), partner: companion ? actor.system?.partner?.name ?? "" : "" }
    };
  }

  detectLeaders(specs) {
    return rankDaggerheartLeaders(specs.map(s => s.leadership).filter(Boolean));
  }

  /** The planner's Daggerheart row: the GM's Fear going in, and how freely the GM spends it. */
  plannerSettings({ setup }) {
    const asked = setup.system ?? {};
    const fear = Number.isFinite(Number(asked.fear)) && asked.fear !== "" && asked.fear !== undefined ? Number(asked.fear) : fearNow();
    const spending = FEAR_SPENDING[asked.spending] ? asked.spending : "steady";
    return {
      title: t("Plan.Title"),
      hint: t("Plan.Hint"),
      fields: [
        { key: "fear", type: "select", label: resourceWord("fear"), hint: t("Plan.FearHint"), value: String(fear), choices: Array.from({ length: FEAR_MAX + 1 }, (_, n) => ({ value: String(n), label: String(n) })) },
        { key: "spending", type: "pills", label: t("Plan.Spending", { fear: resourceWord("fear") }), hint: t("Plan.SpendingHint"), value: spending, choices: Object.keys(FEAR_SPENDING).map(k => ({ value: k, label: t(`Plan.${k}`), hint: t(`Plan.${k}Hint`) })) }
      ]
    };
  }

  applyPlannerSettings(spec, settings, { setup }) {
    const asked = setup.system ?? {};
    const fear = Number.isFinite(Number(asked.fear)) && asked.fear !== "" && asked.fear !== undefined ? Number(asked.fear) : fearNow();
    spec.options.system = { fear: Math.max(0, Math.min(FEAR_MAX, fear)), spending: FEAR_SPENDING[asked.spending] ? asked.spending : "steady" };
  }

  /** The GM's Fear, as the fight leaves it, for the planner's summary of the fight. */
  describeEncounter(spec, replay) {
    return describeFear(spec.options?.system, replay);
  }

  /**
   * The kinds of thing a character can ask for in a standoff: Daggerheart's gear (weapons, armor, consumables, loot), in
   * the system's own words. It has no materials or rarities.
   */
  itemCatalog() {
    return { categories: GOODS.map(key => ({ key, label: systemWord(`TYPES.Item.${key}`, `ItemType.${key}`) })), materials: [], rarities: [] };
  }

  /**
   * Daggerheart's words: rolls against a Difficulty (a character's Evasion), its Hit Points (HP), and its money (Gold,
   * or what the world calls it).
   */
  term(key) {
    if ( key === "ac" ) return systemWord("DAGGERHEART.GENERAL.difficulty", "Difficulty");
    if ( key === "hp" ) return systemWord("DAGGERHEART.GENERAL.HitPoints.short", "Hp");
    if ( key === "money" ) return moneyWord();
    return null;
  }

  /** Its own pools' names (Hope, Stress, Fear, Armor Slots): the system's words, else this module's. */
  resourceLabel(key) {
    return LABELLED.includes(key) ? resourceWord(key) : null;
  }

  get supportsLive() {
    return true;
  }

  /** No initiative: whoever the GM spotlights acts. */
  get liveTurns() {
    return "spotlight";
  }

  /**
   * The spotlight given (or handed back) as the daggerheart tracker gives it: its countdowns, action tokens and effects
   * that last until one's next action go with it.
   */
  async giveSpotlight(combat, combatant) {
    const tracker = ui.combat;
    if ( tracker?.viewed === combat ) {
      if ( !combatant ) return combat.turn === null ? null : (tracker.clearTurn ? tracker.clearTurn() : combat.update({ turn: null }));
      if ( tracker.setCombatantSpotlight && combat.combatant?.id !== combatant.id ) return tracker.setCombatantSpotlight(combatant.id);
    }
    return super.giveSpotlight(combat, combatant);
  }

  /** The GM's Fear, as the world holds it now. */
  livePools() {
    return { fear: fearNow() };
  }

  /** A live battle: one turn's changes (commit.js commitDaggerheartChanges). */
  async commitChanges(tokenDoc, spec, changes, final, options) {
    return commitDaggerheartChanges(tokenDoc, spec, changes, final, options);
  }

  /**
   * The engine's conditions Daggerheart's sheets carry: Vulnerable, Hidden and Restrained (the engine's restrained and
   * immobilized both), written as the system's status (commit.js) and read back as the same keys. Any other (the
   * engine's frightened, its unconscious: the system's is how a fight ended, not a condition to lay) the core keeps.
   */
  sheetCarries(key) {
    return CARRIED.has(key);
  }

  /**
   * Daggerheart's own name for one of its conditions (its status and the engine's key are the same word); none for any
   * other, the engine's immobilized too (the system's Restrained is more than that).
   */
  conditionLabel(key) {
    return Object.hasOwn(CONDITION_KEYS, key) ? conditionName(key) : null;
  }

  /** Daggerheart's conditions (on or off: none is counted), then the core's. */
  conditionChoices() {
    return [...Object.keys(CONDITION_KEYS).map(key => ({ key })), ...super.conditionChoices()];
  }

  /** What a live turn did to the GM's Fear. */
  async commitTurn(before, after) {
    return commitFearTurn(before, after);
  }

  /** A player character's spotlight, read from the daggerheart system's cards (read-turn.js). */
  readTurn(messages, context) {
    return readDaggerheartTurn(messages, context);
  }

  /** API 19. A player's damage or healing card, as it's made (read-turn.js readDaggerheartDamage). */
  damageCard(message) {
    return readDaggerheartDamage(message);
  }

  /** API 19. A damage card applied to one token through the system's own damage handling (commit.js). */
  async applyDamageCard(message, token, options) {
    return applyDaggerheartDamage(message, token, options);
  }

  /**
   * API 19. A strike rolled with the system's own roller, its card in the chat (strike-roll.js rollDaggerheartStrike): the
   * attack at its target, no dialog, and a hit's damage as the card holds it; null where the strike isn't the creature's
   * standard attack, a weapon or its unarmed attack.
   */
  async rollStrike(token, options = {}) {
    return rollDaggerheartStrike(token, options);
  }

  /**
   * API 19. An action's own card, as its user shows it from the sheet (action-card.js useDaggerheartAction): a
   * feature's, a domain card's, nothing rolled, spent or applied; null for a strike rollStrike rolls, one kept out of
   * the chat, or anything that isn't one of the sheet's actions.
   */
  async useAction(token, options = {}) {
    return useDaggerheartAction(token, options);
  }

  /**
   * API 19. The damage of an action that isn't an attack, rolled with the system's own roller once for all it catches,
   * on a card of its own (action-card.js rollDaggerheartDamage): by type, as rolled; null where the sheet has none.
   */
  async rollDamage(token, options = {}) {
    return rollDaggerheartDamage(token, options);
  }

  /**
   * API 19. A save rolled with the system's own roller, its card in the chat (check-roll.js rollDaggerheartSave): a
   * reaction roll with the trait the save names, no dialog; null where the save isn't a trait.
   */
  async rollSave(token, options = {}) {
    return rollDaggerheartSave(token, options);
  }

  /**
   * API 19. A check rolled with the system's own roller, its card in the chat (check-roll.js rollDaggerheartCheck): an
   * action roll with the trait the sheets give it (words, a theft, first aid, an escape, a trait move), no dialog; an
   * adversary's words and escapes with what the engine adds to them. Null for any other check, and a companion's.
   */
  async rollCheck(token, options = {}) {
    return rollDaggerheartCheck(token, options);
  }

  /**
   * API 19. While the system's own Automation applies players' damage (Apply Damage/Healing, for Players): that
   * setting, as the GM finds it, in the system's words; else null.
   */
  appliesPlayerDamage() {
    const automation = plain(setting("Automation") ?? globalThis.game?.system?.settings?.automation);
    if ( !automation?.roll?.damageApply?.players ) return null;
    return t("AutoApply.Name", {
      system: t("Label"),
      menu: systemWord("DAGGERHEART.SETTINGS.Menu.automation.name", "AutoApply.Menu"),
      setting: systemWord("DAGGERHEART.SETTINGS.Automation.FIELDS.roll.damageApply.label", "AutoApply.Setting"),
      who: systemWord("DAGGERHEART.GENERAL.player.plural", "AutoApply.Players")
    });
  }

  /** Gold or an item, handed over (a deal, a demand, a theft). */
  async commitConcession(giverDoc, receiverDoc, concession) {
    return commitDaggerheartConcession(giverDoc, receiverDoc, concession, currency());
  }

  describeOutcome(spec, final) {
    return describeDaggerheartOutcome(spec, final);
  }
}


