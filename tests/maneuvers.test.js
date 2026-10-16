/**
 * Daggerheart's maneuvers on the core's catalog (its maneuvers.js): the trait moves anyone can make (Grapple, Shove,
 * Maneuver), an SRD adversary's features that knock a foe back, pull it in, knock it over or seize it (known by their
 * ids), on their own or with its standard attack, a fall from a height (the SRD's guide, by the range fallen; nobody
 * lands prone), and a knockback stopped short (the SRD's guide's collision).
 */
import { describe, expect, test } from "vitest";
import { DaggerheartAdapter } from "../scripts/adapter.js";
import { daggerheartRules } from "../scripts/rules.js";
import { traitMoves, featureMove, attackMove, toActionSpec, RANGES } from "../scripts/actions.js";
import { parseFormula, part, STATUS } from "../scripts/core.js";
import { beginRun, beginRound, takeTurn, prepareBattle } from "../../FastFighting/scripts/engine/simulator.js";
import { withManeuver } from "../../FastFighting/scripts/engine/maneuvers.js";
import { fallDamage } from "../../FastFighting/scripts/engine/behavior/forced.js";
import { maneuverOf } from "../../FastFighting/scripts/story/master.js";

/** A world's own Range Measurement (its variant rule): a grid of 5-foot squares, counted short. */
const SHORT = { ...RANGES, veryClose: 10, close: 20, far: 40, veryFar: 80 };

describe("the trait moves, as the core's maneuvers", () => {
  const [grapple, maneuver, , shove] = traitMoves({ id: "w", traits: { strength: 2, agility: 1 }, ranges: RANGES });

  test("Grapple: held (the core's grab); on a critical, Restrained as well, broken against 12 + its Strength; no botch", () => {
    expect(grapple).toMatchObject({ maneuver: "grapple", check: { mod: 2, against: "ac" } });
    expect(grapple.onHit[2]).toEqual({ grab: true });
    expect(grapple.onHit[3]).toMatchObject({ grab: true, conditions: { restrained: 1, immobilized: 1 }, escape: { dc: 14, others: "check" } });
    // (The Duality Dice never fail critically, and Daggerheart has no prone: nothing of the core's botch.)
    expect([grapple.onHit[0], grapple.onHit[1]]).toEqual([null, null]);
  });

  test("Shove (Strength): out of Melee to Very Close; on a critical, as far as Close; by the world's ranges", () => {
    expect(shove).toMatchObject({ maneuver: "shove", kind: "control", check: { mod: 2, against: "ac" }, melee: true });
    expect(shove.onHit.map(o => o?.move ?? null)).toEqual([null, null, { kind: "push", feet: 10 }, { kind: "push", feet: 25 }]);
    const short = traitMoves({ id: "w", traits: { strength: 2 }, ranges: SHORT }).find(a => a.traitMove === "shove");
    expect(short.onHit.slice(2).map(o => o.move.feet)).toEqual([5, 15]);
  });

  test("Maneuver (Agility): Vulnerable, told as a feint; each keeps its own outcomes, and the story knows each", () => {
    expect(maneuver).toMatchObject({ maneuver: "feint", check: { mod: 1 } });
    expect(maneuver.onHit[2].conditions).toEqual({ vulnerable: 1 });
    for ( const a of [grapple, shove, maneuver] ) {
      expect(withManeuver(a)).toBe(a);
      expect(maneuverOf(a)).toBe(a.maneuver);
    }
  });
});

describe("an SRD adversary's features, by their ids", () => {
  test("knocked back to a band (from where the feature reaches), or by one; pulled in; knocked over: the core's maneuver for each", () => {
    // (Deeproot Defender's Ground Slam: all within Very Close, out to Far.)
    expect(featureMove("0DSCzAFXy0hV4afJ", { type: "damage", range: "veryClose", areas: [{ size: "veryClose" }] })).toEqual({ maneuver: "fling", move: { kind: "push", feet: 45, knockback: true } });
    // (Minor Fire Elemental's Explosion: all within Close, out to Far.)
    expect(featureMove("ESnu3I89BmUdBZEk", { type: "attack", range: "close", areas: [{ size: "close" }] })).toEqual({ maneuver: "fling", move: { kind: "push", feet: 30, knockback: true } });
    // (The Banshee's wail: all within Close, to Close: from Melee, to the edge of it.)
    expect(featureMove("CSrzB2SNFXb3Y5b6", { type: "attack", range: "", areas: [{ size: "close" }] })).toEqual({ maneuver: "shove", move: { kind: "push", feet: 25, knockback: true } });
    // (The Cloud Titan's Wind Worker: Far from where it stood.)
    expect(featureMove("HhuXSt7z9vfEQi8k", { type: "damage", range: "close" }).move).toEqual({ kind: "push", feet: 60, knockback: true });
    // (Deeproot Defender's Grab and Drag, from Close; the Cephilith Abomination's tongue, from Far.)
    expect(featureMove("rreGFW5TbhUoZf2T", { type: "attack", range: "close" })).toEqual({ maneuver: "drag", move: { kind: "pull", feet: 25 } });
    expect(featureMove("7DSC9gbRVC7j7nKh", { type: "effect", range: "far" }).move).toEqual({ kind: "pull", feet: 55 });
    // (The Acid Burrower's Earth Eruption knocks them over: Vulnerable, its own effect. The Bear's Bite seizes.)
    expect(featureMove("ctXYwil2D1zfsekT", { type: "attack", range: "veryClose" })).toEqual({ maneuver: "trip" });
    expect(featureMove("zgR0MEqyobKp2yXr", { type: "attack", range: "melee" })).toEqual({ maneuver: "grapple" });
  });

  test("only the action that does it; the world's ranges; nothing for any other feature, whatever it's called", () => {
    // (The Roc's Here Comes the Boom: its attack doesn't move anyone; its reaction roll does.)
    expect(featureMove("JHpHvFvrJGI2Kwe1", { _id: "Gpe0jznvJvDjA5YP", type: "attack" })).toBe(null);
    expect(featureMove("JHpHvFvrJGI2Kwe1", { _id: "glnoG8JVxdGxNoyJ", type: "attack" })).toEqual({ maneuver: "shove", move: { kind: "push", feet: 30, knockback: true } });
    expect(featureMove("0DSCzAFXy0hV4afJ", { type: "damage", range: "veryClose", areas: [{ size: "veryClose" }] }, SHORT).move.feet).toBe(30);
    expect([featureMove("f1", { type: "damage" }), featureMove("toString", {}), featureMove(null, {})]).toEqual([null, null, null]);
  });

  const ctx = (moves, extra = {}) => ({ id: "x", label: "Feature", pc: false, attackBonus: 4, difficulty: 15, ranges: RANGES, moves, ...extra });
  const harm = (dice, bonus = 0, type = "physical") => ({ main: { type: [type], applyTo: "hitPoints", value: { dice, bonus, multiplier: "flat", flatMultiplier: 1 } } });
  const status = (...statuses) => new Map([["e1", { statuses, changes: [] }]]);

  test("an attack that knocks back: a control action on the same roll, its damage as ever, the move on a success", () => {
    // (The Frost Titan's Bull Rush.)
    const rush = { type: "attack", range: "close", target: { type: "any", amount: 1 }, roll: { type: "attack" }, cost: [{ key: "stress", value: 1 }], damage: harm("d10", 2) };
    const spec = toActionSpec(rush, ctx(featureMove("lxMzWFQOIpidX094", rush)));
    expect(spec).toMatchObject({ kind: "control", maneuver: "shove", bonus: 4, resource: "stress", magical: false, damage: [{ type: "physical" }] });
    expect(spec.onHit).toEqual([null, null, { label: "Feature", move: { kind: "push", feet: 25, knockback: true } }, { label: "Feature", move: { kind: "push", feet: 25, knockback: true } }]);
    // (Without its move, the same attack is a strike.)
    expect(toActionSpec(rush, ctx(null)).kind).toBe("strike");
  });

  test("a reaction roll that knocks back and lays Vulnerable: both on a failure, its damage halved or not as it says", () => {
    // (The Gargantuan Sea Turtle's Gigaton Splash.)
    const splash = { type: "attack", range: "", areas: [{ size: "far" }], target: { type: "any" }, save: { trait: "strength", damageMod: "none" }, cost: [], damage: harm("d8"), effects: [{ _id: "e1" }] };
    const spec = toActionSpec(splash, ctx(featureMove("3X0uVX5xsTcrpQ16", splash), { effectsById: status("vulnerable") }));
    expect(spec).toMatchObject({ kind: "control", maneuver: "shove", save: { type: "strength", dc: 15 }, area: { targets: 4 }, damage: [{ type: "physical" }] });
    expect(spec.onSave[0]).toMatchObject({ conditions: { vulnerable: 1 }, rounds: 2, move: { kind: "push", feet: 25 } });
    expect([spec.onSave[2], spec.onSave[3]]).toEqual([null, null]);
  });

  test("one with no roll simply happens; one that pulls in and restrains: the move with Restrained, broken against its Difficulty", () => {
    // (Ground Slam: its Stress isn't played, its knockback is.)
    const slam = { type: "damage", range: "veryClose", areas: [{ size: "veryClose" }], target: { type: "any" }, cost: [], damage: { main: null, resources: { stress: {} } } };
    expect(toActionSpec(slam, ctx(null))).toBe(null);
    expect(toActionSpec(slam, ctx(featureMove("0DSCzAFXy0hV4afJ", slam)))).toMatchObject({ kind: "control", auto: true, maneuver: "fling", outcome: { move: { kind: "push", feet: 45 } } });
    // (The Ahuizotl's Drag and Bag.)
    const bag = { type: "effect", range: "close", target: { type: "any", amount: 1 }, cost: [{ key: "fear", value: 1 }], effects: [{ _id: "e1" }] };
    const spec = toActionSpec(bag, ctx(featureMove("dqwQS5ZsTMHWUEPL", bag), { effectsById: status("restrained") }));
    expect(spec).toMatchObject({ kind: "control", auto: true, maneuver: "drag", resource: "fear", shared: "fear" });
    expect(spec.outcome).toMatchObject({ conditions: { restrained: 1, immobilized: 1 }, escape: { dc: 15, others: "check" }, move: { kind: "pull", feet: 25 } });
  });

  test("knocked over, Vulnerable: a trip; seized, Restrained: a grapple (the system's own hold, not the core's grab)", () => {
    const eruption = { type: "attack", range: "veryClose", areas: [{ size: "veryClose" }], target: { type: "any" }, save: { trait: "agility", damageMod: "none" }, cost: [], effects: [{ _id: "e1" }] };
    const trip = toActionSpec(eruption, ctx(featureMove("ctXYwil2D1zfsekT", eruption), { effectsById: status("vulnerable") }));
    expect(trip).toMatchObject({ kind: "control", maneuver: "trip", onSave: [{ conditions: { vulnerable: 1 } }, { conditions: { vulnerable: 1 } }, null, null] });
    expect(trip.onSave[0].move).toBeUndefined();
    const bite = { type: "attack", range: "melee", target: { type: "any" }, roll: { type: "attack" }, cost: [], damage: harm("d4", 10), effects: [{ _id: "e1" }] };
    const grapple = toActionSpec(bite, ctx(featureMove("zgR0MEqyobKp2yXr", bite), { effectsById: status("restrained") }));
    expect(grapple).toMatchObject({ kind: "control", maneuver: "grapple", bonus: 4, damage: [{ flat: 10 }] });
    expect(grapple.onHit[2]).toMatchObject({ conditions: { restrained: 1, immobilized: 1 }, escape: { dc: 15, others: "check" } });
    expect(grapple.onHit[2].grab).toBeUndefined();
  });

  test("read off an adversary's sheet: the feature with the SRD's id, not one with its name", async () => {
    const titan = (featureId, action) => ({ id: "t1", uuid: "Actor.t1", name: "Frost Titan", type: "adversary", img: "", statuses: new Set(),
      items: [{ id: featureId, type: "feature", name: "Bull Rush", system: { featureForm: "action", actions: [action] }, effects: [] }],
      system: { type: "solo", tier: 3, difficulty: 15, experiences: {}, resistance: { physical: {}, magical: {} }, attack: { name: "Club", type: "attack", range: "melee", roll: { type: "attack", bonus: 7 }, damage: harm("d10", 8), cost: [] },
        resources: { hitPoints: { max: 10, value: 0 }, stress: { max: 5, value: 0 } }, damageThresholds: { major: 20, severe: 35 } } });
    const rush = { _id: "XfNzlNYwGNaIIdcg", type: "attack", range: "close", target: { type: "any", amount: 1 }, roll: { type: "attack" }, cost: [{ key: "stress", value: 1 }], damage: harm("d10", 2) };
    const tokenOf = actor => ({ id: `t-${actor.id}`, name: actor.name, actor, texture: { src: "" } });
    const own = (await new DaggerheartAdapter().toCombatantSpec(tokenOf(titan("lxMzWFQOIpidX094", rush)))).actions.find(a => a.feature);
    expect(own).toMatchObject({ kind: "control", maneuver: "shove", bonus: 7, onHit: [null, null, { move: { kind: "push", feet: 25 } }, { move: { kind: "push", feet: 25 } }] });
    const copy = (await new DaggerheartAdapter().toCombatantSpec(tokenOf(titan("someOtherId0000", rush)))).actions.find(a => a.feature);
    expect(copy.kind).toBe("strike");
  });

  test("with its standard attack: knocked back to a band, pushed until that far off; pulled in from as far as the attack reaches", () => {
    // (The Bear's Overwhelming Force and the Vault Guardian Sentinel's Kinetic Slam: to Very Close, whoever it hurt only.)
    expect(attackMove("2fXzhh2qil8dw3vw", { range: "melee" }, RANGES, "Overwhelming Force")).toEqual({ kind: "move", move: { kind: "push", to: 15, knockback: true }, label: "Overwhelming Force", hurtOnly: true });
    expect(attackMove("eXgcX8stbsTetuoU", { range: "veryClose" })).toMatchObject({ move: { kind: "push", to: 15, knockback: true }, hurtOnly: true });
    // (The Greater Water Elemental's High Tide: to Close, by the world's ranges too; any hit.)
    expect(attackMove("BGE42W1XPd0vpimR", { range: "veryClose" }).move).toEqual({ kind: "push", to: 30, knockback: true });
    expect(attackMove("BGE42W1XPd0vpimR", { range: "veryClose" }).hurtOnly).toBeUndefined();
    expect(attackMove("BGE42W1XPd0vpimR", { range: "veryClose" }, SHORT).move.to).toBe(20);
    // (The Cursed Merfolk's "Get Over Here!": its Chained Trident reaches Far, and it pulls them in from there.)
    expect(attackMove("eX0tAOy7TD4wVgEY", { range: "far" }).move).toEqual({ kind: "pull", feet: 55 });
  });

  test("with its standard attack: not a maneuver of its own; nothing for a feature that isn't one, whatever it's called", () => {
    for ( const id of ["2fXzhh2qil8dw3vw", "eXgcX8stbsTetuoU", "BGE42W1XPd0vpimR", "eX0tAOy7TD4wVgEY"] ) expect(featureMove(id, { type: "effect", range: "melee" })).toBe(null);
    expect([attackMove("lxMzWFQOIpidX094", { range: "melee" }), attackMove("f1", {}), attackMove("toString", {}), attackMove(null, {})]).toEqual([null, null, null, null]);
  });

  test("read off an adversary's sheet: its standard attack carries the passive's knockback; a feature with another id, nothing", async () => {
    const bear = featureId => ({ id: "b1", uuid: "Actor.b1", name: "Bear", type: "adversary", img: "", statuses: new Set(),
      items: [{ id: featureId, type: "feature", name: "Overwhelming Force", system: { featureForm: "passive", actions: [] }, effects: [] }],
      system: { type: "bruiser", tier: 1, difficulty: 14, experiences: {}, resistance: { physical: {}, magical: {} }, attack: { name: "Claws", type: "attack", range: "melee", roll: { type: "attack", bonus: 1 }, damage: harm("d8", 3), cost: [] },
        resources: { hitPoints: { max: 7, value: 0 }, stress: { max: 2, value: 0 } }, damageThresholds: { major: 9, severe: 17 } } });
    const claws = async featureId => (await new DaggerheartAdapter().toCombatantSpec({ id: "t-b1", name: "Bear", actor: bear(featureId), texture: { src: "" } })).actions.find(a => a.id === "t-b1.attack");
    expect(await claws("2fXzhh2qil8dw3vw")).toMatchObject({ kind: "strike", bonus: 1, effects: [{ kind: "move", move: { kind: "push", to: 15, knockback: true }, label: "Overwhelming Force" }] });
    expect((await claws("someOtherId0000")).effects).toBeUndefined();
  });
});

describe("a fall from a height", () => {
  test("by the range it falls (the SRD's guide): Very Close 1d10+3, Close 1d20+5, Far or more 1d100+15; physical; nobody lands prone", () => {
    const fell = feet => daggerheartRules.fallDamage(feet);
    expect([10, 15].map(fell)).toEqual([[part([{ n: 1, faces: 10 }], 3, "physical")], [part([{ n: 1, faces: 10 }], 3, "physical")]]);
    expect([20, 30].map(fell)).toEqual([[part([{ n: 1, faces: 20 }], 5, "physical")], [part([{ n: 1, faces: 20 }], 5, "physical")]]);
    expect([35, 200].map(fell)).toEqual([[part([{ n: 1, faces: 100 }], 15, "physical")], [part([{ n: 1, faces: 100 }], 15, "physical")]]);
    expect(fell(0)).toEqual([]);
    expect(daggerheartRules.fallProne).toBe(false);
    // (The core asks the system's.)
    expect(fallDamage({ prep: { rules: daggerheartRules } }, 20, null)).toEqual(fell(20));
  });
});

describe("a collision", () => {
  const collides = move => daggerheartRules.collisionDamage({}, { feetLeft: 5, into: null, move, by: null });

  test("a knockback stopped short: the SRD's guide, 1d20+5 direct physical (no Armor Slot); a feature's own first", () => {
    const guide = [{ ...part([{ n: 1, faces: 20 }], 5, "physical"), direct: true }];
    expect(collides(featureMove("lxMzWFQOIpidX094", { type: "attack", range: "close" }).move)).toEqual(guide);
    expect(collides(attackMove("2fXzhh2qil8dw3vw", { range: "melee" }).move)).toEqual(guide);
    const own = [part([{ n: 2, faces: 6 }], 0, "physical")];
    expect(collides({ kind: "push", feet: 10, knockback: true, collision: own })).toBe(own);
  });

  test("a shove or a pull isn't that fast: nothing; nor where the core doesn't say what moved it", () => {
    const shove = traitMoves({ id: "w", traits: { strength: 2 } }).find(a => a.traitMove === "shove");
    expect([collides(shove.onHit[2].move), collides(shove.onHit[3].move)]).toEqual([[], []]);
    expect(collides(attackMove("eX0tAOy7TD4wVgEY", { range: "far" }).move)).toEqual([]);
    expect(collides(featureMove("rreGFW5TbhUoZf2T", { type: "attack", range: "close" }).move)).toEqual([]);
    expect(daggerheartRules.collisionDamage({}, { feetLeft: 5, into: null })).toEqual([]);
  });
});

/* A fight on a map: Brakka, a character, and an Ogre, an adversary. */
const traits = { tactical: { base: 70, fudge: 0 }, brave: { base: 90, fudge: 0 }, selfish: { base: 30, fudge: 0 }, loyal: { base: 60, fudge: 0 } };
const iwr = (major, severe, armor = 0) => ({ immune: [], resist: {}, weak: {}, dh: { thresholds: { major, severe }, physical: {}, magical: {}, reduce: {}, armor } });
const at = x => ({ position: { x, y: 0, size: 5 } });
const hero = (x, actions = [], extra = {}) => ({ id: "Brakka", name: "Brakka", side: "friendly", kind: "pc", duality: true, level: 1, hp: { value: 6, max: 6 }, hopeMax: 6, stressMax: 6, armorMax: 3,
  resources: { hope: 2, stress: 6, armor: 3 }, experiences: [], defenses: { ac: 11, strength: 20 }, initiative: { mod: 1 }, speeds: { walk: 30 },
  actions: [{ id: "Brakka.fist", name: "Fist", kind: "strike", bonus: 0, melee: true, reach: 5, damage: [parseFormula("1d4", "physical")] }, ...actions],
  iwr: iwr(8, 16, 3), traits, flags: { fearless: true }, diesAtZero: false, escapeDC: 32, ...at(x), ...extra });
const brute = (x, actions = [], extra = {}) => ({ id: "Ogre", name: "Ogre", side: "hostile", kind: "npc", level: 1, adversaryType: "bruiser", hp: { value: 5, max: 5 }, stressMax: 3, resources: { stress: 3 },
  defenses: { ac: 12 }, initiative: { mod: 0 }, speeds: { walk: 30 },
  actions: [{ id: "Ogre.club", name: "Club", kind: "strike", bonus: 1, melee: true, reach: 5, damage: [parseFormula("1d6", "physical")] }, ...actions],
  iwr: iwr(8, 14), traits, flags: { fearless: true }, diesAtZero: true, escapeDC: 12, ...at(x), ...extra });
/** A battle on the ground's cells ([i, j, cell]), everyone in it from the start. */
function battleOn(list, cells, seed = 1) {
  const spec = { combatants: list, sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Foes", enemies: ["friendly"] } },
    options: { positioning: true, maxRounds: 4, talking: false, aftermath: "none", system: { fear: 2 } }, ground: { size: 5, cells } };
  const run = beginRun(prepareBattle(spec, daggerheartRules), seed, { log: true });
  beginRound(run, 1);
  for ( const u of run.units ) u.active = true;
  return run;
}

describe("in a fight, by a ledge", () => {
  /** The ground falls away `depth` feet from x = 10 on. */
  const ledge = depth => Array.from({ length: 12 }, (_, k) => [2 + k, 0, { g: -depth }]);
  const fight = (list, depth, seed = 1) => battleOn(list, ledge(depth), seed);

  test("a character's Shove sends a foe at the edge over it: it falls 20 feet (Close: 1d20+5), marks Hit Points, and isn't prone", () => {
    const shove = traitMoves({ id: "Brakka", traits: { strength: 20 } }).filter(a => a.traitMove === "shove");
    for ( let seed = 1; seed <= 4; seed++ ) {
      const run = fight([hero(0, shove), brute(5)], 20, seed);
      const ogre = run.byId.get("Ogre");
      takeTurn(run, run.byId.get("Brakka"));
      expect(run.log.find(e => e.type === "control" && e.actorId === "Brakka")).toMatchObject({ maneuver: "shove", took: true });
      expect(run.log.find(e => e.type === "forced" && e.targetId === "Ogre")).toMatchObject({ how: "push", fall: 20 });
      const fall = run.log.find(e => e.type === "fall" && e.actorId === "Ogre");
      // (6 to 25 damage against its thresholds, 8 and 14: one Hit Point at least, three at most.)
      expect(fall).toMatchObject({ feet: 20 });
      expect(fall.amount).toBeGreaterThanOrEqual(1);
      expect(fall.amount).toBeLessThanOrEqual(3);
      expect(ogre.hp).toBe(5 - fall.amount);
      expect(ogre.prone).toBeFalsy();
    }
  });

  test("an adversary's knockback over a 40-foot drop: Far, 1d100+15, a Severe hit (an Armor Slot takes it down a step)", () => {
    const rush = { _id: "XfNzlNYwGNaIIdcg", type: "attack", range: "close", target: { type: "any", amount: 1 }, roll: { type: "attack" }, cost: [{ key: "stress", value: 1 }],
      damage: { main: { type: ["physical"], applyTo: "hitPoints", value: { dice: "d4", bonus: 0, multiplier: "flat", flatMultiplier: 1 } } } };
    const bullRush = { ...toActionSpec(rush, { id: "Ogre.rush", label: "Bull Rush", pc: false, attackBonus: 30, difficulty: 15, ranges: RANGES, moves: featureMove("lxMzWFQOIpidX094", rush) }), feature: true };
    const run = fight([brute(0, [bullRush]), hero(5)], 40);
    const brakka = run.byId.get("Brakka");
    takeTurn(run, run.byId.get("Ogre"));
    expect(run.log.find(e => e.type === "forced" && e.targetId === "Brakka")).toMatchObject({ how: "push", fall: 40 });
    expect(run.log.find(e => e.type === "fall" && e.actorId === "Brakka")).toMatchObject({ feet: 40 });
    expect(brakka.status).toBe(STATUS.STANDING);
    expect(brakka.prone).toBeFalsy();
    expect(brakka.resources.armor).toBeLessThan(3);
  });
});

describe("in a fight, knocked back by a standard attack: on open ground, into a wall, into someone", () => {
  // (The Ogre's Club, with the Bear's Overwhelming Force: whoever it hits knocked back to Very Close.)
  const club = { id: "Ogre.club", name: "Club", kind: "strike", bonus: 30, melee: true, reach: 5, damage: [parseFormula("1", "physical")], effects: [attackMove("2fXzhh2qil8dw3vw", { range: "melee" }, RANGES, "Overwhelming Force")] };
  const ogre = x => brute(x, [], { actions: [club] });
  // (Hit Points enough to stand it, thresholds 8 and 16, no Armor Slots.)
  const sturdy = (x, extra = {}) => hero(x, [], { hp: { value: 20, max: 20 }, armorMax: 0, resources: { hope: 2, stress: 6, armor: 0 }, iwr: iwr(8, 16), ...extra });

  test("its standard attack knocks a character out of Melee to the edge of Very Close: 10 feet; nothing in the way, no collision", () => {
    const run = battleOn([ogre(0), sturdy(5)], []);
    takeTurn(run, run.byId.get("Ogre"));
    expect(run.log.find(e => e.type === "attack" && e.actorId === "Ogre").degree).toBeGreaterThanOrEqual(2);
    expect(run.log.find(e => e.type === "forced" && e.targetId === "Brakka")).toMatchObject({ actorId: "Ogre", how: "push", feet: 10, blocked: false });
    expect(run.byId.get("Brakka").pos.x).toBe(15);
    expect(run.log.some(e => e.type === "collision")).toBe(false);
  });

  test("into a wall: it stays where it stood and takes the collision, 1d20+5 physical, marking its Hit Points", () => {
    for ( let seed = 1; seed <= 4; seed++ ) {
      // (The wall: on the east side of Brakka's square.)
      const run = battleOn([ogre(0), sturdy(5)], [[1, 0, { b: ["e"] }]], seed);
      const brakka = run.byId.get("Brakka");
      takeTurn(run, run.byId.get("Ogre"));
      expect(run.log.find(e => e.type === "forced" && e.targetId === "Brakka")).toMatchObject({ feet: 0, blocked: true });
      expect(brakka.pos.x).toBe(5);
      const hit = run.log.find(e => e.type === "collision");
      // (6 to 25 damage against its thresholds, 8 and 16: one Hit Point at least, three at most.)
      expect(hit).toMatchObject({ actorId: "Brakka", into: null });
      expect(hit.amount).toBeGreaterThanOrEqual(1);
      expect(hit.amount).toBeLessThanOrEqual(3);
      expect(brakka.hp).toBe(20 - run.log.find(e => e.type === "attack" && e.actorId === "Ogre").damage - hit.amount);
    }
  });

  test("into someone behind it: the one knocked back takes the collision, the one it hits nothing (the SRD says nothing of it)", () => {
    const run = battleOn([ogre(0), sturdy(5), sturdy(10, { id: "Isel", name: "Isel" })], []);
    takeTurn(run, run.byId.get("Ogre"));
    expect(run.log.find(e => e.type === "forced" && e.targetId === "Brakka")).toMatchObject({ feet: 0, blocked: true });
    expect(run.log.find(e => e.type === "collision")).toMatchObject({ actorId: "Brakka", into: "Isel" });
    expect(run.byId.get("Isel").hp).toBe(20);
  });
});
