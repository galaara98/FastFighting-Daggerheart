/**
 * Live battles in Daggerheart: a player character's spotlight read from the system's cards, whom FastFighting would
 * spotlight next, and the conditions its sheets carry (written there, read back as the same keys).
 */
import { describe, expect, test } from "vitest";
import { readDaggerheartTurn } from "../scripts/read-turn.js";
import { daggerheartRules } from "../scripts/rules.js";
import { DaggerheartAdapter } from "../scripts/adapter.js";
import { beginLive, liveRound, liveTurn, pcTurnBegin, pcTurnEnd, nextSpotlight, setCondition, syncFromSheets } from "../../FastFighting/scripts/engine/live.js";
import { captureUnit } from "../../FastFighting/scripts/engine/simulator.js";
import { diffOutcome } from "../../FastFighting/scripts/engine/changes.js";
import { CORE_CONDITIONS } from "../../FastFighting/scripts/engine/conditions.js";
import { parseFormula, STATUS } from "../scripts/core.js";
import { text } from "./foundry-i18n.js";

/** A daggerheart action roll card: the Duality Dice, its targets, its damage. */
const card = ({ type = "dualityRoll", hope = 8, fear = 4, total = 15, targets = [], hasDamage = false, damage = null, trait = "agility", difficulty = null, hasHealing = false, token = "tokA" } = {}) => ({
  type, speaker: { token },
  rolls: [],
  system: {
    title: "Longsword", hasRoll: type !== "damageRoll", hasDamage, hasHealing, targets,
    damage: { main: damage === null ? null : { total: damage } },
    roll: { total, isCritical: hope === fear, dHope: { total: hope }, dFear: { total: fear }, dice: [{ faces: 12, total: hope }, { faces: 12, total: fear }], options: { roll: { trait, difficulty } } }
  }
});
const context = { tokenId: "tokA", ids: { tokA: "A", tokB: "B" } };

describe("a spotlight read from the daggerheart system's cards", () => {
  test("an attack that meets the target's Evasion, with Hope: a hit, its damage, the spotlight kept", () => {
    const [e] = readDaggerheartTurn([card({ targets: [{ id: "tokB", evasion: 12 }], hasDamage: true, damage: 9 })], context);
    expect(e).toMatchObject({ type: "attack", targetId: "B", degree: 2, damage: 9, withFear: false, handoff: false, sure: true });
  });

  test("a miss, or a hit with Fear, hands the spotlight to the GM; matching dice are a critical", () => {
    const miss = readDaggerheartTurn([card({ total: 9, targets: [{ id: "tokB", evasion: 12 }], hasDamage: true })], context)[0];
    expect(miss).toMatchObject({ degree: 1, damage: 0, handoff: true });
    const fear = readDaggerheartTurn([card({ hope: 3, fear: 9, total: 16, targets: [{ id: "tokB", evasion: 12 }], hasDamage: true, damage: 5 })], context)[0];
    expect(fear).toMatchObject({ degree: 2, withFear: true, handoff: true });
    const crit = readDaggerheartTurn([card({ hope: 6, fear: 6, total: 8, targets: [{ id: "tokB", evasion: 12 }], hasDamage: true, damage: 12 })], context)[0];
    expect(crit).toMatchObject({ degree: 3, crit: true, handoff: false });
  });

  test("damage on a card of its own goes to the hit before it", () => {
    const events = readDaggerheartTurn([
      card({ targets: [{ id: "tokB", evasion: 12 }], hasDamage: true }),
      card({ type: "damageRoll", damage: 7 })
    ], context);
    expect(events).toHaveLength(1);
    expect(events[0].damage).toBe(7);
  });

  test("a Presence roll is words for the GM to confirm; a roll that tells nothing else still hands off the spotlight", () => {
    const [talk] = readDaggerheartTurn([card({ trait: "presence", targets: [{ id: "tokB" }] })], context);
    expect(talk).toMatchObject({ type: "talk", targetId: "B", degree: null, sure: false });
    const [mark] = readDaggerheartTurn([card({ trait: "finesse", hope: 2, fear: 10, total: 14 })], context);
    expect(mark).toEqual({ type: "handoff", handoff: true, sure: true });
    expect(readDaggerheartTurn([card({ trait: "finesse", total: 14 })], context)).toEqual([]);
    expect(readDaggerheartTurn([card({ token: "tokB", targets: [{ id: "tokA", evasion: 10 }], hasDamage: true })], context)).toEqual([]);
  });
});

describe("whom FastFighting would spotlight next", () => {
  const traits = { tactical: { base: 60, fudge: 0 }, brave: { base: 70, fudge: 0 }, selfish: { base: 30, fudge: 0 }, loyal: { base: 70, fudge: 0 } };
  const hero = id => ({
    id, name: id, side: "friendly", kind: "pc", duality: true, level: 1, hp: { value: 6, max: 6 }, hopeMax: 6, stressMax: 6, armorMax: 3,
    resources: { hope: 2, stress: 6, armor: 3 }, defenses: { ac: 11, agility: 2, strength: 1, finesse: 0, instinct: 1, presence: 0, knowledge: 0 },
    initiative: { mod: 1 }, speeds: { walk: 30 },
    actions: [{ id: `${id}.sword`, name: "Longsword", kind: "strike", bonus: 2, melee: true, reach: 5, damage: [parseFormula("1d10+3", "physical")] }],
    iwr: { immune: [], resist: {}, weak: {}, dh: { thresholds: { major: 8, severe: 16 }, physical: {}, magical: {}, reduce: {}, armor: 3 } }, traits, flags: {}, diesAtZero: false
  });
  const bandit = id => ({
    id, name: id, side: "hostile", kind: "npc", level: 1, adversaryType: "standard", hp: { value: 5, max: 5 }, stressMax: 3, resources: { stress: 3 },
    defenses: { ac: 12 }, initiative: { mod: 0 }, speeds: { walk: 30 },
    actions: [{ id: `${id}.daggers`, name: "Daggers", kind: "strike", bonus: 1, melee: true, reach: 5, damage: [parseFormula("1d8+1", "physical")] }],
    iwr: { immune: [], resist: {}, weak: {}, dh: { thresholds: { major: 8, severe: 14 }, physical: {}, magical: {}, reduce: {} } }, traits, flags: { fearless: true }, diesAtZero: true
  });
  const spec = () => ({
    combatants: [hero("Brakka"), hero("Tovin"), bandit("B1"), bandit("B2")],
    sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Bandits", enemies: ["friendly"] } },
    options: { positioning: false, maxRounds: 10, talking: false, system: { fear: 3, spending: "steady" }, initiativeOrder: ["Brakka", "Tovin", "B1", "B2"] }
  });

  test("the players first; after one that hands it off, the adversary that has waited longest; then the next player", () => {
    const run = beginLive(spec(), daggerheartRules, { seed: 3, players: ["Brakka", "Tovin"] });
    liveRound(run, 1);
    for ( const u of run.units ) u.active = true;
    expect(nextSpotlight(run).id).toBe("Brakka");
    // Brakka keeps it (a hit with Hope): Tovin next.
    pcTurnBegin(run, "Brakka");
    pcTurnEnd(run, "Brakka", []);
    expect(nextSpotlight(run).id).toBe("Tovin");
    // Tovin hands it off: an adversary, the one that has waited longest.
    pcTurnBegin(run, "Tovin");
    pcTurnEnd(run, "Tovin", [{ type: "handoff", handoff: true, sure: true }]);
    expect(nextSpotlight(run).id).toBe("B1");
    liveTurn(run, "B1");
    // Back to the players, after Tovin: Brakka (round again). B2 has waited longest now, for the next hand-off.
    expect(nextSpotlight(run).id).toBe("Brakka");
    pcTurnBegin(run, "Brakka");
    pcTurnEnd(run, "Brakka", [{ type: "handoff", handoff: true, sure: true }]);
    const next = nextSpotlight(run);
    expect(next.id).toBe(run.byId.get("B2").status === STATUS.STANDING ? "B2" : "B1");
  });
});

describe("the conditions its sheets carry", () => {
  /** The system's statuses (its conditions, and how a fight ends): Actor#toggleStatusEffect refuses any other. */
  const STATUSES = ["vulnerable", "hidden", "restrained", "deathMove", "defeated", "unconscious", "dead"];
  const raider = () => {
    const actor = {
      id: "r1", uuid: "Actor.r1", name: "Jagged Knife Raider", type: "adversary", img: "", statuses: new Set(), effects: [], items: [], toggled: [],
      system: { type: "standard", tier: 1, difficulty: 12, experiences: {}, resistance: { physical: {}, magical: {} },
        resources: { hitPoints: { max: 5, value: 0 }, stress: { max: 3, value: 0 } }, damageThresholds: { major: 8, severe: 14 } },
      async toggleStatusEffect(id, { active }) {
        if ( !STATUSES.includes(id) ) throw new Error(`no status ${id}`);
        this.toggled.push(id);
        if ( active ) this.statuses.add(id);
        else this.statuses.delete(id);
      },
      async update() {}
    };
    return { id: "t-r1", uuid: "Scene.s1.Token.t-r1", name: actor.name, actor, texture: { src: "" } };
  };
  const adapter = new DaggerheartAdapter();
  /** One turn's change set (engine/changes.js) with only conditions in it, written onto the token's sheet. */
  const commit = async (token, conditions) => adapter.commitChanges(token, await adapter.toCombatantSpec(token), { conditions }, { system: {} }, {});
  const read = async token => (await adapter.readLiveState(token)).conditions;

  test("each one laid reads back as the same key, and taken off is gone: Vulnerable, Hidden, Restrained (the engine's immobilized too)", async () => {
    for ( const [key, status] of [["vulnerable", "vulnerable"], ["hidden", "hidden"], ["restrained", "restrained"], ["immobilized", "restrained"]] ) {
      const token = raider();
      expect(adapter.sheetCarries(key)).toBe(true);
      const laid = await commit(token, { set: { [key]: 1 }, cleared: [] });
      expect(token.actor.statuses).toEqual(new Set([status]));
      expect((await read(token))[key]).toBe(1);
      // (Undone, it comes off again.)
      expect(laid.statuses).toEqual([{ id: status, active: false, overlay: false }]);
      const lifted = await commit(token, { set: {}, cleared: [key] });
      expect(token.actor.statuses.size).toBe(0);
      expect((await read(token))[key]).toBeUndefined();
      expect(lifted.statuses).toEqual([{ id: status, active: true, overlay: false }]);
    }
  });

  test("Restrained is the engine's restrained and immobilized: either lays it, both read back; either taken off lifts it, unless the other is laid", async () => {
    const token = raider();
    await commit(token, { set: { immobilized: 1 }, cleared: [] });
    expect(await read(token)).toEqual({ restrained: 1, immobilized: 1 });
    // (Laid again, it's on already: nothing more.)
    const again = await commit(token, { set: { restrained: 1 }, cleared: [] });
    expect([again.statuses, token.actor.toggled]).toEqual([[], ["restrained"]]);
    // (One that can move again is no longer Restrained.)
    await commit(token, { set: {}, cleared: ["restrained"] });
    expect(await read(token)).toEqual({});
    await commit(token, { set: { immobilized: 1 }, cleared: ["restrained"] });
    expect(await read(token)).toEqual({ restrained: 1, immobilized: 1 });
  });

  test("one the system has no status for (frightened) isn't written: the core keeps it", async () => {
    const token = raider();
    expect(adapter.sheetCarries("frightened")).toBe(false);
    const laid = await commit(token, { set: { frightened: 2 }, cleared: [] });
    const lifted = await commit(token, { set: {}, cleared: ["frightened"] });
    expect([laid.statuses, lifted.statuses, token.actor.toggled]).toEqual([[], [], []]);
    expect(await read(token)).toEqual({});
  });

  test("for every condition the GM can choose, sheetCarries says whether the sheet gives it back", async () => {
    for ( const { key, valued } of adapter.conditionChoices() ) {
      const token = raider();
      await commit(token, { set: { [key]: valued ? 2 : 1 }, cleared: [] });
      expect([key, (await read(token))[key] > 0]).toEqual([key, adapter.sheetCarries(key)]);
      await commit(token, { set: {}, cleared: [key] });
      expect([key, await read(token)]).toEqual([key, {}]);
    }
  });

  test("the choices: Daggerheart's own (none counted), then the core's; in the system's words, none for the engine's others", () => {
    const choices = adapter.conditionChoices();
    expect(choices.slice(0, 3)).toEqual([{ key: "vulnerable" }, { key: "hidden" }, { key: "restrained" }]);
    expect(choices.slice(3)).toEqual([...CORE_CONDITIONS]);
    expect(adapter.conditionLabel("restrained")).toBe(text("FFDAGGERHEART.Condition.restrained"));
    expect([adapter.conditionLabel("immobilized"), adapter.conditionLabel("frightened"), adapter.conditionLabel("toString")]).toEqual([null, null, null]);
    // (The system's own word, where it has one.)
    const i18n = globalThis.game.i18n;
    const own = "DAGGERHEART.CONFIG.Condition.hidden.name";
    globalThis.game.i18n = { ...i18n, has: k => k === own || i18n.has(k), localize: k => (k === own ? "Oculto" : i18n.localize(k)) };
    expect(adapter.conditionLabel("hidden")).toBe("Oculto");
  });

  test("in a live battle: the GM's immobilized goes on the sheet as Restrained, the engine reads it back; taken off, it's gone", async () => {
    const traits = { tactical: { base: 60, fudge: 0 }, brave: { base: 70, fudge: 0 }, selfish: { base: 30, fudge: 0 }, loyal: { base: 70, fudge: 0 } };
    const unit = (id, side) => ({
      id, name: id, side, kind: "npc", level: 1, adversaryType: "standard", hp: { value: 5, max: 5 }, stressMax: 3, resources: { stress: 3 },
      defenses: { ac: 12 }, initiative: { mod: 0 }, speeds: { walk: 30 },
      actions: [{ id: `${id}.daggers`, name: "Daggers", kind: "strike", bonus: 1, melee: true, reach: 5, damage: [parseFormula("1d8+1", "physical")] }],
      iwr: { immune: [], resist: {}, weak: {}, dh: { thresholds: { major: 8, severe: 14 }, physical: {}, magical: {}, reduce: {} } }, traits, flags: { fearless: true }, diesAtZero: true
    });
    const run = beginLive({
      combatants: [unit("A", "friendly"), unit("B", "hostile")],
      sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Bandits", enemies: ["friendly"] } },
      options: { positioning: false, maxRounds: 10, talking: false, system: { fear: 3, spending: "steady" }, initiativeOrder: ["A", "B"] }
    }, daggerheartRules, { seed: 3, players: [] });
    const u = run.byId.get("B");
    const token = raider();
    // What the GM does, written (live-battle.js liveCondition), then the sheet read again for the next turn.
    const gm = async op => {
      const before = captureUnit(u, daggerheartRules);
      setCondition(run, "B", op);
      const after = captureUnit(u, daggerheartRules);
      await adapter.commitChanges(token, await adapter.toCombatantSpec(token), diffOutcome(before, after), after, { before });
      const state = await adapter.readLiveState(token);
      syncFromSheets(run, { B: { ...state, carries: key => adapter.sheetCarries(key) } });
    };
    await gm({ key: "immobilized" });
    expect(token.actor.statuses).toEqual(new Set(["restrained"]));
    expect(u.conds).toMatchObject({ restrained: 1, immobilized: 1 });
    await gm({ key: "immobilized", value: 0 });
    expect(token.actor.statuses.size).toBe(0);
    expect(u.conds.restrained ?? 0).toBe(0);
    expect(u.conds.immobilized ?? 0).toBe(0);
  });
});
