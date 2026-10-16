/**
 * Daggerheart's rules for FastFighting Core (the SRD's Core Mechanics and Running an Adventure).
 *
 * Rolls (dice.js): player characters roll the Duality Dice, adversaries a d20. A player character's action roll with
 * Hope gains it a Hope (at most its maximum); with Fear, the GM gains a Fear (at most 12); a critical (matching dice)
 * gains a Hope and clears a Stress. Before rolling it may spend a Hope on an Experience that fits, when that's worth it.
 * Reaction rolls bring neither Hope nor Fear.
 *
 * The spotlight (roundTurns): there's no initiative. Each player character takes the spotlight in turn; one whose
 * action roll fails, or goes with Fear, hands it to the GM, who spotlights an adversary (the one that has waited
 * longest), and may spend Fear for more (as freely as the planner says). A Solo with Relentless (X) can be spotlit up to
 * X times in a GM turn. Friends of the party who aren't player characters act at the end of the round.
 *
 * Harm (applyIwr): damage of a type it resists is halved, of one it's immune to ignored, its reduction taken off; then
 * its thresholds say how many Hit Points it marks: under Major 1, Major 2, Severe 3 (twice Severe 4, with the Massive
 * Damage rule). A player character marks an Armor Slot to take it down a step, while it has one, for a hit worth it.
 * Stress damage marks Stress; Stress it can't mark becomes Hit Points. A Minion falls to any damage; Minion (X): each
 * X damage another of its kind falls with it. A Horde that has marked half its Hit Points or more hits for its lesser
 * damage. A companion marks one Stress for any damage, and is out of the fight at its last; its rolls are its partner's
 * (the Duality Dice: Hope to the partner, Fear to the GM), and it acts at the end of the round.
 * Reactions: only a feature's (an adversary's that answers being hurt, actions.js toReactionSpec), one a round.
 * A fall from a height (shoved over a ledge: fallDamage): by the range it falls, the SRD's guide; nobody lands prone.
 * A knockback stopped short by a wall or someone in the way (collisionDamage): the SRD's guide's collision.
 *
 * Death moves (onDropped): a player character whose last Hit Point is marked chooses, as its playstyles lean (else
 * its nerve): Avoid Death (out cold; its Hope die at or under its level, a scar), Risk It All (the Duality Dice: Hope
 * higher, it clears that many Hit Points and fights on; Fear higher, it dies; matching, it clears them all and its
 * Stress), or Blaze of Glory (one last action, a critical, and then it dies). Adversaries are defeated (dead).
 *
 * Breaking free (breakFree, the core's holds.js): Restrained is a temporary condition. A player character (or a
 * companion) clears it with an action roll, the better of Strength and Agility, against the Difficulty of whoever laid
 * it (what's typical for its tier, when that isn't known); an adversary clears it when the GM spotlights it, with no
 * roll, spending that spotlight. A friend beside it can pull it loose the same way, with Strength or Finesse.
 * FastFighting's improvised bonds are homebrew (Daggerheart has none): Strength or Finesse for a character, the d20
 * and its attack modifier for an adversary, against two over its tier's typical Difficulty; a friend unties them with
 * no roll. Either way it's the spotlight's action, and a character's roll brings Hope or Fear like any action roll.
 * Whether a creature tied up can still cast is the world's setting (tied-up.js).
 * Pure: no Foundry globals (words through t(); the setting through tied-up.js).
 */
import { STATUS, DOWNED_MODELS, clamp, dropCondition, edgeDistance, localize, part } from "./core.js";
import { DUALITY, dualityChances, d20Chances, rollDuality, rollD20 } from "./dice.js";
import { CONDITION_KEYS, RANGES } from "./actions.js";
import { tiedStopsSpells } from "./tied-up.js";
import { t, systemWord } from "./words.js";

/** The most Fear the GM can hold. */
export const FEAR_MAX = 12;
/** How freely the GM spends Fear on more spotlights in a GM turn: Fear it keeps back, and how many more at most. */
export const FEAR_SPENDING = Object.freeze({
  sparing: { keep: 4, more: 1 },
  steady: { keep: 1, more: 1 },
  free: { keep: 0, more: Infinity }
});
/** How likely an Experience fits the moment (the table's call). */
const FITS = 0.6;
/**
 * Worth a Hope, by how freely its tactics spend resources: an Experience that makes the roll at least this much likelier
 * to succeed; and whether it keeps Hope back for its class's Hope feature.
 */
const HOPE_SPENDING = Object.freeze({
  conserve: { worth: 0.2, keep: true },
  balanced: { worth: 0.12, keep: true },
  nova: { worth: 0.06, keep: false }
});

const isPc = u => !!u?.spec?.duality;
/** Rolls the Duality Dice: a player character, and a companion (its rolls are its partner's). */
const rollsDuality = u => isPc(u) || !!u?.spec?.companionRoll;
const success = d => d[2] + d[3];

/** Gain Hope, up to its maximum. */
function gainHope(u, n = 1) {
  u.resources.hope = Math.min(u.spec.hopeMax ?? 6, (u.resources.hope ?? 0) + n);
}

/** The GM gains Fear, up to the most it can hold. */
function gainFear(u, n = 1) {
  const pools = u.sharedPools;
  if ( pools && "fear" in pools ) pools.fear = Math.min(FEAR_MAX, pools.fear + n);
}

/** Clear Stress (its unmarked Stress, back up to its maximum). */
function clearStress(u, n = 1) {
  if ( Number.isFinite(u.resources.stress) ) u.resources.stress = Math.min(u.spec.stressMax ?? 6, u.resources.stress + n);
}

/**
 * A Hope on an Experience before the dice, when one fits and it's worth it: the roll's chance of success up by WORTH
 * at least, and Hope to spare (its Hope feature wants three: it keeps those back unless the roll is unlikely to work).
 * A companion's roll is its partner's: the partner's Hope, as the partner spends it, on the companion's Experience.
 */
function experienceFor(rng, u, mod, dc, options, reaction) {
  const purse = u.partner ?? u;
  const hope = purse.resources?.hope ?? 0;
  const best = u.spec.experiences?.[0];
  if ( !(hope > 0) || !(best?.value > 0) || !Number.isFinite(dc) ) return null;
  const how = HOPE_SPENDING[purse.tac?.resourceUse] ?? HOPE_SPENDING.balanced;
  const before = success(dualityChances(mod, dc, { advantage: options.advantage, reaction }));
  const after = success(dualityChances(mod + best.value, dc, { advantage: options.advantage, reaction }));
  if ( after - before < how.worth ) return null;
  if ( how.keep && hope <= (purse.spec.hopeReserve ?? 0) && before >= 0.35 ) return null;
  if ( !rng.chance(FITS) ) return null;
  purse.resources.hope -= 1;
  return { name: best.name, value: best.value };
}

/** The line a duality roll adds to the log: the dice, how it went, an Experience used. */
function noteOf(roll, reaction) {
  const dice = t(roll.with === "crit" ? "Note.Crit" : reaction ? "Note.Reaction" : roll.with === "hope" ? "Note.Hope" : "Note.Fear", { hope: roll.hope, fear: roll.fear });
  return roll.experience ? `${dice} · ${t("Note.Experience", { name: roll.experience.name, value: roll.experience.value })}` : dice;
}

/** A player character's action roll, made: Hope or Fear, a critical's Stress, and whether the spotlight swings. */
function settle(u, roll) {
  if ( roll.with === "crit" ) {
    gainHope(u);
    clearStress(u);
  } else if ( roll.with === "hope" ) gainHope(u);
  else gainFear(u);
  if ( roll.with === "fear" || roll.degree < 2 ) u.handoff = true;
}

/** Hit Points a hit marks, by its damage and the thresholds (Massive Damage, when that rule is on). */
export function marksFor(damage, thresholds = {}, { massive = false } = {}) {
  if ( !(damage > 0) ) return 0;
  const major = Number(thresholds.major) || 0;
  const severe = Number(thresholds.severe) || 0;
  if ( massive && severe > 0 && damage >= 2 * severe ) return 4;
  if ( damage >= severe ) return 3;
  if ( damage >= major ) return 2;
  return 1;
}

/**
 * Whether a player character marks an Armor Slot against a hit of so many Hit Points. Its shield tactic says how freely
 * it uses its defenses: "always", against any hit; "spare", against Major or worse; "never", only against Severe ("Let
 * this character decide" is one of these: auto.js). Unanswered: against Major or worse, and against a Minor hit while
 * it has more than half its slots.
 */
function marksArmor(u, marks) {
  const left = u.resources?.armor ?? 0;
  if ( !(left > 0) || !(marks > 0) ) return false;
  switch ( u.tac?.shield ) {
    case "always": return true;
    case "spare": return marks >= 2;
    case "never": return marks >= 3;
    default: return marks >= 2 || left > (u.spec.armorMax ?? 0) / 2;
  }
}

/** Clear Hit Points; one out cold gets up. */
function heal(c, amount) {
  c.hp = Math.min(c.maxHp, Math.max(0, c.hp) + amount);
  if ( c.status === STATUS.DOWN && c.hp > 0 ) {
    c.status = STATUS.STANDING;
    c.stable = false;
  }
}

/** How a player character meets its end, as its playstyles lean (the first that leans), else its nerve. */
const DEATH_LEANS = Object.freeze({
  martyr: "blaze", redeemSeeker: "blaze",
  wildcard: "risk", impatient: "risk", brawler: "risk", speedRunner: "risk", instigator: "risk", vengeful: "risk", relentless: "risk",
  chicken: "avoid", fragile: "avoid", lazy: "avoid", mercenary: "avoid", diplomat: "avoid", peacekeeper: "avoid", skeptic: "avoid", wallflower: "avoid"
});
export function deathMoveOf(u) {
  for ( const id of u.spec.playstyles ?? [] ) if ( DEATH_LEANS[id] ) return DEATH_LEANS[id];
  const brave = u.prep?.traits?.brave ?? 50;
  return u.tac?.retreat === "never" || brave >= 80 ? "risk" : "avoid";
}

/** Who the GM can spotlight: anyone not a player character (nor one of their friends), standing, in the fight. */
function gmUnits(run, order) {
  const party = new Set(order.filter(isPc).map(u => u.side));
  return order.filter(u => !isPc(u) && u.active && u.status === STATUS.STANDING && !party.has(u.side));
}

/** A line in the log, as the system tells it. */
function say(run, u, key, data = {}) {
  run.log?.push({ round: run.round, actor: u?.spec.name ?? "", actorId: u?.id ?? null, side: u?.side ?? null, type: "spotlight", text: t(key, data) });
}

/** A GM turn: an adversary in the spotlight, and more for Fear, as freely as the GM spends it. */
function* gmTurn(run, order) {
  const dh = run.dh;
  dh.gmTurns += 1;
  const times = new Map();
  const pick = () => {
    let best = null;
    for ( const u of gmUnits(run, order) ) {
      if ( (times.get(u) ?? 0) >= Math.max(1, u.spec.relentless ?? 1) ) continue;
      // (The one that has waited longest; one already up this turn, Relentless, after anyone new.)
      const waited = (times.get(u) ?? 0) * 1000 + (dh.lastUp.get(u) ?? -1);
      if ( !best || waited < best.waited ) best = { u, waited };
    }
    return best?.u ?? null;
  };
  const first = pick();
  if ( !first ) return;
  say(run, first, "Spotlight.Gm", { name: first.spec.name });
  const spend = FEAR_SPENDING[dh.spending] ?? FEAR_SPENDING.steady;
  let more = 0;
  for ( let u = first; u; ) {
    times.set(u, (times.get(u) ?? 0) + 1);
    dh.lastUp.set(u, dh.gmTurns);
    yield u;
    if ( more >= spend.more || (run.sharedPools.fear ?? 0) <= spend.keep ) break;
    const next = pick();
    if ( !next ) break;
    run.sharedPools.fear -= 1;
    more += 1;
    say(run, next, "Spotlight.Fear", { name: next.spec.name, fear: run.sharedPools.fear });
    u = next;
  }
}

/**
 * A try at a hold on the Duality Dice, in words for the log (the core shows a d20's numbers itself): the trait, the
 * total against the Difficulty, how it went.
 */
function triedLine(roll, mod, dc, label) {
  const numbers = localize("FASTFIGHTING.Log.RollOwn", { natural: roll.natural, mod: mod >= 0 ? `+${mod}` : `${mod}`, total: roll.total, label: systemWord("DAGGERHEART.GENERAL.difficulty", "Difficulty"), dc });
  return label ? t("BreakFree.Trait", { trait: label, roll: numbers, note: roll.note }) : t("BreakFree.Plain", { roll: numbers, note: roll.note });
}

/** The first of `list` after `from` in the fight's order, round again to the first. */
function nextIn(list, from, order) {
  if ( !list.length ) return null;
  const at = from ? order.indexOf(from) : -1;
  return list.find(u => order.indexOf(u) > at) ?? list[0];
}

export const daggerheartRules = {
  id: "daggerheart",

  /* Turn ------------------------------------------------------------------ */
  mainPool: "action",
  movement: "feet",
  /** A spotlight: one action, and a move within Close range as part of it; or, sprinting, a move that is the action. */
  turn(u) {
    // (Sprinting: up to Far, the roll made; within Close, missed.)
    if ( u.sprinting ) return { action: 0, move: u.sprinting === "missed" ? u.spec.speeds?.walk ?? 30 : u.spec.sprint?.range ?? 60 };
    return { action: 1, move: u.spec.speeds?.walk ?? 30 };
  },
  /**
   * One in a hurry (its playstyles' rush: Impatient, Speed-Runner), with no foe within Close range, sprints for it: a
   * player character with an Agility action roll against Difficulty 12 (made, it moves up to Far; either way the
   * spotlight's action is spent on it, and the roll brings Hope or Fear); an adversary simply moves up to Very Far, as
   * its action. One held where it is (Restrained, a grab, tied up) doesn't.
   */
  startTurn(run, u) {
    u.sprinting = false;
    const rush = (u.turnBehavior ?? u.ownBehavior ?? u.spec.behavior ?? {}).rush ?? 0;
    if ( !(rush > 0) || !run.prep.options.positioning || !u.spec.sprint || u.status !== STATUS.STANDING ) return null;
    if ( u.conds?.immobilized || u.grabbedBy || u.bound || u.boundBy ) return null;
    const enemies = run.prep.sides[u.side]?.enemies ?? new Set();
    let nearest = null;
    for ( const o of run.units ) {
      if ( o === u || o.status !== STATUS.STANDING || !o.active || o.spec.untargetable || !enemies.has(o.side) ) continue;
      const d = edgeDistance(u, o);
      if ( d !== null && (nearest === null || d < nearest) ) nearest = d;
    }
    if ( nearest === null || nearest <= (u.spec.speeds?.walk ?? 30) || !run.rng.chance(rush) ) return null;
    if ( !isPc(u) ) {
      u.sprinting = "made";
      return { text: t("Sprint.Adversary") };
    }
    const roll = daggerheartRules.roll(run.rng, Number(u.spec.sprint.mod) || 0, 12, { roller: u, faces: DUALITY, kind: "check" });
    u.sprinting = roll.degree >= 2 ? "made" : "missed";
    return { text: t(u.sprinting === "made" ? "Sprint.Made" : "Sprint.Missed", { note: roll.note }) };
  },
  costOf(action) {
    return action.economy === "free" ? {} : { action: 1 };
  },
  basicAction: { action: 1 },
  talkCost: { action: 1 },
  /** A playstyle's taunt: an action roll, the spotlight's one. */
  tauntCost: { action: 1 },
  stealCost: { action: 1 },
  feintCost: {},
  standCost(u) {
    return { move: Math.ceil((u.spec.speeds?.walk ?? 30) / 2) };
  },
  /**
   * Nobody gets a free strike at a foe that moves off: Daggerheart has none (a feature may say otherwise). A reaction
   * feature of its own (an adversary's Thorny Armor) answers one thing a round.
   */
  reactions(u) {
    return u?.spec?.reactions?.length ? 1 : 0;
  },
  opportunity() {
    return null;
  },

  /* The fight -------------------------------------------------------------- */
  /** A player character's Hope, Stress and Armor Slots; anyone's Stress. */
  initUnit(u) {
    u.handoff = false;
    u.scarred = false;
    u.deathMove = null;
    u.armorMarked = 0;
  },
  /** The GM's Fear (the planner's, else one for each player character) and how freely it's spent. */
  initRun(run) {
    const asked = run.prep.options.system ?? {};
    const pcs = run.units.filter(isPc).length;
    run.sharedPools.fear = clamp(Number.isFinite(asked.fear) ? asked.fear : pcs, 0, FEAR_MAX);
    run.fearStart = run.sharedPools.fear;
    run.dh = { spending: FEAR_SPENDING[asked.spending] ? asked.spending : "steady", gmTurns: 0, lastUp: new Map() };
    // A companion and its partner, where it's on the field: the partner rolls for it.
    for ( const u of run.units ) {
      if ( u.spec.companionRoll ) u.partner = run.units.find(o => o.id === u.spec.flags?.masterId && isPc(o)) ?? null;
    }
    // Minions of a kind, on a side: the ones that fall with one struck hard enough (Minion (X)).
    const kinds = new Map();
    for ( const u of run.units ) {
      if ( u.spec.adversaryType !== "minion" ) continue;
      const key = `${u.side}|${u.spec.kinKey ?? u.spec.name}`;
      if ( !kinds.has(key) ) kinds.set(key, []);
      kinds.get(key).push(u);
      u.kin = kinds.get(key);
    }
  },
  /**
   * The spotlight, for a round: each player character in turn (the order the dice set), a GM turn after any whose
   * action roll failed or went with Fear; then the party's other friends. Without player characters able to act,
   * everyone in turn.
   */
  *roundTurns(run, order) {
    // (A reaction feature answers one thing each round, spotlit or not: an adversary may wait rounds for the GM.)
    for ( const u of run.units ) if ( u.spec.reactions?.length ) u.reactionsLeft = daggerheartRules.reactions(u);
    const pcs = order.filter(isPc);
    if ( !pcs.some(u => u.active && u.status === STATUS.STANDING) ) {
      yield* order;
      return;
    }
    for ( const pc of pcs ) {
      pc.handoff = false;
      yield pc;
      if ( pc.handoff ) yield* gmTurn(run, order);
    }
    // (Friends of the party who aren't player characters, and anyone not in the fight yet: at the end of the round.)
    const party = new Set(pcs.map(u => u.side));
    for ( const u of [...order] ) if ( !isPc(u) && (party.has(u.side) || !u.active) ) yield u;
  },

  /**
   * A live battle's next spotlight, as the GM would likely give it (FastFighting suggests it, and gives it when it plays
   * everyone): after a player character whose roll failed or went with Fear, the adversary that has waited longest;
   * otherwise the next player character in turn after the last to have it. With no player character able to act, the
   * next one in turn. `up`: each one's last turn, by turn number.
   */
  nextSpotlight(run, { last = null, up = {} } = {}) {
    const order = run.order;
    const able = u => u.active && u.status === STATUS.STANDING;
    const pcs = order.filter(u => isPc(u) && able(u));
    if ( !pcs.length ) return nextIn(order.filter(able), last, order);
    if ( last && isPc(last) && last.handoff ) {
      const waited = u => up[u.id] ?? -1;
      const gm = gmUnits(run, order).reduce((best, u) => (!best || waited(u) < waited(best) ? u : best), null);
      if ( gm ) return gm;
    }
    const lastPc = order.filter(isPc).reduce((best, u) => ((up[u.id] ?? -1) > (best ? up[best.id] ?? -1 : -1) ? u : best), null);
    return nextIn(pcs, lastPc, order);
  },

  /* Rolls ----------------------------------------------------------------- */
  /** Player characters (and their companions) roll the Duality Dice; everyone else a d20. */
  dieOf(u) {
    return rollsDuality(u) ? DUALITY : 20;
  },
  roll(rng, mod, dc, options = {}) {
    const u = options.roller ?? null;
    if ( options.faces !== DUALITY ) return rollD20(rng, mod, dc, { advantage: options.advantage, critOn: options.critOn ?? 20 });
    const reaction = options.kind === "save";
    const experience = u ? experienceFor(rng, u, mod, dc, options, reaction) : null;
    const roll = rollDuality(rng, mod + (experience?.value ?? 0), dc, { advantage: options.advantage, reaction, crit: !!u?.lastStand });
    if ( experience ) roll.experience = experience;
    // (A companion's Hope is its partner's; its Fear, the GM's.)
    if ( u && !reaction ) settle(u.partner ?? u, roll);
    roll.note = noteOf(roll, reaction);
    return roll;
  },
  distribution(mod, dc, { advantage = 0, kind = "check", faces = 20, critOn = null } = {}) {
    if ( faces === DUALITY ) return dualityChances(mod, dc, { advantage, reaction: kind === "save" });
    return d20Chances(mod, dc, { advantage, critOn: critOn ?? 20 });
  },
  /** Only for a total changed after the dice: a duality roll succeeds on the total; a d20 also on its critical. */
  degreeOfSuccess(natural, total, dc, kind, die) {
    if ( die?.faces === DUALITY ) return total >= dc ? 2 : 1;
    return natural >= (die?.critOn ?? 20) ? 3 : total >= dc ? 2 : 1;
  },
  attackPenalty() {
    return 0;
  },
  /** A point on the Duality Dice (2d12) is worth more than one on a d20, near the middle. */
  rollPoint: 0.1,
  minimumDamage: 0,
  /** A reaction roll that succeeds avoids it, or (when the feature says so) takes half. */
  saveMultiplier(degree, save) {
    return degree >= 2 ? (save?.half ? 0.5 : 0) : 1;
  },
  /** Critical damage: the damage as rolled, and the most its dice could show on top. */
  critical(parts) {
    return (parts ?? []).map(p => ({ ...p, flat: p.flat + p.dice.reduce((s, { n, faces }) => s + (n > 0 ? n * faces : 0), 0) }));
  },

  /* Harm ------------------------------------------------------------------ */
  /**
   * The Hit Points a hit marks. `iwr.dh`: {thresholds: {major, severe}, physical/magical: {resistance, immunity,
   * reduction}, reduce: {physical, magical} (steps a feature takes off), minorImmune, massive, armor (its slots),
   * minion (X), multiplier}. With `target` (the fight itself), Armor Slots are marked and Stress taken; without (an
   * estimate), a character with slots is reckoned to mark one against Major or worse.
   */
  applyIwr(iwr, byType, target = null, { direct = false } = {}) {
    const dh = iwr?.dh;
    let raw = 0;
    let stress = 0;
    let steps = 0;
    for ( const [type, amount] of Object.entries(byType ?? {}) ) {
      if ( !(amount > 0) ) continue;
      if ( type === "stress" ) {
        stress += amount;
        continue;
      }
      const r = dh?.[type] ?? {};
      if ( r.immunity || iwr?.immune?.includes(type) ) continue;
      const halved = r.resistance ? Math.floor(amount / 2) : amount;
      raw += Math.max(0, halved - (Number(r.reduction) || 0));
      steps = Math.max(steps, Number(dh?.reduce?.[type]) || 0);
    }
    if ( !dh ) return raw + stress;
    // (A companion marks a Stress for any damage, whatever it is: its Stress is its Hit Points here.)
    if ( dh.companion ) return (raw > 0 ? 1 : 0) + stress;
    let marks = marksFor(raw, dh.thresholds, { massive: dh.massive });
    if ( dh.minion && raw > 0 && target ) target.minionOverflow = Math.floor(raw / dh.minion);
    marks = Math.max(0, marks - steps);
    if ( marks === 1 && dh.minorImmune ) marks = 0;
    // (Direct damage: no Armor Slot lessens it.)
    if ( !direct && target ) {
      if ( marksArmor(target, marks) ) {
        target.resources.armor -= 1;
        target.armorMarked = (target.armorMarked ?? 0) + 1;
        marks -= 1;
      }
    } else if ( !direct && dh.armor > 0 && marks >= 2 ) marks -= 1;
    marks = Math.round(marks * (dh.multiplier ?? 1));
    // Stress: what it can't mark, it marks as Hit Points.
    if ( stress > 0 ) {
      if ( !target ) marks += 0.3 * stress;
      else {
        const can = Math.min(stress, Math.max(0, target.resources.stress ?? 0));
        if ( Number.isFinite(target.resources.stress) ) target.resources.stress -= can;
        marks += stress - can;
      }
    }
    return marks;
  },

  /** A Horde's full attack while it has marked under half its Hit Points; its lesser one after. */
  usable(run, u, action) {
    if ( !action.horde || !u.spec.hordeHp ) return true;
    const marked = u.maxHp - Math.max(0, u.hp);
    return action.horde === "full" ? marked < u.spec.hordeHp : marked >= u.spec.hordeHp;
  },

  /* A fall from a height, a collision -------------------------------------- */
  /**
   * A fall (over a ledge, shoved: the core's forced movement), by the range it falls, in feet by the system's ranges
   * (the SRD's guide): from Very Close range 1d10+3 physical damage, from Close 1d20+5, from Far or farther 1d100+15
   * (that the GM may say it kills outright isn't played). Its Hit Points marked as for any hit, an Armor Slot and all.
   */
  fallDamage(feet) {
    if ( !(feet > 0) ) return [];
    const [faces, flat] = feet <= RANGES.veryClose ? [10, 3] : feet <= RANGES.close ? [20, 5] : [100, 15];
    return [part([{ n: 1, faces }], flat, "physical")];
  },
  /** Daggerheart has no prone: nobody lands that way. */
  fallProne: false,
  /**
   * A collision (the core's forced movement, stopped short by a wall or by someone in the way): the SRD's guide, for
   * one that collides at a dangerous speed, is 1d20+5 direct physical damage (no Armor Slot lessens it). Here that's a
   * knockback (an adversary's feature: actions.js marks its move so); a shove or a pull isn't that fast. A feature's own
   * collision damage, on its move, comes first. Only the one moved takes it: the SRD says nothing of whoever it hits.
   */
  collisionDamage(t, { move = null } = {}) {
    if ( Array.isArray(move?.collision) ) return move.collision;
    return move?.knockback ? [{ ...part([{ n: 1, faces: 20 }], 5, "physical"), direct: true }] : [];
  },

  /* Falling ---------------------------------------------------------------- */
  /**
   * Adversaries are defeated (beaten: the table decides what that means; one who would kill, kills); a player character
   * makes its death move. Struck while out cold from Avoid Death (a Cruel foe finishing it: homebrew, the SRD doesn't
   * say), it rolls the Duality Dice: Fear higher, it dies; otherwise it hangs on, still out cold.
   */
  onDropped(c, { model = DOWNED_MODELS.SIMULATE, rng = null } = {}) {
    c.hp = Math.min(0, c.hp);
    if ( !isPc(c) ) {
      c.status = STATUS.BEATEN;
      // Minion (X): each X damage, another of its kind falls with it.
      const more = c.minionOverflow ?? 0;
      c.minionOverflow = 0;
      if ( more > 0 && c.kin ) {
        const fallen = c.kin.filter(o => o !== c && o.status === STATUS.STANDING && o.active).slice(0, more);
        for ( const o of fallen ) {
          o.hp = 0;
          o.status = STATUS.BEATEN;
        }
        if ( fallen.length ) c.fallNote = t("Minion.More", { names: fallen.map(o => o.spec.name).join(", "), n: fallen.length });
      }
      return c.status;
    }
    // (Already on its last stand: it fights on until its last action is done.)
    if ( c.lastStand ) {
      c.hp = 0;
      return c.status;
    }
    if ( c.status === STATUS.DOWN ) {
      if ( !rng ) return c.status;
      const hope = rng.die(12);
      const fear = rng.die(12);
      if ( fear > hope ) c.status = STATUS.DEAD;
      c.fallNote = t(fear > hope ? "DeathMove.Finished" : "DeathMove.HangsOn", { hope, fear });
      return c.status;
    }
    if ( model === DOWNED_MODELS.DEAD ) {
      c.status = STATUS.DEAD;
      return c.status;
    }
    if ( model === DOWNED_MODELS.OUT || !rng ) {
      c.status = STATUS.DOWN;
      c.stable = true;
      return c.status;
    }
    const move = deathMoveOf(c);
    c.deathMove = move;
    if ( move === "blaze" ) {
      c.hp = 0;
      c.lastStand = { turns: 1, label: systemWord("DAGGERHEART.CONFIG.DeathMoves.blazeOfGlory.name", "DeathMove.blaze") };
      c.dhNote = t("DeathMove.BlazeNote");
      return c.status;
    }
    if ( move === "risk" ) {
      const hope = rng.die(12);
      const fear = rng.die(12);
      if ( fear > hope ) {
        c.status = STATUS.DEAD;
        c.fallNote = t("DeathMove.RiskDies", { hope, fear });
        return c.status;
      }
      if ( hope === fear ) {
        c.hp = c.maxHp;
        if ( Number.isFinite(c.resources.stress) ) c.resources.stress = c.spec.stressMax ?? c.resources.stress;
      } else c.hp = Math.min(c.maxHp, hope);
      c.dhNote = t(hope === fear ? "DeathMove.RiskAll" : "DeathMove.RiskLives", { hope, fear, n: c.hp });
      return c.status;
    }
    // Avoid Death: out cold (open to a finishing blow until a friend tends it); its Hope die at or under its level, a scar.
    c.status = STATUS.DOWN;
    c.stable = false;
    const die = rng.die(12);
    c.scarred = die <= (c.spec.level ?? 1);
    c.fallNote = t(c.scarred ? "DeathMove.AvoidScar" : "DeathMove.Avoid", { n: die });
    return c.status;
  },
  onHealed(c, amount) {
    heal(c, amount);
  },
  /** Out cold, a character lies as it is until someone tends it or clears its Hit Points: no rolls of its own. */
  recoveryCheck() {
    return null;
  },
  /**
   * Tending a friend out cold (homebrew: the SRD leaves it to the table): an Instinct or Knowledge action roll against
   * Difficulty 12. A success keeps it safe from a finishing blow; a critical clears a Hit Point, and it gets up.
   */
  firstAidDC() {
    return 12;
  },
  firstAid(target, degree) {
    if ( degree >= 2 ) target.stable = true;
    if ( degree === 3 ) heal(target, 1);
  },
  /** Sizing a foe up (a Lore-Collector's Analyze or Perceive): against its Difficulty. */
  sizeUpDC(target) {
    return target.spec.defenses?.ac ?? 12;
  },
  /** Hidden ends when it attacks. */
  afterRoll(run, u, roll, ctx) {
    if ( ctx?.kind === "attack" && u.conds?.hidden ) dropCondition(u, "hidden");
  },
  /** A wooden door: Smash it (Strength) or Tinker with its lock (Finesse), Difficulty 12, or break it down (12 damage). */
  door: { ac: 10, hp: 12, threshold: 0, forceDC: 12, pickDC: 12 },
  doorCosts: { open: {}, force: { action: 1 }, pick: { action: 1 } },
  /** A death move that kept it on its feet (Risk It All, Blaze of Glory), said once the hit is done. */
  afterHarm(run, u) {
    if ( !u.dhNote ) return null;
    const text = u.dhNote;
    u.dhNote = null;
    return { text };
  },

  /* Breaking free --------------------------------------------------------- */
  /**
   * The sheet's Restrained, with nothing of the engine's behind it (put on by the GM, or by the system): a temporary
   * condition, broken with an action (breakFree), its own or a friend's beside it. Who laid it isn't known, so it's as
   * hard as what's typical for its tier (12 in tier 1, as this module's other Difficulties the SRD leaves to the GM).
   * One hold for the engine's two keys for it (restrained, and immobilized: the same Restrained).
   */
  escapeFrom(run, u, key) {
    if ( !CONDITION_KEYS.restrained.includes(key) ) return null;
    if ( key !== "restrained" && u.baseConds?.restrained > 0 ) return null;
    return { dc: daggerheartRules.typical.dc(u.spec.level), others: "check" };
  },
  /** FastFighting's improvised bonds (homebrew: Daggerheart has none): two harder than its tier's typical, 14 in tier 1. */
  bondsDC(u) {
    return daggerheartRules.typical.dc(u.spec.level) + 2;
  },
  /** A try at breaking free: the spotlight's action (an adversary's spotlight, spent on it). */
  escapeCost() {
    return { action: 1 };
  },
  /** Freeing a friend beside it: the spotlight's action. */
  untieCost() {
    return { action: 1 };
  },
  /**
   * One try at a hold, by `who`: itself, or (freeing) a friend beside `held`. A player character or a companion makes
   * an action roll on the Duality Dice (Hope, Fear, the spotlight as any action roll's), its better trait for it
   * (spec.escapeWork: Strength or Agility out of a grip, Strength or Finesse for bonds or a friend), against the hold's
   * Difficulty (else what's typical for the held one's tier). An adversary clears a hold when the GM spotlights it, no
   * roll; its bonds take the d20 and its attack modifier. Bonds a friend unties are the core's (no roll). What comes
   * off with a hold broken (Restrained's immobilized too) is the core's.
   */
  breakFree(run, who, hold, { freeing = false, held = null } = {}) {
    if ( freeing && hold.others === "untie" ) return null;
    const bonds = hold.key === "bound";
    const dc = Number.isFinite(hold.dc) ? hold.dc : daggerheartRules.typical.dc((held ?? who).spec.level);
    if ( rollsDuality(who) ) {
      const work = (bonds || freeing ? who.spec.escapeWork?.bonds : who.spec.escapeWork) ?? {};
      const mod = Number(work.mod) || 0;
      const roll = daggerheartRules.roll(run.rng, mod, dc, { roller: who, faces: DUALITY, kind: "check" });
      return { success: roll.degree >= 2, degree: roll.degree, dc, said: { text: triedLine(roll, roll.total - roll.natural, dc, work.label) } };
    }
    if ( !bonds ) return { success: true };
    const mod = Number(who.spec.escapeWork?.mod) || 0;
    const roll = daggerheartRules.roll(run.rng, mod, dc, { roller: who, faces: 20, kind: "check" });
    return { success: roll.degree >= 2, degree: roll.degree, natural: roll.natural, mod, total: roll.total, dc };
  },
  /** Whether a creature tied up casts no spells: the world's setting (the SRD doesn't say which need free hands). */
  get tiedStopsSpells() {
    return tiedStopsSpells();
  },

  /* What's typical, by level --------------------------------------------- */
  typical: {
    ac: level => 11 + Math.ceil((Number(level) || 1) / 3),
    save: () => 1,
    skill: () => 1,
    dc: level => 11 + Math.ceil((Number(level) || 1) / 3)
  },

  /* Situations ------------------------------------------------------------ */
  modifiers: {
    exposed({ target }) {
      return !!target.conds?.vulnerable;
    },
    defense() {
      return 0;
    },
    /** Rolls against the Vulnerable have advantage; against the Hidden, disadvantage. */
    attack({ target }) {
      const advantage = (target.conds?.vulnerable ? 1 : 0) - (target.conds?.hidden ? 1 : 0);
      return { bonus: 0, advantage: Math.sign(advantage) };
    },
    save() {
      return { bonus: 0, advantage: 0 };
    },
    check() {
      return { bonus: 0, advantage: 0 };
    },
    steal() {
      return { bonus: 0, advantage: 0 };
    },
    actionsLost() {
      return 0;
    }
  },
  /** Immune to an effect when it's immune to every condition the effect lays (the sheet's condition immunities). */
  isImmune(target, action) {
    const immune = new Set(target.spec.conditionImmune ?? []);
    const conditions = [...(action.onSave ?? []), ...(action.onHit ?? []), action.outcome].filter(o => o && !o.self).flatMap(o => Object.keys(o.conditions ?? {}));
    const own = conditions.filter(k => ["vulnerable", "hidden", "restrained"].includes(k));
    return own.length > 0 && own.every(k => immune.has(k));
  },
  /** What a condition takes from a creature's fighting each round. */
  conditionWeight(key) {
    if ( key === "restrained" ) return 0.2;
    if ( key === "immobilized" ) return 0;
    return null;
  },
  conditionMods(key) {
    if ( key === "vulnerable" ) return { defAdv: 1 };
    if ( key === "hidden" ) return { defAdv: -1 };
    return null;
  },
  resistShare() {
    return 0.5;
  },

  /** What writing back needs beyond the core's: Hope, Stress, Armor Slots, the death move, a scar, and the GM's Fear. */
  capture(u) {
    return {
      hope: isPc(u) ? u.resources.hope ?? null : null,
      stress: Number.isFinite(u.resources.stress) ? u.resources.stress : null,
      armor: isPc(u) && Number.isFinite(u.resources.armor) ? u.resources.armor : null,
      armorMarked: u.armorMarked ?? 0,
      deathMove: u.deathMove ?? null,
      scarred: !!u.scarred,
      // (Consumables, as many as are left: "item:<id>".)
      items: Object.fromEntries(Object.entries(u.resources ?? {}).filter(([k]) => k.startsWith("item:"))),
      fear: u.sharedPools?.fear ?? null
    };
  },

  secondsPerRound: 6,
  /** A character's "retreat when hurt": with a Hit Point or two left. */
  retreatAt: 0.34,

  storyDamageType(type) {
    return type === "magical" ? "force" : type === "physical" ? "slashing" : type;
  },

  /** Daggerheart's Restrained: it can't move, but it can still act (the story's immobilized, not pinned and helpless). */
  storyCondition(key) {
    return key === "restrained" ? "immobilized" : null;
  }
};
