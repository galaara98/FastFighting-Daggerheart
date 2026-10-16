/**
 * Breaking free in Daggerheart (the core's holds): each creature's way out and how hard its own grip is to break, the
 * sheet's Restrained, improvised bonds, a character's action roll (Hope, Fear, the spotlight), an adversary's spotlight,
 * a friend freeing another, what it costs, what restrains a foe, and the setting for spells while tied up.
 */
import { describe, expect, test } from "vitest";
import { DaggerheartAdapter } from "../scripts/adapter.js";
import { daggerheartRules } from "../scripts/rules.js";
import { toActionSpec, traitMoves, RANGES } from "../scripts/actions.js";
import { registerTiedStopsSpells } from "../scripts/tied-up.js";
import { parseFormula, applyOutcome, STATUS } from "../scripts/core.js";
import { beginRun, beginRound, takeTurn, prepareBattle } from "../../FastFighting/scripts/engine/simulator.js";
import * as holds from "../../FastFighting/scripts/engine/behavior/holds.js";
import { text } from "./foundry-i18n.js";

/** Dice that come up as listed, then the last over and over. */
const fixed = (...rolls) => {
  let i = 0;
  return { die: () => rolls[Math.min(i++, rolls.length - 1)], chance: () => true, next: () => 0.5 };
};
const trait = v => ({ value: v });
const tokenOf = actor => ({ id: `t-${actor.id}`, name: actor.name, actor, texture: { src: "" } });
const sword = { type: "attack", range: "melee", target: { type: "any", amount: 1 }, roll: { type: "attack", trait: "strength" }, cost: [],
  damage: { main: { type: ["physical"], applyTo: "hitPoints", value: { dice: "d10", bonus: 3, multiplier: "prof", flatMultiplier: 1 } } } };
const character = (traits, weapon = { burden: "oneHanded" }) => ({
  id: "a1", uuid: "Actor.a1", name: "Wren", type: "character", img: "", statuses: new Set(), items: [],
  system: {
    traits: Object.fromEntries(Object.entries(traits).map(([k, v]) => [k, trait(v)])),
    levelData: { level: { current: 1 } }, proficiency: 1, evasion: 12, damageThresholds: { major: 6, severe: 12 },
    resources: { hitPoints: { max: 6, value: 0 }, stress: { max: 6, value: 0 }, hope: { value: 2, max: 6 } }, armorScore: { max: 3, value: 0 },
    experiences: {}, gold: {}, primaryWeapon: { id: "w1", name: "Greatsword", system: { attack: sword, ...weapon }, effects: [] }, secondaryWeapon: null,
    resistance: { physical: {}, magical: {} }, rules: {}
  }
});
const raider = () => ({
  id: "r1", uuid: "Actor.r1", name: "Jagged Knife Raider", type: "adversary", img: "", statuses: new Set(), items: [],
  system: { type: "standard", tier: 1, difficulty: 13, experiences: {}, resistance: { physical: {}, magical: {} },
    resources: { hitPoints: { max: 5, value: 0 }, stress: { max: 3, value: 0 } }, damageThresholds: { major: 8, severe: 14 },
    attack: { ...sword, name: "Daggers", roll: { type: "attack", bonus: 2 } } }
});

/** A creature as the engine holds it, for the rules' own hooks: a player character, or (pc false) an adversary. */
const unit = ({ id = "u", pc = true, level = 1, escapeWork = pc ? { mod: 1, label: "Agility", bonds: { mod: 2, label: "Finesse" } } : { mod: 2 }, conds = {} } = {}) => ({
  id, side: "friendly", status: STATUS.STANDING, active: true, resources: { hope: 2, stress: 6 }, sharedPools: { fear: 3 },
  baseConds: { ...conds }, conds: { ...conds }, effects: [],
  spec: { name: id, ...(pc ? { duality: true } : {}), level, hopeMax: 6, stressMax: 6, experiences: [], escapeWork }
});
const run = rng => ({ rng, prep: { rules: daggerheartRules }, byId: new Map() });

describe("each creature's way out, and its own grip", () => {
  test("a character: Strength or Agility out of a grip, Strength or Finesse out of bonds; its grip 12 + its Strength", async () => {
    const adapter = new DaggerheartAdapter();
    const nimble = await adapter.toCombatantSpec(tokenOf(character({ agility: 1, strength: -1, finesse: 2, instinct: 0, presence: 0, knowledge: 0 })));
    expect(nimble.escapeWork).toEqual({ mod: 1, label: text("FFDAGGERHEART.Trait.agility"), bonds: { mod: 2, label: text("FFDAGGERHEART.Trait.finesse") } });
    expect(nimble.escapeDC).toBe(12);
    // (Even: Strength, the first.)
    const strong = await adapter.toCombatantSpec(tokenOf(character({ agility: 2, strength: 2, finesse: 0, instinct: 0, presence: 0, knowledge: 0 })));
    expect(strong.escapeWork).toMatchObject({ mod: 2, label: text("FFDAGGERHEART.Trait.strength"), bonds: { mod: 2, label: text("FFDAGGERHEART.Trait.strength") } });
    expect(strong.escapeDC).toBe(14);
  });

  test("a weapon needs as many hands as its burden", async () => {
    const adapter = new DaggerheartAdapter();
    const traits = { agility: 0, strength: 1, finesse: 0, instinct: 0, presence: 0, knowledge: 0 };
    expect((await adapter.toCombatantSpec(tokenOf(character(traits)))).actions[0]).toMatchObject({ kind: "strike", hands: 1 });
    expect((await adapter.toCombatantSpec(tokenOf(character(traits, { burden: "twoHanded" })))).actions[0]).toMatchObject({ kind: "strike", hands: 2 });
  });

  test("an adversary: its attack modifier for bonds; its grip its Difficulty. An NPC's, its Difficulty; a companion's, 12", async () => {
    const adapter = new DaggerheartAdapter();
    expect(await adapter.toCombatantSpec(tokenOf(raider()))).toMatchObject({ escapeWork: { mod: 2 }, escapeDC: 13 });
    const clerk = { id: "n1", uuid: "Actor.n1", name: "Clerk", type: "npc", img: "", statuses: new Set(), items: [], system: { difficulty: 11 } };
    expect(await adapter.toCombatantSpec(tokenOf(clerk))).toMatchObject({ escapeWork: { mod: 0 }, escapeDC: 11 });
    const fang = { id: "c1", uuid: "Actor.c1", name: "Fang", type: "companion", img: "", statuses: new Set(), items: [],
      system: { partner: null, evasion: 12, proficiency: 1, experiences: {}, resources: { stress: { max: 3, value: 0 } }, levelData: { level: { current: 1 } }, rules: {} } };
    expect(await adapter.toCombatantSpec(tokenOf(fang))).toMatchObject({ escapeWork: { mod: 0, bonds: { mod: 0 } }, escapeDC: 12 });
  });
});

describe("what holds it, and how hard it is to break", () => {
  test("the sheet's Restrained is one hold, at the tier's typical Difficulty, that a friend can try to break", () => {
    const r = run(fixed(1));
    const held = unit({ conds: { restrained: 1, immobilized: 1 } });
    expect(holds.holdsOf(r, held)).toEqual([expect.objectContaining({ key: "restrained", dc: 12, others: "check", sheet: true })]);
    expect(holds.holdsOf(r, unit({ level: 7, conds: { restrained: 1, immobilized: 1 } }))[0].dc).toBe(14);
    // (FastFighting's "can't move" alone is Restrained too; Vulnerable and Hidden hold nothing.)
    expect(holds.holdsOf(r, unit({ conds: { immobilized: 1 } }))).toEqual([expect.objectContaining({ key: "immobilized", dc: 12 })]);
    expect(holds.holdsOf(r, unit({ conds: { vulnerable: 1, hidden: 1 } }))).toEqual([]);
  });

  test("improvised bonds: two over the tier's typical Difficulty (14 in tier 1)", () => {
    expect([1, 4, 7, 10].map(level => daggerheartRules.bondsDC({ spec: { level } }))).toEqual([14, 15, 16, 17]);
    const prisoner = Object.assign(unit(), { bound: true, status: STATUS.BOUND });
    expect(holds.holdsOf(run(fixed(1)), prisoner)).toEqual([expect.objectContaining({ key: "bound", dc: 14, others: "untie" })]);
  });

  test("an adversary's grab is broken against its Difficulty", () => {
    const r = run(fixed(1));
    const bandit = unit({ id: "b", pc: false });
    bandit.spec.escapeDC = 13;
    r.byId.set("b", bandit);
    const held = Object.assign(unit(), { grabbedBy: "b" });
    expect(holds.holdsOf(r, held)).toEqual([expect.objectContaining({ key: "grabbed", byId: "b", dc: 13 })]);
  });

  test("a try costs the spotlight's action; so does freeing a friend", () => {
    const hold = { key: "restrained", dc: 12, others: "check" };
    expect(daggerheartRules.escapeCost(unit(), hold)).toEqual({ action: 1 });
    expect(daggerheartRules.untieCost(unit(), unit({ id: "f" }), hold)).toEqual({ action: 1 });
  });
});

describe("a try at breaking free", () => {
  const restrained = { key: "restrained", dc: 12, others: "check", sheet: true };

  /** The roll in the log's words: the trait, the numbers (the core's), how the Duality Dice went. */
  const said = (trait, natural, mod, total, dc, note) => text("FFDAGGERHEART.BreakFree.Trait", {
    trait, roll: text("FASTFIGHTING.Log.RollOwn", { natural, mod: `+${mod}`, total, label: text("FFDAGGERHEART.Difficulty"), dc }), note
  });

  test("a character: an action roll on the Duality Dice, its better trait, Hope for it; broken, Restrained comes off whole", () => {
    const r = run(fixed(9, 4));
    const u = unit({ conds: { restrained: 1, immobilized: 1 } });
    const hold = holds.holdsOf(r, u)[0];
    const got = holds.tryHold(r, u, hold);
    expect(got).toEqual({ success: true, degree: 2, dc: 12, said: { text: said("Agility", 13, 1, 14, 12, text("FFDAGGERHEART.Note.Hope", { hope: 9, fear: 4 })) } });
    expect(u.resources.hope).toBe(3);
    holds.release(r, u, hold);
    expect([u.baseConds, u.conds]).toEqual([{}, {}]);
  });

  test("with Fear: the GM gains a Fear and the spotlight; a failure keeps it Restrained", () => {
    const u = unit({ conds: { restrained: 1, immobilized: 1 } });
    expect(daggerheartRules.breakFree(run(fixed(2, 5)), u, restrained)).toMatchObject({ success: false, degree: 1 });
    expect([u.sharedPools.fear, u.handoff]).toEqual([4, true]);
    expect(u.baseConds).toEqual({ restrained: 1, immobilized: 1 });
  });

  test("bonds: Strength or Finesse, against bondsDC; a hold with no Difficulty known, what's typical for its tier", () => {
    const u = unit();
    const note = text("FFDAGGERHEART.Note.Hope", { hope: 6, fear: 5 });
    expect(daggerheartRules.breakFree(run(fixed(6, 5)), u, { key: "bound", dc: 14, others: "untie" })).toEqual({ success: false, degree: 1, dc: 14, said: { text: said("Finesse", 11, 2, 13, 14, note) } });
    expect(daggerheartRules.breakFree(run(fixed(6, 4)), u, { key: "grabbed", dc: null, others: null })).toMatchObject({ success: false, dc: 12 });
    // (Of the held one's tier, when a friend tries.)
    expect(daggerheartRules.breakFree(run(fixed(6, 4)), u, { key: "restrained", dc: null, others: "check" }, { freeing: true, held: unit({ level: 7 }) })).toMatchObject({ dc: 14 });
  });

  test("a companion: its partner's Duality Dice, no trait of its own", () => {
    const partner = unit({ id: "p" });
    const fang = { ...unit({ id: "fang", pc: false, escapeWork: { mod: 0, bonds: { mod: 0 } } }), partner };
    fang.spec.companionRoll = true;
    const got = daggerheartRules.breakFree(run(fixed(3, 8)), fang, restrained);
    expect(got.said.text).toBe(text("FFDAGGERHEART.BreakFree.Plain", { roll: text("FASTFIGHTING.Log.RollOwn", { natural: 11, mod: "+0", total: 11, label: text("FFDAGGERHEART.Difficulty"), dc: 12 }), note: text("FFDAGGERHEART.Note.Fear", { hope: 3, fear: 8 }) }));
    expect(partner.handoff).toBe(true);
  });

  test("an adversary clears a hold when the GM spotlights it, no roll; bonds take the d20 and its attack modifier", () => {
    const bandit = unit({ id: "b", pc: false, conds: { restrained: 1, immobilized: 1 } });
    expect(daggerheartRules.breakFree(run(fixed(1)), bandit, restrained)).toEqual({ success: true });
    const bonds = { key: "bound", dc: 14, others: "untie" };
    expect(daggerheartRules.breakFree(run(fixed(12)), bandit, bonds)).toEqual({ success: true, degree: 2, natural: 12, mod: 2, total: 14, dc: 14 });
    expect(daggerheartRules.breakFree(run(fixed(11)), bandit, bonds)).toMatchObject({ success: false });
    expect(bandit.sharedPools.fear).toBe(3);
  });

  test("a friend beside it: Strength or Finesse; broken, Restrained comes off the friend, and an effect's other conditions stay", () => {
    const r = run(fixed(8, 3));
    const friend = unit({ id: "f" });
    friend.effects.push({ key: "kneebreaker", conditions: { restrained: 1, immobilized: 1, vulnerable: 1 }, sourceId: null, rounds: 2, escape: { dc: 12, others: "check" } });
    const hold = holds.holdsOf(r, friend)[0];
    const helper = unit({ id: "h" });
    expect(holds.tryHold(r, helper, hold, { freeing: true, held: friend })).toMatchObject({ success: true, said: { text: said("Finesse", 11, 2, 13, 12, text("FFDAGGERHEART.Note.Hope", { hope: 8, fear: 3 })) } });
    holds.release(r, friend, hold);
    expect(friend.effects).toEqual([expect.objectContaining({ key: "kneebreaker", conditions: { vulnerable: 1 } })]);
    // (Bonds a friend unties: the core's, no roll.)
    expect(daggerheartRules.breakFree(r, helper, { key: "bound", dc: 14, others: "untie" }, { freeing: true, held: friend })).toBe(null);
  });

  test("in a fight: Restrained, no foe near, it breaks free on its spotlight, and moves again", () => {
    const traits = { tactical: { base: 60, fudge: 0 }, brave: { base: 95, fudge: 0 }, selfish: { base: 30, fudge: 0 }, loyal: { base: 60, fudge: 0 } };
    const iwr = { immune: [], resist: {}, weak: {}, dh: { thresholds: { major: 8, severe: 16 }, physical: {}, magical: {}, reduce: {} } };
    const hero = { id: "Brakka", name: "Brakka", side: "friendly", kind: "pc", duality: true, level: 1, hp: { value: 6, max: 6 }, hopeMax: 6, stressMax: 6,
      resources: { hope: 2, stress: 6 }, experiences: [], defenses: { ac: 11, strength: 2 }, initiative: { mod: 1 }, speeds: { walk: 30 },
      actions: [{ id: "Brakka.sword", name: "Longsword", kind: "strike", bonus: 2, melee: true, reach: 5, damage: [parseFormula("1d10+3", "physical")] }],
      iwr, traits, flags: { fearless: true }, diesAtZero: false, conditions: { restrained: 1, immobilized: 1 }, escapeWork: { mod: 2, label: "Strength", bonds: { mod: 2 } },
      position: { x: 0, y: 0, size: 5 } };
    const bandit = { id: "B1", name: "B1", side: "hostile", kind: "npc", level: 1, hp: { value: 5, max: 5 }, resources: {}, defenses: { ac: 12 }, initiative: { mod: 0 }, speeds: { walk: 30 },
      actions: [{ id: "B1.daggers", name: "Daggers", kind: "strike", bonus: 1, melee: true, reach: 5, damage: [parseFormula("1d8+1", "physical")] }],
      iwr, traits, flags: { fearless: true }, diesAtZero: true, position: { x: 120, y: 0, size: 5 } };
    let freed = 0;
    let fear = 0;
    for ( let seed = 1; seed <= 12; seed++ ) {
      const spec = { combatants: [structuredClone(hero), structuredClone(bandit)], sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Bandits", enemies: ["friendly"] } },
        options: { positioning: true, maxRounds: 4, talking: false, system: { fear: 2 } } };
      const r = beginRun(prepareBattle(spec, daggerheartRules), seed, { log: true });
      beginRound(r, 1);
      const u = r.byId.get("Brakka");
      takeTurn(r, u);
      const tried = r.log.find(e => e.actorId === "Brakka" && e.type === "escape");
      // (The Duality Dice in the system's words, not a d20's numbers.)
      expect(tried).toMatchObject({ hold: "restrained", dc: 12, said: expect.stringContaining("Strength") });
      expect(tried.natural).toBeUndefined();
      if ( tried.success ) {
        freed += 1;
        expect([u.conds.restrained ?? 0, u.conds.immobilized ?? 0]).toEqual([0, 0]);
      } else expect(u.handoff).toBe(true);
      fear += r.sharedPools.fear - 2;
    }
    expect(freed).toBeGreaterThan(0);
    expect(fear).toBeGreaterThan(0);
  });

  test("held where it is, it doesn't sprint", () => {
    const hurry = conds => {
      const u = Object.assign(unit({ conds }), { turnBehavior: { rush: 1 }, pos: { x: 0, y: 0 } });
      Object.assign(u.spec, { sprint: { range: 60, mod: 2 }, speeds: { walk: 30 } });
      const foe = { ...unit({ id: "b", pc: false }), side: "hostile", pos: { x: 100, y: 0 } };
      return daggerheartRules.startTurn({ rng: fixed(9, 4), units: [u, foe], prep: { options: { positioning: true }, sides: { friendly: { enemies: new Set(["hostile"]) } } } }, u);
    };
    expect(hurry({})).toEqual({ text: expect.any(String) });
    expect(hurry({ restrained: 1, immobilized: 1 })).toBe(null);
  });
});

describe("what restrains a foe says how it's broken", () => {
  const binding = { type: "effect", range: "close", target: { type: "any" }, cost: [], effects: [{ _id: "e1" }] };
  const effectsById = new Map([["e1", { statuses: ["restrained"], changes: [] }]]);

  test("an adversary's: against its Difficulty; a character's: none known here; Grapple's critical: 12 + its Strength", () => {
    expect(toActionSpec(binding, { id: "x", pc: false, difficulty: 14, ranges: RANGES, effectsById }).outcome.escape).toEqual({ dc: 14, others: "check" });
    expect(toActionSpec(binding, { id: "x", pc: true, ranges: RANGES, effectsById }).outcome.escape).toEqual({ dc: null, others: "check" });
    const grapple = traitMoves({ id: "p", traits: { strength: 2 } }).find(a => a.traitMove === "grapple");
    expect(grapple.onHit[3].escape).toEqual({ dc: 14, others: "check" });
    // (A plain success is the core's grab: as hard to break as the one grappling's grip, its escapeDC.)
    expect(grapple.onHit[2]).toEqual({ grab: true });
    // (Nothing to break in what doesn't restrain.)
    const exposing = new Map([["e1", { statuses: ["vulnerable"], changes: [] }]]);
    expect(toActionSpec(binding, { id: "x", pc: false, difficulty: 14, ranges: RANGES, effectsById: exposing }).outcome.escape).toBeUndefined();
  });

  test("laid on a foe, it's a hold: an adversary breaks it on its spotlight, no roll, and moves again", () => {
    const grapple = traitMoves({ id: "p", traits: { strength: 2 } }).find(a => a.traitMove === "grapple");
    const bandit = unit({ id: "b", pc: false });
    applyOutcome(bandit, grapple.onHit[3], "p", grapple);
    const r = run(fixed(1));
    const [hold] = holds.holdsOf(r, bandit);
    expect(hold).toMatchObject({ key: "restrained", byId: "p", dc: 14, others: "check" });
    expect(holds.tryHold(r, bandit, hold)).toEqual({ success: true });
    holds.release(r, bandit, hold);
    expect([bandit.conds.restrained ?? 0, bandit.conds.immobilized ?? 0]).toEqual([0, 0]);
  });
});

describe("tied up, and spells", () => {
  test("the world's setting reaches the rules: on by default, off when the GM says", () => {
    expect(daggerheartRules.tiedStopsSpells).toBe(true);
    globalThis.game.settings = { get: (module, key) => (module === "fast-fighting-daggerheart" && key === "tiedStopsSpells" ? false : undefined) };
    expect(daggerheartRules.tiedStopsSpells).toBe(false);
    globalThis.game.settings.get = () => true;
    expect(daggerheartRules.tiedStopsSpells).toBe(true);
  });

  test("registered as a world setting, on by default, in the module's words", () => {
    const registered = [];
    globalThis.game.settings = { register: (...args) => registered.push(args) };
    registerTiedStopsSpells();
    expect(registered).toEqual([["fast-fighting-daggerheart", "tiedStopsSpells", expect.objectContaining({ scope: "world", config: true, type: Boolean, default: true })]]);
    expect(text(registered[0][2].name)).toBeTruthy();
    expect(text(registered[0][2].hint)).toBeTruthy();
  });

  test("the core reads it for a spell; a weapon needs its hands either way", () => {
    const spell = { id: "s", kind: "spell-attack", magical: true };
    const greatsword = { id: "g", kind: "strike", hands: 2, magical: true };
    expect([holds.needsHands(daggerheartRules, spell), holds.needsHands(daggerheartRules, greatsword)]).toEqual([true, true]);
    globalThis.game.settings = { get: () => false };
    expect([holds.needsHands(daggerheartRules, spell), holds.needsHands(daggerheartRules, greatsword)]).toEqual([false, true]);
    expect(daggerheartRules.handsKnown).toBeUndefined();
  });
});

describe("natural attacks need no free hands", () => {
  const beastly = (img, extra = {}) => {
    const actor = raider();
    actor.system.attack = { ...actor.system.attack, name: "Attack", img };
    Object.assign(actor.system, extra);
    return actor;
  };
  const attackOf = async actor => (await new DaggerheartAdapter().toCombatantSpec(tokenOf(actor))).actions[0];

  test("one shown with its own body (claws, fangs, a tail, a fist, a horn): none; a weapon's, as the core has it", async () => {
    for ( const img of ["icons/creatures/claws/claw-straight-brown.webp", "icons/creatures/abilities/mouth-teeth-long-red.webp", "icons/commodities/biological/tail-lizard-red.webp",
      "icons/commodities/bones/horn-drinking-white.webp", "icons/skills/melee/unarmed-punch-fist.webp", "icons/magic/earth/strike-fist-stone.webp"] ) {
      const a = await attackOf(beastly(img));
      expect(a.hands).toBe(0);
      expect(holds.needsHands(daggerheartRules, a)).toBe(false);
    }
    for ( const img of ["icons/weapons/daggers/dagger-twin-green.webp", "icons/skills/melee/sword-shield-stylized-white.webp", "", undefined] ) {
      const a = await attackOf(beastly(img));
      expect(a.hands).toBeUndefined();
      expect(holds.needsHands(daggerheartRules, a)).toBe(true);
    }
  });

  test("a beast's, whatever its icon; its features' too; a Horde's lesser attack as its full one; a companion's", async () => {
    const wolf = beastly("icons/skills/melee/blood-slash-foam-red.webp", { type: "skulk", motivesAndTactics: "Hunt prey, keep to the pack" });
    wolf.items = [{ id: "f1", type: "feature", name: "Pounce", system: { featureForm: "action", actions: [{ _id: "p", type: "attack", range: "melee", target: { type: "any", amount: 1 }, roll: { type: "attack" }, cost: [], damage: sword.damage }] }, effects: [] }];
    const spec = await new DaggerheartAdapter().toCombatantSpec(tokenOf(wolf));
    expect(spec.actions.map(a => a.hands)).toEqual([0, 0]);
    const pack = beastly("icons/creatures/abilities/mouth-teeth-long-red.webp", { type: "horde", typeData: { hordeDamage: "1d4" } });
    expect((await new DaggerheartAdapter().toCombatantSpec(tokenOf(pack))).actions.filter(a => a.horde).map(a => a.hands)).toEqual([0, 0]);
    const fang = { id: "c1", uuid: "Actor.c1", name: "Fang", type: "companion", img: "", statuses: new Set(), items: [],
      system: { partner: null, evasion: 12, proficiency: 1, experiences: {}, resources: { stress: { max: 3, value: 0 } }, levelData: { level: { current: 1 } }, rules: {},
        attack: { ...sword, name: "Bite", roll: { type: "attack", bonus: 2 } } } };
    expect(await attackOf(fang)).toMatchObject({ kind: "strike", hands: 0 });
  });
});
