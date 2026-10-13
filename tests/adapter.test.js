/**
 * The adapter, with stand-ins for the system's actors: a character (its traits, gold, a potion, loot, the trait moves,
 * Help an Ally, sizing up, tending, theft, doors; who it is, from its whole sheet), an adversary's personality, an
 * environment (a hazard), and Sprint in a fight.
 */
import { describe, expect, test } from "vitest";
import { DaggerheartAdapter } from "../scripts/adapter.js";
import { daggerheartRules } from "../scripts/rules.js";
import { replay } from "../../FastFighting/scripts/engine/simulator.js";
import { parseFormula, STATUS, PC_BASELINE } from "../scripts/core.js";
import { text } from "./foundry-i18n.js";
import { withHints } from "../../FastFighting/scripts/foundry/auto-config.js";

const trait = v => ({ value: v });
const dagger = { type: "attack", range: "melee", target: { type: "any", amount: 1 }, roll: { type: "attack", trait: "finesse" }, cost: [],
  damage: { main: { type: ["physical"], applyTo: "hitPoints", value: { dice: "d8", bonus: 1, multiplier: "prof", flatMultiplier: 1 } } } };
const potion = { _id: "drink", type: "healing", target: { type: "self" }, cost: [], damage: { resources: { hitPoints: { applyTo: "hitPoints", value: { custom: { enabled: true, formula: "1d4" } } } } } };
const character = () => ({
  id: "a1", uuid: "Actor.a1", name: "Wren", type: "character", img: "", statuses: new Set(),
  items: [
    { id: "p1", type: "consumable", name: "Minor Health Potion", system: { quantity: 2, actions: [potion] }, effects: [] },
    { id: "g1", type: "loot", name: "Gem", system: { quantity: 1, tier: 1 }, effects: [] }
  ],
  system: {
    traits: { agility: trait(1), strength: trait(-1), finesse: trait(2), instinct: trait(0), presence: trait(1), knowledge: trait(0) },
    levelData: { level: { current: 1 } }, proficiency: 1, evasion: 12, damageThresholds: { major: 6, severe: 12 },
    resources: { hitPoints: { max: 6, value: 1 }, stress: { max: 6, value: 2 }, hope: { value: 2, max: 6 } }, armorScore: { max: 3, value: 1 },
    experiences: { x: { name: "Thief", value: 2 } }, gold: { coins: 3, handfuls: 2, bags: 1, chests: 0 },
    primaryWeapon: { id: "w1", name: "Dagger", system: { attack: dagger }, effects: [] }, secondaryWeapon: null,
    resistance: { physical: {}, magical: {} }, rules: {}
  }
});
const tokenOf = actor => ({ id: `t-${actor.id}`, name: actor.name, actor, texture: { src: "" } });

describe("a character", () => {
  test("its numbers: Hit Points and Stress left, Hope, Armor Slots left, Evasion, its traits", async () => {
    const spec = await new DaggerheartAdapter().toCombatantSpec(tokenOf(character()));
    expect(spec).toMatchObject({ kind: "pc", duality: true, hp: { value: 5, max: 6 }, defenses: { ac: 12, finesse: 2 }, resources: { hope: 2, stress: 4, armor: 2, "item:p1": 2 } });
  });

  test("what it can do: its weapon, its potion (a drink of its own), the trait moves, Help an Ally", async () => {
    const spec = await new DaggerheartAdapter().toCombatantSpec(tokenOf(character()));
    const kinds = spec.actions.map(a => a.traitMove ?? a.kind);
    expect(kinds).toEqual(["strike", "heal", "grapple", "maneuver", "hide", "buff"]);
    expect(spec.actions[1]).toMatchObject({ resource: "item:p1", selfOnly: true, consumable: true });
  });

  test("what playstyles need: sizing up, tending, theft, doors, gold and gear to give up", async () => {
    const spec = await new DaggerheartAdapter().toCombatantSpec(tokenOf(character()));
    expect(spec.sizeUp).toMatchObject({ mod: 0, uses: 1 });
    expect(spec.firstAid).toEqual({ mod: 0 });
    expect(spec.theft).toMatchObject({ mod: 2 });
    expect(spec.doorWork).toEqual({ force: { mod: -1 }, pick: { mod: 2 } });
    expect(spec.valuables.money).toBe(123);
    expect(spec.valuables.stowed.map(i => i.name)).toEqual(["Minor Health Potion", "Gem"]);
  });
});

describe("who it is, from its whole sheet", () => {
  /** A Guardian as the SRD's compendium makes one: its class, subclass, ancestry and community, its cards and features. */
  const guardian = () => {
    const actor = character();
    actor.system.traits = Object.fromEntries(Object.entries({ agility: 1, strength: 2, finesse: -1, instinct: 0, presence: 1, knowledge: 0 }).map(([k, v]) => [k, trait(v)]));
    actor.system.scars = 0;
    actor.system.resources.stress.max = 6;
    actor.system.biography = { background: "<p><strong>Who did you fail?</strong> My village.</p>", connections: "<p>Mira is a coward.</p>", characteristics: { faith: "The Sun" } };
    actor.items.push(
      { id: "c1", type: "class", name: "Guardian", system: { domains: ["valor", "blade"], characterGuide: { suggestedTraits: { agility: 1, strength: 2, finesse: -1, instinct: 0, presence: 1, knowledge: 0 } } }, effects: [] },
      { id: "s1", type: "subclass", name: "Stalwart", _stats: { compendiumSource: "Compendium.daggerheart.subclasses.Item.rKRxFBlkbh9cDK8K" }, system: { featureState: 1 }, effects: [] },
      { id: "a1", type: "ancestry", name: "Orc", system: { loreReference: "orc" }, effects: [] },
      { id: "m1", type: "community", name: "Ridgeborne", system: { loreReference: "ridgeborne" }, effects: [] },
      { id: "d1", type: "domainCard", name: "I Am Your Shield", system: { domain: "valor", inVault: false, actions: [{ type: "effect", target: { type: "friendly" }, cost: [{ key: "stress", value: 1 }] }] }, effects: [] },
      { id: "d2", type: "domainCard", name: "Lean on Me", system: { domain: "valor", inVault: true, actions: [{ type: "healing", target: { type: "friendly" } }] }, effects: [] }
    );
    return actor;
  };

  test("a character: its class's guide, domains and cards, subclass, ancestry, community and features, each shown in its reasons", () => {
    const { traits, reasons } = new DaggerheartAdapter().deriveTraits(guardian());
    expect(traits.brave).toBeGreaterThan(PC_BASELINE.brave + 5);
    expect(traits.loyal).toBeGreaterThan(PC_BASELINE.loyal + 3);
    for ( const name of ["Stalwart", "Orc", "Ridgeborne"] ) expect(reasons.brave).toContain(name);
    expect(reasons.brave).toContain(text("FFDAGGERHEART.Domain.valor"));
    // (Its loadout's cards act on it; a card in the vault only counts toward its domain.)
    expect(reasons.loyal).toContain("I Am Your Shield");
    expect(reasons.loyal).not.toContain("Lean on Me");
  });

  test("out of the party, where the world has one", () => {
    const adapter = new DaggerheartAdapter();
    const alone = guardian();
    const settled = adapter.deriveTraits(alone).traits.loyal;
    globalThis.game.actors = [{ type: "party" }];
    alone.parties = new Set();
    expect(adapter.deriveTraits(alone).traits.loyal).toBe(settled - 10);
    alone.parties = new Set([{ type: "party" }]);
    expect(adapter.deriveTraits(alone).traits.loyal).toBe(settled);
  });

  test("its biography: faith and Experiences about it, its background its story, its connections left out", () => {
    const bio = new DaggerheartAdapter().biography(guardian());
    expect(bio.about).toContain("The Sun");
    expect(bio.about).toContain("Thief");
    expect(bio.story).toBe("My village.");
    expect(JSON.stringify(bio)).not.toContain("coward");
  });

  test("an adversary: its type and tier, its features, the damage it's immune to; its description and motives about it", async () => {
    const ghost = { id: "g1", uuid: "Actor.g1", name: "Ghost", type: "adversary", img: "", statuses: new Set(),
      items: [{ id: "f1", type: "feature", name: "Terrifying", system: { featureForm: "passive", actions: [{ type: "damage", target: { type: "any" }, damage: { resources: { hope: { applyTo: "hope" } } } }] }, effects: [] }],
      system: { type: "standard", tier: 1, difficulty: 11, motivesAndTactics: "Haunt, wail", description: "<p>A restless spirit.</p>", experiences: {},
        resistance: { physical: { immunity: true }, magical: {} }, resources: { hitPoints: { max: 3, value: 0 }, stress: { max: 2, value: 0 } }, damageThresholds: { major: 5, severe: 9 } } };
    const adapter = new DaggerheartAdapter();
    const { traits, reasons } = adapter.deriveTraits(ghost);
    expect(traits.brave).toBe(56);
    expect(reasons.brave).toContain("Terrifying");
    expect(reasons.brave).toContain(text("FFDAGGERHEART.Harm.physicalImmunity"));
    const spec = await adapter.toCombatantSpec(tokenOf(ghost));
    expect(spec.traits.brave.base).toBe(56);
    expect(adapter.biography(ghost)).toEqual({ about: "A restless spirit. Haunt, wail", story: "", against: "" });
  });
});

describe("an environment", () => {
  test("a hazard: its action features, reaction rolls against its Difficulty; nobody attacks it", async () => {
    const undertow = { _id: "u1", type: "attack", range: "close", target: { type: "any" }, cost: [], save: { trait: "agility", difficulty: null, damageMod: "none" },
      damage: { main: { type: ["physical"], applyTo: "hitPoints", value: { dice: "d6", bonus: 1, multiplier: "flat", flatMultiplier: 1 } } } };
    const river = { id: "e1", uuid: "Actor.e1", name: "Raging River", type: "environment", img: "", statuses: new Set(),
      items: [{ id: "f1", type: "feature", name: "Undertow", system: { featureForm: "action", actions: [undertow] }, effects: [] }, { id: "f2", type: "feature", name: "Current", system: { featureForm: "passive", actions: [] }, effects: [] }],
      system: { tier: 1, difficulty: 10 } };
    const spec = await new DaggerheartAdapter().toCombatantSpec(tokenOf(river));
    expect(spec).toMatchObject({ kind: "hazard", hazard: { once: false }, untargetable: true });
    expect(spec.actions).toHaveLength(1);
    expect(spec.actions[0]).toMatchObject({ kind: "save", save: { type: "agility", dc: 10 } });
  });
});

describe("sprinting", () => {
  const traits = { tactical: { base: 60, fudge: 0 }, brave: { base: 80, fudge: 0 }, selfish: { base: 30, fudge: 0 }, loyal: { base: 60, fudge: 0 } };
  const at = x => ({ x, y: 0, size: 5 });
  test("one in a hurry, its foe beyond Close range, sprints for it (an Agility roll)", () => {
    let sprints = 0;
    for ( let seed = 1; seed <= 10; seed++ ) {
      const runner = { id: "R", name: "Runner", side: "friendly", kind: "pc", duality: true, level: 1, position: at(0), hp: { value: 6, max: 6 }, hopeMax: 6, stressMax: 6, armorMax: 0,
        resources: { hope: 2, stress: 6, armor: 0 }, experiences: [], defenses: { ac: 11, agility: 2 }, initiative: { mod: 5 }, speeds: { walk: 30 }, sprint: { range: 60, mod: 2 },
        behavior: { rush: 1 }, actions: [{ id: "R.s", name: "Sword", kind: "strike", bonus: 1, melee: true, reach: 5, damage: [parseFormula("1d8", "physical")] }],
        iwr: { immune: [], resist: {}, weak: {} }, traits, flags: {}, diesAtZero: false };
      const foe = { id: "F", name: "Foe", side: "hostile", kind: "npc", level: 1, position: at(90), hp: { value: 6, max: 6 }, resources: {}, defenses: { ac: 12 }, initiative: { mod: 0 }, speeds: { walk: 30 },
        actions: [{ id: "F.c", name: "Claw", kind: "strike", bonus: 0, melee: true, reach: 5, damage: [parseFormula("1d6", "physical")] }], iwr: { immune: [], resist: {}, weak: {} }, traits, flags: { fearless: true }, diesAtZero: true };
      const r = replay({ combatants: [runner, foe], sides: { friendly: { label: "P", enemies: ["hostile"] }, hostile: { label: "F", enemies: ["friendly"] } }, options: { positioning: true, maxRounds: 3, talking: false } }, daggerheartRules, seed);
      sprints += r.log.filter(e => e.type === "startTurn" && e.actorId === "R").length;
    }
    expect(sprints).toBeGreaterThan(0);
    expect(STATUS.STANDING).toBe("standing");
  });
});

describe("what it would do (\"Let this character decide\"), from its sheet", () => {
  const spellcast = { _id: "x1", type: "attack", range: "far", target: { type: "any", amount: 1 }, roll: { type: "spellcast" }, cost: [],
    damage: { main: { type: ["magical"], applyTo: "hitPoints", value: { dice: "d10", bonus: 0, multiplier: "prof", flatMultiplier: 1 } } } };
  const mend = { _id: "m1", type: "healing", target: { type: "any" }, range: "", cost: [{ key: "hope", value: 2 }], damage: { resources: { hitPoints: { applyTo: "hitPoints", value: { custom: { enabled: true, formula: "1" } } } } } };

  /** A Guardian built to mark Armor Slots (Iron Will), and a Highborne Wizard with a healing spell and a grimoire. */
  const guardian = () => {
    const actor = character();
    actor.items.push(
      { id: "c1", type: "class", name: "Guardian", system: { domains: ["valor", "blade"] }, effects: [] },
      { id: "f1", type: "feature", name: "Iron Will", system: { actions: [] }, effects: [{ system: { changes: [{ key: "system.rules.damageReduction.maxArmorMarked.value", type: "add", value: 1 }], duration: { description: "" } } }] },
      { id: "d1", type: "domainCard", name: "I Am Your Shield", system: { domain: "valor", inVault: false, actions: [{ type: "effect", target: { type: "friendly" }, cost: [{ key: "stress", value: 1 }] }] }, effects: [] }
    );
    return actor;
  };
  const wizard = () => {
    const actor = character();
    actor.items.push(
      { id: "c1", type: "class", name: "Wizard", system: { domains: ["codex", "splendor"] }, effects: [] },
      { id: "m1", type: "community", name: "Highborne", system: { loreReference: "highborne" }, effects: [] },
      { id: "d1", type: "domainCard", name: "Mending Touch", system: { domain: "splendor", type: "spell", inVault: false, actions: [mend] }, effects: [] },
      { id: "d2", type: "domainCard", name: "Book of Illiat", system: { domain: "codex", type: "grimoire", inVault: false, actions: [spellcast] }, effects: [] },
      // (A spell's Armor Slot for a while isn't a build on them.)
      { id: "d3", type: "domainCard", name: "Book of Ava", system: { domain: "codex", type: "grimoire", inVault: false, actions: [] }, effects: [{ system: { changes: [{ type: "armor", value: { max: "1" } }], duration: { type: "shortRest" } } }] }
    );
    return actor;
  };
  const hints = async actor => {
    const adapter = new DaggerheartAdapter();
    const spec = await adapter.toCombatantSpec(tokenOf(actor));
    return { out: adapter.tacticHints(actor, spec, {}), spec };
  };

  test("a Guardian: a protector by its Valor, marking Armor Slots against any hit (Iron Will), to a friend who falls", async () => {
    const { out, spec } = await hints(guardian());
    const valor = text("FFDAGGERHEART.Domain.valor");
    expect(out).toMatchObject({
      style: { value: "protector", why: valor }, target: { value: "protect", why: valor }, shield: { value: "always", why: "Iron Will" },
      allyDying: { value: "rescue", why: valor }, selfRevived: { value: "rejoin", why: valor }
    });
    // (Nothing it attacks with of its own; no healing, no talking class, no community that bargains.)
    for ( const k of ["specialty", "healAggro", "talk", "offer", "expect", "preferredAction"] ) expect(out[k]).toBeUndefined();
    const { lets, why } = withHints({}, out, spec);
    expect(Object.keys(lets).sort()).toEqual(Object.keys(out).sort());
    expect(why.shield).toBe("Iron Will");
  });

  test("a Highborne Wizard: a caster leaning on its grimoire, healing eagerly (Mending Touch), offering a handful of gold", async () => {
    const { out, spec } = await hints(wizard());
    expect(out).toMatchObject({
      style: { value: "caster", why: text("FFDAGGERHEART.Domain.codex") },
      shield: { value: "spare", why: text("FFDAGGERHEART.Resource.armor") },
      healAggro: { value: "aggressive", why: "Mending Touch" },
      allyDying: { value: "rescue", why: "Mending Touch" },
      specialty: { value: "strong", why: "Book of Illiat" },
      offer: { value: { kind: "money", amount: 1, coin: 10 }, why: "Highborne" }
    });
    // (A handful is worth ten coins, with coins on: what the survey counts the offer in.)
    expect(spec.valuables.denominations.map(c => c.value)).toContain(10);
    const { lets, why } = withHints({}, out, spec);
    expect(lets.offer).toEqual({ kind: "money", amount: 1, coin: 10 });
    expect(why.offer).toBe("Highborne");
  });

  test("an adversary Leader: the most dangerous first, calling its others in, leaning on its features; a close-range attack says no style", async () => {
    const leader = { id: "l1", uuid: "Actor.l1", name: "Lieutenant", type: "adversary", img: "", statuses: new Set(),
      items: [
        { id: "f1", type: "feature", name: "More Where That Came From", system: { featureForm: "action", actions: [{ _id: "s1", type: "summon", cost: [] }] }, effects: [] },
        { id: "f2", type: "feature", name: "Coup de Grace", system: { featureForm: "action", actions: [{ ...dagger, _id: "k1", cost: [{ key: "fear", value: 1 }], roll: { type: "attack", bonus: 2 } }] }, effects: [] },
        { id: "f3", type: "feature", name: "Momentum", system: { featureForm: "reaction", actions: [{ _id: "r1", type: "healing", target: { type: "any" }, damage: { resources: { fear: { applyTo: "fear", value: { custom: { enabled: true, formula: "1" } } } } } }] }, effects: [] }
      ],
      system: { type: "leader", tier: 1, difficulty: 14, motivesAndTactics: "Bully, command", experiences: {}, resistance: { physical: {}, magical: {} },
        resources: { hitPoints: { max: 6, value: 0 }, stress: { max: 3, value: 0 } }, damageThresholds: { major: 8, severe: 14 },
        attack: { ...dagger, name: "Javelin", range: "close", roll: { type: "attack", bonus: 2 } } } };
    const { out } = await hints(leader);
    expect(out).toEqual({
      target: { value: "dangerous", why: text("FFDAGGERHEART.Type.leader") },
      beyond: { value: "seekHelp", why: "More Where That Came From" },
      specialty: { value: "strong", why: "Coup de Grace" }
    });
  });

  test("an environment: nothing", async () => {
    const river = { id: "e1", uuid: "Actor.e1", name: "Raging River", type: "environment", img: "", statuses: new Set(), items: [], system: { tier: 1, difficulty: 10 } };
    expect(new DaggerheartAdapter().tacticHints(river, null, {})).toEqual({});
  });
});
