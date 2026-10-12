/**
 * The adapter, with stand-ins for the system's actors: a character (its traits, gold, a potion, loot, the trait moves,
 * Help an Ally, sizing up, tending, theft, doors), an environment (a hazard), and Sprint in a fight.
 */
import { describe, expect, test } from "vitest";
import { DaggerheartAdapter } from "../scripts/adapter.js";
import { daggerheartRules } from "../scripts/rules.js";
import { replay } from "../../FastFighting/scripts/engine/simulator.js";
import { parseFormula, STATUS } from "../scripts/core.js";

const trait = v => ({ value: v });
const dagger = { type: "attack", range: "melee", target: { type: "any", amount: 1 }, roll: { type: "attack", trait: "finesse" }, cost: [],
  damage: { main: { type: ["physical"], applyTo: "hitPoints", value: { dice: "d8", bonus: 1, multiplier: "prof", flatMultiplier: 1 } } } };
const potion = { _id: "drink", type: "healing", target: { type: "self" }, cost: [], damage: { resources: { hitPoints: { applyTo: "hitPoints", value: { custom: { enabled: true, formula: "1d4" } } } } } };
const character = () => ({
  id: "a1", uuid: "Actor.a1", name: "Wren", type: "character", img: "", statuses: new Set(),
  items: [
    { id: "p1", type: "consumable", name: "Minor Health Potion", system: { quantity: 2, actions: [potion] }, effects: [] },
    { id: "g1", type: "loot", name: "Gem", system: { quantity: 1, tier: 1 }, effects: [] }
  ],
  system: {
    traits: { agility: trait(1), strength: trait(-1), finesse: trait(2), instinct: trait(0), presence: trait(1), knowledge: trait(0) },
    levelData: { level: { current: 1 } }, proficiency: 1, evasion: 12, damageThresholds: { major: 6, severe: 12 },
    resources: { hitPoints: { max: 6, value: 1 }, stress: { max: 6, value: 2 }, hope: { value: 2, max: 6 } }, armorScore: { max: 3, value: 1 },
    experiences: { x: { name: "Thief", value: 2 } }, gold: { coins: 3, handfuls: 2, bags: 1, chests: 0 },
    primaryWeapon: { id: "w1", name: "Dagger", system: { attack: dagger }, effects: [] }, secondaryWeapon: null,
    resistance: { physical: {}, magical: {} }, rules: {}
  }
});
const tokenOf = actor => ({ id: `t-${actor.id}`, name: actor.name, actor, texture: { src: "" } });

describe("a character", () => {
  test("its numbers: Hit Points and Stress left, Hope, Armor Slots left, Evasion, its traits", async () => {
    const spec = await new DaggerheartAdapter().toCombatantSpec(tokenOf(character()));
    expect(spec).toMatchObject({ kind: "pc", duality: true, hp: { value: 5, max: 6 }, defenses: { ac: 12, finesse: 2 }, resources: { hope: 2, stress: 4, armor: 2, "item:p1": 2 } });
  });

  test("what it can do: its weapon, its potion (a drink of its own), the trait moves, Help an Ally", async () => {
    const spec = await new DaggerheartAdapter().toCombatantSpec(tokenOf(character()));
    const kinds = spec.actions.map(a => a.traitMove ?? a.kind);
    expect(kinds).toEqual(["strike", "heal", "grapple", "maneuver", "hide", "buff"]);
    expect(spec.actions[1]).toMatchObject({ resource: "item:p1", selfOnly: true, consumable: true });
  });

  test("what playstyles need: sizing up, tending, theft, doors, gold and gear to give up", async () => {
    const spec = await new DaggerheartAdapter().toCombatantSpec(tokenOf(character()));
    expect(spec.sizeUp).toMatchObject({ mod: 0, uses: 1 });
    expect(spec.firstAid).toEqual({ mod: 0 });
    expect(spec.theft).toMatchObject({ mod: 2 });
    expect(spec.doorWork).toEqual({ force: { mod: -1 }, pick: { mod: 2 } });
    expect(spec.valuables.money).toBe(123);
    expect(spec.valuables.stowed.map(i => i.name)).toEqual(["Minor Health Potion", "Gem"]);
  });
});

describe("an environment", () => {
  test("a hazard: its action features, reaction rolls against its Difficulty; nobody attacks it", async () => {
    const undertow = { _id: "u1", type: "attack", range: "close", target: { type: "any" }, cost: [], save: { trait: "agility", difficulty: null, damageMod: "none" },
      damage: { main: { type: ["physical"], applyTo: "hitPoints", value: { dice: "d6", bonus: 1, multiplier: "flat", flatMultiplier: 1 } } } };
    const river = { id: "e1", uuid: "Actor.e1", name: "Raging River", type: "environment", img: "", statuses: new Set(),
      items: [{ id: "f1", type: "feature", name: "Undertow", system: { featureForm: "action", actions: [undertow] }, effects: [] }, { id: "f2", type: "feature", name: "Current", system: { featureForm: "passive", actions: [] }, effects: [] }],
      system: { tier: 1, difficulty: 10 } };
    const spec = await new DaggerheartAdapter().toCombatantSpec(tokenOf(river));
    expect(spec).toMatchObject({ kind: "hazard", hazard: { once: false }, untargetable: true });
    expect(spec.actions).toHaveLength(1);
    expect(spec.actions[0]).toMatchObject({ kind: "save", save: { type: "agility", dc: 10 } });
  });
});

describe("sprinting", () => {
  const traits = { tactical: { base: 60, fudge: 0 }, brave: { base: 80, fudge: 0 }, selfish: { base: 30, fudge: 0 }, loyal: { base: 60, fudge: 0 } };
  const at = x => ({ x, y: 0, size: 5 });
  test("one in a hurry, its foe beyond Close range, sprints for it (an Agility roll)", () => {
    let sprints = 0;
    for ( let seed = 1; seed <= 10; seed++ ) {
      const runner = { id: "R", name: "Runner", side: "friendly", kind: "pc", duality: true, level: 1, position: at(0), hp: { value: 6, max: 6 }, hopeMax: 6, stressMax: 6, armorMax: 0,
        resources: { hope: 2, stress: 6, armor: 0 }, experiences: [], defenses: { ac: 11, agility: 2 }, initiative: { mod: 5 }, speeds: { walk: 30 }, sprint: { range: 60, mod: 2 },
        behavior: { rush: 1 }, actions: [{ id: "R.s", name: "Sword", kind: "strike", bonus: 1, melee: true, reach: 5, damage: [parseFormula("1d8", "physical")] }],
        iwr: { immune: [], resist: {}, weak: {} }, traits, flags: {}, diesAtZero: false };
      const foe = { id: "F", name: "Foe", side: "hostile", kind: "npc", level: 1, position: at(90), hp: { value: 6, max: 6 }, resources: {}, defenses: { ac: 12 }, initiative: { mod: 0 }, speeds: { walk: 30 },
        actions: [{ id: "F.c", name: "Claw", kind: "strike", bonus: 0, melee: true, reach: 5, damage: [parseFormula("1d6", "physical")] }], iwr: { immune: [], resist: {}, weak: {} }, traits, flags: { fearless: true }, diesAtZero: true };
      const r = replay({ combatants: [runner, foe], sides: { friendly: { label: "P", enemies: ["hostile"] }, hostile: { label: "F", enemies: ["friendly"] } }, options: { positioning: true, maxRounds: 3, talking: false } }, daggerheartRules, seed);
      sprints += r.log.filter(e => e.type === "startTurn" && e.actorId === "R").length;
    }
    expect(sprints).toBeGreaterThan(0);
    expect(STATUS.STANDING).toBe("standing");
  });
});
