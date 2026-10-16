/**
 * Summons: the system's "summon" action as the core's summoning (behavior/summons.js). How many it calls (its count's
 * formula, @partySize the party's), how far off they appear (its range), what it costs (an SRD feature's Fear its data
 * leaves out), the creatures read like any other, from where the action keeps them; what isn't played (a countdown's,
 * a reaction's, a Minion's Form Up, a summoned creature's own summoning); and in a fight, the creatures joining their
 * summoner's side, a summoned Minion with its kind.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DaggerheartAdapter } from "../scripts/adapter.js";
import { daggerheartRules } from "../scripts/rules.js";
import { summonCount, toSummonSpec, RANGES } from "../scripts/actions.js";
import { parseFormula, STATUS } from "../scripts/core.js";
import { beginRun, beginRound, takeTurn, prepareBattle, replay } from "../../FastFighting/scripts/engine/simulator.js";

const LACKEY = "Compendium.daggerheart.adversaries.Actor.C0OMQqV7pN6t7ouR";
const MOCKERY = "Compendium.daggerheart.adversaries.Actor.mockery0000000000";

const tokenOf = actor => ({ id: `t-${actor.id}`, name: actor.name, actor, texture: { src: "" } });
const harm = (dice, bonus = 0) => ({ main: { type: ["physical"], applyTo: "hitPoints", value: { dice, bonus, multiplier: "flat", flatMultiplier: 1 } } });
const attack = (name, dice, bonus = 0) => ({ name, img: "icons/weapons/daggers/dagger-twin-green.webp", type: "attack", range: "melee", target: { type: "any", amount: 1 }, roll: { type: "attack", bonus: 1 }, cost: [], damage: harm(dice, bonus) });
const feature = (id, name, form, actions) => ({ id, type: "feature", name, system: { featureForm: form, actions }, effects: [] });
const summon = (uuid, count, extra = {}) => ({ _id: "call", type: "summon", summon: [{ actorUUID: uuid, count }], cost: [], uses: { max: "" }, range: "", ...extra });
/** An adversary as the system's sheet has it; `pack`: one kept in a compendium. */
const adversary = ({ id, name, type = "standard", hp = 5, features = [], pack = null, atk = attack("Daggers", "d8", 1) }) => ({
  id, uuid: pack ? `Compendium.${pack}.Actor.${id}` : `Actor.${id}`, pack, name, type: "adversary", img: "", statuses: new Set(),
  prototypeToken: { name, texture: { src: "" } }, items: features,
  system: { type, tier: 1, difficulty: 12, experiences: {}, motivesAndTactics: "", resistance: { physical: {}, magical: {} },
    resources: { hitPoints: { max: hp, value: 0 }, stress: { max: 3, value: 0 } }, damageThresholds: { major: 8, severe: 14 }, attack: atk }
});
const lackey = () => adversary({ id: "C0OMQqV7pN6t7ouR", name: "Jagged Knife Lackey", type: "minion", hp: 1, pack: "daggerheart.adversaries", atk: attack("Daggers", "d4", 1),
  features: [feature("m3", "Minion (3)", "passive", [])] });
const mockery = () => adversary({ id: "mockery0000000000", name: "Ravenous Mockery", pack: "daggerheart.adversaries",
  features: [feature("i2G6IPeYPxI5Yex6", "Never Just One", "action", [summon(MOCKERY, "1", { cost: [{ key: "fear", value: 1 }] })])] });
const lieutenant = (more = []) => adversary({ id: "lt", name: "Jagged Knife Lieutenant", type: "leader", hp: 6, atk: attack("Javelin", "d4"),
  features: [feature("Mo91w4ccffcmBPt5", "More Where That Came From", "action", [summon(LACKEY, "3")]), ...more] });

/** Where Foundry would find the creatures by their UUIDs. */
const world = new Map();
beforeEach(() => {
  world.clear();
  for ( const a of [lackey(), mockery()] ) world.set(a.uuid, a);
  globalThis.fromUuid = async uuid => world.get(uuid) ?? null;
});
afterEach(() => {
  delete globalThis.fromUuid;
});

describe("how many, how far off, what it costs", () => {
  test("its count's formula on average, @partySize the party's; at most eight of a kind", () => {
    expect(["3", "1d4", "2d4", "1d6", "1d4+2", "", "0"].map(f => summonCount(f))).toEqual([3, 3, 5, 4, 5, 1, 0]);
    expect(summonCount("@partySize*2", { partySize: 3 })).toBe(6);
    expect(summonCount("@partySize * 2", { partySize: 5 })).toBe(8);
    expect(summonCount("@partySize")).toBe(0);
    // (Any other figure of the sheet's counts nothing.)
    expect(summonCount("@scale")).toBe(0);
  });

  test("its range in feet, else the core's; its cost and uses; the Fear an SRD feature's data leaves out", () => {
    const creatures = [{ id: "c" }];
    const at = range => toSummonSpec(summon(LACKEY, "1", { range }), { id: "s", label: "Call", ranges: RANGES }, creatures);
    expect(at("far")).toMatchObject({ kind: "summon", name: "Call", creatures, range: { increment: 60, max: 60, noPenalty: true } });
    expect(at("").range).toBeUndefined();
    expect(at("self").range).toBeUndefined();
    const paid = toSummonSpec(summon(LACKEY, "1", { cost: [{ key: "fear", value: 1 }], uses: { max: "1" } }), { id: "s", ranges: RANGES }, creatures);
    expect(paid).toMatchObject({ resource: "fear", resourceCost: 1, shared: "fear", uses: 1 });
    expect(toSummonSpec(summon(LACKEY, "1", { cost: [{ key: "stress", value: 1 }] }), { id: "s" }, creatures)).toMatchObject({ resource: "stress", resourceCost: 1 });
    // (The Head Vampire's The Hunt Is On: 2 Fear in its words, none in its data. What its data says, where it says.)
    expect(toSummonSpec(summon(LACKEY, "1d4"), { id: "s", feature: "IWtpuQCuV82lOSry" }, creatures)).toMatchObject({ resource: "fear", resourceCost: 2, shared: "fear" });
    expect(toSummonSpec(summon(LACKEY, "1d4", { cost: [{ key: "stress", value: 1 }] }), { id: "s", feature: "IWtpuQCuV82lOSry" }, creatures).resource).toBe("stress");
    expect(toSummonSpec(summon(LACKEY, "1"), { id: "s", feature: "toString" }, creatures).resource).toBeUndefined();
    expect(toSummonSpec(summon(LACKEY, "1"), { id: "s" }, [])).toBe(null);
  });
});

describe("the creatures it calls, read like any other", () => {
  test("a Jagged Knife Lieutenant's three Lackeys: each from its compendium, a Minion of its kind, where a live battle places it from", async () => {
    const spec = await new DaggerheartAdapter().toCombatantSpec(tokenOf(lieutenant()));
    const call = spec.actions.find(a => a.kind === "summon");
    expect(call).toMatchObject({ id: "t-lt.Mo91w4ccffcmBPt5.call", name: "More Where That Came From", feature: true });
    expect(call.resource).toBeUndefined();
    expect(call.creatures).toHaveLength(3);
    expect(call.creatures[0]).toMatchObject({ name: "Jagged Knife Lackey", kind: "npc", adversaryType: "minion", minion: 3, sourceUuid: LACKEY, kinKey: LACKEY });
    expect(call.creatures[0].actions[0]).toMatchObject({ kind: "strike", name: "Daggers" });
  });

  test("a creature summoned calls nobody in turn: a Ravenous Mockery reveals another, not a third", async () => {
    const spec = await new DaggerheartAdapter().toCombatantSpec(tokenOf(mockery()));
    const call = spec.actions.find(a => a.kind === "summon");
    expect(call).toMatchObject({ resource: "fear", resourceCost: 1, shared: "fear" });
    expect(call.creatures).toHaveLength(1);
    expect(call.creatures[0].actions.some(a => a.kind === "summon")).toBe(false);
  });

  test("two read at once each call theirs: one reading what it summons doesn't stop the other", async () => {
    const adapter = new DaggerheartAdapter();
    const specs = await Promise.all([adapter.toCombatantSpec(tokenOf(lieutenant())), adapter.toCombatantSpec(tokenOf(mockery()))]);
    expect(specs.map(s => s.actions.filter(a => a.kind === "summon").length)).toEqual([1, 1]);
  });

  test("as many as the party: the system's party's members, else the world's player characters", async () => {
    const legion = n => adversary({ id: "fw", name: "Fallen Warlord", type: "solo", features: [feature("AP7W9ruUCdTHO69S", "Endless Legions", "action", [summon(LACKEY, "@partySize*2")])] });
    const count = async () => (await new DaggerheartAdapter().toCombatantSpec(tokenOf(legion()))).actions.find(a => a.kind === "summon")?.creatures.length ?? 0;
    expect(await count()).toBe(0);
    globalThis.game.actors = Object.assign([{ type: "character", hasPlayerOwner: true }, { type: "character", hasPlayerOwner: false }], { party: null });
    expect(await count()).toBe(2);
    globalThis.game.actors.party = { system: { partyMembers: [1, 2, 3] } };
    expect(await count()).toBe(6);
  });

  test("not played: what a countdown brings, a reaction's, a Minion's for a Fear (Form Up), one it can't find", async () => {
    const adapter = new DaggerheartAdapter();
    const ritual = feature("4L7aM9NDLbjvuwI3", "Summoning Ritual", "action", [{ _id: "tick", type: "countdown" }, summon(LACKEY, "1")]);
    const split = feature("M9gAcPrgKfSg9Tjb", "Split", "reaction", [summon(LACKEY, "2", { cost: [{ key: "fear", value: 1 }] })]);
    const lost = feature("lost", "Lost Friends", "action", [summon("Compendium.daggerheart.adversaries.Actor.nobody", "2")]);
    const keeper = await adapter.toCombatantSpec(tokenOf(adversary({ id: "sk", name: "Secret-Keeper", type: "leader", features: [ritual, split, lost] })));
    expect(keeper.actions.filter(a => a.kind === "summon")).toEqual([]);
    const sporeling = adversary({ id: "sp", name: "Fungispunj Sporeling", type: "minion", hp: 1,
      features: [feature("KjDHgxHRNrSov4e8", "Form Up", "action", [summon(LACKEY, "1", { cost: [{ key: "fear", value: 1 }] })])] });
    expect((await adapter.toCombatantSpec(tokenOf(sporeling))).actions.filter(a => a.kind === "summon")).toEqual([]);
  });

  test("an environment's, on its spec (for the core's hazards, when they summon); a character's feature's, as its own", async () => {
    const adapter = new DaggerheartAdapter();
    const river = { id: "rr", uuid: "Actor.rr", name: "Raging River", type: "environment", img: "", statuses: new Set(),
      items: [feature("SDTS3LOPMVJOt1S1", "Patient Hunter", "action", [summon(LACKEY, "1", { cost: [{ key: "fear", value: 1 }] })])],
      system: { tier: 1, difficulty: 10 } };
    expect((await adapter.toCombatantSpec(tokenOf(river))).actions).toEqual([expect.objectContaining({ kind: "summon", resource: "fear", creatures: [expect.objectContaining({ name: "Jagged Knife Lackey" })] })]);
    const caller = { id: "pc", uuid: "Actor.pc", name: "Wren", type: "character", img: "", statuses: new Set(),
      items: [feature("f1", "Call the Pack", "passive", [summon(LACKEY, "2", { name: "Call", cost: [{ key: "hope", value: 2 }], range: "close" })])],
      system: { traits: {}, levelData: { level: { current: 1 } }, proficiency: 1, evasion: 10, damageThresholds: { major: 5, severe: 10 },
        resources: { hitPoints: { max: 6, value: 0 }, stress: { max: 6, value: 0 }, hope: { value: 2, max: 6 } }, armorScore: { max: 0, value: 0 },
        experiences: {}, gold: {}, primaryWeapon: null, secondaryWeapon: null, resistance: { physical: {}, magical: {} }, rules: {} } };
    const call = (await adapter.toCombatantSpec(tokenOf(caller))).actions.find(a => a.kind === "summon");
    expect(call).toMatchObject({ name: "Call the Pack: Call", resource: "hope", resourceCost: 2, range: { max: 30 }, feature: true });
    expect(call.creatures).toHaveLength(2);
  });
});

describe("in a fight", () => {
  const evasive = { tactical: { base: 70, fudge: 0 }, brave: { base: 70, fudge: 0 }, selfish: { base: 30, fudge: 0 }, loyal: { base: 70, fudge: 0 } };
  const hero = () => ({
    id: "Brakka", name: "Brakka", side: "friendly", kind: "pc", duality: true, level: 1, hp: { value: 6, max: 6 }, hopeMax: 6, stressMax: 6, armorMax: 0,
    resources: { hope: 2, stress: 6, armor: 0 }, experiences: [],
    defenses: { ac: 11, agility: 2, strength: 1, finesse: 0, instinct: 1, presence: 0, knowledge: 0 }, initiative: { mod: 1 }, speeds: { walk: 30 },
    actions: [{ id: "Brakka.sword", name: "Longsword", kind: "strike", bonus: 2, melee: true, reach: 5, damage: [parseFormula("1d10+3", "physical")] }],
    iwr: { immune: [], resist: {}, weak: {}, dh: { thresholds: { major: 8, severe: 16 }, physical: {}, magical: {}, reduce: {} } },
    traits: evasive, flags: {}, diesAtZero: false
  });
  const battle = (combatants, options = {}) => ({ combatants, sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Bandits", enemies: ["friendly"] } },
    options: { positioning: false, maxRounds: 10, talking: false, aftermath: "none", ...options } });
  const leader = async (more = []) => ({ ...(await new DaggerheartAdapter().toCombatantSpec(tokenOf(lieutenant(more)))), side: "hostile", traits: evasive, flags: { fearless: true } });

  test("the Lieutenant calls its Lackeys: they join its side, and Minion (3) takes them down together", async () => {
    const run = beginRun(prepareBattle(battle([hero(), await leader()], { system: { fear: 0 } }), daggerheartRules), 1, { log: true });
    beginRound(run, 1);
    takeTurn(run, run.byId.get("t-lt"));
    expect(run.log.find(e => e.type === "summon")).toMatchObject({ actorId: "t-lt", action: "More Where That Came From", names: ["Jagged Knife Lackey", "Jagged Knife Lackey", "Jagged Knife Lackey"] });
    const called = run.units.filter(u => u.summoner === "t-lt");
    expect(called).toHaveLength(3);
    expect(called.every(u => u.side === "hostile" && u.status === STATUS.STANDING)).toBe(true);
    // (With their kind once the next turn begins: one struck for 3 more takes another down with it.)
    daggerheartRules.startTurn(run, run.byId.get("Brakka"));
    expect(called.every(u => u.kin?.length === 3)).toBe(true);
    called[0].hp = 0;
    called[0].minionOverflow = 1;
    daggerheartRules.onDropped(called[0]);
    expect(called.filter(u => u.status === STATUS.BEATEN)).toHaveLength(2);
  });

  test("one for a Fear spends the GM's Fear; with none, it can't", async () => {
    const worshippers = feature("DKl9G56DwWpLVblv", "Summon Worshippers", "action", [summon(LACKEY, "2", { _id: "w", cost: [{ key: "fear", value: 1 }], range: "far" })]);
    const spec = await leader([worshippers]);
    // (Only the one for a Fear.)
    spec.actions = spec.actions.filter(a => a.kind !== "summon" || a.resource === "fear");
    const fight = fear => {
      const run = beginRun(prepareBattle(battle([hero(), spec], { system: { fear } }), daggerheartRules), 2, { log: true });
      beginRound(run, 1);
      takeTurn(run, run.byId.get("t-lt"));
      return run;
    };
    const paid = fight(2);
    expect(paid.log.find(e => e.type === "summon")).toMatchObject({ action: "Summon Worshippers" });
    expect(paid.sharedPools.fear).toBe(1);
    expect(fight(0).log.some(e => e.type === "summon")).toBe(false);
  });

  test("over a fight: the Lackeys called fight for the Lieutenant, and aren't the table's", async () => {
    let calls = 0;
    let blows = 0;
    for ( let seed = 1; seed <= 10; seed++ ) {
      const r = replay(battle([hero(), await leader()], { system: { fear: 2 } }), daggerheartRules, seed);
      calls += r.log.filter(e => e.type === "summon").length;
      blows += r.log.filter(e => e.type === "attack" && String(e.actorId).startsWith("t-lt~")).length;
      expect(Object.keys(r.units).some(k => k.includes("~"))).toBe(false);
    }
    expect(calls).toBeGreaterThan(0);
    expect(blows).toBeGreaterThan(0);
  });
});
