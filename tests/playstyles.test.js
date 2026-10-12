/**
 * Every playstyle perk with an effect in Daggerheart: the tactics that say how freely Hope and Armor Slots go, adversaries
 * defeated (and killed by those who would), a character struck while out cold, tending it, sizing a foe up, the trait
 * moves (Grapple, Maneuver, Hide), Help an Ally, gold and gear, weak spots.
 */
import { describe, expect, test } from "vitest";
import { daggerheartRules } from "../scripts/rules.js";
import { DUALITY } from "../scripts/dice.js";
import { traitMoves, helpAnAlly, toActionSpec, RANGES } from "../scripts/actions.js";
import { goldValue, weakSpot } from "../scripts/adapter.js";
import { replay } from "../../FastFighting/scripts/engine/simulator.js";
import { combinePlaystyles } from "../../FastFighting/scripts/engine/playstyles.js";
import { parseFormula, STATUS } from "../scripts/core.js";

const fixed = (...rolls) => {
  let i = 0;
  return { die: () => rolls[Math.min(i++, rolls.length - 1)], chance: () => true, next: () => 0.5 };
};
const pc = (extra = {}) => ({ id: "pc", side: "friendly", status: STATUS.STANDING, active: true, hp: 0, maxHp: 6, resources: { hope: 2, stress: 6, armor: 3 }, sharedPools: { fear: 3 },
  prep: { traits: { brave: 50 } }, spec: { name: "Wren", duality: true, hopeMax: 6, stressMax: 6, armorMax: 3, experiences: [], level: 1, playstyles: [], ...extra.spec }, ...extra.u });
const dh = { dh: { thresholds: { major: 8, severe: 16 }, physical: {}, magical: {}, reduce: {}, armor: 3 } };

describe("tactics, as Daggerheart reads them", () => {
  test("its shield tactic says how freely it marks Armor Slots: always, against any hit; spare, Major or worse; never, only Severe", () => {
    const hit = (shield, damage) => {
      const u = pc({ u: { tac: { shield } } });
      u.resources.armor = 1;
      return daggerheartRules.applyIwr(dh, { physical: damage }, u);
    };
    expect([hit("always", 3), hit("spare", 3), hit("spare", 9), hit("never", 9), hit("never", 17)]).toEqual([0, 1, 1, 2, 2]);
  });

  test("how freely it uses resources says when a Hope goes on an Experience", () => {
    const roll = resourceUse => {
      const u = pc({ u: { tac: { resourceUse } }, spec: { experiences: [{ name: "Thief", value: 2 }] } });
      return daggerheartRules.roll(fixed(9, 9), 4, 14, { roller: u, faces: DUALITY, kind: "attack" }).experience ?? null;
    };
    // (+4 against 14 already lands three times in four, +2 more makes it about a tenth likelier: only a free spender
    // reaches for an Experience for that.)
    expect(roll("conserve")).toBe(null);
    expect(roll("nova")).toEqual({ name: "Thief", value: 2 });
  });
});

describe("falling", () => {
  test("an adversary whose last Hit Point is marked is defeated (the table decides; one who would kill, kills)", () => {
    const foe = { status: STATUS.STANDING, hp: 0, maxHp: 5, resources: {}, spec: { name: "Bandit" } };
    daggerheartRules.onDropped(foe, { rng: fixed(1) });
    expect(foe.status).toBe(STATUS.BEATEN);
  });

  test("struck while out cold: Fear higher, it dies; otherwise it hangs on, still out cold", () => {
    const dies = pc({ u: { status: STATUS.DOWN } });
    daggerheartRules.onDropped(dies, { rng: fixed(3, 9) });
    expect(dies.status).toBe(STATUS.DEAD);
    const hangs = pc({ u: { status: STATUS.DOWN } });
    daggerheartRules.onDropped(hangs, { rng: fixed(9, 3) });
    expect(hangs.status).toBe(STATUS.DOWN);
  });

  test("tending a friend out cold: a success keeps it safe; a critical gets it up", () => {
    const safe = pc({ u: { status: STATUS.DOWN, stable: false } });
    daggerheartRules.firstAid(safe, 2);
    expect(safe).toMatchObject({ status: STATUS.DOWN, stable: true });
    const up = pc({ u: { status: STATUS.DOWN, stable: false } });
    daggerheartRules.firstAid(up, 3);
    expect(up).toMatchObject({ status: STATUS.STANDING, hp: 1 });
  });

  test("Hidden ends when it attacks", () => {
    const u = { conds: { hidden: 1 }, baseConds: { hidden: 1 }, effects: [], baseMods: [], spec: { iwr: {} } };
    daggerheartRules.afterRoll(null, u, { degree: 2 }, { kind: "attack" });
    expect(u.conds.hidden).toBeFalsy();
  });
});

describe("what a character can do", () => {
  test("the trait moves: Grapple (Strength) restrains, Maneuver (Agility) leaves it Vulnerable, Hide (Finesse) hides it", () => {
    const [grapple, maneuver, hide] = traitMoves({ id: "w", traits: { strength: 1, agility: 2, finesse: 0 }, ranges: RANGES });
    expect(grapple).toMatchObject({ kind: "control", check: { mod: 1, against: "ac" }, melee: true });
    expect(grapple.onHit[2].conditions).toEqual({ restrained: 1, immobilized: 1 });
    expect(maneuver.onHit[2].conditions).toEqual({ vulnerable: 1 });
    expect(hide).toMatchObject({ kind: "buff", targets: "self", check: { mod: 0, dc: 12 } });
  });

  test("Help an Ally: a Hope for a d6 on a friend's next action roll, no spotlight of its own, never itself", () => {
    expect(helpAnAlly({ id: "w" })).toMatchObject({ kind: "buff", resource: "hope", resourceCost: 1, economy: "free", includeSelf: false, outcome: { mods: { attackDie: 6, checkDie: 6 }, uses: 1 } });
  });

  test("a spell is a spell attack (its caster counts as one)", () => {
    const blades = { type: "attack", range: "veryClose", roll: { type: "spellcast" }, damage: { main: { type: ["magical"], value: { dice: "d8", bonus: 2, multiplier: "prof", flatMultiplier: 1 } } }, cost: [] };
    expect(toActionSpec(blades, { id: "s", pc: true, traits: { finesse: 2 }, spellcast: "finesse", proficiency: 1, ranges: RANGES }).kind).toBe("spell-attack");
  });

  test("gold, in the smallest coin; a weak spot where it guards one kind of damage and not the other", () => {
    const kinds = [{ key: "chests", value: 1000 }, { key: "bags", value: 100 }, { key: "handfuls", value: 10 }, { key: "coins", value: 1 }];
    expect(goldValue({ handfuls: 2, bags: 1, coins: 3 }, kinds)).toBe(123);
    expect(weakSpot({ resistance: { physical: { resistance: true }, magical: {} } })).toEqual({ magical: 1 });
    expect(weakSpot({ resistance: { physical: {}, magical: {} } })).toEqual({});
  });
});

describe("in a fight", () => {
  const traits = { tactical: { base: 70, fudge: 0 }, brave: { base: 70, fudge: 0 }, selfish: { base: 20, fudge: 0 }, loyal: { base: 80, fudge: 0 } };
  const hero = (id, extra = {}) => ({
    id, name: id, side: "friendly", kind: "pc", duality: true, level: 1, hp: { value: 6, max: 6 }, hopeMax: 6, stressMax: 6, armorMax: 3,
    resources: { hope: 4, stress: 6, armor: 3 }, experiences: [], defenses: { ac: 11, agility: 1, strength: 1, finesse: 1, instinct: 1, presence: 1, knowledge: 1 },
    initiative: { mod: 1 }, speeds: { walk: 30 },
    actions: [{ id: `${id}.sword`, name: "Sword", kind: "strike", bonus: 1, melee: true, reach: 5, damage: [parseFormula("1d8+1", "physical")] }, helpAnAlly({ id, label: "Help" })],
    iwr: { immune: [], resist: {}, weak: {}, dh: { thresholds: { major: 7, severe: 14 }, physical: {}, magical: {}, reduce: {}, armor: 3 } },
    traits, flags: {}, diesAtZero: false, ...extra
  });
  const brute = id => ({
    id, name: id, side: "hostile", kind: "npc", level: 1, adversaryType: "bruiser", hp: { value: 9, max: 9 }, resources: {}, defenses: { ac: 13 }, initiative: { mod: 0 }, speeds: { walk: 30 },
    actions: [{ id: `${id}.club`, name: "Club", kind: "strike", bonus: 2, melee: true, reach: 5, damage: [parseFormula("1d10+4", "physical")] }],
    iwr: { immune: [], resist: {}, weak: {}, dh: { thresholds: { major: 9, severe: 16 }, physical: {}, magical: {}, reduce: {} } }, traits, flags: { fearless: true }, diesAtZero: true
  });

  test("an Enabler spends Hope helping a friend; a foe whose last Hit Point is marked is beaten, unless a Cruel character kills it", () => {
    const style = ids => {
      const p = combinePlaystyles(ids);
      return { playstyles: p.ids, behavior: p.behavior, desireStyle: p.desire };
    };
    let helped = 0;
    let beaten = 0;
    let killed = 0;
    for ( let seed = 1; seed <= 20; seed++ ) {
      const spec = { combatants: [hero("Ana", style(["enabler"])), hero("Bo", style(["cruel"])), brute("Ogre")],
        sides: { friendly: { label: "P", enemies: ["hostile"] }, hostile: { label: "F", enemies: ["friendly"] } }, options: { positioning: false, maxRounds: 12, talking: false, system: { fear: 1 } } };
      const r = replay(spec, daggerheartRules, seed);
      helped += r.log.filter(e => e.type === "buff" && e.actorId === "Ana").length;
      if ( r.units.Ogre.status === STATUS.BEATEN ) beaten += 1;
      if ( r.units.Ogre.status === STATUS.DEAD ) killed += 1;
    }
    expect(helped).toBeGreaterThan(0);
    expect(beaten + killed).toBeGreaterThan(10);
    expect(killed).toBeGreaterThan(0);
  });
});

describe("what counts as its own", () => {
  test("Hide is what one keeping a low profile goes for (one in a hurry doesn't stop for it); Help an Ally is anyone's", () => {
    const [, , hide] = traitMoves({ id: "w", traits: { finesse: 1 }, ranges: RANGES });
    expect(hide).toMatchObject({ setup: true, leans: ["lowProfile"] });
    expect(helpAnAlly({ id: "w" }).special).toBe(false);
  });
});
