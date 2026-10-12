/**
 * The Daggerheart system's actions (a weapon's attack, an adversary's, the actions on features and domain cards), as
 * FastFighting ActionSpecs. Read from the action's data, never its name:
 *  - attack, with a roll (attack, or spellcast) and damage: a strike (its trait, or the adversary's attack modifier);
 *    with a reaction roll it forces instead (a save: the trait, the Difficulty), a save, or a control action when it
 *    only lays effects;
 *  - damage, without a roll: it simply happens;
 *  - healing that clears Hit Points: a heal;
 *  - effect: what its effects do that the engine knows (bonuses to rolls and damage, Evasion, the conditions
 *    Vulnerable, Hidden and Restrained), on itself, a friend or a foe.
 * A spellcast attack is a spell attack (its caster counts as one). Its cost (Hope, Stress, Fear, an Armor Slot; the first
 * of them) and its uses carry over. Ranges are the system's
 * (Melee, Very Close, Close, Far, Very Far), in feet. Other kinds of action (summons, countdowns, macros, beastforms)
 * aren't played.
 * Pure: no Foundry globals.
 */
import { part, parseFormula } from "./core.js";

/** The system's ranges, in feet, unless its Range Measurement rule says otherwise. */
export const RANGES = Object.freeze({ melee: 5, veryClose: 15, close: 30, far: 60, veryFar: 120 });
/** How many foes an area takes in, by its size. */
const AREA_TARGETS = Object.freeze({ melee: 1, veryClose: 2, close: 3, far: 4, veryFar: 5 });
/** The conditions this module plays (the engine's immobilized goes with Restrained). */
const CONDITIONS = Object.freeze(["vulnerable", "hidden", "restrained"]);

const list = v => (Array.isArray(v) ? v : v instanceof Set ? [...v] : v && typeof v === "object" ? Object.values(v) : v ? [v] : []);
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Where an action reaches: {melee, reach} for Melee, {range} beyond it, null for itself (or no range at all). */
export function reachOf(key, ranges = RANGES) {
  if ( !key || key === "self" ) return null;
  if ( key === "melee" ) return { melee: true, reach: ranges.melee ?? 5 };
  const feet = ranges[key];
  return Number.isFinite(feet) ? { melee: false, range: { increment: feet, max: feet, noPenalty: true } } : null;
}

/**
 * A damage formula's parts: its dice (as many as its Proficiency, for "prof"; else its own count), its bonus, or its
 * own formula. Typed physical or magical; Stress damage as "stress".
 */
export function damagePartsOf(damage, { proficiency = 1 } = {}) {
  const main = damage?.main ?? damage?.parts?.hitPoints ?? null;
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
  if ( !faces ) return flat > 0 ? [part([], flat, type)] : [];
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
    for ( const s of e.statuses ?? [] ) {
      if ( !CONDITIONS.includes(s) ) continue;
      conditions[s] = 1;
      if ( s === "restrained" ) conditions.immobilized = 1;
    }
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

/** How many it takes in: an area's, or the targets it names (an attack on up to three). */
function targetsOf(action) {
  const area = list(action.areas)[0];
  if ( area ) return AREA_TARGETS[area.size] ?? 2;
  const n = num(action.target?.amount);
  return n > 1 ? n : 1;
}

/**
 * One system action as an engine ActionSpec, or null when it isn't something the engine plays.
 * @param {object} action    the system's action data
 * @param {object} ctx       {id, label, pc, traits ({agility: 1, ...}), spellcast (the trait), proficiency, attackBonus
 *                           (an adversary's), difficulty (its Difficulty, for the reaction rolls it calls for),
 *                           critOn, ranges, effectsById (its item's effects, by id), horde ("full" | "reduced")}
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
  switch ( action.type ) {
    case "attack": {
      // A reaction roll it forces: a save (with damage), else a control action that lays its effects.
      if ( save ) {
        if ( parts.length ) return { ...base, kind: "save", save, damage: parts, ...where, ...area, effects: effect?.conditions && Object.keys(effect.conditions).length ? [{ kind: "condition", conditions: effect.conditions, rounds: 2, label: ctx.label ?? "" }] : undefined };
        if ( !effect ) return null;
        const outcome = { ...effect, rounds: 2, label: ctx.label ?? action.name ?? "" };
        return { ...base, kind: "control", save, onSave: [outcome, outcome, null, null], ...where, ...area };
      }
      const kind = action.roll?.type;
      if ( kind !== "attack" && kind !== "spellcast" ) return null;
      const bonus = ctx.pc ? num(ctx.traits?.[kind === "spellcast" ? (ctx.spellcast ?? trait) : trait]) + num(action.roll?.bonus) : num(action.roll?.bonus) || num(ctx.attackBonus);
      if ( !parts.length ) {
        // A spell that only lays effects on a foe it hits (Slumber): control, decided by the roll against its Difficulty.
        if ( !effect ) return null;
        const outcome = { ...effect, rounds: 2, label: ctx.label ?? action.name ?? "" };
        return { ...base, kind: "control", bonus, onHit: [null, null, outcome, outcome], ...where, ...area };
      }
      const riders = effect?.conditions && Object.keys(effect.conditions).length ? [{ kind: "condition", conditions: effect.conditions, rounds: 2, label: ctx.label ?? "" }] : undefined;
      return {
        ...base, kind: kind === "spellcast" ? "spell-attack" : "strike", bonus, damage: parts, ...(where ?? reachOf("melee", ctx.ranges)), ...area, effects: riders,
        ...(ctx.critOn && ctx.critOn < 20 ? { critOn: ctx.critOn } : {}), ...(ctx.horde ? { horde: ctx.horde } : {}),
        magical: kind === "spellcast" || list(action.damage?.main?.type).includes("magical")
      };
    }
    case "damage":
      return parts.length ? { ...base, kind: "auto", damage: parts, ...(where ?? reachOf("melee", ctx.ranges)), ...area } : null;
    case "healing": {
      const hp = action.damage?.resources?.hitPoints ?? action.healing?.hitPoints ?? null;
      if ( !hp?.value ) return null;
      const heal = damagePartsOf({ main: hp }, { proficiency: ctx.proficiency }).map(p => ({ ...p, type: "healing" }));
      return heal.length ? { ...base, kind: "heal", heal, ...(where ?? reachOf("melee", ctx.ranges)) } : null;
    }
    case "effect": {
      if ( !effect ) return null;
      const outcome = { ...effect, rounds: 2, label: ctx.label ?? action.name ?? "" };
      const who = action.target?.type;
      if ( who === "self" ) return { ...base, kind: "buff", targets: "self", outcome };
      if ( who === "friendly" ) return { ...base, kind: "buff", outcome, ...(where ?? reachOf("close", ctx.ranges)) };
      // On a foe: it simply happens (its conditions); a bonus is for friends.
      if ( !Object.keys(effect.conditions).length ) return { ...base, kind: "buff", targets: "self", outcome };
      return { ...base, kind: "control", auto: true, outcome: { ...outcome, mods: undefined }, ...(where ?? reachOf("close", ctx.ranges)), ...area };
    }
    default:
      return null;
  }
}

/**
 * The moves anyone can make with a trait (the SRD's trait verbs), each an action roll against the foe's Difficulty:
 *  - Grapple (Strength): the foe Restrained, until it clears it (two rounds, here);
 *  - Maneuver (Agility): an opening, the foe Vulnerable until it next acts;
 *  - Hide (Finesse), against Difficulty 12: Hidden (rolls against it at disadvantage) until it attacks.
 * The SRD lets a character attempt these as any action; which trait and what comes of it is this module's reading.
 * @param {object} ctx  {id, traits, names: {grapple, maneuver, hide, restrained, vulnerable, hidden}, ranges}
 */
export function traitMoves({ id, traits = {}, names = {}, ranges = RANGES }) {
  const melee = reachOf("melee", ranges);
  const restrained = { conditions: { restrained: 1, immobilized: 1 }, rounds: 2, label: names.restrained ?? "" };
  const vulnerable = { conditions: { vulnerable: 1 }, rounds: 1, label: names.vulnerable ?? "" };
  const hidden = { conditions: { hidden: 1 }, rounds: 2, label: names.hidden ?? "" };
  return [
    { id: `${id}.grapple`, name: names.grapple ?? "", kind: "control", check: { mod: num(traits.strength), against: "ac" }, onHit: [null, null, restrained, restrained], traitMove: "grapple", ...melee },
    { id: `${id}.maneuver`, name: names.maneuver ?? "", kind: "control", check: { mod: num(traits.agility), against: "ac" }, onHit: [null, null, vulnerable, vulnerable], traitMove: "maneuver", ...melee },
    { id: `${id}.hide`, name: names.hide ?? "", kind: "buff", targets: "self", check: { mod: num(traits.finesse), dc: 12 }, onDegree: [null, null, hidden, hidden], traitMove: "hide", setup: true, leans: ["lowProfile"] }
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
