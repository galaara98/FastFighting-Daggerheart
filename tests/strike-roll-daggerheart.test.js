/**
 * A strike rolled the daggerheart system's way in a live battle (core API 19 rollStrike): the attack the engine's
 * strike names (an adversary's or companion's standard attack, a Horde's lesser one, a character's weapon or unarmed
 * attack), used with no dialog at the strike's target (the user's target for the roll, theirs put back after); the
 * attack read off its card (a critical, a hit, a miss) and a hit's damage by type as the card holds it, rolled as the
 * card's Roll Damage button rolls it unless the system's Automation rolled it already; the system's own workflow kept
 * from applying the damage, laying the effects, paying the costs and counting the Duality Dice's Hope and Fear, which
 * FastFighting does; for the GMs only when secret. Null where the strike isn't such an attack, its target isn't on the
 * scene, or the system made no roll at it.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DaggerheartAdapter } from "../scripts/adapter.js";
import { attackFor } from "../scripts/strike-roll.js";
import { readDaggerheartStrike } from "../scripts/read-turn.js";

const adapter = new DaggerheartAdapter();
const was = { Hooks: globalThis.Hooks, canvas: globalThis.canvas };
afterEach(() => {
  Object.assign(globalThis, was);
  vi.useRealTimers();
});

/** Foundry's Hooks, as far as the system's action workflow uses them: a call stops at a listener's false. */
function hooks() {
  const on = new Map();
  let n = 0;
  return {
    on: (name, fn) => { on.set(++n, { name, fn }); return n; },
    off: (name, id) => on.delete(id),
    call: (name, ...args) => { for ( const h of [...on.values()] ) if ( h.name === name && h.fn(...args) === false ) return false; return true; },
    count: () => on.size
  };
}

/** The scene this user is looking at, its tokens, and the user's own targets. */
function scene({ tokens = ["tokA", "tokB", "tokC"], targets = ["tokC"], viewing = "s" } = {}) {
  const placed = new Map(tokens.map(id => [id, { id }]));
  const sets = [];
  game.user = { id: "u1", isGM: true, targets: new Set(targets.map(id => placed.get(id))) };
  globalThis.canvas = {
    scene: { id: viewing },
    tokens: {
      get: id => placed.get(id),
      setTargets(ids, { mode }) {
        sets.push({ ids: [...ids], mode });
        game.user.targets = new Set([...ids].map(id => placed.get(id)).filter(Boolean));
      }
    }
  };
  return { sets };
}

/** A character's or companion's Duality roll, as its card holds it. */
const dualityRoll = ({ hope = 9, fear = 4, mod = 3 }) => ({
  total: hope + fear + mod, isCritical: hope === fear, dHope: { total: hope }, dFear: { total: fear },
  dice: [{ faces: 12, total: hope }, { faces: 12, total: fear }], options: { roll: { difficulty: null } }
});
/** An adversary's d20, as its card holds it: a critical at its threshold. */
const d20Roll = ({ natural = 15, mod = 3, critOn = 20 }) => ({
  total: natural + mod, isCritical: natural >= critOn, dice: [{ faces: 20, total: natural }], options: { roll: { difficulty: null } }
});

let made = 0;

/**
 * A damage roll on its card, as the system's DamageRoll makes it: written onto the card without waiting (`lands` ms
 * later; null, never). `damage` is the card's total, a critical's with what the system adds for it.
 */
function rollDamage(card, o, log) {
  log.damageRolls += 1;
  const main = { total: o.damage ?? 7, options: { damageTypes: o.types ?? ["physical"] } };
  const resources = o.stress ? { stress: { total: o.stress, options: {} } } : {};
  if ( o.lands !== null ) setTimeout(() => { card.system.damage = { main, resources }; }, o.lands ?? 30);
  return { main, resources };
}

/**
 * An attack action as the system's runs it: its use() reads the user's targets as it starts (the token's Evasion, or
 * its Difficulty), calls the workflow's hooks, rolls, makes its card (in the message mode it's given), then its steps:
 * the damage rolled where the world's Automation (`auto`) says so, then applied, the effects laid (`effects`), the costs
 * paid (`costs`), and the Duality Dice's Hope or Fear counted unless skipped. The card's Roll Damage button rolls it.
 * `reload`: a weapon to reload first (the system says so and rolls nothing).
 */
function action(name, actor, o, log) {
  return {
    name, hasRoll: true, hasDamage: true, hasSave: !!o.hasSave,
    async use(event, options = {}) {
      const config = {
        event, dialog: {}, selectedMessageMode: "public", hasEffect: !!o.effects, ...options,
        skips: { resources: false, triggers: false, ...(options.skips ?? {}) }
      };
      config.costs = (o.costs ?? []).map(c => ({ ...c }));
      config.targets = o.untargeted ? [] : [...game.user.targets].map(t => ({ id: t.id, actorId: `Actor.${t.id}`, name: t.id, difficulty: o.difficulty ?? null, evasion: o.evasion === undefined ? 12 : o.evasion }));
      log.uses.push({ name, event, options, targets: [...game.user.targets].map(t => t.id), dialog: config.dialog.configure !== false && !event?.shiftKey });
      log.config = config;
      if ( o.reload ) return { notification: "reload" };
      if ( Hooks.call("daggerheart.preUseAction", this, config) === false ) return undefined;
      const roll = ["character", "companion"].includes(actor.type) ? dualityRoll(o) : d20Roll(o);
      const card = {
        id: `card${++made}`, type: ["character", "companion"].includes(actor.type) ? "dualityRoll" : "adversaryRoll", mode: config.selectedMessageMode,
        system: { hasRoll: true, hasDamage: true, targets: config.targets, roll, damage: { main: null, resources: {} } },
        async onRollDamage(e) {
          log.buttons.push(e);
          rollDamage(card, o, log);
        }
      };
      game.messages.set(card.id, card);
      config.message = card;
      const step = (key, fn) => {
        if ( Hooks.call(`daggerheart.pre${key}Action`, this, config) === false ) return;
        fn();
        Hooks.call(`daggerheart.post${key}Action`, this, config);
      };
      if ( o.auto ) config.damage = rollDamage(card, o, log);
      step("ApplyDamage", () => { if ( config.damage && o.auto ) log.applied += 1; });
      step("Effects", () => { if ( config.hasEffect && o.auto ) log.laid += 1; });
      step("Cost", () => { log.paid += config.costs.reduce((s, c) => s + c.value, 0); });
      if ( !config.skips.resources ) log.hopeFear += 1;
      return config;
    }
  };
}

/**
 * A token on the scene this user is looking at, its actor of `type` with its standard attack (a character's: its
 * unarmed attack), and a character's two weapons, a feature and some loot. `o`: how its rolls go (above).
 */
function fighter(type = "adversary", o = {}) {
  const log = { uses: [], buttons: [], damageRolls: 0, applied: 0, laid: 0, paid: 0, hopeFear: 0, config: null };
  const actor = { id: "actA", type, items: new Map(), system: {} };
  actor.system.attack = action("standard", actor, o, log);
  for ( const [id, kind] of [["w1", "weapon"], ["w2", "weapon"], ["f1", "feature"], ["l1", "loot"]] ) {
    if ( type === "character" ) actor.items.set(id, { id, type: kind, system: { attack: action(id, actor, o, log) } });
  }
  return { token: { id: "tokA", uuid: "Scene.s.Token.tokA", parent: { id: "s" }, actor }, actor, log };
}

const target = { id: "tokB", uuid: "Scene.s.Token.tokB", parent: { id: "s" } };
const strike = (id = "tokA.attack") => ({ id, name: "a blow" });
const react = (token, action = strike(), at = target, options = {}) => adapter.rollStrike(token, { action, target: at, ...options });

beforeEach(() => {
  globalThis.Hooks = hooks();
  const store = new Map();
  game.messages = { get: id => store.get(id), set: (id, m) => store.set(id, m) };
});

describe("a strike, rolled the daggerheart system's way", () => {
  test("the weapon the engine's strike names, used with no dialog at the strike's target; the user's own targets put back", async () => {
    const { sets } = scene({ targets: ["tokC"] });
    const { token, log } = fighter("character");
    await react(token, strike("tokA.w2"));
    expect(log.uses).toHaveLength(1);
    expect(log.uses[0]).toMatchObject({ name: "w2", targets: ["tokB"], dialog: false, options: { dialog: { configure: false } } });
    // (Shift down, the system's own way past its dialogs; no advantage or disadvantage of the click's.)
    expect(log.uses[0].event).toMatchObject({ shiftKey: true, altKey: false, ctrlKey: false });
    expect(sets.at(-1)).toEqual({ ids: ["tokC"], mode: "replace" });
    expect([...game.user.targets].map(t => t.id)).toEqual(["tokC"]);
    expect(Hooks.count()).toBe(0);
  });

  test("a creature's own attack by the adapter's ids: the standard attack (a Horde's lesser one too), a character's unarmed", () => {
    const adversary = fighter("adversary");
    expect(attackFor(adversary.token, strike("tokA.attack"))).toBe(adversary.actor.system.attack);
    expect(attackFor(adversary.token, strike("tokA.attack.horde"))).toBe(adversary.actor.system.attack);
    const companion = fighter("companion");
    expect(attackFor(companion.token, strike("tokA.attack"))).toBe(companion.actor.system.attack);
    const character = fighter("character");
    expect(attackFor(character.token, strike("tokA.unarmed"))).toBe(character.actor.system.attack);
    expect(attackFor(character.token, strike("tokA.w1"))).toBe(character.actor.items.get("w1").system.attack);
  });

  test("a hit: the attack as the card has it, and its damage by type, rolled as the card's Roll Damage button rolls it", async () => {
    scene();
    const { token, log } = fighter("adversary", { natural: 15, mod: 3, damage: 7, lands: 60 });
    expect(await react(token)).toEqual({ attack: { degree: 2, natural: 15, total: 18 }, damage: { byType: { physical: 7 } } });
    expect(log.buttons).toHaveLength(1);
    expect(log.buttons[0]).toMatchObject({ shiftKey: true });
    // (The card the core then applies, as its damageCard reads it.)
    const card = game.messages.get(log.config.message.id);
    expect(adapter.damageCard(card)).toEqual({ amount: 7, kind: "damage", targets: ["tokB"], save: false });
  });

  test("magical damage, and the Stress it marks besides", async () => {
    scene();
    const { token } = fighter("character", { hope: 10, fear: 3, damage: 6, types: ["magical"], stress: 1 });
    expect(await react(token, strike("tokA.w1"))).toEqual({ attack: { degree: 2, natural: 13, total: 16 }, damage: { byType: { magical: 6, stress: 1 } } });
  });

  test("a miss is degree 1, with no damage rolled", async () => {
    scene();
    const { token, log } = fighter("character", { hope: 2, fear: 5, mod: 1 });
    expect(await react(token, strike("tokA.w1"))).toEqual({ attack: { degree: 1, natural: 7, total: 8 }, damage: null });
    expect(log.damageRolls).toBe(0);
  });

  test("a critical (matching Duality Dice, an adversary's d20 at its threshold) is degree 3, hitting whatever it needed; its damage as the system rolls it", async () => {
    scene();
    const pc = fighter("character", { hope: 3, fear: 3, mod: 0, damage: 19, evasion: 30 });
    expect(await react(pc.token, strike("tokA.w1"))).toEqual({ attack: { degree: 3, natural: 6, total: 6 }, damage: { byType: { physical: 19 } } });
    const foe = fighter("adversary", { natural: 19, critOn: 19, mod: 2, damage: 14 });
    expect(await react(foe.token)).toEqual({ attack: { degree: 3, natural: 19, total: 21 }, damage: { byType: { physical: 14 } } });
  });

  test("against an adversary, its Difficulty", async () => {
    scene();
    const { token } = fighter("character", { hope: 8, fear: 4, mod: 2, difficulty: 15, evasion: null });
    expect((await react(token, strike("tokA.w1"))).attack.degree).toBe(1);
  });

  test("damage the system's Automation rolled already: read off the card, not rolled again", async () => {
    scene();
    const { token, log } = fighter("adversary", { auto: true, damage: 9 });
    expect((await react(token)).damage).toEqual({ byType: { physical: 9 } });
    expect(log.damageRolls).toBe(1);
    expect(log.buttons).toEqual([]);
  });

  test("the system's workflow doesn't apply the damage, lay the effects, pay the costs or count Hope and Fear: FastFighting does", async () => {
    scene();
    const o = { auto: true, effects: true, costs: [{ key: "fear", value: 1 }] };
    const { token, log } = fighter("adversary", o);
    await react(token);
    expect(log).toMatchObject({ applied: 0, laid: 0, paid: 0, hopeFear: 0 });
    expect(log.uses[0].options.skips).toEqual({ resources: true });
    // (Each put back once its step is past, as the system left it.)
    expect(log.config.damage).not.toBeNull();
    expect(log.config.hasEffect).toBe(true);
    expect(log.config.costs).toEqual([{ key: "fear", value: 1 }]);
    expect(Hooks.count()).toBe(0);
    // (The same attack used as a player would: the system does them all.)
    const own = fighter("adversary", o);
    await own.actor.system.attack.use({ shiftKey: true }, {});
    expect(own.log).toMatchObject({ applied: 1, laid: 1, paid: 1, hopeFear: 1 });
  });

  test("secret: its card in the GMs' mode; otherwise in the chat's own", async () => {
    scene();
    const hidden = fighter("adversary");
    await react(hidden.token, strike(), target, { secret: true });
    expect(hidden.log.uses[0].options.selectedMessageMode).toBe("gm");
    expect(hidden.log.config.message.mode).toBe("gm");
    const open = fighter("adversary");
    await react(open.token);
    expect(open.log.uses[0].options).not.toHaveProperty("selectedMessageMode");
    expect(open.log.config.message.mode).toBe("public");
  });

  test("a hit whose damage never lands on its card: the attack, its damage left to the engine", async () => {
    vi.useFakeTimers();
    scene();
    const { token } = fighter("adversary", { lands: null });
    const rolled = react(token);
    await vi.advanceTimersByTimeAsync(3200);
    expect(await rolled).toEqual({ attack: { degree: 2, natural: 15, total: 18 }, damage: null });
  });

  test("not an attack of its own by the strike's id (a feature's action, another item, another's, the wrong kind of creature): null, nothing rolled", async () => {
    scene();
    const pc = fighter("character");
    for ( const id of ["tokA.f1", "tokA.l1", "tokA.f1.a1", "tokA.attack", "tokZ.w1", "w1", "tokA."] ) expect(await react(pc.token, strike(id))).toBeNull();
    expect(pc.log.uses).toEqual([]);
    const foe = fighter("adversary");
    for ( const id of ["tokA.unarmed", "tokA.w1"] ) expect(await react(foe.token, strike(id))).toBeNull();
    expect(await react(fighter("companion").token, strike("tokA.attack.horde"))).toBeNull();
    // (One its targets roll to resist: the engine's save, not a strike.)
    const saved = fighter("adversary", { hasSave: true });
    expect(await react(saved.token)).toBeNull();
    expect(foe.log.uses).toEqual([]);
    expect(saved.log.uses).toEqual([]);
    expect(await react({ id: "tokA", actor: null }, strike())).toBeNull();
  });

  test("a target not on the scene this user is looking at, or none: null, nothing rolled, the user's targets untouched", async () => {
    const { sets } = scene({ viewing: "elsewhere" });
    const { token, log } = fighter("adversary");
    expect(await react(token)).toBeNull();
    expect(await react(token, strike(), null)).toBeNull();
    scene({ tokens: ["tokA"] });
    expect(await react(token)).toBeNull();
    expect(log.uses).toEqual([]);
    expect(sets).toEqual([]);
  });

  test("a roll the system didn't make at the target (a weapon to reload, cancelled, its targeting left it out, no Evasion to meet): null", async () => {
    scene();
    expect(await react(fighter("character", { reload: true }).token, strike("tokA.w1"))).toBeNull();
    expect(await react(fighter("adversary", { untargeted: true }).token)).toBeNull();
    expect(await react(fighter("adversary", { evasion: null }).token)).toBeNull();
    const cancelled = fighter("adversary");
    Hooks.on("daggerheart.preUseAction", () => false);
    expect(await react(cancelled.token)).toBeNull();
    expect(cancelled.log.uses).toHaveLength(1);
  });

  test("the system failing: its error, and the user's targets and the hooks put back either way", async () => {
    scene({ targets: ["tokC"] });
    const { token, actor } = fighter("adversary");
    actor.system.attack.use = async () => { throw new Error("no"); };
    await expect(react(token)).rejects.toThrow("no");
    expect([...game.user.targets].map(t => t.id)).toEqual(["tokC"]);
    expect(Hooks.count()).toBe(0);
  });
});

describe("a strike's card, read", () => {
  const card = (extra = {}) => ({
    type: "dualityRoll",
    system: { hasRoll: true, targets: [{ id: "tokB", evasion: 12 }], roll: dualityRoll({ hope: 9, fear: 4, mod: 3 }), damage: { main: null, resources: {} }, ...extra }
  });

  test("its damage as the card's data holds it (the roll's JSON), its types as a Set or a list", () => {
    expect(readDaggerheartStrike(card({ damage: { main: JSON.stringify({ total: 5, options: { damageTypes: ["magical"] } }), resources: {} } }), "tokB").damage).toEqual({ magical: 5 });
    expect(readDaggerheartStrike(card({ damage: { main: { total: 4, options: { damageTypes: new Set(["physical", "magical"]) } }, resources: {} } }), "tokB").damage).toEqual({ physical: 4 });
  });

  test("none at another token, nor on a card with no action roll, nor on anything else", () => {
    expect(readDaggerheartStrike(card(), "tokC")).toBeNull();
    expect(readDaggerheartStrike(card({ hasRoll: false }), "tokB")).toBeNull();
    expect(readDaggerheartStrike({ ...card(), type: "damageRoll" }, "tokB")).toBeNull();
    expect(readDaggerheartStrike({ type: "systemMessage", system: {} }, "tokB")).toBeNull();
    expect(readDaggerheartStrike(null, "tokB")).toBeNull();
  });
});
