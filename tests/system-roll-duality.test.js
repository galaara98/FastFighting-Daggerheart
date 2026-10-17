/**
 * A roll the system made itself in a live battle (rollStrike's card): the engine takes its Duality Dice as they fell
 * (rules.asRolled), so Hope or Fear goes as the card shows, not as the engine's own dice would have had it.
 */
import { describe, expect, test } from "vitest";
import { daggerheartRules } from "../scripts/rules.js";
import { DUALITY } from "../scripts/dice.js";
import { parseFormula } from "../scripts/core.js";
import { beginRun, prepareBattle } from "../../FastFighting/scripts/engine/simulator.js";
import { rollCheck } from "../../FastFighting/scripts/engine/probability.js";

const minds = { tactical: { base: 70, fudge: 0 }, brave: { base: 60, fudge: 0 }, selfish: { base: 40, fudge: 0 }, loyal: { base: 60, fudge: 0 } };
const thresholds = { dh: { thresholds: { major: 8, severe: 16 }, physical: {}, magical: {}, reduce: {} } };

function setUp() {
  const hero = { id: "Brakka", name: "Brakka", side: "friendly", kind: "pc", duality: true, level: 1, hp: { value: 6, max: 6 }, hopeMax: 6, stressMax: 6, armorMax: 0,
    resources: { hope: 2, stress: 3, armor: 0 }, experiences: [], defenses: { ac: 11 }, initiative: { mod: 1 }, speeds: { walk: 30 },
    actions: [{ id: "Brakka.fist", name: "Fist", kind: "strike", bonus: 1, melee: true, reach: 5, damage: [parseFormula("1d4", "physical")] }],
    iwr: { immune: [], resist: {}, weak: {}, ...thresholds }, traits: minds, flags: {}, diesAtZero: false };
  const ogre = { id: "Ogre", name: "Ogre", side: "hostile", kind: "npc", level: 1, adversaryType: "bruiser", hp: { value: 8, max: 8 }, stressMax: 3, resources: { stress: 3 },
    defenses: { ac: 14 }, initiative: { mod: 0 }, speeds: { walk: 30 },
    actions: [{ id: "Ogre.club", name: "Club", kind: "strike", bonus: 1, melee: true, reach: 5, damage: [parseFormula("1d6", "physical")] }],
    iwr: { immune: [], resist: {}, weak: {}, ...thresholds }, traits: minds, flags: { fearless: true }, diesAtZero: true };
  const spec = { combatants: [hero, ogre], sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Foes", enemies: ["friendly"] } },
    options: { positioning: false, maxRounds: 4, talking: false, aftermath: "none", system: { fear: 2 } } };
  const run = beginRun(prepareBattle(spec, daggerheartRules), 1, { log: true });
  return { run, hero: run.byId.get("Brakka"), ogre: run.byId.get("Ogre") };
}

const rolled = (hope, fear, degree) => ({ degree, natural: hope + fear, total: hope + fear + 1, dice: { hope, fear } });
const asCard = (run, u, r) => rollCheck(daggerheartRules, run.rng, 1, 14, { faces: DUALITY, kind: "attack", roller: u, rolled: r });

describe("the system's Duality Dice, as its card shows them", () => {
  test("with Fear: the GM gains a Fear, the character no Hope, and the spotlight swings", () => {
    const { run, hero } = setUp();
    const roll = asCard(run, hero, rolled(3, 11, 2));
    expect(roll).toMatchObject({ degree: 2, natural: 14, total: 15, hope: 3, fear: 11, with: "fear" });
    expect(run.sharedPools.fear).toBe(3);
    expect(hero.resources.hope).toBe(2);
    expect(hero.handoff).toBe(true);
  });

  test("with Hope: a Hope; matching dice: a critical, a Hope and a Stress cleared", () => {
    const { run, hero } = setUp();
    asCard(run, hero, rolled(10, 4, 2));
    expect(hero.resources.hope).toBe(3);
    expect(run.sharedPools.fear).toBe(2);
    const crit = asCard(run, hero, rolled(6, 6, 3));
    expect(crit.with).toBe("crit");
    expect(hero.resources).toMatchObject({ hope: 4, stress: 4 });
  });

  test("an adversary's d20, or dice unread: the roll as it stands, nothing settled", () => {
    const { run, ogre } = setUp();
    const roll = rollCheck(daggerheartRules, run.rng, 1, 11, { faces: 20, kind: "attack", roller: ogre, rolled: { degree: 2, natural: 15, total: 16 } });
    expect(roll).toMatchObject({ degree: 2, natural: 15, total: 16 });
    expect(run.sharedPools.fear).toBe(2);
  });

  test("a reaction roll's (rollSave's card): neither Hope nor Fear, nor a critical's Stress; its critical only a success", () => {
    const { run, hero } = setUp();
    const save = r => rollCheck(daggerheartRules, run.rng, 1, 14, { faces: DUALITY, kind: "save", roller: hero, rolled: r });
    expect(save(rolled(6, 6, 2))).toMatchObject({ degree: 2, hope: 6, fear: 6, with: "crit" });
    save(rolled(2, 11, 2));
    save(rolled(10, 1, 2));
    expect(hero.resources).toMatchObject({ hope: 2, stress: 3 });
    expect(run.sharedPools.fear).toBe(2);
    expect(hero.handoff).toBeFalsy();
  });
});
