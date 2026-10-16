/**
 * Hope and Stress an action gives (a healing action's Hope gained and Stress cleared, as the core's outcome.resources),
 * what they're worth and how they land (rules.gainResource, rules.resourceWorth); and the Stress an attack marks
 * besides its Hit Points (Stress damage).
 */
import { describe, expect, test } from "vitest";
import { DaggerheartAdapter } from "../scripts/adapter.js";
import { daggerheartRules } from "../scripts/rules.js";
import { toActionSpec, resourcesGained, damagePartsOf, RANGES } from "../scripts/actions.js";
import { parseFormula, STATUS } from "../scripts/core.js";
import { beginRun, beginRound, takeTurn, prepareBattle } from "../../FastFighting/scripts/engine/simulator.js";

/** A resource an action gives or marks, as the system keeps it: a number, or so many dice. */
const fixed = (key, n) => ({ applyTo: key, value: { custom: { enabled: true, formula: String(n) }, multiplier: "prof", flatMultiplier: 1, dice: "d6" } });
const dice = (key, count, faces) => ({ applyTo: key, value: { custom: { enabled: false }, multiplier: "flat", flatMultiplier: count, dice: `d${faces}`, bonus: null } });
const healing = (resources, extra = {}) => ({ _id: "h", type: "healing", target: { type: "self" }, range: "self", cost: [], uses: { max: "" }, damage: { main: null, resources }, ...extra });
const ctx = { id: "x", label: "Card", pc: true, traits: {}, proficiency: 2, ranges: RANGES };

describe("Hope gained, Stress cleared", () => {
  test("what a healing action gives: Hope, Stress cleared, each as it comes to on average", () => {
    expect(resourcesGained(healing({ stress: fixed("stress", 2), hope: fixed("hope", 2) }))).toEqual({ stress: 2, hope: 2 });
    expect(resourcesGained(healing({ stress: dice("stress", 1, 6) }))).toEqual({ stress: 4 });
    // (Hit Points, Armor Slots, the GM's Fear: none of these. A formula of the sheet's own counts nothing.)
    expect(resourcesGained(healing({ hitPoints: fixed("hitPoints", 1), armor: fixed("armor", 1), fear: fixed("fear", 1), hope: fixed("hope", "@scale") }))).toBe(null);
  });

  test("on itself, once a long rest (Battle Ritual): a buff that gains them", () => {
    const ritual = healing({ stress: fixed("stress", 2), hope: fixed("hope", 2) }, { uses: { max: "1", recovery: "longRest" }, range: "" });
    expect(toActionSpec(ritual, ctx)).toEqual({ id: "x", name: "Card", uses: 1, kind: "buff", targets: "self", outcome: { resources: { stress: 2, hope: 2 }, label: "Card" } });
  });

  test("on a friend in reach, for its cost (Mending Touch, 2 Hope; a song for allies within Close)", () => {
    const mending = healing({ stress: fixed("stress", 1) }, { target: { type: "any" }, range: "", cost: [{ key: "hope", value: 2 }] });
    expect(toActionSpec(mending, ctx)).toMatchObject({ kind: "buff", resource: "hope", resourceCost: 2, melee: true, reach: 5, outcome: { resources: { stress: 1 } } });
    expect(toActionSpec(mending, ctx).targets).toBeUndefined();
    const song = healing({ hope: fixed("hope", 1) }, { target: { type: "friendly" }, range: "close", uses: { max: "1" } });
    expect(toActionSpec(song, ctx)).toMatchObject({ kind: "buff", range: { max: 30 }, outcome: { resources: { hope: 1 } } });
  });

  test("not one free any number of times (a trigger's payoff: Swift Step); Hit Points cleared stay a heal", () => {
    expect(toActionSpec(healing({ stress: fixed("stress", 1) }), ctx)).toBe(null);
    const howl = healing({ hitPoints: fixed("hitPoints", 1), stress: fixed("stress", 1) }, { target: { type: "any" }, range: "", uses: { max: "1" } });
    expect(toActionSpec(howl, { ...ctx, pc: false })).toMatchObject({ kind: "heal", heal: [{ flat: 1, type: "healing" }] });
  });

  test("a character's domain card, among its actions", async () => {
    const actor = { id: "a1", uuid: "Actor.a1", name: "Wren", type: "character", img: "", statuses: new Set(),
      items: [{ id: "d1", type: "domainCard", name: "Second Wind", system: { inVault: false, actions: [healing({ stress: fixed("stress", 3) }, { name: "Clear Three Stress", uses: { max: "1" } })] }, effects: [] }],
      system: { traits: {}, levelData: { level: { current: 1 } }, proficiency: 1, evasion: 10, damageThresholds: { major: 5, severe: 10 },
        resources: { hitPoints: { max: 6, value: 0 }, stress: { max: 6, value: 4 }, hope: { value: 2, max: 6 } }, armorScore: { max: 0, value: 0 },
        experiences: {}, gold: {}, primaryWeapon: null, secondaryWeapon: null, resistance: { physical: {}, magical: {} }, rules: {} } };
    const spec = await new DaggerheartAdapter().toCombatantSpec({ id: "t1", name: "Wren", actor, texture: { src: "" } });
    expect(spec.actions.find(a => a.kind === "buff" && a.feature)).toMatchObject({ name: "Second Wind: Clear Three Stress", targets: "self", outcome: { resources: { stress: 3 } } });
  });

  const unit = ({ pc = true, hope = 2, stress = 3 } = {}) => ({ resources: { hope: pc ? hope : undefined, stress }, spec: { duality: pc, hopeMax: 6, stressMax: 6 } });

  test("how they land: Hope a player character's alone, up to its most; Stress cleared up to its slots; anything else added", () => {
    const pc = unit({ hope: 5, stress: 4 });
    daggerheartRules.gainResource(pc, "hope", 3);
    daggerheartRules.gainResource(pc, "stress", 3);
    expect(pc.resources).toMatchObject({ hope: 6, stress: 6 });
    daggerheartRules.gainResource(pc, "stress", -9);
    expect(pc.resources.stress).toBe(0);
    const foe = unit({ pc: false, stress: 1 });
    daggerheartRules.gainResource(foe, "hope", 2);
    daggerheartRules.gainResource(foe, "stress", 1);
    daggerheartRules.gainResource(foe, "tokens", 2);
    expect(foe.resources).toEqual({ hope: undefined, stress: 2, tokens: 2 });
  });

  test("what they're worth: only as far as there's room; a Stress cleared more to one with none left", () => {
    const worth = (u, key, n) => daggerheartRules.resourceWorth({}, u, key, n);
    expect(worth(unit({ hope: 5 }), "hope", 3)).toBeCloseTo(worth(unit({ hope: 2 }), "hope", 1), 10);
    expect(worth(unit({ hope: 6 }), "hope", 2)).toBe(0);
    expect(worth(unit({ pc: false }), "hope", 2)).toBe(0);
    expect(worth(unit({ stress: 6 }), "stress", 2)).toBe(0);
    expect(worth(unit({ stress: 0 }), "stress", 1)).toBeGreaterThan(worth(unit({ stress: 3 }), "stress", 1));
    expect(worth(unit(), "tokens", 2)).toBe(0);
  });

  test("in a fight: worn down to no Stress and no Hope, with a weak blow, it performs its ritual and is the better for it", () => {
    const evasive = { tactical: { base: 70, fudge: 0 }, brave: { base: 60, fudge: 0 }, selfish: { base: 40, fudge: 0 }, loyal: { base: 60, fudge: 0 } };
    const ritual = { ...toActionSpec(healing({ stress: fixed("stress", 2), hope: fixed("hope", 2) }, { uses: { max: "1" } }), { ...ctx, id: "Brakka.ritual", label: "Battle Ritual" }), feature: true };
    const hero = { id: "Brakka", name: "Brakka", side: "friendly", kind: "pc", duality: true, level: 1, hp: { value: 6, max: 6 }, hopeMax: 6, stressMax: 6, armorMax: 0,
      resources: { hope: 0, stress: 0, armor: 0 }, experiences: [], defenses: { ac: 11 }, initiative: { mod: 1 }, speeds: { walk: 30 },
      actions: [{ id: "Brakka.fist", name: "Fist", kind: "strike", bonus: -4, melee: true, reach: 5, damage: [parseFormula("1", "physical")] }, ritual],
      iwr: { immune: [], resist: {}, weak: {}, dh: { thresholds: { major: 8, severe: 16 }, physical: {}, magical: {}, reduce: {} } }, traits: evasive, flags: {}, diesAtZero: false };
    const ogre = { id: "Ogre", name: "Ogre", side: "hostile", kind: "npc", level: 1, adversaryType: "bruiser", hp: { value: 8, max: 8 }, stressMax: 3, resources: { stress: 3 },
      defenses: { ac: 14 }, initiative: { mod: 0 }, speeds: { walk: 30 },
      actions: [{ id: "Ogre.club", name: "Club", kind: "strike", bonus: 1, melee: true, reach: 5, damage: [parseFormula("1d6", "physical")] }],
      iwr: { immune: [], resist: {}, weak: {}, dh: { thresholds: { major: 8, severe: 14 }, physical: {}, magical: {}, reduce: {} } }, traits: evasive, flags: { fearless: true }, diesAtZero: true };
    const spec = { combatants: [hero, ogre], sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Foes", enemies: ["friendly"] } },
      options: { positioning: false, maxRounds: 4, talking: false, aftermath: "none", system: { fear: 0 } } };
    const run = beginRun(prepareBattle(spec, daggerheartRules), 1, { log: true });
    beginRound(run, 1);
    const brakka = run.byId.get("Brakka");
    takeTurn(run, brakka);
    expect(run.log.find(e => e.type === "buff" && e.actorId === "Brakka")).toMatchObject({ action: "Battle Ritual", self: true });
    expect(brakka.resources).toMatchObject({ hope: 2, stress: 2 });
    expect(brakka.uses["Brakka.ritual"]).toBe(0);
    expect(brakka.status).toBe(STATUS.STANDING);
  });
});

describe("Stress an attack marks besides its Hit Points", () => {
  const vampire = { type: "attack", range: "melee", target: { type: "any", amount: 1 }, roll: { type: "attack", bonus: 3 }, cost: [],
    damage: { main: { type: ["physical"], applyTo: "hitPoints", value: { dice: "d4", flatMultiplier: 5, multiplier: "flat", bonus: null } }, resources: { stress: fixed("stress", 1), hope: fixed("hope", 1) } } };

  test("Stress damage, beside its Hit Points' (a Vampire's Draining Bite); the Hope it takes isn't damage", () => {
    expect(damagePartsOf(vampire.damage)).toEqual([parseFormula("5d4", "physical"), parseFormula("1", "stress")]);
    expect(toActionSpec(vampire, { id: "v", label: "Draining Bite", pc: false, ranges: RANGES })).toMatchObject({ kind: "strike", bonus: 3, damage: [{ type: "physical" }, { type: "stress", flat: 1 }] });
  });

  test("an attack that only marks Stress (a Green Ooze's Envelop) deals it as a blow; its effect rides it", () => {
    const envelop = { ...vampire, effects: [{ _id: "e1" }], damage: { main: null, resources: { stress: fixed("stress", 2) } } };
    const effectsById = new Map([["e1", { statuses: ["restrained"], changes: [] }]]);
    const spec = toActionSpec(envelop, { id: "o", label: "Envelop", pc: false, difficulty: 10, ranges: RANGES, effectsById });
    expect(spec).toMatchObject({ kind: "strike", damage: [{ type: "stress", flat: 2 }], effects: [{ kind: "condition", conditions: { restrained: 1, immobilized: 1 } }] });
    // (Stress it can't mark becomes Hit Points.)
    const target = { resources: { stress: 1 }, spec: {} };
    expect(daggerheartRules.applyIwr({ dh: { thresholds: { major: 5, severe: 10 }, physical: {}, magical: {}, reduce: {} } }, { stress: 2 }, target)).toBe(1);
    expect(target.resources.stress).toBe(0);
  });

  test("a formula of the sheet's own marks nothing", () => {
    expect(damagePartsOf({ main: null, resources: { stress: fixed("stress", "@scale") } })).toEqual([]);
  });
});
