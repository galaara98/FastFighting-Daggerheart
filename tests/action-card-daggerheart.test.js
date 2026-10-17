/**
 * An action's own card, and the damage of one that isn't an attack, the daggerheart system's way in a live battle (core
 * API 19 useAction, rollDamage). Its card: the action's own (its toChat), nothing rolled, spent or applied; for the
 * GMs only when secret; none for a strike rollStrike rolls, one kept out of the chat, or anything that isn't one of the
 * sheet's actions. Its damage: the action's damage step alone, as the Damage button on an item's card rolls it (no
 * roll before it, no dialog, no targets), on a card of its own, read by type; no other step of its workflow, so nothing
 * applied, laid, paid or counted, and the sheet's costs and uses not checked (FastFighting pays them). The core applies
 * that card to each target with its save's share (applyDamageCard), on the main damage before the thresholds.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DaggerheartAdapter } from "../scripts/adapter.js";
import { SystemAdapter } from "../scripts/core.js";
import { actionFor } from "../scripts/action-card.js";
import { readDaggerheartDamageRoll } from "../scripts/read-turn.js";

const adapter = new DaggerheartAdapter();
const was = { Hooks: globalThis.Hooks };
afterEach(() => {
  Object.assign(globalThis, was);
  vi.useRealTimers();
});

/** Foundry's Hooks, as far as making a card and the system's workflow use them. */
function hooks() {
  const on = new Map();
  let n = 0;
  return {
    on: (name, fn) => { on.set(++n, { name, fn }); return n; },
    off: (name, id) => on.delete(id),
    call: (name, ...args) => { for ( const h of [...on.values()] ) if ( h.name === name && h.fn(...args) === false ) return false; return true; },
    callAll: (name, ...args) => { for ( const h of [...on.values()] ) if ( h.name === name ) h.fn(...args); return true; },
    count: () => on.size
  };
}

let made = 0;
let chat = null;

/**
 * The chat, as Foundry makes a card: a moment later (`after` ms, a server's answer), its preCreateChatMessage hook
 * (which may change it: applyMode), the card kept, then createChatMessage. `user`: whoever made it.
 */
function theChat() {
  const store = new Map();
  game.messages = { get: id => store.get(id) };
  game.user = { id: "gm1", isGM: true };
  return {
    async create(data, { after = 5, user = "gm1" } = {}) {
      const doc = { id: `card${++made}`, mode: "public", ...data, applyMode(mode) { this.mode = mode; } };
      await new Promise(resolve => setTimeout(resolve, after));
      if ( Hooks.call("preCreateChatMessage", doc, data, {}, user) === false ) return null;
      store.set(doc.id, doc);
      Hooks.callAll("createChatMessage", doc, {}, user);
      return doc;
    }
  };
}

const STEPS = ["roll", "damage", "save", "applyDamage", "effects", "cost", "uses"];

/**
 * One of the sheet's actions, as the system's: toChat sends its card (an abilityUse naming it) without waiting for it;
 * prepareConfig makes a use's config (the chat's mode unless told, the user's targets, the dialog as the click says),
 * turning it down where it skips its dialog and the sheet can't pay (`afford`) or has no use left (`usesLeft`); its
 * workflow's steps each logged, the damage step rolling `damage` (null: none) of `types` and `stress` Stress besides on
 * a card of its own, in the mode its config says (`cancel`: false back; `lost`: no card handed back); use() runs them.
 */
function sheetAction(id, item, actor, o, log) {
  const act = {
    _id: id,
    get id() { return this._id; },
    actor, chatDisplay: o.chatDisplay ?? true, hasRoll: !!o.hasRoll, hasSave: !!o.hasSave,
    hasDamage: !o.healing && (o.damage !== null || !!o.stress), hasHealing: !!o.healing,
    async toChat(origin) {
      log.toChat.push(origin);
      if ( o.noCard ) return;
      if ( o.broken ) throw new Error("no");
      chat.create({ type: "abilityUse", system: { source: { actor: actor.uuid, item, action: id } } });
    },
    prepareConfig(event, options = {}) {
      const config = {
        event, dialog: {}, selectedMessageMode: "public", hasRoll: this.hasRoll, hasSave: this.hasSave, source: { actor: actor.uuid, item, action: id },
        targets: [{ id: "tokC" }], ...options, skips: { resources: false, ...(options.skips ?? {}) },
        resourceUpdates: { async updateResources() { log.resources += 1; } }
      };
      config.dialog.configure ??= !(event?.shiftKey || event?.altKey || event?.ctrlKey);
      log.configs.push({ event, options: structuredClone(options) });
      if ( o.refuse ) return false;
      if ( config.dialog.configure === false && (o.afford === false || o.usesLeft === false) ) return false;
      return config;
    },
    workflow: new Map(STEPS.map(key => [key, {
      async execute(config, messageId, force) {
        log.steps.push(key);
        if ( key !== "damage" ) return;
        log.damage.push({ messageId, force, hasRoll: config.hasRoll, dialog: config.dialog.configure, targets: config.targets, skips: config.skips });
        if ( o.cancel ) return false;
        const main = o.damage === undefined ? 7 : o.damage;
        const card = await chat.create({
          type: "adversaryRoll", mode: config.selectedMessageMode, rollMode: config.rollMode,
          system: {
            hasRoll: config.hasRoll, hasDamage: true, hasSave: config.hasSave, targets: config.targets, isDirect: false,
            damage: {
              main: main === null ? null : JSON.stringify({ total: main, options: { damageTypes: o.types ?? ["physical"] } }),
              resources: o.stress ? { stress: JSON.stringify({ total: o.stress, options: {} }) } : {}
            }
          }
        }, { after: 0 });
        if ( !o.lost ) config.message = card;
      }
    }])),
    async use() {
      log.used += 1;
    }
  };
  return act;
}

/**
 * A token whose actor has its standard attack (an attack roll with damage; `attackSave`: one its targets resist), a
 * domain card (dc1: a1 a save with damage, a2 damage that simply lands, a3 effects alone, a4 healing) and a feature (f1:
 * b1, kept out of the chat). `o[actionId]`: how that one goes (above).
 */
function creature(type = "adversary", o = {}) {
  const log = { toChat: [], configs: [], damage: [], steps: [], used: 0, resources: 0 };
  const actor = { id: "actA", uuid: "Scene.s.Token.tokA.Actor.actA", type, items: new Map(), system: {} };
  actor.system.attack = sheetAction("atk", actor.id, actor, { hasRoll: true, hasSave: !!o.attackSave, ...o.atk }, log);
  const items = {
    dc1: { a1: { hasSave: true }, a2: {}, a3: { damage: null }, a4: { healing: true } },
    f1: { b1: { chatDisplay: false } }
  };
  for ( const [itemId, actions] of Object.entries(items) ) {
    const list = new Map(Object.entries(actions).map(([id, base]) => [id, sheetAction(id, itemId, actor, { ...base, ...o[id] }, log)]));
    actor.items.set(itemId, { id: itemId, type: itemId === "f1" ? "feature" : "domainCard", system: { actions: list } });
  }
  return { token: { id: "tokA", uuid: "Scene.s.Token.tokA", actor }, actor, log };
}

const act = id => ({ id, name: "a spell" });
const use = (token, id = "tokA.dc1.a1", options = {}) => adapter.useAction(token, { action: act(id), targets: [], ...options });
const damage = (token, id = "tokA.dc1.a1", options = {}) => adapter.rollDamage(token, { action: act(id), card: null, ...options });

beforeEach(() => {
  globalThis.Hooks = hooks();
  chat = theChat();
});

describe("an action's own card (useAction)", () => {
  test("a domain card's action: its own card, as the system shows one when it's used; nothing rolled, spent or applied", async () => {
    const { token, log } = creature("character");
    const out = await use(token);
    expect(out).toEqual({ card: expect.any(String) });
    expect(game.messages.get(out.card)).toMatchObject({ type: "abilityUse", mode: "public", system: { source: { actor: "Scene.s.Token.tokA.Actor.actA", item: "dc1", action: "a1" } } });
    expect(log.toChat).toEqual([null]);
    expect(log).toMatchObject({ configs: [], steps: [], used: 0, resources: 0 });
    expect(Hooks.count()).toBe(0);
  });

  test("secret: its card in the GMs' mode, whatever the chat's", async () => {
    const { token } = creature();
    const out = await use(token, "tokA.dc1.a2", { secret: true });
    expect(game.messages.get(out.card).mode).toBe("gm");
  });

  test("a strike rollStrike rolls: null, its card shows it; a standard attack its targets resist (the engine's save): its own card", async () => {
    const plain = creature();
    expect(await use(plain.token, "tokA.attack")).toBeNull();
    expect(await use(plain.token, "tokA.attack.horde")).toBeNull();
    expect(plain.log.toChat).toEqual([]);
    const resisted = creature("adversary", { attackSave: true });
    expect(await use(resisted.token, "tokA.attack")).toEqual({ card: expect.any(String) });
  });

  test("not one of the sheet's actions (a trait move, Help an Ally, an action or item it hasn't, another's): null, no card", async () => {
    const { token, log } = creature("character");
    for ( const id of ["tokA.grapple", "tokA.help", "tokA.dc1.zz", "tokA.zz.a1", "tokA.dc1.a1.x", "tokZ.dc1.a1", "dc1.a1", "tokA."] ) {
      expect(await use(token, id)).toBeNull();
    }
    expect(await adapter.useAction(token, { action: null })).toBeNull();
    expect(await use({ id: "tokA", actor: null })).toBeNull();
    expect(log.toChat).toEqual([]);
  });

  test("one the system keeps out of the chat (its Display in Chat off): null", async () => {
    const { token, log } = creature();
    expect(await use(token, "tokA.f1.b1")).toBeNull();
    expect(log.toChat).toEqual([]);
  });

  test("a card that never comes: null, after a while; another's card, or another action's, isn't taken; the hooks put back", async () => {
    vi.useFakeTimers();
    const { token } = creature("adversary", { a1: { noCard: true } });
    const out = use(token);
    chat.create({ type: "abilityUse", system: { source: { actor: "Scene.s.Token.tokA.Actor.actA", item: "dc1", action: "a1" } } }, { user: "player1" });
    chat.create({ type: "abilityUse", system: { source: { actor: "Scene.s.Token.tokA.Actor.actA", item: "dc1", action: "a2" } } });
    chat.create({ type: "adversaryRoll", system: { source: { actor: "Scene.s.Token.tokA.Actor.actA", item: "dc1", action: "a1" } } });
    await vi.advanceTimersByTimeAsync(3200);
    expect(await out).toBeNull();
    expect(Hooks.count()).toBe(0);
  });

  test("the system failing: its error, and the hooks put back", async () => {
    const { token } = creature("adversary", { a1: { broken: true } });
    await expect(use(token)).rejects.toThrow("no");
    expect(Hooks.count()).toBe(0);
  });

  test("offered, so the core asks it for a spell's card and for a save's or an auto's", () => {
    expect(adapter.useAction).not.toBe(SystemAdapter.prototype.useAction);
    expect(adapter.rollDamage).not.toBe(SystemAdapter.prototype.rollDamage);
  });
});

describe("an action's damage (rollDamage)", () => {
  test("a save's: the action's damage step alone, as the Damage button rolls it (no roll before it, no dialog, no targets), on a card of its own", async () => {
    const { token, log } = creature();
    const out = await damage(token);
    expect(out).toEqual({ damage: { byType: { physical: 7 } }, card: expect.any(String) });
    expect(log.damage).toEqual([{ messageId: null, force: true, hasRoll: false, dialog: false, targets: [], skips: { resources: true } }]);
    // (No other step: nothing rolled before it, no reaction rolls, nothing applied or laid, no cost or use paid.)
    expect(log).toMatchObject({ steps: ["damage"], used: 0, resources: 0, toChat: [] });
    expect(log.configs[0].event).toMatchObject({ shiftKey: true, altKey: false, ctrlKey: false });
    // (The card the core then applies to each target, as its damageCard reads it.)
    expect(adapter.damageCard(game.messages.get(out.card))).toEqual({ amount: 7, kind: "damage", targets: [], save: true });
  });

  test("damage that simply lands; magical, with the Stress it marks; Stress alone; a roll that came to nothing", async () => {
    expect((await damage(creature().token, "tokA.dc1.a2")).damage).toEqual({ byType: { physical: 7 } });
    expect((await damage(creature("adversary", { a1: { damage: 6, types: ["magical"], stress: 1 } }).token)).damage).toEqual({ byType: { magical: 6, stress: 1 } });
    expect((await damage(creature("adversary", { a1: { damage: null, stress: 2 } }).token)).damage).toEqual({ byType: { stress: 2 } });
    expect((await damage(creature("adversary", { a1: { damage: 0 } }).token)).damage).toEqual({ byType: { physical: 0 } });
  });

  test("the sheet's costs and uses aren't checked (FastFighting pays them): rolled where the sheet couldn't pay, nothing spent", async () => {
    const { token, actor, log } = creature("adversary", { a1: { afford: false, usesLeft: false } });
    expect((await damage(token)).damage).toEqual({ byType: { physical: 7 } });
    expect(log.configs[0].options.dialog).toEqual({ configure: true });
    expect(log).toMatchObject({ steps: ["damage"], resources: 0 });
    // (The system's own checks, which it makes when it skips its dialog: this sheet couldn't use it so.)
    expect(actor.items.get("dc1").system.actions.get("a1").prepareConfig({ shiftKey: true }, {})).toBe(false);
  });

  test("secret: its card and its dice in the GMs' mode; otherwise the chat's own", async () => {
    const hidden = creature();
    const out = await damage(hidden.token, "tokA.dc1.a1", { secret: true });
    expect(game.messages.get(out.card)).toMatchObject({ mode: "gm", rollMode: "gm" });
    const open = creature();
    const shown = await damage(open.token);
    expect(open.log.configs[0].options).not.toHaveProperty("selectedMessageMode");
    expect(game.messages.get(shown.card)).toMatchObject({ mode: "public", rollMode: undefined });
  });

  test("applied as the core applies it to each target: its save's half on the main damage, before the thresholds; its Stress whole", async () => {
    const out = await damage(creature("adversary", { a1: { damage: 7, stress: 1 } }).token);
    const calls = [];
    const actor = {
      id: "r1", uuid: "Actor.r1", type: "adversary", statuses: new Set(), effects: [], items: [],
      system: { resources: { hitPoints: { value: 0, max: 6, isReversed: true }, stress: { value: 0, max: 3, isReversed: true } }, rules: { attack: { damage: { hpDamageTakenMultiplier: 1 } } } },
      async takeDamage(args, isDirect) {
        calls.push({ main: args.main.total, stress: args.resources.stress?.total, isDirect });
        return [];
      }
    };
    await adapter.applyDamageCard(game.messages.get(out.card), { id: "tokB", uuid: "Scene.s.Token.tokB", actor }, { multiplier: 0.5 });
    expect(calls).toEqual([{ main: 3.5, stress: 1, isDirect: false }]);
  });

  test("nothing of the sheet's to roll (healing, effects alone, not one of its actions), turned down, cancelled, or no card back: null", async () => {
    for ( const id of ["tokA.dc1.a4", "tokA.dc1.a3", "tokA.grapple", "tokA.dc1.zz", "tokZ.dc1.a1"] ) expect(await damage(creature().token, id)).toBeNull();
    for ( const how of [{ refuse: true }, { cancel: true }, { lost: true }] ) expect(await damage(creature("adversary", { a1: how }).token)).toBeNull();
    const stepless = creature();
    stepless.actor.items.get("dc1").system.actions.get("a1").workflow = new Map();
    expect(await damage(stepless.token)).toBeNull();
  });
});

describe("the sheet's action, by the adapter's id", () => {
  test("a feature's or a domain card's by item and action; a creature's own attack; an action list kept as a list", () => {
    const { token, actor } = creature("adversary");
    expect(actionFor(token, act("tokA.dc1.a2"))).toBe(actor.items.get("dc1").system.actions.get("a2"));
    expect(actionFor(token, act("tokA.attack"))).toBe(actor.system.attack);
    const listed = [...actor.items.get("f1").system.actions.values()];
    actor.items.set("f1", { id: "f1", type: "feature", system: { actions: listed } });
    expect(actionFor(token, act("tokA.f1.b1"))).toBe(listed[0]);
  });
});

describe("a damage card, read by type", () => {
  const card = (damage, extra = {}) => ({ type: "adversaryRoll", system: { hasRoll: false, damage, ...extra } });

  test("its main damage under its type (as a Set or a list, its JSON or a Roll), and its Stress", () => {
    expect(readDaggerheartDamageRoll(card({ main: { total: 5, options: { damageTypes: new Set(["magical", "physical"]) } }, resources: {} }))).toEqual({ magical: 5 });
    expect(readDaggerheartDamageRoll(card({ main: JSON.stringify({ total: 4, options: {} }), resources: { stress: { total: 2, options: {} } } }))).toEqual({ physical: 4, stress: 2 });
  });

  test("none for healing, a card with no damage roll, or anything else", () => {
    expect(readDaggerheartDamageRoll(card({ main: null, resources: { hitPoints: { total: 3 } } }, { hasHealing: true }))).toBeNull();
    expect(readDaggerheartDamageRoll(card({ main: null, resources: {} }))).toBeNull();
    expect(readDaggerheartDamageRoll({ type: "abilityUse", system: {} })).toBeNull();
    expect(readDaggerheartDamageRoll(null)).toBeNull();
  });
});
