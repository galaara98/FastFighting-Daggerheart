/**
 * Live battles in Daggerheart: a player character's spotlight read from the system's cards, and whom FastFighting
 * would spotlight next.
 */
import { describe, expect, test } from "vitest";
import { readDaggerheartTurn } from "../scripts/read-turn.js";
import { daggerheartRules } from "../scripts/rules.js";
import { beginLive, liveRound, liveTurn, pcTurnBegin, pcTurnEnd, nextSpotlight } from "../../FastFighting/scripts/engine/live.js";
import { parseFormula, STATUS } from "../scripts/core.js";

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
