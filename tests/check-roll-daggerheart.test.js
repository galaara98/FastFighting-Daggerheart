/**
 * A save or a check rolled the daggerheart system's way in a live battle (core API 19 rollSave, rollCheck): a save, a
 * reaction roll with the trait it names; a check, an action roll with the trait the sheets give it (words, a theft,
 * first aid, an escape, a trait move by its id); both through the actor's own diceRoll, with no dialog and no
 * Experience, and read off the card (a critical on matching dice or at the d20's threshold, only a success on a
 * reaction roll). The dice's Hope, Fear and Stress are kept off the sheets (FastFighting counts them from the card's
 * dice); for the GMs only when secret. Null for a save that isn't a trait, a check the helper doesn't make, a
 * companion's check, and a roll cancelled or unread. Who it's against isn't needed (a player's screen doesn't have it).
 */
import { beforeEach, describe, expect, test } from "vitest";
import { DaggerheartAdapter } from "../scripts/adapter.js";
import { SystemAdapter } from "../scripts/core.js";
import { checkTrait, saveTrait } from "../scripts/check-roll.js";
import { readDaggerheartCheck } from "../scripts/read-turn.js";
import { text } from "./foundry-i18n.js";

const adapter = new DaggerheartAdapter();
let made = 0;
let gathered = [];

/** The system's queue of a roll's resource changes (its ResourceUpdateMap): applied only when its caller says. */
class Updates extends Map {
  constructor(log) {
    super();
    this.log = log;
  }

  addResources(list) {
    for ( const r of list ) this.set(r.key, this.has(r.key) ? { ...r, value: this.get(r.key).value + r.value } : r);
  }

  async updateResources() {
    this.log.applied.push(...this.values());
  }
}

/**
 * A creature of `type` on the scene, its actor's diceRoll as the system's: it reads the config as it's given (a dialog
 * unless configure is false), rolls (a character's or companion's Duality Dice, `hope` and `fear`, plus the trait; else
 * a d20, `natural`, a critical at its sheet's threshold (`critOn`; `null`, none), a reaction roll's at 20), adds the
 * roll's base modifiers and the Experiences named (by key, from its sheet), makes the card (in the message mode it's
 * given), queues the dice's Hope, Fear and Stress (not for a reaction roll, nor when skipped) and what its features'
 * triggers return (`trigger`), and hands its config back. `cancel`: nothing back. `nocard`: no card made. `system`: more
 * of its sheet.
 */
function creature(type = "character", o = {}) {
  const log = { rolls: [], applied: [], config: null };
  const duality = ["character", "companion"].includes(type);
  const actor = {
    id: "a1", type, isNPC: !duality, uuid: "Actor.a1", name: "Kael", img: "", statuses: new Set(), items: [],
    system: {
      traits: Object.fromEntries(Object.entries(o.traits ?? {}).map(([k, v]) => [k, { value: v }])),
      ...(duality || o.critOn === null ? {} : { criticalThreshold: o.critOn ?? 20 }), ...o.system
    },
    async diceRoll(config) {
      log.rolls.push({ ...config, dialog: config.dialog?.configure !== false });
      log.config = config;
      if ( o.cancel ) return undefined;
      const reaction = config.actionType === "reaction";
      const sheet = actor.system;
      const mod = (sheet.traits[config.roll.trait]?.value ?? 0) + (config.roll.baseModifiers ?? []).reduce((n, m) => n + m.value, 0)
        + (config.experiences ?? []).reduce((n, k) => n + (sheet.experiences?.[k]?.value ?? 0), 0);
      const options = { roll: { ...config.roll }, actionType: config.actionType };
      const { hope = 9, fear = 4, natural = 15 } = o;
      const roll = duality
        ? { total: hope + fear + mod, isCritical: hope === fear, dHope: { total: hope }, dFear: { total: fear }, dice: [{ faces: 12, total: hope }, { faces: 12, total: fear }], options }
        : { total: natural + mod, isCritical: natural >= (reaction ? 20 : sheet.criticalThreshold), dice: [{ faces: 20, total: natural }], options };
      config.source = { actor: actor.uuid };
      config.resourceUpdates = new Updates(log);
      if ( duality && !reaction && !config.skips?.resources ) {
        config.resourceUpdates.addResources(hope === fear ? [{ key: "hope", value: 1 }, { key: "stress", value: -1 }] : [{ key: hope > fear ? "hope" : "fear", value: 1 }]);
      }
      if ( o.trigger ) config.resourceUpdates.addResources([{ key: "stress", value: -1 }]);
      if ( !o.nocard ) {
        const card = { id: `card${++made}`, type: duality ? "dualityRoll" : "adversaryRoll", mode: config.selectedMessageMode ?? "public", system: { hasRoll: true, title: config.title, roll } };
        game.messages.set(card.id, card);
        config.message = card;
      }
      return config;
    }
  };
  return { token: { id: "tokA", uuid: "Scene.s.Token.tokA", name: "Kael", parent: { id: "s" }, texture: { src: "" }, actor }, actor, log };
}

/** An adversary's sheet, as far as the adapter reads one: its attack (+2), its Experiences, its type. */
const sword = { type: "attack", range: "melee", target: { type: "any", amount: 1 }, cost: [], damage: { main: { type: ["physical"], applyTo: "hitPoints", value: { dice: "d8", bonus: 1, multiplier: "flat", flatMultiplier: 1 } } } };
const adversarySheet = (extra = {}) => ({
  type: "standard", tier: 1, difficulty: 13, experiences: {}, resistance: { physical: {}, magical: {} }, resources: { hitPoints: { max: 5, value: 0 }, stress: { max: 3, value: 0 } },
  damageThresholds: { major: 8, severe: 14 }, attack: { ...sword, name: "Daggers", roll: { type: "attack", bonus: 2 } }, ...extra
});

const nobody = { id: null, name: "" };
const save = (token, options) => adapter.rollSave(token, { action: nobody, from: null, ...options });
const check = (token, options) => adapter.rollCheck(token, { action: nobody, skill: null, against: null, target: null, ...options });

beforeEach(() => {
  const store = new Map();
  game.messages = { get: id => store.get(id), set: (id, m) => store.set(id, m) };
  gathered = [];
  // (The effects the system gathers for a roll of that kind.)
  game.system = { api: { data: { actions: { actionsTypes: { base: { getActionRelevantEffects: async (rollData, actor) => { gathered.push({ rollData, actor }); return ["fx"]; } } } } } } };
});

describe("a save, rolled the daggerheart system's way", () => {
  test("a reaction roll with the trait it names, against its Difficulty, no dialog and no Experience; its card read", async () => {
    const { token, actor, log } = creature("character", { traits: { agility: 2 }, hope: 9, fear: 4 });
    expect(await save(token, { save: "agility", dc: 14 })).toEqual({ degree: 2, natural: 13, total: 15, dice: { hope: 9, fear: 4 } });
    expect(log.rolls).toHaveLength(1);
    expect(log.rolls[0]).toMatchObject({ event: null, actionType: "reaction", hasRoll: true, roll: { trait: "agility", type: "trait", difficulty: 14 }, dialog: false, effects: ["fx"] });
    expect(log.rolls[0].experiences).toBeUndefined();
    // (The effects the system gathers for a reaction roll with that trait.)
    expect(gathered).toEqual([{ rollData: { action: { actionType: "reaction", roll: { type: "trait", trait: "agility" } } }, actor }]);
    expect(log.config.message.mode).toBe("public");
  });

  test("matching dice: a critical, only a success on a reaction roll, whatever the total; under the Difficulty, a failure", async () => {
    const crit = creature("character", { hope: 3, fear: 3 });
    expect(await save(crit.token, { save: "strength", dc: 20 })).toEqual({ degree: 2, natural: 6, total: 6, dice: { hope: 3, fear: 3 } });
    const fail = creature("character", { traits: { strength: 1 }, hope: 2, fear: 5 });
    expect((await save(fail.token, { save: "strength", dc: 14 })).degree).toBe(1);
  });

  test("an adversary's: a d20, a success on a 20 whatever the total (its own threshold is for its attacks); no dice", async () => {
    const twenty = creature("adversary", { natural: 20, critOn: 18 });
    expect(await save(twenty.token, { save: "agility", dc: 30 })).toEqual({ degree: 2, natural: 20, total: 20 });
    const eighteen = creature("adversary", { natural: 18, critOn: 18 });
    expect(await save(eighteen.token, { save: "agility", dc: 30 })).toEqual({ degree: 1, natural: 18, total: 18 });
    expect(eighteen.log.rolls[0]).toMatchObject({ actionType: "reaction", dialog: false });
  });

  test("an adversary's: the bare d20, as the engine's save for it (it has no traits); no Experience, no modifier", async () => {
    const { token, log } = creature("adversary", { natural: 10, system: adversarySheet({ experiences: { a: { name: "Tough", value: 3 } } }) });
    const spec = await adapter.toCombatantSpec(token);
    expect((await save(token, { save: "strength", dc: 30 })).total).toBe(10 + spec.defenses.strength);
    expect(log.rolls[0]).not.toHaveProperty("experiences");
    expect(log.rolls[0].roll).not.toHaveProperty("baseModifiers");
  });

  test("a companion's: its own reaction roll, as the system makes one", async () => {
    const { token, log } = creature("companion", { hope: 8, fear: 5 });
    expect(await save(token, { save: "instinct", dc: 12 })).toEqual({ degree: 2, natural: 13, total: 13, dice: { hope: 8, fear: 5 } });
    expect(log.rolls[0]).toMatchObject({ actionType: "reaction", roll: { trait: "instinct" } });
  });

  test("no Hope, Fear or Stress on the sheets: none queued for the dice, and its triggers' not applied (as the system's own reaction roll)", async () => {
    const { token, log } = creature("character", { hope: 10, fear: 2, trigger: true });
    await save(token, { save: "presence", dc: 10 });
    expect(log.rolls[0].skips).toEqual({ resources: true });
    expect(log.applied).toEqual([]);
  });

  test("titled as the system titles its own: a character's by its trait, an adversary's a reaction roll", async () => {
    const words = { "DAGGERHEART.UI.Chat.dualityRoll.abilityCheckTitle": "<{ability}>", "DAGGERHEART.CONFIG.Traits.agility.name": "AGI", "DAGGERHEART.GENERAL.reactionRoll": "REACT" };
    const i18n = game.i18n;
    game.i18n = { ...i18n, has: k => k in words || i18n.has(k), localize: k => words[k] ?? i18n.localize(k) };
    const pc = creature("character");
    await save(pc.token, { save: "agility", dc: 10 });
    expect(pc.log.rolls[0].title).toBe("<AGI>");
    const foe = creature("adversary");
    await save(foe.token, { save: "agility", dc: 10 });
    expect(foe.log.rolls[0].title).toBe("REACT");
  });

  test("secret: its card in the GMs' mode", async () => {
    const { token, log } = creature("character");
    await save(token, { save: "agility", dc: 10, secret: true });
    expect(log.rolls[0].selectedMessageMode).toBe("gm");
    expect(log.config.message.mode).toBe("gm");
  });

  test("a save that names no trait: null, nothing rolled; of several, the better on the sheet (the first when even)", async () => {
    const { token, actor, log } = creature("character", { traits: { agility: 1, presence: 3 } });
    for ( const key of ["con", "will", null, [], ["con"], "Agility"] ) expect(await save(token, { save: key, dc: 10 })).toBeNull();
    expect(log.rolls).toEqual([]);
    expect(saveTrait(actor, ["agility", "presence"])).toBe("presence");
    expect(saveTrait(actor, ["strength", "finesse"])).toBe("strength");
    await save(token, { save: ["agility", "presence"], dc: 10 });
    expect(log.rolls[0].roll.trait).toBe("presence");
  });
});

describe("a check, rolled the daggerheart system's way", () => {
  test("an action roll with the trait the sheets give it, against its Difficulty, no dialog and no Experience; no target needed", async () => {
    const { token, actor, log } = creature("character", { traits: { presence: 2 }, hope: 9, fear: 4 });
    expect(await check(token, { purpose: "talk", skill: "Presence", dc: 12 })).toEqual({ degree: 2, natural: 13, total: 15, dice: { hope: 9, fear: 4 } });
    expect(log.rolls[0]).toMatchObject({ event: null, actionType: "action", hasRoll: true, roll: { trait: "presence", type: "trait", difficulty: 12 }, dialog: false, effects: ["fx"] });
    expect(log.rolls[0].experiences).toBeUndefined();
    expect(gathered).toEqual([{ rollData: { action: { actionType: "action", roll: { type: "trait", trait: "presence" } } }, actor }]);
  });

  test("each by its purpose, as the sheets have it; a trait move by its id", () => {
    const { token } = creature("character", { traits: { knowledge: 1, instinct: 1, strength: 0, agility: 2 } });
    const of = (purpose, id = null) => checkTrait(token, { purpose, action: { id, name: "" } });
    expect(of("talk")).toBe("presence");
    expect(of("theft")).toBe("finesse");
    // (First aid: the better of Knowledge and Instinct, Knowledge when even; an escape: the better of Strength and Agility.)
    expect(of("firstAid")).toBe("knowledge");
    expect(of("escape")).toBe("agility");
    expect(of("sprint")).toBe("agility");
    token.actor.system.traits.instinct.value = 2;
    expect(of("firstAid")).toBe("instinct");
    expect(of("control", "tokA.grapple")).toBe("strength");
    expect(of("control", "tokA.shove")).toBe("strength");
    expect(of("control", "tokA.maneuver")).toBe("agility");
    expect(of("aid", "tokA.hide")).toBe("finesse");
  });

  test("a check the helper doesn't make, or a companion's: null, nothing rolled", async () => {
    const { token, log } = creature("character", { traits: { strength: 2 } });
    for ( const purpose of ["heal", "cast", "disengage", null, "constructor", "toString"] ) expect(await check(token, { purpose, dc: 10 })).toBeNull();
    for ( const id of ["tokA.w1", "tokZ.grapple", "grapple", "tokA.help", "tokA.", null] ) {
      expect(await check(token, { purpose: "control", dc: 10, action: { id, name: "" } })).toBeNull();
      expect(await check(token, { purpose: "aid", dc: 10, action: { id, name: "" } })).toBeNull();
    }
    expect(log.rolls).toEqual([]);
    // (A companion's action roll is its partner's, as the system makes it.)
    const pet = creature("companion");
    expect(await check(pet.token, { purpose: "escape", dc: 10 })).toBeNull();
    expect(pet.log.rolls).toEqual([]);
    expect(await check({ id: "tokA", actor: null }, { purpose: "talk", dc: 10 })).toBeNull();
  });

  test("how it went: a critical on matching dice whatever the total, a success at the Difficulty, a failure under it", async () => {
    expect(await check(creature("character", { hope: 6, fear: 6 }).token, { purpose: "talk", dc: 30 })).toEqual({ degree: 3, natural: 12, total: 12, dice: { hope: 6, fear: 6 } });
    expect((await check(creature("character", { traits: { finesse: 2 }, hope: 9, fear: 4 }).token, { purpose: "theft", dc: 15 })).degree).toBe(2);
    expect((await check(creature("character", { hope: 2, fear: 5 }).token, { purpose: "aid", dc: 12, action: { id: "tokA.hide", name: "" } })).degree).toBe(1);
  });

  test("an adversary's: a d20 action roll, a critical on a 20, titled an action roll; no dice", async () => {
    const words = { "DAGGERHEART.GENERAL.Roll.action": "ACT" };
    const i18n = game.i18n;
    game.i18n = { ...i18n, has: k => k in words || i18n.has(k), localize: k => words[k] ?? i18n.localize(k) };
    const { token, log } = creature("adversary", { natural: 20 });
    expect(await check(token, { purpose: "talk", dc: 30 })).toEqual({ degree: 3, natural: 20, total: 20 });
    expect(log.rolls[0]).toMatchObject({ actionType: "action", title: "ACT" });
    expect((await check(creature("adversary", { natural: 11 }).token, { purpose: "escape", dc: 12 })).degree).toBe(1);
  });

  test("an adversary's words: its best Experience (the first of equals), as the system adds one, and a Social one's +2: what the engine plans with", async () => {
    const experiences = { a: { name: "Fast Talk", value: 2 }, b: { name: "Haggle", value: 3 }, c: { name: "Liar", value: 3 } };
    const { token, log } = creature("adversary", { natural: 10, system: adversarySheet({ type: "social", experiences }) });
    const spec = await adapter.toCombatantSpec(token);
    expect(await check(token, { purpose: "talk", skill: "Haggle", dc: 30 })).toMatchObject({ degree: 1, natural: 10, total: 10 + spec.social.pitches.persuade.mod });
    expect(log.rolls[0].experiences).toEqual(["b"]);
    expect(log.rolls[0].roll.baseModifiers).toEqual([{ label: text("FFDAGGERHEART.Type.social"), value: 2 }]);
    // (Spent with no Fear: no cost, no dialog to charge one.)
    expect(log.rolls[0]).toMatchObject({ dialog: false });
    expect(log.rolls[0].costs).toBeUndefined();
    // (Another type, no Experience: nothing added.)
    const plain = creature("adversary", { natural: 10, system: adversarySheet() });
    expect((await check(plain.token, { purpose: "talk", dc: 30 })).total).toBe(10 + (await adapter.toCombatantSpec(plain.token)).social.pitches.persuade.mod);
    expect(plain.log.rolls[0]).not.toHaveProperty("experiences");
    expect(plain.log.rolls[0].roll).not.toHaveProperty("baseModifiers");
  });

  test("an adversary's escape: its attack modifier, its escapeWork's; anything else of an adversary's, left to the engine", async () => {
    const { token, log } = creature("adversary", { natural: 10, system: adversarySheet() });
    const spec = await adapter.toCombatantSpec(token);
    expect((await check(token, { purpose: "escape", dc: 30 })).total).toBe(10 + spec.escapeWork.mod);
    expect(log.rolls[0].roll.baseModifiers).toEqual([{ label: text("FFDAGGERHEART.AttackModifier"), value: 2 }]);
    for ( const purpose of ["theft", "firstAid"] ) expect(await check(token, { purpose, dc: 10 })).toBeNull();
    expect(log.rolls).toHaveLength(1);
  });

  test("a d20 check where the sheet's critical threshold isn't 20 (the engine plans it at 20), or there's none: null, nothing rolled", async () => {
    for ( const critOn of [18, 19, null] ) {
      const { token, log } = creature("adversary", { critOn, system: adversarySheet() });
      expect(await check(token, { purpose: "talk", dc: 10 })).toBeNull();
      expect(await check(token, { purpose: "escape", dc: 10 })).toBeNull();
      expect(log.rolls).toEqual([]);
    }
    // (A save, a reaction roll, crits on a 20 whatever the sheet says: rolled.)
    expect(await save(creature("adversary", { critOn: 18, natural: 19 }).token, { save: "agility", dc: 30 })).toMatchObject({ degree: 1 });
  });

  test("an escape names its trait by its key where it knows it (rules.js breakFree: Finesse out of bonds); a word for the log isn't read", async () => {
    const { token, log } = creature("character", { traits: { strength: 1, agility: 2, finesse: 0 } });
    await check(token, { purpose: "escape", skill: "finesse", dc: 10 });
    await check(token, { purpose: "escape", skill: "Finesse", dc: 10 });
    await check(token, { purpose: "escape", skill: null, dc: 10 });
    expect(log.rolls.map(r => r.roll.trait)).toEqual(["finesse", "agility", "agility"]);
  });

  test("the dice's Hope, Fear and Stress kept off the sheets (FastFighting counts them from the card); its triggers' applied, as the sheet's roll does", async () => {
    const { token, log } = creature("character", { hope: 4, fear: 10, trigger: true });
    await check(token, { purpose: "talk", dc: 10 });
    expect(log.rolls[0].skips).toEqual({ resources: true });
    expect(log.applied).toEqual([{ key: "stress", value: -1 }]);
    // (Nothing to apply: nothing applied.)
    const quiet = creature("character", { hope: 4, fear: 10 });
    await check(quiet.token, { purpose: "talk", dc: 10 });
    expect(quiet.log.applied).toEqual([]);
    // (The same roll as a player makes it: the system queues the dice's Fear.)
    const own = creature("character", { hope: 4, fear: 10 });
    const rolled = await own.actor.diceRoll({ roll: { trait: "presence", type: "trait" }, actionType: "action" });
    expect([...rolled.resourceUpdates.values()]).toEqual([{ key: "fear", value: 1 }]);
  });

  test("secret: its card in the GMs' mode; otherwise in the chat's own", async () => {
    const hidden = creature("adversary");
    await check(hidden.token, { purpose: "talk", dc: 10, secret: true });
    expect(hidden.log.config.message.mode).toBe("gm");
    const open = creature("adversary");
    await check(open.token, { purpose: "talk", dc: 10 });
    expect(open.log.rolls[0]).not.toHaveProperty("selectedMessageMode");
  });

  test("cancelled, no card made, or no Difficulty: null", async () => {
    expect(await check(creature("character", { cancel: true }).token, { purpose: "talk", dc: 10 })).toBeNull();
    expect(await check(creature("character", { nocard: true }).token, { purpose: "talk", dc: 10 })).toBeNull();
    const none = creature("character");
    for ( const dc of [null, undefined, "", "hard"] ) expect(await check(none.token, { purpose: "talk", dc })).toBeNull();
    expect(none.log.rolls).toEqual([]);
  });
});

describe("a save's or a check's card, read", () => {
  const card = (roll, extra = {}) => ({ type: "dualityRoll", system: { hasRoll: true, roll: { total: 15, isCritical: false, dHope: { total: 9 }, dFear: { total: 4 }, dice: [{ faces: 12, total: 9 }, { faces: 12, total: 4 }], options: { roll: { difficulty: null } }, ...roll }, ...extra } });

  test("the card's own Difficulty first (its text too), else the one asked for; with neither, only a critical is known", () => {
    expect(readDaggerheartCheck(card({ options: { roll: { difficulty: "16" } } }), { dc: 10 }).degree).toBe(1);
    expect(readDaggerheartCheck(card({}), { dc: 14 }).degree).toBe(2);
    expect(readDaggerheartCheck(card({}), {})).toBeNull();
    expect(readDaggerheartCheck(card({ isCritical: true, dHope: { total: 4 }, dice: [{ faces: 12, total: 4 }, { faces: 12, total: 4 }] }), {})).toMatchObject({ degree: 3, dice: { hope: 4, fear: 4 } });
    expect(readDaggerheartCheck(card({ isCritical: true }), { reaction: true }).degree).toBe(2);
  });

  test("none on a card with no roll, a damage card, anything else", () => {
    expect(readDaggerheartCheck(card({}, { hasRoll: false }), { dc: 10 })).toBeNull();
    expect(readDaggerheartCheck({ ...card({}), type: "damageRoll" }, { dc: 10 })).toBeNull();
    expect(readDaggerheartCheck({ type: "systemMessage", system: { hasRoll: true } }, { dc: 10 })).toBeNull();
    expect(readDaggerheartCheck(card({ total: undefined }), { dc: 10 })).toBeNull();
    expect(readDaggerheartCheck(null, { dc: 10 })).toBeNull();
  });
});

describe("the adapter", () => {
  test("offers both, so the core asks it for every save and check in a turn it plays", () => {
    expect(adapter.rollSave).not.toBe(SystemAdapter.prototype.rollSave);
    expect(adapter.rollCheck).not.toBe(SystemAdapter.prototype.rollCheck);
  });
});
