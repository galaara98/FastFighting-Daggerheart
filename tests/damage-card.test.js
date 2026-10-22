/**
 * API 19: a player's damage card in a live battle. Read as it's made (damageCard: how much, damage or healing, at whom,
 * a reaction roll first); applied to a token through the system's own Actor#takeDamage / takeHealing, times the GM's
 * multiplier, with undo records of what it changed (applyDamageCard); and the system's own Automation, which applies
 * players' damage itself, named while it's on (appliesPlayerDamage).
 */
import { describe, expect, test } from "vitest";
import { DaggerheartAdapter } from "../scripts/adapter.js";
import { systemAppliesText } from "../../FastFighting/scripts/foundry/live-battle.js";
import { text } from "./foundry-i18n.js";

const adapter = new DaggerheartAdapter();

/** A daggerheart action card: the Duality Dice, its targets, its damage or healing (as Rolls: {total, options}). */
const card = ({ type = "dualityRoll", hope = 8, fear = 4, total = 15, targets = [], damage = 9, types = ["physical"], healing = null, hasSave = false, hasRoll = type !== "damageRoll", isDirect = false } = {}) => ({
  type, speaker: { token: "tokA" }, rolls: [],
  system: {
    title: "Longsword", hasRoll, hasDamage: damage !== null && !healing, hasHealing: !!healing, hasSave, isDirect, targets,
    damage: {
      main: damage === null || healing ? null : { total: damage, options: { damageTypes: types } },
      resources: Object.fromEntries(Object.entries(healing ?? {}).map(([k, n]) => [k, { total: n, options: {} }]))
    },
    roll: { total, isCritical: hope === fear, dHope: { total: hope }, dFear: { total: fear }, dice: [{ faces: 12, total: hope }, { faces: 12, total: fear }], options: { roll: { difficulty: null } } }
  }
});
const at = (id, evasion = 12) => ({ id, actorId: `Actor.${id}`, name: id, evasion });

describe("a damage card, as it's made", () => {
  test("an attack that hits: its damage, at that token", () => {
    expect(adapter.damageCard(card({ targets: [at("tokB")] }), { ids: { tokB: "B" } })).toEqual({ amount: 9, kind: "damage", targets: ["tokB"], save: false });
  });

  test("only the targets it hit; a critical hits them all; none hit, no damage lands", () => {
    const targets = [at("tokB", 12), at("tokC", 18)];
    expect(adapter.damageCard(card({ targets })).targets).toEqual(["tokB"]);
    expect(adapter.damageCard(card({ targets, hope: 5, fear: 5, total: 10 })).targets).toEqual(["tokB", "tokC"]);
    expect(adapter.damageCard(card({ targets, total: 9 }))).toBeNull();
  });

  test("damage with no roll (on a card of its own): every token it names; none named, none", () => {
    expect(adapter.damageCard(card({ hasRoll: false, total: 1, damage: 4, targets: [at("tokB", 30), at("tokC", 30)] })).targets).toEqual(["tokB", "tokC"]);
    expect(adapter.damageCard(card({ type: "damageRoll", damage: 4 }))).toEqual({ amount: 4, kind: "damage", targets: [], save: false });
  });

  test("an action whose targets make a reaction roll first: save, for the GM to settle", () => {
    expect(adapter.damageCard(card({ hasRoll: false, hasSave: true, damage: 12, targets: [at("tokB")] }))).toMatchObject({ amount: 12, save: true });
  });

  test("healing: the Hit Points it clears (else all it restores), at whom it names", () => {
    expect(adapter.damageCard(card({ healing: { hitPoints: 3, stress: 1 }, targets: [at("tokC", 30)] }))).toEqual({ amount: 3, kind: "healing", targets: ["tokC"], save: false });
    expect(adapter.damageCard(card({ healing: { stress: 2, hope: 1 } })).amount).toBe(3);
  });

  test("its damage as the card's data holds it (the roll's JSON) is read too", () => {
    const m = card({ targets: [at("tokB")] });
    m.system.damage.main = JSON.stringify({ total: 7, options: { damageTypes: ["magical"] } });
    expect(adapter.damageCard(m).amount).toBe(7);
  });

  test("anything else: null (a roll with no damage, another card, odd data)", () => {
    expect(adapter.damageCard(card({ damage: null, targets: [at("tokB")] }))).toBeNull();
    expect(adapter.damageCard({ ...card(), type: "fateRoll" })).toBeNull();
    expect(adapter.damageCard({ type: "systemMessage", system: {} })).toBeNull();
    const broken = card({ targets: [at("tokB")] });
    broken.system.damage.main = "{not json";
    expect(adapter.damageCard(broken)).toBeNull();
    expect(adapter.damageCard(null)).toBeNull();
  });
});

describe("a damage card applied, through the system", () => {
  /**
   * An adversary's token whose actor takes damage as the system does in brief: the damage to Hit Points marked by its
   * thresholds, written without waiting (later: a moment after it says what it did), its Defeated automation at its last.
   */
  const raider = ({ hp = 1, max = 6, taken = 1, later = false, statuses = [] } = {}) => {
    const actor = {
      id: "r1", uuid: "Actor.r1", name: "Jagged Knife Raider", type: "adversary", statuses: new Set(statuses), effects: [], items: [], calls: [],
      system: {
        resources: { hitPoints: { value: hp, max, isReversed: true }, stress: { value: 0, max: 3, isReversed: true } },
        damageThresholds: { major: 5, severe: 10 }, rules: { attack: { damage: { hpDamageTakenMultiplier: taken } } }
      },
      async takeDamage(args, isDirect) {
        this.calls.push({ how: "damage", args: structuredClone(args), isDirect });
        const n = args.main?.total ?? 0;
        const marks = n >= 10 ? 3 : n >= 5 ? 2 : n > 0 ? 1 : 0;
        const updates = [{ key: "hitPoints", value: marks }];
        const write = () => {
          this.system.resources.hitPoints.value = Math.min(max, hp + marks);
          if ( this.system.resources.hitPoints.value >= max ) this.statuses.add("defeated");
        };
        if ( later ) setTimeout(write, 40);
        else write();
        return updates;
      },
      async takeHealing(args) {
        this.calls.push({ how: "healing", args: structuredClone(args) });
        const updates = Object.entries(args.resources).map(([key, r]) => ({ key, value: -r.total }));
        for ( const u of updates ) this.system.resources[u.key].value = Math.max(0, this.system.resources[u.key].value + u.value);
        return updates;
      }
    };
    return { id: "tokB", uuid: "Scene.s1.Token.tokB", actor };
  };

  test("its damage times the GM's multiplier (and the creature's own damage-taken multiplier), its types, whether it's direct", async () => {
    for ( const [multiplier, taken, total] of [[1, 1, 9], [2, 1, 18], [0.5, 1, 4.5], [1, 2, 18], [0.5, 1.5, 7]] ) {
      const token = raider({ taken });
      await adapter.applyDamageCard(card({ damage: 9, types: ["magical"], isDirect: true }), token, { multiplier });
      expect([multiplier, taken, token.actor.calls]).toEqual([multiplier, taken, [{ how: "damage", args: { main: { total, options: { damageTypes: ["magical"], fullRestore: false, itemId: null } }, resources: {} }, isDirect: true }]]);
    }
  });

  test("a half (a save's share, the GM's Half): halved before the thresholds and left as it comes, as the system's own save is", async () => {
    // (9 halved is 4.5: a Minor hit against a Major threshold of 5, one Hit Point; rounded up it would have been two.)
    const token = raider({ hp: 0 });
    await adapter.applyDamageCard(card({ damage: 9 }), token, { multiplier: 0.5 });
    expect(token.actor.calls[0].args.main.total).toBe(4.5);
    expect(token.actor.system.resources.hitPoints.value).toBe(1);
  });

  test("the undo record: the Hit Points marked as they were; statuses laid along the way come off, those it had stay", async () => {
    const token = raider({ hp: 3, statuses: ["vulnerable"] });
    const records = await adapter.applyDamageCard(card({ damage: 12 }), token, { multiplier: 1 });
    expect(token.actor.system.resources.hitPoints.value).toBe(6);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ tokenUuid: "Scene.s1.Token.tokB", actorUuid: "Actor.r1", actorUpdate: { "system.resources.hitPoints.value": 3 }, itemUpdates: [], statusesBefore: ["vulnerable"] });
  });

  test("written a moment later (the system doesn't wait for its own update): the sheet shows it before the core reads it", async () => {
    const token = raider({ hp: 1, later: true });
    const records = await adapter.applyDamageCard(card({ damage: 6 }), token, { multiplier: 2 });
    expect(token.actor.system.resources.hitPoints.value).toBe(4);
    expect(records[0].actorUpdate).toEqual({ "system.resources.hitPoints.value": 1 });
  });

  test("a heal, times the multiplier: what it restores as it was", async () => {
    const token = raider({ hp: 4 });
    const records = await adapter.applyDamageCard(card({ healing: { hitPoints: 1 } }), token, { multiplier: 2 });
    expect(token.actor.calls).toEqual([{ how: "healing", args: { resources: { hitPoints: { total: 2, options: { damageTypes: [], fullRestore: false, itemId: null } } } } }]);
    expect(token.actor.system.resources.hitPoints.value).toBe(2);
    expect(records[0].actorUpdate).toEqual({ "system.resources.hitPoints.value": 4 });
  });

  test("a character's Armor Slots marked on its armor, its Stress, and the GM's Fear: each as it was", async () => {
    const was = globalThis.game.settings;
    globalThis.game.settings = { get: (ns, key) => (ns === "daggerheart" && key === "ResourcesFear" ? 5 : undefined) };
    const armor = { id: "arm1", type: "armor", system: { armor: { current: 1, max: 4 } } };
    const actor = {
      id: "c1", uuid: "Actor.c1", type: "character", statuses: new Set(), effects: [], items: [armor],
      system: { resources: { hitPoints: { value: 0, max: 6, isReversed: true }, stress: { value: 2, max: 6, isReversed: true }, hope: { value: 2, max: 6 } } },
      async takeDamage() {
        armor.system.armor.current = 2;
        this.system.resources.hitPoints.value = 1;
        this.system.resources.stress.value = 3;
        return [{ key: "armor", value: 1, uuid: "Actor.c1.Item.arm1" }, { key: "stress", value: 1 }, { key: "hitPoints", value: 1 }, { key: "fear", value: -1 }];
      }
    };
    const m = card({ damage: 8 });
    m.system.damage.resources = { stress: { total: 1, options: {} }, fear: { total: 1, options: {} } };
    const records = await adapter.applyDamageCard(m, { uuid: "Scene.s1.Token.c1", actor }, { multiplier: 1 });
    globalThis.game.settings = was;
    expect(records[0].actorUpdate).toEqual({ "system.resources.stress.value": 2, "system.resources.hitPoints.value": 0 });
    expect(records[0].itemUpdates).toEqual([{ id: "arm1", update: { "system.armor.current": 1 } }]);
    expect(records[1].setting).toEqual({ namespace: "daggerheart", key: "ResourcesFear", value: 5 });
  });

  test("nothing done (the system's hook said no, the Armor Slot dialog closed, no damage on the card): no undo records", async () => {
    const token = raider();
    token.actor.takeDamage = async () => null;
    expect(await adapter.applyDamageCard(card(), token, { multiplier: 1 })).toEqual([]);
    token.actor.takeDamage = async () => [];
    expect(await adapter.applyDamageCard(card(), token, { multiplier: 1 })).toEqual([]);
    expect(await adapter.applyDamageCard(card({ damage: null }), raider(), { multiplier: 1 })).toEqual([]);
  });
});

describe("the system's own Automation applying players' damage", () => {
  const automation = players => ({ roll: { damageApply: { gm: true, players } } });
  const name = () => text("FFDAGGERHEART.AutoApply.Name", {
    system: text("FFDAGGERHEART.Label"), menu: text("FFDAGGERHEART.AutoApply.Menu"), setting: text("FFDAGGERHEART.AutoApply.Setting"), who: text("FFDAGGERHEART.AutoApply.Players")
  });

  test("on for players: that setting's name, as the GM finds it (in the core's words for the toggles it greys out); off: null", () => {
    globalThis.game.settings = { get: (ns, key) => (ns === "daggerheart" && key === "Automation" ? automation(true) : undefined) };
    expect(adapter.appliesPlayerDamage()).toBe(name());
    expect(systemAppliesText(adapter)).toBe(text("FASTFIGHTING.Live.SystemApplies", { name: name() }));
    globalThis.game.settings = { get: () => automation(false) };
    expect(adapter.appliesPlayerDamage()).toBeNull();
    expect(systemAppliesText(adapter)).toBeNull();
    // (The GM's own, on, isn't the players'.)
    globalThis.game.settings = { get: () => ({ roll: { damageApply: { gm: true } } }) };
    expect(adapter.appliesPlayerDamage()).toBeNull();
  });

  test("in the system's own words where it has them; read from game.system.settings when the setting can't be", () => {
    const i18n = globalThis.game.i18n;
    const own = { "DAGGERHEART.SETTINGS.Menu.automation.name": "Automatización", "DAGGERHEART.GENERAL.player.plural": "Jugadores" };
    globalThis.game.i18n = { ...i18n, has: k => k in own || i18n.has(k), localize: k => own[k] ?? i18n.localize(k), format: (k, d) => i18n.format(k, d) };
    globalThis.game.system = { id: "daggerheart", settings: { automation: automation(true) } };
    expect(adapter.appliesPlayerDamage()).toBe(text("FFDAGGERHEART.AutoApply.Name", {
      system: text("FFDAGGERHEART.Label"), menu: "Automatización", setting: text("FFDAGGERHEART.AutoApply.Setting"), who: "Jugadores"
    }));
  });
});

describe("a character's Armor Slots, as FastFighting plays it", () => {
  /**
   * A character's token whose actor takes damage as the system does in brief: Hit Points marked by its thresholds, the
   * question of which Armor Slots to mark put to its owner (the system's "armorSlot" query, here the browser's own
   * CONFIG.queries handler), the answer's Hit Points marked and slots written.
   */
  const hero = ({ player = false, current = 0, max = 3 } = {}) => {
    const armor = { uuid: "Actor.h1.Item.arm", system: { armor: { current, max } } };
    const actor = {
      id: "h1", uuid: "Actor.h1", name: "Brakka", type: "character", statuses: new Set(), effects: [], items: [], asked: [],
      owner: player ? { id: "player1", isGM: false } : { id: "gm1", isGM: true },
      allApplicableEffects: () => [],
      system: { armor, resources: { hitPoints: { value: 0, max: 6, isReversed: true }, stress: { value: 0, max: 6, isReversed: true } }, damageThresholds: { major: 5, severe: 10 }, rules: {} },
      async takeDamage(args) {
        const n = args.main?.total ?? 0;
        const marks = n >= 10 ? 3 : n >= 5 ? 2 : n > 0 ? 1 : 0;
        const answer = await CONFIG.queries.armorSlot({ actorId: this.uuid, damage: marks, type: ["physical"] });
        this.asked.push(answer);
        const updates = [{ key: "hitPoints", value: answer.modifiedDamage }];
        for ( const c of answer.armorChanges ) {
          updates.push({ key: "armor", value: c.amount, uuid: c.uuid });
          armor.system.armor.current += c.amount;
        }
        this.system.resources.hitPoints.value += answer.modifiedDamage;
        return updates;
      }
    };
    return { id: "tokH", uuid: "Scene.s1.Token.tokH", actor };
  };
  const withQueries = async fn => {
    const was = { CONFIG: globalThis.CONFIG, user: game.user };
    const dialog = [];
    globalThis.CONFIG = { queries: { armorSlot: async data => { dialog.push(data); return { modifiedDamage: data.damage, armorChanges: [], stressSpent: 0 }; } } };
    game.user = { id: "gm1", isGM: true };
    try {
      return await fn(dialog);
    } finally {
      globalThis.CONFIG = was.CONFIG;
      game.user = was.user;
    }
  };

  test("no player of its own here, in a turn FastFighting plays: no dialog; the engine's Hit Points, its Armor Slot left to the turn's changes", () => withQueries(async dialog => {
    const own = CONFIG.queries.armorSlot;
    const marked = hero();
    await adapter.applyDamageCard(card({ damage: 7 }), marked, { multiplier: 1, amount: 1 });
    expect(marked.actor.asked).toEqual([{ modifiedDamage: 1, armorChanges: [], stressSpent: 0 }]);
    // (Written once, with the turn: commitDaggerheartChanges, from the engine's armorMarked.)
    expect(marked.actor.system.armor.system.armor.current).toBe(0);
    const kept = hero();
    await adapter.applyDamageCard(card({ damage: 7 }), kept, { multiplier: 1, amount: 2 });
    expect(kept.actor.asked[0]).toEqual({ modifiedDamage: 2, armorChanges: [], stressSpent: 0 });
    expect(dialog).toEqual([]);
    // (The system's own question again afterwards.)
    expect(CONFIG.queries.armorSlot).toBe(own);
  }));

  test("outside a turn FastFighting plays (no engine's say): a slot against Major or worse, while one is free", () => withQueries(async () => {
    const major = hero();
    await adapter.applyDamageCard(card({ damage: 7 }), major, { multiplier: 1 });
    expect(major.actor.asked[0]).toEqual({ modifiedDamage: 1, armorChanges: [{ uuid: "Actor.h1.Item.arm", amount: 1 }], stressSpent: 0 });
    expect(major.actor.system.armor.system.armor.current).toBe(1);
    const full = hero({ current: 3 });
    await adapter.applyDamageCard(card({ damage: 12 }), full, { multiplier: 1 });
    expect(full.actor.asked[0]).toEqual({ modifiedDamage: 3, armorChanges: [], stressSpent: 0 });
    const minor = hero();
    await adapter.applyDamageCard(card({ damage: 3 }), minor, { multiplier: 1 });
    expect(minor.actor.asked[0]).toEqual({ modifiedDamage: 1, armorChanges: [], stressSpent: 0 });
  }));

  test("a player of theirs here: the system's own question, their dialog", () => withQueries(async dialog => {
    const token = hero({ player: true });
    await adapter.applyDamageCard(card({ damage: 7 }), token, { multiplier: 1, amount: 1 });
    expect(dialog).toEqual([{ actorId: "Actor.h1", damage: 2, type: ["physical"] }]);
  }));
});
