/**
 * The Daggerheart system's actions (a weapon's attack, an adversary's, the actions on features and domain cards), as
 * FastFighting ActionSpecs. Read from the action's data, never its name:
 *  - attack, with a roll (attack, or spellcast) and damage: a strike (its trait, or the adversary's attack modifier);
 *    with a reaction roll it forces instead (a save: the trait, the Difficulty), a save, or a control action when it
 *    only lays effects;
 *  - damage, without a roll: it simply happens;
 *  - the Stress either marks besides its Hit Points (its damage's Stress): Stress damage;
 *  - healing that clears Hit Points: a heal; that gives Hope or clears Stress instead, a buff that gains them (gainSpec);
 *  - effect: what its effects do that the engine knows (bonuses to rolls and damage, Evasion, the conditions
 *    Vulnerable, Hidden and Restrained), on itself, a friend or a foe. Restrained laid on a foe says how it's broken.
 *  - summon: the core's summoning (toSummonSpec), once the adapter has read the creatures it calls.
 * A spellcast attack is a spell attack (its caster counts as one). Its cost (Hope, Stress, Fear, an Armor Slot; the first
 * of them) and its uses carry over. Ranges are the system's
 * (Melee, Very Close, Close, Far, Very Far), in feet. An adversary's reaction feature that harms whoever hurt it is one
 * of the engine's reactions (toReactionSpec). An SRD adversary's feature that knocks a foe back, pulls it in, knocks it
 * over or seizes it (known by its id: FEATURE_MOVES) is one of the core's maneuvers (featureMove), as are the trait
 * moves anyone can make (traitMoves); one that does it with its standard attack, a rider on that attack (attackMove).
 * An attack shown with a creature's own body (bodyIcon) is a natural one, needing no free hands.
 * Other kinds of action (countdowns, macros, beastforms) aren't played.
 * Pure: no Foundry globals.
 */
import { part, parseFormula, parseTypedFormula, meanPart } from "./core.js";

/** The system's ranges, in feet, unless its Range Measurement rule says otherwise. */
export const RANGES = Object.freeze({ melee: 5, veryClose: 15, close: 30, far: 60, veryFar: 120 });
/** How many foes an area takes in, by its size. */
const AREA_TARGETS = Object.freeze({ melee: 1, veryClose: 2, close: 3, far: 4, veryFar: 5 });
/**
 * The conditions this module plays, by the system's status for each, as the engine's keys: Vulnerable, Hidden, and
 * Restrained (it can't move but can still act: the engine's restrained and immobilized together). Read from a sheet
 * (adapter.js), laid by an action's effects (effectOf), and written back (commit.js) by the same table.
 */
export const CONDITION_KEYS = Object.freeze({
  vulnerable: Object.freeze(["vulnerable"]),
  hidden: Object.freeze(["hidden"]),
  restrained: Object.freeze(["restrained", "immobilized"])
});
/** The engine's keys for one of the system's statuses; none for any other (a defeat status, another module's). */
export const conditionKeysOf = status => (Object.hasOwn(CONDITION_KEYS, status) ? CONDITION_KEYS[status] : []);

/**
 * The SRD adversaries' features that move a foe or take its footing, by the feature's id in the system's compendium
 * (kept when an adversary is imported, or copied): their data says what they deal and lay (damage, Vulnerable,
 * Restrained), not this, which only their words say. Each is one of the core's maneuvers (featureMove):
 *  - to: knocked back to a range band; by: knocked back as far as a band reaches (from where it stood): a shove, or a
 *    fling to Far and beyond;
 *  - in: pulled into Melee range: a drag;
 *  - maneuver: what it is, where it doesn't move anyone (knocked over, Vulnerable: a trip; seized and held, Restrained:
 *    a grapple; wrapped and squeezed: constrict).
 * action: only that one of its actions (the rest do something else). attack: it comes with the adversary's standard
 * attack instead (a passive's knockback, or a reaction's to its own standard attack hitting): a rider on that attack
 * (attackMove), not a maneuver of its own; a reaction's Stress isn't paid (the core's riders on a blow are free).
 * A knockback (to, by) is a collision where it's stopped short (rules.js collisionDamage); a pull isn't.
 * Not here: what only answers a blow (Vengeful Fate's knockback: the core's reactions don't move anyone); what costs
 * the GM a Fear on a standard attack (the Elephant's Toss); what moves a foe some other way (thrown out of an area, or
 * as the GM chooses).
 */
const FEATURE_MOVES = Object.freeze({
  CSrzB2SNFXb3Y5b6: { to: "close" }, // Banshee: Wail of Despair (a failed reaction roll)
  "0DSCzAFXy0hV4afJ": { to: "far" }, // Deeproot Defender: Ground Slam
  ESnu3I89BmUdBZEk: { to: "far" }, // Minor Fire Elemental: Explosion
  OCDeXZ8K5EbT8ywA: { to: "far" }, // Dragon Mother Mitera: Tail Swipe
  LVFZ4AfVhS6Q9hRy: { to: "close" }, // Vault Guardian Sentinel: Mana Bolt (a failed reaction roll)
  iGIVBeuyJDKftzrs: { to: "far" }, // Plesiosaurus: Wall of Water (a failed reaction roll)
  HhuXSt7z9vfEQi8k: { by: "far" }, // Cloud Titan: Wind Worker
  JHpHvFvrJGI2Kwe1: { by: "close", action: "glnoG8JVxdGxNoyJ" }, // Roc: Here Comes the Boom (its reaction roll, not its attack)
  NuksKUrbf4yj4vR2: { to: "close" }, // Volcanic Dragon, Molten Scourge: Eruption (a failed reaction roll)
  bpjpHxf6tj4i3H4r: { to: "close" }, // Volcanic Dragon, Molten Scourge: Shattering Might
  "8bMOItTuL7PfAYcJ": { to: "far" }, // Volcanic Dragon, Obsidian Predator: Avalanche Tail
  AXhSVGL33i0j6DAw: { by: "close" }, // Volcanic Dragon, Ashen Tyrant: Desperate Rampage
  "3X0uVX5xsTcrpQ16": { to: "close" }, // Gargantuan Sea Turtle: Gigaton Splash (a failed reaction roll)
  afz1zt0dMBQwanI0: { to: "close" }, // Gargantuan Sea Turtle: Tail Bash
  uzlxE1Cxm9GGmrNs: { to: "close" }, // Pirate Tough: Clear the Decks
  lxMzWFQOIpidX094: { to: "close" }, // Frost Titan: Bull Rush
  b2QvDYOq1nreI2uD: { to: "veryFar", action: "8fgkb7U2pxNyiHrB" }, // Minotaur Wrecker: Charging Bull (its attack)
  rreGFW5TbhUoZf2T: { in: true }, // Deeproot Defender: Grab and Drag
  dqwQS5ZsTMHWUEPL: { in: true }, // Ahuizotl: Drag and Bag
  kaTCdf7p0SVNiW0u: { in: true }, // Entombed Empress: Grasping Chains
  "7DSC9gbRVC7j7nKh": { in: true }, // Cephilith Abomination: Tongue Attack
  ctXYwil2D1zfsekT: { maneuver: "trip" }, // Acid Burrower: Earth Eruption
  j1mUnngeA5NKBgnZ: { maneuver: "trip" }, // Landshark Behemoth: Forceful Eruption
  MabIQE1Kjn60j08J: { maneuver: "trip" }, // Giant Eagle: Deadly Dive
  zgR0MEqyobKp2yXr: { maneuver: "grapple" }, // Bear: Bite
  JEsOYtkNPrEjQp9A: { maneuver: "grapple" }, // Octopus: Grapple
  "7Eiy4PoehsyoMQU2": { maneuver: "grapple" }, // Giant Octopus: Grapple
  vz2BWhispgR7mSWF: { maneuver: "grapple" }, // Kraken: Grapple and Drown
  Sa4Nt0eoDjirBKGf: { maneuver: "grapple" }, // Jagged Knife Kneebreaker: Hold Them Down
  "9gizFt9ovKL05DXu": { maneuver: "grapple" }, // Bladed Guard: Detain
  bSG0fOnMCgOFVdpP: { maneuver: "grapple" }, // Cephilith Abomination: Bear Hug
  "0BirBknShzjOvSdz": { maneuver: "grapple" }, // Harbinger of Famine: Too Many Mouths
  bkNqFMvqT2qnOH9E: { maneuver: "constrict" }, // Lamia: Constriction
  "2jD66IGYZIZF385K": { maneuver: "constrict", action: "SazYQVwEPYDJQwse" }, // Water Mother: Constrict (its attack)
  "2fXzhh2qil8dw3vw": { to: "veryClose", attack: true }, // Bear: Overwhelming Force (a passive: whoever marks Hit Points from it)
  eXgcX8stbsTetuoU: { to: "veryClose", attack: true }, // Vault Guardian Sentinel: Kinetic Slam (a passive: whoever it damages)
  BGE42W1XPd0vpimR: { to: "close", attack: true }, // Greater Water Elemental: High Tide (a reaction, for a Stress)
  eX0tAOy7TD4wVgEY: { in: true, attack: true } // Cursed Merfolk: "Get Over Here!" (a reaction, for a Stress; its attack for a Fear isn't played)
});

const list = v => (Array.isArray(v) ? v : v instanceof Set ? [...v] : v && typeof v === "object" ? Object.values(v) : v ? [v] : []);
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Where an action reaches: {melee, reach} for Melee, {range} beyond it, null for itself (or no range at all). */
export function reachOf(key, ranges = RANGES) {
  if ( !key || key === "self" ) return null;
  if ( key === "melee" ) return { melee: true, reach: ranges.melee ?? 5 };
  const feet = ranges[key];
  return Number.isFinite(feet) ? { melee: false, range: { increment: feet, max: feet, noPenalty: true } } : null;
}

/** Pulled into Melee range: from as far as it reaches to beside the one pulling. */
const pullFrom = (reach, ranges) => ({ kind: "pull", feet: Math.max(ranges.melee, reach - ranges.melee) });

/**
 * What one of an SRD adversary's features does to where a foe stands (FEATURE_MOVES), for one of its actions:
 * {maneuver, move} (the core's: maneuvers.js), or null. In feet, by the ranges in play, from where the feature reaches
 * (its area's size, else its range): knocked back to a band, as far as that band is past it (from Melee, where the
 * feature reaches that far already: the Banshee's wail, within Close, sends each to the edge of Close); by a band, that
 * band's distance; pulled in, from as far as it reaches to beside the one pulling. A knockback is marked so
 * (knockback: rules.js collisionDamage). Null for one that comes with its standard attack (attackMove).
 */
export function featureMove(featureId, action, ranges = RANGES) {
  const m = Object.hasOwn(FEATURE_MOVES, featureId ?? "") ? FEATURE_MOVES[featureId] : null;
  if ( !m || m.attack || (m.action && m.action !== (action?._id ?? action?.id)) ) return null;
  const reach = ranges[list(action?.areas)[0]?.size ?? action?.range] ?? ranges.melee;
  if ( m.in ) return { maneuver: "drag", move: pullFrom(reach, ranges) };
  const band = m.to ?? m.by;
  if ( !band ) return { maneuver: m.maneuver };
  const from = m.by ? 0 : reach < ranges[band] ? reach : ranges.melee;
  return { maneuver: ranges[band] > ranges.close ? "fling" : "shove", move: { kind: "push", feet: ranges[band] - from, knockback: true } };
}

/**
 * What one of an SRD adversary's features does with its standard attack (FEATURE_MOVES, attack): a rider on that
 * attack's hit ({kind: "move", move, label}: the core's), or null. Knocked back to a band: pushed until it's that far
 * off (already there or farther, nowhere); pulled in, from as far as the attack reaches. On every hit: the Bear's
 * knocks back whoever marks Hit Points from it, which an Armor Slot may spare; the rider can't tell.
 * @param {string} featureId  the feature's id
 * @param {object} attack     the adversary's standard attack (its range)
 * @param {object} ranges     the ranges in play, in feet
 * @param {string} label      the feature's name
 */
export function attackMove(featureId, attack, ranges = RANGES, label = "") {
  const m = Object.hasOwn(FEATURE_MOVES, featureId ?? "") ? FEATURE_MOVES[featureId] : null;
  if ( !m?.attack ) return null;
  const reach = ranges[attack?.range] ?? ranges.melee;
  if ( m.in ) return { kind: "move", move: pullFrom(reach, ranges), label };
  return m.to ? { kind: "move", move: { kind: "push", to: ranges[m.to], knockback: true }, label } : null;
}

/**
 * A damage formula's parts: its dice (as many as its Proficiency, for "prof"; else its own count, none at all for a
 * count of 0), its bonus, or its own formula. Typed physical or magical; Stress damage as "stress", the Stress it marks
 * besides its Hit Points (a Vampire's Draining Bite, a Green Ooze's Envelop) too. Direct damage (the
 * system's damage.direct: no Armor Slot can lessen it) is marked so, for the core to say (rules.js applyIwr).
 */
export function damagePartsOf(damage, { proficiency = 1 } = {}) {
  const parts = basePartsOf(damage, { proficiency });
  return damage?.direct ? parts.map(p => ({ ...p, direct: true })) : parts;
}

/** An action's other resources, as the system keeps them (its damage's resources; an older action's parts, by key). */
const resourcesOf = damage => damage?.resources ?? (damage?.parts && !Array.isArray(damage.parts) ? damage.parts : null) ?? {};

function basePartsOf(damage, { proficiency = 1 } = {}) {
  const main = damage?.main ?? damage?.parts?.hitPoints ?? null;
  const parts = partsOf(main, { proficiency });
  // (The Stress it marks besides: Stress damage too, where it comes to any. A heal's is the Stress it clears: gainSpec.)
  const stress = main?.applyTo === "stress" ? null : resourcesOf(damage).stress;
  if ( stress?.value ) parts.push(...partsOf({ ...stress, applyTo: "stress" }, { proficiency }).filter(p => p.flat > 0 || p.dice.some(d => d.n > 0 && d.faces > 0)));
  return parts;
}

/** One damage part's dice and bonus, or its own formula: [part], or none. */
function partsOf(main, { proficiency = 1 } = {}) {
  const value = main?.value;
  if ( !value ) return [];
  const type = main.applyTo === "stress" ? "stress" : list(main.type)[0] ?? "physical";
  if ( value.custom?.enabled ) {
    const formula = String(value.custom.formula ?? "").replace(/@[\w.]+/g, "0");
    return [parseFormula(formula, type)];
  }
  const faces = Number(/d(\d+)/.exec(String(value.dice ?? ""))?.[1]) || 0;
  const count = Math.max(1, num(value.flatMultiplier) || 1) * (value.multiplier === "prof" ? Math.max(1, proficiency) : 1);
  const flat = num(value.bonus);
  // (A flat count of no dice, as the system's own formula reads it: its bonus alone. A Minion's "4 physical".)
  const diceless = value.multiplier === "flat" && value.flatMultiplier !== undefined && !(num(value.flatMultiplier) > 0);
  if ( !faces || diceless ) return flat > 0 ? [part([], flat, type)] : [];
  return [part([{ n: count, faces }], flat, type)];
}

/** What an action costs to use, the first of its costs: {resource, resourceCost, shared?}, or {}. */
export function costOfAction(action) {
  const cost = list(action.cost).find(c => ["hope", "stress", "fear", "armor"].includes(c?.key));
  if ( !cost ) return {};
  const out = { resource: cost.key, resourceCost: Math.max(1, num(cost.value) || 1) };
  if ( cost.key === "fear" ) out.shared = "fear";
  return out;
}

/** What an action's effects do that the engine plays: {conditions, mods}, or null. */
export function effectOf(action, effectsById = new Map()) {
  const conditions = {};
  const mods = {};
  for ( const ref of list(action.effects) ) {
    const e = effectsById.get(ref?._id ?? ref);
    if ( !e ) continue;
    for ( const s of e.statuses ?? [] ) for ( const k of conditionKeysOf(s) ) conditions[k] = 1;
    for ( const c of e.changes ?? [] ) {
      const key = String(c.key ?? "");
      const v = num(c.value);
      if ( !v ) continue;
      if ( /^system\.bonuses\.roll\.(?:bonus|attack|attack\.bonus)$/.test(key) ) {
        mods.attack = (mods.attack ?? 0) + v;
        mods.checks = (mods.checks ?? 0) + v;
      } else if ( /^system\.bonuses\.damage\.(?:bonus|physical\.bonus|magical\.bonus)$/.test(key) ) mods.damage = (mods.damage ?? 0) + v;
      else if ( key === "system.evasion" ) mods.ac = (mods.ac ?? 0) + v;
    }
  }
  const has = Object.keys(conditions).length || Object.keys(mods).length;
  return has ? { conditions, mods } : null;
}

/**
 * How the Restrained an action lays is broken (a temporary condition: rules.js breakFree), for the effect it leaves: an
 * action roll against the Difficulty of the adversary who laid it (a character's: none known here, so what's typical),
 * its own or a friend's beside it. Nothing for an effect that doesn't restrain.
 */
function escapeOf(effect, ctx) {
  if ( !CONDITION_KEYS.restrained.some(k => effect?.conditions?.[k]) ) return {};
  return { escape: { dc: ctx.pc ? null : num(ctx.difficulty) || null, others: "check" } };
}

/** The Hit Points a healing action clears, if it clears any. */
const hitPointsHealed = action => action?.damage?.resources?.hitPoints ?? action?.healing?.hitPoints ?? null;

/**
 * Does this action clear someone else's Hit Points: healing Hit Points, aimed at anyone but itself (as toActionSpec
 * plays it: a heal for a friend)?
 */
export function mendsOthers(action) {
  return action?.type === "healing" && !!hitPointsHealed(action)?.value && action.target?.type !== "self" && action.range !== "self";
}

/** How many it takes in: an area's, or the targets it names (an attack on up to three). */
function targetsOf(action) {
  const area = list(action.areas)[0];
  if ( area ) return AREA_TARGETS[area.size] ?? 2;
  const n = num(action.target?.amount);
  return n > 1 ? n : 1;
}

/**
 * One that moves a foe or takes its footing (ctx.moves, featureMove: {maneuver, move}), as a control action whatever
 * it would be otherwise: its roll (an attack, a reaction roll it forces, or none: it simply happens), the move landing
 * with what its effects lay, its damage as ever (dealt as a control action's is: never a critical's), told as the
 * maneuver it is. Null when it would do nothing.
 */
function maneuverSpec(action, ctx, { base, where, area, parts, effect, escape, save = null, bonus = null, magical = false }) {
  const { maneuver, move = null } = ctx.moves;
  if ( !effect && !move && !parts.length ) return null;
  const outcome = { ...(effect ? { ...effect, rounds: 2, ...escape } : {}), label: ctx.label ?? action.name ?? "", ...(move ? { move } : {}) };
  const spec = { ...base, kind: "control", maneuver, ...(parts.length ? { damage: parts, magical } : {}), ...where, ...area };
  if ( save ) return { ...spec, save, onSave: [outcome, outcome, null, null] };
  if ( bonus !== null ) return { ...spec, bonus, onHit: [null, null, outcome, outcome] };
  return { ...spec, auto: true, outcome: { ...outcome, mods: undefined } };
}

/**
 * One system action as an engine ActionSpec, or null when it isn't something the engine plays.
 * @param {object} action    the system's action data
 * @param {object} ctx       {id, label, pc, traits ({agility: 1, ...}), spellcast (the trait), proficiency, attackBonus
 *                           (an adversary's), difficulty (its Difficulty, for the reaction rolls it calls for),
 *                           critOn, ranges, effectsById (its item's effects, by id), horde ("full" | "reduced"),
 *                           moves (what it does to where a foe stands: featureMove)}
 */
export function toActionSpec(action, ctx) {
  if ( !action ) return null;
  const base = { id: ctx.id, name: ctx.label ?? action.name ?? "", ...costOfAction(action) };
  const uses = num(action.uses?.max);
  if ( uses > 0 ) base.uses = uses;
  const where = reachOf(action.range, ctx.ranges) ?? (action.target?.type === "self" ? null : reachOf("melee", ctx.ranges));
  const parts = damagePartsOf(action.damage, { proficiency: ctx.proficiency });
  const effect = effectOf(action, ctx.effectsById);
  const targets = targetsOf(action);
  const area = targets > 1 ? { area: { targets } } : {};
  const trait = action.roll?.trait ?? null;
  const save = action.save?.trait ? { type: action.save.trait, dc: num(action.save.difficulty) || ctx.difficulty || 12, half: action.save.damageMod === "half", basic: action.save.damageMod === "half" } : null;
  // (On a foe: how what restrains it is broken.)
  const escape = escapeOf(effect, ctx);
  // (On a foe, moving it or taking its footing: a maneuver.)
  const maneuver = ctx.moves && !["self", "friendly"].includes(action.target?.type) ? { base, where, area, parts, effect, escape } : null;
  const magicDamage = list(action.damage?.main?.type).includes("magical");
  switch ( action.type ) {
    case "attack": {
      // A reaction roll it forces: a save (with damage), else a control action that lays its effects.
      if ( save ) {
        if ( maneuver ) return maneuverSpec(action, ctx, { ...maneuver, save, magical: magicDamage });
        if ( parts.length ) return { ...base, kind: "save", save, damage: parts, ...where, ...area, effects: effect?.conditions && Object.keys(effect.conditions).length ? [{ kind: "condition", conditions: effect.conditions, rounds: 2, label: ctx.label ?? "", ...escape }] : undefined };
        if ( !effect ) return null;
        const outcome = { ...effect, rounds: 2, label: ctx.label ?? action.name ?? "", ...escape };
        return { ...base, kind: "control", save, onSave: [outcome, outcome, null, null], ...where, ...area };
      }
      const kind = action.roll?.type;
      if ( kind !== "attack" && kind !== "spellcast" ) return null;
      const bonus = ctx.pc ? num(ctx.traits?.[kind === "spellcast" ? (ctx.spellcast ?? trait) : trait]) + num(action.roll?.bonus) : num(action.roll?.bonus) || num(ctx.attackBonus);
      if ( maneuver ) return maneuverSpec(action, ctx, { ...maneuver, bonus, magical: kind === "spellcast" || magicDamage });
      if ( !parts.length ) {
        // A spell that only lays effects on a foe it hits (Slumber): control, decided by the roll against its Difficulty.
        if ( !effect ) return null;
        const outcome = { ...effect, rounds: 2, label: ctx.label ?? action.name ?? "", ...escape };
        return { ...base, kind: "control", bonus, onHit: [null, null, outcome, outcome], ...where, ...area };
      }
      const riders = effect?.conditions && Object.keys(effect.conditions).length ? [{ kind: "condition", conditions: effect.conditions, rounds: 2, label: ctx.label ?? "", ...escape }] : undefined;
      return {
        ...base, kind: kind === "spellcast" ? "spell-attack" : "strike", bonus, damage: parts, ...(where ?? reachOf("melee", ctx.ranges)), ...area, effects: riders,
        ...(ctx.critOn && ctx.critOn < 20 ? { critOn: ctx.critOn } : {}), ...(ctx.horde ? { horde: ctx.horde } : {}),
        magical: kind === "spellcast" || magicDamage
      };
    }
    case "damage":
      if ( maneuver ) return maneuverSpec(action, ctx, { ...maneuver, magical: magicDamage });
      return parts.length ? { ...base, kind: "auto", damage: parts, ...(where ?? reachOf("melee", ctx.ranges)), ...area } : null;
    case "healing": {
      const hp = hitPointsHealed(action);
      const heal = hp?.value ? damagePartsOf({ main: hp }, { proficiency: ctx.proficiency }).map(p => ({ ...p, type: "healing" })) : [];
      if ( heal.length ) return { ...base, kind: "heal", heal, ...(where ?? reachOf("melee", ctx.ranges)) };
      // (No Hit Points: the Hope it gives, the Stress it clears.)
      return gainSpec(action, ctx, { base, where, area });
    }
    case "effect": {
      if ( maneuver ) return maneuverSpec(action, ctx, maneuver);
      if ( !effect ) return null;
      const outcome = { ...effect, rounds: 2, label: ctx.label ?? action.name ?? "" };
      const who = action.target?.type;
      if ( who === "self" ) return { ...base, kind: "buff", targets: "self", outcome };
      if ( who === "friendly" ) return { ...base, kind: "buff", outcome, ...(where ?? reachOf("close", ctx.ranges)) };
      // On a foe: it simply happens (its conditions); a bonus is for friends.
      if ( !Object.keys(effect.conditions).length ) return { ...base, kind: "buff", targets: "self", outcome };
      return { ...base, kind: "control", auto: true, outcome: { ...outcome, mods: undefined, ...escape }, ...(where ?? reachOf("close", ctx.ranges)), ...area };
    }
    default:
      return null;
  }
}

/**
 * What a healing action gives besides Hit Points: Hope gained and Stress cleared ({hope, stress}), each as many as it
 * comes to on average (its dice, its Proficiency); null for neither.
 */
export function resourcesGained(action, { proficiency = 1 } = {}) {
  const res = action?.damage ? resourcesOf(action.damage) : action?.healing ?? {};
  const out = {};
  for ( const key of ["hope", "stress"] ) {
    if ( !res[key]?.value ) continue;
    const n = Math.round(partsOf(res[key], { proficiency }).reduce((s, p) => s + Math.max(0, meanPart(p)), 0));
    if ( n > 0 ) out[key] = n;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * A healing action that clears no Hit Points but gives Hope or clears Stress (resourcesGained), as a buff that gains
 * them (the core's outcome.resources, through rules.js gainResource): on itself, or on a friend (itself too) within its
 * reach. Only one with something to pay for it or only so many uses (Battle Ritual, once a long rest; Mending Touch, for
 * 2 Hope): one free any number of times is a trigger's payoff (on a critical, when an attack misses it: Gore and Glory,
 * Swift Step), which comes about as its words say. Null for anything else.
 */
function gainSpec(action, ctx, { base, where, area }) {
  const resources = resourcesGained(action, { proficiency: ctx.proficiency });
  if ( !resources || !(base.resource || base.uses) ) return null;
  const outcome = { resources, label: ctx.label ?? action.name ?? "" };
  if ( action.target?.type === "self" || action.range === "self" ) return { ...base, kind: "buff", targets: "self", outcome };
  return { ...base, kind: "buff", outcome, ...(where ?? reachOf("melee", ctx.ranges)), ...area };
}

/** The most of one creature a summoning calls (the core's own summonings call no more). */
const SUMMON_MOST = 8;

/**
 * How many of a creature a summon action calls: its count's formula ("3", "1d4", "@partySize * 2") on average, its
 * @partySize the party's size; any other figure of the sheet's counts nothing. Between none and SUMMON_MOST.
 */
export function summonCount(formula, { partySize = 0 } = {}) {
  const text = String(formula ?? "").trim() || "1";
  const filled = text.replace(/@partySize\b/gi, String(Math.max(0, Number(partySize) || 0))).replace(/@[\w.]+/g, "0");
  const n = Math.round(parseTypedFormula(filled).reduce((s, p) => s + meanPart(p), 0));
  return Math.max(0, Math.min(SUMMON_MOST, n));
}

/**
 * The SRD's summoning features whose data leaves out the Fear their words cost, by the feature's id in the system's
 * compendium (kept when it's imported, or copied): the Fear each costs.
 */
const SUMMON_FEAR = Object.freeze({
  IWtpuQCuV82lOSry: 2, // Head Vampire: The Hunt Is On
  XxXOrFovbCz9zFxR: 1, // Arch-Necromancer: Open the Gates of Death
  yKWQLL3qsEZlQjyb: 1, // Dryad: Grow Saplings
  OWUM3eFiZrIn0Bjd: 2, // Divine Usurpation: Difilers Abound
  TlX8yI5OWVmOK3cF: 1, // Megastorm: Stormheart
  M2Iudy8tNp2tR4rO: 1 // Abandoned Mine: Into the Spider's Web
});

/**
 * A summon action (the system's "summon") as the core's summoning (behavior/summons.js), given the creatures it calls
 * (their CombatantSpecs, as many of each as it calls: the adapter reads them): its cost and uses as any action's (an SRD
 * feature's Fear its data leaves out, SUMMON_FEAR); how far off they appear, its range in feet (the core's, where it
 * gives none, or only itself); no time set, as Daggerheart sets none (they stay until they're beaten). Null when it
 * calls nobody.
 * @param {object} action      the system's action data
 * @param {object} ctx         {id, label, ranges, feature (the feature's id)}
 * @param {object[]} creatures their CombatantSpecs
 */
export function toSummonSpec(action, ctx, creatures = []) {
  if ( !creatures.length ) return null;
  const fear = Object.hasOwn(SUMMON_FEAR, ctx.feature ?? "") ? SUMMON_FEAR[ctx.feature] : 0;
  const cost = costOfAction(action);
  const base = { id: ctx.id, name: ctx.label ?? action.name ?? "", ...(cost.resource || !fear ? cost : { resource: "fear", resourceCost: fear, shared: "fear" }) };
  const uses = num(action.uses?.max);
  if ( uses > 0 ) base.uses = uses;
  const feet = (ctx.ranges ?? RANGES)[action.range];
  return { ...base, kind: "summon", creatures, ...(Number.isFinite(feet) ? { range: { increment: feet, max: feet, noPenalty: true } } : {}) };
}

/**
 * Foundry's icons for a creature's own body (claws, fangs, a tail, tentacles, a hoof or a horn, a fist), by where in
 * Foundry's icon library the system's adversaries take them from: an attack shown with one is a natural attack, which
 * needs no free hands. A weapon's icon, a spell's, isn't one.
 */
const BODY_ICON = /^icons\/(?:creatures\/|commodities\/(?:biological|bones|claws)\/|skills\/melee\/unarmed-|magic\/earth\/strike-fist)/;
export const bodyIcon = img => BODY_ICON.test(String(img ?? ""));

/**
 * A reaction feature's action as one of the engine's reactions (the core's responses.js), or null when it isn't one
 * the engine plays. When it goes off is in the feature's words, which this module doesn't read; what it does is in its
 * data. One that harms others on its own (damage of its own, or a reaction roll it forces with damage; not damage added
 * to its standard attack's) answers being hurt (on "damaged"): it strikes whoever hurt it, within its range (or its
 * area's), and a reaction roll avoids it when it calls for one. The SRD's are all of that kind (Thorny Armor, Burning,
 * Acid Bath, Lava Splash, Warding Sphere ...). Paid in its own Stress, or nothing; its uses carry over.
 * Not played: a standard attack back (the engine strikes back only at a miss, or for a friend), one paid in Fear (the
 * GM's, which an engine reaction can't draw on), more damage on its own hit (a bonus on its attack, not an answer),
 * what it does to itself (clearing Stress, a blow halved: its data doesn't say which), Fear it gains the GM.
 * @param {object} action   the system's action data
 * @param {object} ctx      {id, label, difficulty (its Difficulty, for the reaction roll), ranges}
 */
export function toReactionSpec(action, ctx) {
  if ( !action || action.target?.type === "self" ) return null;
  const main = action.damage?.main ?? action.damage?.parts?.hitPoints ?? null;
  if ( !main || main.includeBase ) return null;
  const save = action.save?.trait ? { type: action.save.trait, dc: num(action.save.difficulty) || ctx.difficulty || 12, half: action.save.damageMod === "half", basic: action.save.damageMod === "half" } : null;
  if ( action.type === "attack" ? !save : action.type !== "damage" ) return null;
  const damage = damagePartsOf(action.damage).filter(p => p.flat > 0 || p.dice.some(d => d.n > 0 && d.faces > 0));
  if ( !damage.length ) return null;
  const cost = costOfAction(action);
  if ( cost.resource && cost.resource !== "stress" ) return null;
  const ranges = ctx.ranges ?? RANGES;
  const range = ranges[action.range] ?? ranges[list(action.areas)[0]?.size];
  const uses = num(action.uses?.max);
  return {
    id: ctx.id, label: ctx.label ?? action.name ?? "", on: "damaged", damage,
    ...(save ? { save } : {}), ...(cost.resource ? { resource: cost.resource, amount: cost.resourceCost } : {}),
    ...(Number.isFinite(range) ? { range } : {}), ...(uses > 0 ? { uses } : {})
  };
}

/**
 * The moves anyone can make with a trait (the SRD's trait verbs), each an action roll against the foe's Difficulty:
 *  - Grapple (Strength): the foe held (the core's grab: it can't move off, until it breaks free against the grip, 12 +
 *    its Strength, adapter.js escapeDC); on a critical, Restrained as well (two rounds at most, here);
 *  - Shove (Strength): the foe pushed out of Melee range to Very Close (10 feet, by the system's ranges); on a
 *    critical, as far as Close (25 feet);
 *  - Maneuver (Agility): an opening, the foe Vulnerable until it next acts (told as a feint);
 *  - Hide (Finesse), against Difficulty 12: Hidden (rolls against it at disadvantage) until it attacks.
 * The SRD lets a character attempt these as any action; which trait and what comes of it is this module's reading.
 * Each is one of the core's maneuvers (maneuvers.js), with outcomes of its own: Daggerheart has no prone, and the
 * Duality Dice don't fail critically (nothing for the core's botched grapple or shove).
 * @param {object} ctx  {id, traits, names: {grapple, shove, maneuver, hide, restrained, vulnerable, hidden}, ranges}
 */
export function traitMoves({ id, traits = {}, names = {}, ranges = RANGES }) {
  const melee = reachOf("melee", ranges);
  // (Broken as any grip of a character's is: 12 + its Strength, adapter.js escapeDC.)
  const restrained = { conditions: { restrained: 1, immobilized: 1 }, rounds: 2, label: names.restrained ?? "", escape: { dc: 12 + Math.max(0, num(traits.strength)), others: "check" } };
  const vulnerable = { conditions: { vulnerable: 1 }, rounds: 1, label: names.vulnerable ?? "" };
  const hidden = { conditions: { hidden: 1 }, rounds: 2, label: names.hidden ?? "" };
  const push = band => ({ move: { kind: "push", feet: ranges[band] - ranges.melee } });
  const strength = { kind: "control", check: { mod: num(traits.strength), against: "ac" }, ...melee };
  return [
    { id: `${id}.grapple`, name: names.grapple ?? "", ...strength, onHit: [null, null, { grab: true }, { grab: true, ...restrained }], traitMove: "grapple", maneuver: "grapple" },
    { id: `${id}.maneuver`, name: names.maneuver ?? "", kind: "control", check: { mod: num(traits.agility), against: "ac" }, onHit: [null, null, vulnerable, vulnerable], traitMove: "maneuver", maneuver: "feint", ...melee },
    { id: `${id}.hide`, name: names.hide ?? "", kind: "buff", targets: "self", check: { mod: num(traits.finesse), dc: 12 }, onDegree: [null, null, hidden, hidden], traitMove: "hide", setup: true, leans: ["lowProfile"] },
    { id: `${id}.shove`, name: names.shove ?? "", ...strength, onHit: [null, null, push("veryClose"), push("close")], traitMove: "shove", maneuver: "shove" }
  ];
}

/**
 * Help an Ally: a Hope spent to help a friend with its next action roll, an advantage die (a d6) on top of whatever it
 * rolls (it stacks; never on a reaction roll). No spotlight of its own: it's part of the friend's roll.
 */
export function helpAnAlly({ id, label = "", given = "", ranges = RANGES }) {
  return {
    // (Anyone can: not a specialty, though it costs a Hope.)
    // (Once in its spotlight: a Hope for one friend's next roll, not every friend's at once.)
    id: `${id}.help`, name: label, kind: "buff", resource: "hope", resourceCost: 1, economy: "free", oncePerTurn: true, includeSelf: false, special: false,
    outcome: { mods: { attackDie: 6, checkDie: 6 }, uses: 1, rounds: 2, label: given || label }, ...reachOf("close", ranges)
  };
}
