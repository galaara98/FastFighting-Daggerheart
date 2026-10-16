/**
 * Daggerheart's rules: the Duality Dice and the d20, Hope and Fear, thresholds and Armor Slots, death moves, the
 * spotlight, the reaction roll against what takes hold of the body, and the system's actions as the engine plays them.
 */
import { describe, expect, test } from "vitest";
import { dualityChances, d20Chances, rollDuality, rollD20, DUALITY } from "../scripts/dice.js";
import { daggerheartRules, marksFor, deathMoveOf, FEAR_MAX } from "../scripts/rules.js";
import { toActionSpec, toReactionSpec, damagePartsOf, costOfAction, effectOf, RANGES } from "../scripts/actions.js";
import { deriveDaggerheartTraits, rankDaggerheartLeaders, isBeast } from "../scripts/traits.js";
import { replay } from "../../FastFighting/scripts/engine/simulator.js";
import { toughSave } from "../../FastFighting/scripts/engine/behavior/troubles.js";
import { saveRoll } from "../../FastFighting/scripts/engine/battle-state.js";
import { parseFormula, STATUS } from "../scripts/core.js";

/** Dice that come up as listed, then the last over and over. */
const fixed = (...rolls) => {
  let i = 0;
  return { die: () => rolls[Math.min(i++, rolls.length - 1)], chance: () => true, next: () => 0.5 };
};
const sum = a => a.reduce((s, p) => s + p, 0);

describe("the dice", () => {
  test("the Duality Dice: every chance accounted for; a match in twelve is critical; reaction rolls only succeed", () => {
    const d = dualityChances(3, 15);
    expect(sum(d)).toBeCloseTo(1, 10);
    expect(d[3]).toBeCloseTo(1 / 12, 10);
    expect(d[0]).toBe(0);
    expect(d.fear).toBeCloseTo(66 / 144, 10);
    const r = dualityChances(3, 15, { reaction: true });
    expect(r[3]).toBe(0);
    expect(r[2]).toBeCloseTo(d[2] + d[3], 10);
    // (Advantage adds a d6: likelier.)
    expect(dualityChances(3, 15, { advantage: 1 })[2]).toBeGreaterThan(d[2]);
  });

  test("an adversary's d20: its critical threshold, advantage the better of two", () => {
    const d = d20Chances(4, 14);
    expect(sum(d)).toBeCloseTo(1, 10);
    expect(d[3]).toBeCloseTo(1 / 20, 10);
    expect(d20Chances(4, 14, { critOn: 18 })[3]).toBeCloseTo(3 / 20, 10);
    expect(d20Chances(4, 14, { advantage: 1 })[2]).toBeGreaterThan(d[2]);
  });

  test("rolling: with Hope, with Fear, a critical", () => {
    expect(rollDuality(fixed(9, 4), 2, 13)).toMatchObject({ natural: 13, total: 15, degree: 2, with: "hope" });
    expect(rollDuality(fixed(3, 8), 2, 14)).toMatchObject({ total: 13, degree: 1, with: "fear" });
    expect(rollDuality(fixed(2, 2), 0, 20)).toMatchObject({ degree: 3, with: "crit" });
    expect(rollD20(fixed(20), 0, 30)).toMatchObject({ degree: 3 });
    expect(rollD20(fixed(12), 2, 14)).toMatchObject({ degree: 2 });
  });
});

const pc = (extra = {}) => ({ id: "pc", side: "friendly", status: STATUS.STANDING, active: true, resources: { hope: 2, stress: 6, armor: 3 }, sharedPools: { fear: 3 },
  spec: { name: "Brakka", duality: true, hopeMax: 6, stressMax: 6, armorMax: 3, experiences: [], level: 1, ...extra.spec }, ...extra.u });

describe("Hope and Fear", () => {
  test("a player character's action roll: with Hope a Hope; with Fear the GM a Fear and the spotlight; a critical a Hope and a Stress", () => {
    const u = pc();
    u.resources.stress = 4;
    daggerheartRules.roll(fixed(9, 4), 2, 13, { roller: u, faces: DUALITY, kind: "attack" });
    expect(u.resources.hope).toBe(3);
    expect(u.handoff).toBeFalsy();
    daggerheartRules.roll(fixed(3, 8), 2, 12, { roller: u, faces: DUALITY, kind: "attack" });
    expect(u.sharedPools.fear).toBe(4);
    expect(u.handoff).toBe(true);
    u.handoff = false;
    daggerheartRules.roll(fixed(6, 6), 0, 30, { roller: u, faces: DUALITY, kind: "check" });
    expect(u.resources).toMatchObject({ hope: 4, stress: 5 });
    expect(u.handoff).toBe(false);
  });

  test("a failure with Hope still hands the GM the spotlight; reaction rolls bring neither", () => {
    const u = pc();
    daggerheartRules.roll(fixed(8, 3), 0, 20, { roller: u, faces: DUALITY, kind: "attack" });
    expect(u.handoff).toBe(true);
    expect(u.resources.hope).toBe(3);
    const r = pc();
    daggerheartRules.roll(fixed(2, 9), 0, 5, { roller: r, faces: DUALITY, kind: "save" });
    expect(r.sharedPools.fear).toBe(3);
    expect(r.resources.hope).toBe(2);
  });

  test("Hope and Fear stop at their most", () => {
    const u = pc();
    u.resources.hope = 6;
    u.sharedPools.fear = FEAR_MAX;
    daggerheartRules.roll(fixed(9, 1), 0, 2, { roller: u, faces: DUALITY, kind: "attack" });
    daggerheartRules.roll(fixed(1, 9), 0, 2, { roller: u, faces: DUALITY, kind: "attack" });
    expect([u.resources.hope, u.sharedPools.fear]).toEqual([6, FEAR_MAX]);
  });

  test("an Experience for a Hope, before the dice, when it fits and it's worth it", () => {
    const u = pc({ spec: { experiences: [{ name: "Mercenary", value: 2 }] } });
    const roll = daggerheartRules.roll(fixed(6, 5), 1, 14, { roller: u, faces: DUALITY, kind: "attack" });
    expect(roll.experience).toEqual({ name: "Mercenary", value: 2 });
    expect(roll.total).toBe(14);
    // (A Hope spent, a Hope gained back: with Hope.)
    expect(u.resources.hope).toBe(2);
  });

  test("a companion's roll is its partner's: the Duality Dice, its Hope to the partner, its Experience for the partner's Hope", () => {
    const partner = pc();
    const fang = { id: "fang", resources: {}, sharedPools: partner.sharedPools, partner, spec: { name: "Fang", companionRoll: true, experiences: [{ name: "Tracker", value: 2 }] } };
    expect(daggerheartRules.dieOf(fang)).toBe(DUALITY);
    expect(daggerheartRules.dieOf({ spec: { name: "Bandit" } })).toBe(20);
    const roll = daggerheartRules.roll(fixed(6, 5), 1, 14, { roller: fang, faces: DUALITY, kind: "attack" });
    expect(roll.experience).toEqual({ name: "Tracker", value: 2 });
    // (The partner's Hope spent on the companion's Experience, and won back: with Hope.)
    expect(partner.resources.hope).toBe(2);
    expect(fang.resources.hope).toBeUndefined();
    daggerheartRules.roll(fixed(3, 8), 0, 12, { roller: fang, faces: DUALITY, kind: "attack" });
    expect(partner.sharedPools.fear).toBe(4);
  });

  test("adversaries roll a d20, and say nothing of Hope", () => {
    const roll = daggerheartRules.roll(fixed(15), 3, 12, { roller: { spec: { name: "Bandit" } }, faces: 20, kind: "attack" });
    expect(roll).toMatchObject({ natural: 15, total: 18, degree: 2 });
    expect(roll.note).toBeUndefined();
  });
});

describe("harm", () => {
  const dh = (extra = {}) => ({ dh: { thresholds: { major: 8, severe: 16 }, physical: {}, magical: {}, reduce: {}, armor: 3, ...extra } });

  test("thresholds: under Major 1, Major 2, Severe 3; twice Severe 4 with Massive Damage", () => {
    expect([0, 3, 8, 15, 16, 40].map(d => marksFor(d, { major: 8, severe: 16 }))).toEqual([0, 1, 2, 2, 3, 3]);
    expect(marksFor(32, { major: 8, severe: 16 }, { massive: true })).toBe(4);
  });

  test("resistance halves, immunity ignores, reduction comes off", () => {
    expect(daggerheartRules.applyIwr({ dh: { ...dh().dh, armor: 0, physical: { resistance: true } } }, { physical: 17 })).toBe(2);
    expect(daggerheartRules.applyIwr({ dh: { ...dh().dh, magical: { immunity: true } } }, { magical: 30 })).toBe(0);
    expect(daggerheartRules.applyIwr({ dh: { ...dh().dh, armor: 0, physical: { reduction: 3 } } }, { physical: 10 })).toBe(1);
  });

  test("an Armor Slot takes a hit down a step: always for Major or worse, for a Minor one while it has slots to spare", () => {
    const u = pc();
    expect(daggerheartRules.applyIwr(dh(), { physical: 17 }, u)).toBe(2);
    expect(u.resources.armor).toBe(2);
    expect(daggerheartRules.applyIwr(dh(), { physical: 3 }, u)).toBe(0);
    expect(u.resources.armor).toBe(1);
    expect(daggerheartRules.applyIwr(dh(), { physical: 3 }, u)).toBe(1);
    expect(u.resources.armor).toBe(1);
  });

  test("Stress damage marks Stress; what it can't, Hit Points", () => {
    const u = pc();
    u.resources.stress = 1;
    expect(daggerheartRules.applyIwr(dh(), { stress: 3 }, u)).toBe(2);
    expect(u.resources.stress).toBe(0);
  });

  test("a companion marks one Stress for any damage, whatever it is (its Stress is its Hit Points here)", () => {
    const companion = { dh: { companion: true, thresholds: {}, physical: {}, magical: {}, reduce: {} } };
    expect([1, 9, 30].map(n => daggerheartRules.applyIwr(companion, { physical: n }))).toEqual([1, 1, 1]);
    expect(daggerheartRules.applyIwr(companion, { magical: 4, physical: 4 })).toBe(1);
    expect(daggerheartRules.applyIwr(companion, { physical: 0 })).toBe(0);
    expect(daggerheartRules.applyIwr(companion, { stress: 2 }, { resources: {} })).toBe(2);
  });
});

describe("death moves", () => {
  const dying = (playstyles = [], brave = 50) => ({ ...pc(), hp: 0, maxHp: 6, prep: { traits: { brave } }, spec: { ...pc().spec, playstyles } });

  test("which one: as its playstyles lean, else its nerve", () => {
    expect(deathMoveOf(dying(["martyr"]))).toBe("blaze");
    expect(deathMoveOf(dying(["skeptic", "brawler"]))).toBe("avoid");
    expect(deathMoveOf(dying([], 85))).toBe("risk");
    expect(deathMoveOf(dying([]))).toBe("avoid");
  });

  test("Avoid Death: out cold (open to a finishing blow), a scar when the Hope die is at or under its level", () => {
    const u = dying(["fragile"]);
    daggerheartRules.onDropped(u, { rng: fixed(1) });
    expect(u).toMatchObject({ status: STATUS.DOWN, stable: false, scarred: true });
    const v = dying(["fragile"]);
    daggerheartRules.onDropped(v, { rng: fixed(7) });
    expect(v.scarred).toBe(false);
  });

  test("Risk It All: Hope higher, back up; Fear higher, death; matching, everything cleared", () => {
    const up = dying(["brawler"]);
    daggerheartRules.onDropped(up, { rng: fixed(4, 2) });
    expect(up).toMatchObject({ status: STATUS.STANDING, hp: 4 });
    const dead = dying(["brawler"]);
    daggerheartRules.onDropped(dead, { rng: fixed(2, 9) });
    expect(dead.status).toBe(STATUS.DEAD);
    const all = dying(["brawler"]);
    all.resources.stress = 0;
    daggerheartRules.onDropped(all, { rng: fixed(5, 5) });
    expect(all).toMatchObject({ status: STATUS.STANDING, hp: 6, resources: { stress: 6 } });
  });

  test("Blaze of Glory: one last action, a critical", () => {
    const u = dying(["martyr"]);
    daggerheartRules.onDropped(u, { rng: fixed(1) });
    expect(u).toMatchObject({ status: STATUS.STANDING, lastStand: { turns: 1 } });
    expect(daggerheartRules.roll(fixed(2, 9), 0, 30, { roller: u, faces: DUALITY, kind: "attack" }).degree).toBe(3);
  });
});

describe("the system's actions", () => {
  const longsword = { type: "attack", range: "melee", target: { type: "any", amount: 1 }, roll: { type: "attack", trait: "agility" },
    damage: { main: { type: ["physical"], applyTo: "hitPoints", value: { dice: "d10", bonus: 3, multiplier: "prof", flatMultiplier: 1 } } }, cost: [] };

  test("a weapon: its trait to hit, its Proficiency in dice", () => {
    const a = toActionSpec(longsword, { id: "w", label: "Longsword", pc: true, traits: { agility: 2 }, proficiency: 2, ranges: RANGES });
    expect(a).toMatchObject({ kind: "strike", bonus: 2, melee: true, reach: 5, damage: [{ dice: [{ n: 2, faces: 10 }], flat: 3, type: "physical" }] });
  });

  test("an adversary's: its attack modifier, its own count of dice, its range", () => {
    const daggers = { ...longsword, range: "far", roll: { type: "attack", bonus: "1" }, damage: { main: { type: ["physical"], value: { dice: "d8", bonus: 1, multiplier: "flat", flatMultiplier: 1 } } } };
    expect(toActionSpec(daggers, { id: "a", pc: false, attackBonus: 3, ranges: RANGES })).toMatchObject({ kind: "strike", bonus: 1, range: { increment: 60 }, damage: [{ dice: [{ n: 1, faces: 8 }], flat: 1 }] });
  });

  test("costs: Hope, Stress, the GM's Fear", () => {
    expect(costOfAction({ cost: [{ key: "hope", value: 3 }] })).toEqual({ resource: "hope", resourceCost: 3 });
    expect(costOfAction({ cost: [{ key: "fear", value: 1 }] })).toEqual({ resource: "fear", resourceCost: 1, shared: "fear" });
  });

  test("a reaction roll it forces: a save, or control when it only lays conditions", () => {
    const eruption = { type: "attack", range: "veryClose", target: { type: "any" }, save: { trait: "agility", difficulty: null, damageMod: "none" }, cost: [{ key: "stress", value: 1 }], effects: [{ _id: "e1" }], areas: [{ size: "veryClose" }] };
    const a = toActionSpec(eruption, { id: "x", pc: false, difficulty: 14, ranges: RANGES, effectsById: new Map([["e1", { statuses: ["vulnerable"], changes: [] }]]) });
    expect(a).toMatchObject({ kind: "control", save: { type: "agility", dc: 14 }, resource: "stress", area: { targets: 2 } });
    expect(a.onSave[1].conditions).toEqual({ vulnerable: 1 });
  });

  test("effects: roll and damage bonuses, the conditions it plays", () => {
    const e = effectOf({ effects: [{ _id: "a" }] }, new Map([["a", { statuses: ["restrained"], changes: [{ key: "system.bonuses.roll.bonus", value: "2" }] }]]));
    expect(e).toEqual({ conditions: { restrained: 1, immobilized: 1 }, mods: { attack: 2, checks: 2 } });
  });

  test("Stress damage is its own", () => {
    expect(damagePartsOf({ main: { applyTo: "stress", value: { custom: { enabled: true, formula: "1" } } } })).toEqual([parseFormula("1", "stress")]);
  });

  test("a flat count of no dice is its bonus alone (a Minion's 4 damage), as the system reads it", () => {
    const fixedHarm = n => ({ main: { type: ["physical"], applyTo: "hitPoints", value: { dice: "d6", bonus: 4, multiplier: "flat", flatMultiplier: n } } });
    expect(damagePartsOf(fixedHarm(0))).toEqual([parseFormula("4", "physical")]);
    expect(damagePartsOf(fixedHarm(null))).toEqual([parseFormula("4", "physical")]);
    expect(damagePartsOf(fixedHarm(2))).toEqual([parseFormula("2d6+4", "physical")]);
  });

  describe("a reaction feature's action", () => {
    const harm = (dice, bonus, extra = {}) => ({ main: { type: ["physical"], applyTo: "hitPoints", includeBase: false, value: { dice, bonus, multiplier: "flat", flatMultiplier: 1 }, ...extra } });
    const ctx = { id: "r", label: "Thorny Armor", difficulty: 14, ranges: RANGES };

    test("damage of its own answers being hurt: at whoever hurt it, within its range (or its area's), for its Stress, as often as it may", () => {
      const thorns = { type: "damage", range: "melee", target: { type: "any" }, cost: [{ key: "stress", value: 1 }], damage: harm("d10", 5) };
      expect(toReactionSpec(thorns, ctx)).toEqual({ id: "r", label: "Thorny Armor", on: "damaged", damage: [parseFormula("1d10+5", "physical")], resource: "stress", amount: 1, range: 5 });
      const splash = { type: "damage", range: "", areas: [{ size: "veryClose" }], target: { type: "any" }, cost: [], uses: { max: "1" }, damage: harm("d6", 0) };
      expect(toReactionSpec(splash, ctx)).toMatchObject({ on: "damaged", range: 15, uses: 1 });
      expect(toReactionSpec(splash, ctx).resource).toBeUndefined();
    });

    test("a reaction roll it forces with damage: avoided on a success against its Difficulty", () => {
      const quake = { type: "attack", range: "close", target: { type: "any" }, cost: [], save: { trait: "agility", difficulty: null, damageMod: "none" }, damage: harm("d8", 1) };
      expect(toReactionSpec(quake, ctx)).toMatchObject({ on: "damaged", save: { type: "agility", dc: 14 }, range: 30 });
    });

    test("not played: a standard attack back, damage on its own hit, one paid in Fear, one on itself, one without damage", () => {
      const strikeBack = { type: "attack", range: "veryClose", target: { type: "any", amount: 1 }, roll: { type: "attack" }, cost: [{ key: "stress", value: 1 }], damage: harm("d6", 0, { includeBase: true }) };
      const brutal = { type: "damage", target: { type: "any" }, cost: [{ key: "stress", value: 1 }], damage: harm("d6", 0, { includeBase: true }) };
      const bite = { type: "damage", target: { type: "any" }, cost: [{ key: "fear", value: 1 }], damage: harm("d12", 0) };
      const self = { type: "damage", target: { type: "self" }, cost: [], damage: harm("d6", 0) };
      const gainFear = { type: "healing", target: { type: "self" }, cost: [], damage: { resources: { fear: { applyTo: "fear" } } } };
      const lick = { type: "damage", target: { type: "any" }, cost: [], damage: { main: null, resources: { stress: { applyTo: "stress" } } } };
      for ( const a of [strikeBack, brutal, bite, self, gainFear, lick, null] ) expect(toReactionSpec(a, ctx)).toBe(null);
    });
  });
});

describe("personality and leaders", () => {
  test("a Solo is bold and fearless; motives of feeding make a beast", () => {
    expect(deriveDaggerheartTraits({ pc: false, type: "solo", tier: 2 })).toMatchObject({ traits: { brave: 90 }, flags: { fearless: true } });
    expect(isBeast("Burrow, drag away, feed, reposition")).toBe(true);
    expect(isBeast("Bully, command, profit")).toBe(false);
    // (A mind behind the hunger: a vampire feeds, a demon consumes; and a social, leader or support adversary is never
    // a mere beast.)
    expect(isBeast("Charm, deceive, feed")).toBe(false);
    expect(isBeast("Consume, fuel greed, sow dissent")).toBe(false);
    expect(isBeast("Devour, hunt, track", "leader")).toBe(false);
    expect(isBeast("Devour, hunt, track", "bruiser")).toBe(true);
  });

  test("a Leader leads; a character by its Presence", () => {
    const ranked = rankDaggerheartLeaders([{ id: "a", type: "standard", tier: 1 }, { id: "b", type: "leader", tier: 1 }, { id: "c", pc: true, presence: 2 }]);
    expect(ranked.map(r => r.id)).toEqual(["b", "c", "a"]);
  });
});

describe("a fight", () => {
  const evasive = { tactical: { base: 60, fudge: 0 }, brave: { base: 70, fudge: 0 }, selfish: { base: 30, fudge: 0 }, loyal: { base: 70, fudge: 0 } };
  const hero = (id, extra = {}) => ({
    id, name: id, side: "friendly", kind: "pc", duality: true, level: 1, hp: { value: 6, max: 6 }, hopeMax: 6, stressMax: 6, armorMax: 3,
    resources: { hope: 2, stress: 6, armor: 3 }, experiences: [{ name: "Soldier", value: 2 }],
    defenses: { ac: 11, agility: 2, strength: 1, finesse: 0, instinct: 1, presence: 0, knowledge: 0 }, initiative: { mod: 1 }, speeds: { walk: 30 },
    actions: [{ id: `${id}.sword`, name: "Longsword", kind: "strike", bonus: 2, melee: true, reach: 5, damage: [parseFormula("1d10+3", "physical")] }],
    iwr: { immune: [], resist: {}, weak: {}, dh: { thresholds: { major: 8, severe: 16 }, physical: {}, magical: {}, reduce: {}, armor: 3 } },
    traits: evasive, flags: {}, diesAtZero: false, ...extra
  });
  const bandit = id => ({
    id, name: id, side: "hostile", kind: "npc", level: 1, adversaryType: "standard", hp: { value: 5, max: 5 }, stressMax: 3, resources: { stress: 3 },
    defenses: { ac: 12 }, initiative: { mod: 0 }, speeds: { walk: 30 },
    actions: [{ id: `${id}.daggers`, name: "Daggers", kind: "strike", bonus: 1, melee: true, reach: 5, damage: [parseFormula("1d8+1", "physical")] }],
    iwr: { immune: [], resist: {}, weak: {}, dh: { thresholds: { major: 8, severe: 14 }, physical: {}, magical: {}, reduce: {} } },
    traits: evasive, flags: { fearless: true }, diesAtZero: true
  });
  const battle = (combatants, options = {}) => ({ combatants, sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Bandits", enemies: ["friendly"] } },
    options: { positioning: false, maxRounds: 10, talking: false, ...options } });

  test("the spotlight swings to the GM, Hope and Fear are won and spent, and someone wins", () => {
    let gmTurns = 0;
    let fearNotes = 0;
    let decided = 0;
    for ( let seed = 1; seed <= 20; seed++ ) {
      const r = replay(battle([hero("Brakka"), hero("Tovin"), bandit("B1"), bandit("B2"), bandit("B3")], { system: { fear: 2, spending: "steady" } }), daggerheartRules, seed);
      gmTurns += r.log.filter(e => e.type === "spotlight").length;
      fearNotes += r.log.filter(e => e.type === "attack" && e.side === "friendly" && e.note).length;
      if ( r.outcome === "victory" ) decided += 1;
    }
    expect(gmTurns).toBeGreaterThan(0);
    expect(fearNotes).toBeGreaterThan(0);
    expect(decided).toBeGreaterThan(15);
  });

  test("a reaction feature answers the blows that hurt it, once a round, for its Stress; nobody else reacts", () => {
    expect(daggerheartRules.reactions({ spec: {} })).toBe(0);
    const thorny = id => ({ ...bandit(id), reactions: [{ id: `${id}.thorns`, label: "Thorny Armor", on: "damaged", damage: [parseFormula("1d10+5", "physical")], resource: "stress", amount: 1, range: 5 }] });
    expect(daggerheartRules.reactions({ spec: thorny("B1") })).toBe(1);
    let answered = 0;
    let stressSpent = 0;
    for ( let seed = 1; seed <= 10; seed++ ) {
      const r = replay(battle([hero("Brakka"), thorny("B1")], { system: { fear: 0 } }), daggerheartRules, seed);
      const thorns = r.log.filter(e => e.type === "reaction" && e.reaction === "Thorny Armor");
      answered += thorns.length;
      expect(thorns.every(e => e.trigger === "damaged" && e.target === "Brakka")).toBe(true);
      expect(new Set(thorns.map(e => e.round)).size).toBe(thorns.length);
      stressSpent += 3 - (r.units.B1.final?.system?.stress ?? r.units.B1.resources?.stress ?? 3);
    }
    expect(answered).toBeGreaterThan(0);
    expect(stressSpent).toBeGreaterThan(0);
  });

  test("a companion fights beside its partner, on the Duality Dice, its Hope going to the partner", () => {
    const fang = { id: "Fang", name: "Fang", side: "friendly", kind: "companion", companionRoll: true, level: 1, hp: { value: 3, max: 3 }, resources: {}, experiences: [],
      defenses: { ac: 12 }, initiative: { mod: 0 }, speeds: { walk: 30 },
      actions: [{ id: "Fang.attack", name: "Bite", kind: "strike", bonus: 2, melee: true, reach: 5, damage: [parseFormula("1d8", "physical")] }],
      iwr: { immune: [], resist: {}, weak: {}, dh: { companion: true, thresholds: {}, physical: {}, magical: {}, reduce: {} } },
      traits: evasive, flags: { masterId: "Brakka" }, diesAtZero: false };
    let bites = 0;
    let dualityNotes = 0;
    for ( let seed = 1; seed <= 10; seed++ ) {
      const r = replay(battle([hero("Brakka"), { ...fang }, bandit("B1"), bandit("B2")], { system: { fear: 1 } }), daggerheartRules, seed);
      const mine = r.log.filter(e => e.type === "attack" && e.actorId === "Fang");
      bites += mine.length;
      dualityNotes += mine.filter(e => e.note).length;
    }
    expect(bites).toBeGreaterThan(0);
    expect(dualityNotes).toBe(bites);
  });

  test("adversaries act only on GM turns: never more often than the party's failures and Fear allow", () => {
    const r = replay(battle([hero("Brakka"), bandit("B1"), bandit("B2")], { system: { fear: 0, spending: "sparing" } }), daggerheartRules, 3);
    const rounds = r.rounds;
    const banditAttacks = r.log.filter(e => e.type === "attack" && e.side === "hostile").length;
    const heroRolls = r.log.filter(e => e.type === "attack" && e.side === "friendly").length;
    expect(banditAttacks).toBeLessThanOrEqual(heroRolls);
    expect(rounds).toBeGreaterThan(0);
  });
});

describe("against something taking hold of the body", () => {
  test("a Strength reaction roll (the core's toughSave, as for a sickness spreading): the character's Strength", () => {
    const u = { id: "u", spec: { level: 1, defenses: { ac: 12, strength: 2, instinct: 1 } }, mods: {} };
    const run = { prep: { rules: daggerheartRules }, units: [u] };
    expect(toughSave(run, u)).toBe("strength");
    expect(saveRoll(run, u, toughSave(run, u)).mod).toBe(2);
  });
});
