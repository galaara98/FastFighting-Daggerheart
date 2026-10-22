/**
 * What the core gained since API 19, as this helper takes it up: the Duality Dice shown as they are (the Hope die, the
 * Fear die, and the advantage or disadvantage d6 added or taken away); the dice the rules roll themselves shown too (a
 * Sprint, a death move's, a finishing blow's), the same draws as before; hidden from one foe at a time (the core's
 * hiddenFrom); what a character is like on the core's hidden scale (aptitudes, API 23); Speed Runner gone from the
 * core (Risk It All for DPS, Bone a Kiter); and the Statistics Engine's estimates spending no Armor Slot (API 25).
 */
import { describe, expect, test } from "vitest";
import { daggerheartRules, deathMoveOf } from "../scripts/rules.js";
import { DUALITY } from "../scripts/dice.js";
import { aptitudeBand, aptitudesOf } from "../scripts/traits.js";
import { daggerheartHints } from "../scripts/auto.js";
import { APTITUDES, STATUS, DOWNED_MODELS, parseFormula } from "../scripts/core.js";
import { rollCheck } from "../../FastFighting/scripts/engine/probability.js";
import { beginRun, beginRound, prepareBattle, runOne } from "../../FastFighting/scripts/engine/simulator.js";
import { meanDamageVs } from "../../FastFighting/scripts/engine/behavior/evaluate.js";
import { createRng, deriveSeed } from "../../FastFighting/scripts/engine/rng.js";
import { recordingRng } from "../../FastFighting/scripts/engine/table-rolls.js";
import { text } from "./foundry-i18n.js";

/** A recording rng whose dice come up as listed. */
const dice = (...values) => recordingRng({ ...createRng(1), die: () => values.shift() });
const diceOf = roll => roll.groups.map(g => [g.faces, g.results, g.sign, g.roll]);
const pc = (extra = {}) => ({ id: "pc", side: "friendly", status: STATUS.STANDING, active: true, hp: 0, maxHp: 6, resources: { hope: 2, stress: 3, armor: 3 }, sharedPools: { fear: 3 },
  spec: { name: "Brakka", duality: true, hopeMax: 6, stressMax: 6, armorMax: 3, experiences: [], level: 1, ...extra.spec }, ...extra.u });

describe("the Duality Dice, shown as they are", () => {
  test("the Hope die, the Fear die, and a disadvantage d6 taken away; the roll's modifier and total", () => {
    const rng = dice(9, 4, 3);
    const roll = rollCheck(daggerheartRules, rng, 2, 13, { faces: DUALITY, kind: "check", advantage: -1, by: "pc", label: "Agility" });
    expect(roll).toMatchObject({ hope: 9, fear: 4, extra: -3, total: 12, degree: 1 });
    const [shown] = rng.tray.rolls;
    expect(diceOf(shown)).toEqual([[12, [9], 1, 0], [12, [4], 1, 0], [6, [3], -1, 0]]);
    expect(shown.rolls).toEqual([{ mod: 2, total: 12 }]);
  });

  test("with advantage the d6 is added; with neither, the two d12s alone", () => {
    const rng = dice(5, 5, 6, 7, 2);
    rollCheck(daggerheartRules, rng, 0, 10, { faces: DUALITY, kind: "check", advantage: 1 });
    rollCheck(daggerheartRules, rng, 1, 10, { faces: DUALITY, kind: "check" });
    expect(rng.tray.rolls.map(diceOf)).toEqual([[[12, [5], 1, 0], [12, [5], 1, 0], [6, [6], 1, 0]], [[12, [7], 1, 0], [12, [2], 1, 0]]]);
  });

  test("the same draws as before: a plain rng rolls just as it did, and records nothing", () => {
    const options = { faces: DUALITY, kind: "check", advantage: 1 };
    const a = daggerheartRules.roll(createRng(4), 1, 12, options);
    const b = daggerheartRules.roll(recordingRng(createRng(4)), 1, 12, options);
    expect(b).toEqual(a);
  });
});

describe("the dice the rules roll themselves, shown", () => {
  test("Risk It All: the Hope and Fear dice, each a roll of its own", () => {
    const rng = dice(5, 2);
    const c = pc({ spec: { playstyles: ["dps"] } });
    daggerheartRules.onDropped(c, { model: DOWNED_MODELS.SIMULATE, rng });
    expect(c.hp).toBe(5);
    expect(rng.tray.rolls).toEqual([expect.objectContaining({ by: "pc", kind: "other", label: text("FFDAGGERHEART.DeathMove.risk"), rolls: [{ mod: 0, total: 5 }, { mod: 0, total: 2 }] })]);
  });

  test("Avoid Death's Hope die (a scar at or under its level); struck while out cold, the Duality Dice", () => {
    const rng = dice(1, 3, 9);
    const c = pc({ spec: { playstyles: ["wallflower"] } });
    daggerheartRules.onDropped(c, { model: DOWNED_MODELS.SIMULATE, rng });
    expect([c.status, c.scarred]).toEqual([STATUS.DOWN, true]);
    daggerheartRules.onDropped(c, { model: DOWNED_MODELS.SIMULATE, rng });
    expect(c.status).toBe(STATUS.DEAD);
    expect(rng.tray.rolls.map(r => [r.label, r.dice.map(d => d.result)])).toEqual([
      [text("FFDAGGERHEART.DeathMove.avoid"), [1]], [text("FFDAGGERHEART.Rolls.StruckDown"), [3, 9]]
    ]);
  });

  test("a Sprint: the character's Agility roll, as the core rolls it, shown as a Sprint", () => {
    const traits = { tactical: { base: 60, fudge: 0 }, brave: { base: 70, fudge: 0 }, selfish: { base: 30, fudge: 0 }, loyal: { base: 70, fudge: 0 } };
    const hero = {
      id: "brakka", name: "Brakka", side: "friendly", kind: "pc", duality: true, level: 1, hp: { value: 6, max: 6 }, hopeMax: 6, stressMax: 6, armorMax: 3,
      resources: { hope: 2, stress: 6, armor: 3 }, defenses: { ac: 11 }, initiative: { mod: 1 }, speeds: { walk: 30 }, position: { x: 0, y: 0, size: 5 },
      sprint: { range: 100, mod: 2 }, behavior: { rush: 1 }, actions: [], iwr: { immune: [], resist: {}, weak: {} }, traits, flags: {}, diesAtZero: false
    };
    const foe = { ...hero, id: "orc", name: "Orc", side: "hostile", kind: "npc", duality: false, sprint: null, behavior: {}, position: { x: 100, y: 0, size: 5 }, diesAtZero: true };
    const run = beginRun(prepareBattle({ combatants: [hero, foe], sides: { friendly: { label: "P", enemies: ["hostile"] }, hostile: { label: "F", enemies: ["friendly"] } },
      options: { positioning: true, maxRounds: 3, talking: false } }, daggerheartRules), 1, { log: true });
    beginRound(run, 1);
    run.rng = dice(8, 3);
    const u = run.byId.get("brakka");
    daggerheartRules.startTurn(run, u);
    expect(u.sprinting).toBe("made");
    expect(run.rng.tray.rolls).toEqual([expect.objectContaining({ by: "brakka", label: text("FFDAGGERHEART.Rolls.Sprint"), dc: 12, total: 13 })]);
  });
});

describe("hidden from one foe at a time", () => {
  test("striking at the hidden, disadvantage; once the striker has found it, none", () => {
    const hider = { id: "h", conds: { hidden: 1 }, spec: {} };
    const striker = { id: "s", conds: {}, spec: {} };
    expect(daggerheartRules.modifiers.attack({ target: hider, attacker: striker }).advantage).toBe(-1);
    hider.foundBy = new Set(["s"]);
    expect(daggerheartRules.modifiers.attack({ target: hider, attacker: striker }).advantage).toBe(0);
    // (Not from the condition itself: it's hidden from some, not all.)
    expect(daggerheartRules.conditionMods("hidden")).toBeNull();
  });
});

describe("aptitudes, and Speed Runner gone", () => {
  test("a trait on the scale: -1 1, +0 2, +1 and +2 3, +3 4", () => {
    expect([-2, -1, 0, 1, 2, 3, 4].map(aptitudeBand)).toEqual([0, 1, 2, 3, 3, 4, 4]);
    const apt = aptitudesOf({ agility: 2, strength: -1, finesse: 1, instinct: 0, presence: 1, knowledge: 3 });
    expect(apt).toEqual({ smart: 4, strong: 1, fast: 3, wise: 2, charismatic: 3 });
    expect(Object.keys(apt).sort()).toEqual([...APTITUDES].sort());
  });

  test("DPS (Speed Runner, as stored now) risks it all; the Bone domain leans Kiter", () => {
    expect(deathMoveOf({ spec: { playstyles: ["dps"] } })).toBe("risk");
    expect(daggerheartHints({ pc: true, domains: ["bone"] })).toMatchObject({ kiter: 0.3 });
    expect(daggerheartHints({ pc: true, domains: ["bone"] })).not.toHaveProperty("speedRunner");
  });
});

describe("an estimate spends nothing (the core's ctx.estimate, API 25)", () => {
  const traits = { tactical: { base: 60, fudge: 0 }, brave: { base: 70, fudge: 0 }, selfish: { base: 30, fudge: 0 }, loyal: { base: 70, fudge: 0 } };
  const iwr = (major, severe, armor = 0) => ({ immune: [], resist: {}, weak: {}, dh: { thresholds: { major, severe }, physical: {}, magical: {}, reduce: {}, armor } });
  const hero = (id, y) => ({
    id, name: id, side: "friendly", kind: "pc", duality: true, level: 1, hp: { value: 6, max: 6 }, hopeMax: 6, stressMax: 6, armorMax: 3,
    resources: { hope: 2, stress: 6, armor: 3 }, defenses: { ac: 11 }, initiative: { mod: 1 }, speeds: { walk: 30 }, position: { x: 0, y, size: 5 },
    actions: [{ id: `${id}.sword`, name: "Longsword", kind: "strike", bonus: 2, melee: true, reach: 5, damage: [parseFormula("1d10+3", "physical")] }],
    iwr: iwr(8, 16, 3), traits, flags: {}, diesAtZero: false
  });
  const bandit = (id, y) => ({
    id, name: id, side: "hostile", kind: "npc", level: 1, adversaryType: "standard", hp: { value: 5, max: 5 }, stressMax: 3, resources: { stress: 3 },
    defenses: { ac: 12 }, initiative: { mod: 0 }, speeds: { walk: 30 }, position: { x: 10, y, size: 5 },
    actions: [{ id: `${id}.axe`, name: "Axe", kind: "strike", bonus: 1, melee: true, reach: 5, damage: [parseFormula("2d8+4", "physical")] }],
    iwr: iwr(8, 14), traits, flags: {}, diesAtZero: true
  });
  const spec = () => ({ combatants: [hero("brakka", 0), hero("isel", 10), bandit("b1", 0), bandit("b2", 10)],
    sides: { friendly: { label: "P", enemies: ["hostile"] }, hostile: { label: "F", enemies: ["friendly"] } },
    options: { positioning: true, maxRounds: 6, talking: false, system: { fear: 3, spending: "steady" } } });

  test("weighing a blow at a character marks none of its Armor Slots; a blow that lands still may", () => {
    const run = beginRun(prepareBattle(spec(), daggerheartRules), 1);
    beginRound(run, 1);
    const brakka = run.byId.get("brakka");
    meanDamageVs(run, run.byId.get("b1").spec.actions[0], brakka);
    expect(brakka.resources).toEqual({ hope: 2, stress: 6, armor: 3 });
    // (Severe: an Armor Slot marked takes it down to Major, 2 Hit Points.)
    expect(daggerheartRules.applyIwr(brakka.spec.iwr, { physical: 17 }, brakka)).toBe(2);
    expect(brakka.resources.armor).toBe(2);
  });

  test("a fight plays the same whatever fights came before it on the same prepared battle", () => {
    const one = prepareBattle(spec(), daggerheartRules);
    const all = Array.from({ length: 12 }, (_, i) => JSON.stringify(runOne(one, deriveSeed(17, i))));
    const other = prepareBattle(spec(), daggerheartRules);
    for ( let i = 1; i < 12; i += 3 ) expect(JSON.stringify(runOne(other, deriveSeed(17, i)))).toBe(all[i]);
  });
});
