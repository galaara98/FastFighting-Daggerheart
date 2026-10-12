/**
 * A Daggerheart character's personality from its whole sheet, and an adversary's from its type, tier and features.
 * The numbers below are the SRD's (its classes' suggested traits, its subclasses' and communities' ids, the shape of
 * its features' actions); no text of it.
 */
import { describe, test, expect } from "vitest";
import { deriveDaggerheartTraits, featureLeans, subclassKey, loreKey, DH_TRAITS } from "../scripts/traits.js";
import { PC_BASELINE } from "../../FastFighting/scripts/constants.js";

// The SRD's classes' suggested traits: each a typical starting spread (+2, +1, +1, 0, 0, -1).
const GUARDIAN = { agility: 1, strength: 2, finesse: -1, instinct: 0, presence: 1, knowledge: 0 };
const WIZARD = { agility: -1, strength: 0, finesse: 0, instinct: 1, presence: 1, knowledge: 2 };
const ROGUE = { agility: 1, strength: -1, finesse: 2, instinct: 0, presence: 1, knowledge: 0 };
const SERAPH = { agility: 0, strength: 2, finesse: 0, instinct: 1, presence: 1, knowledge: -1 };

/** Where a subclass came from in the system's compendium. */
const fromPack = id => `Compendium.daggerheart.subclasses.Item.${id}`;
const SUBCLASS = {
  stalwart: { source: fromPack("rKRxFBlkbh9cDK8K"), name: "Stalwart" },
  knowledge: { source: fromPack("qqQlgCqhOivUFoQn"), name: "School of Knowledge" },
  syndicate: { source: fromPack("95QxNZwgyEm1LqdG"), name: "Syndicate" },
  wielder: { source: fromPack("M5mpGoAj8LRkylrY"), name: "Divine Wielder" },
  brave: { source: fromPack("NAFU9roaVG7f3RNJ"), name: "Call of the Brave" }
};

// Actions as the system's features and cards have them.
const SHIELD = { name: "I Am Your Shield", form: "passive", actions: [{ type: "effect", target: { type: "friendly" }, cost: [{ key: "stress", value: 1 }] }] };
const HEALING_HANDS = { name: "Healing Hands", actions: [{ type: "healing", target: { type: "any" }, range: "melee", cost: [{ key: "stress" }], damage: { resources: { hitPoints: { applyTo: "hitPoints" } } } }] };
const GORE_AND_GLORY = { name: "Gore and Glory", actions: [
  { type: "healing", target: { type: "any" }, range: "", damage: { resources: { stress: { applyTo: "stress" } } } },
  { type: "healing", target: { type: "self" }, range: "", damage: { resources: { hope: { applyTo: "hope" } } } }
] };
const TERRIFYING = { name: "Terrifying", form: "passive", actions: [{ type: "damage", target: { type: "any" }, damage: { resources: { hope: { applyTo: "hope" } } } }] };
const MOMENTUM = { name: "Momentum", form: "reaction", actions: [{ type: "healing", target: { type: "self" }, damage: { resources: { fear: { applyTo: "fear" } } } }] };
const REINFORCEMENTS = { name: "Reinforcements", form: "action", actions: [{ type: "summon", target: { type: "any" } }] };
const SPLIT = { name: "Split", form: "reaction", actions: [{ type: "summon", target: { type: "any" } }] };
const OMOPHAGOUS = { name: "Omophagous", form: "action", actions: [{ type: "damage", cost: [{ key: "hitPoints", value: 1 }] }] };
const CONTACTS = { name: "Contacts Everywhere", actions: [{ type: "effect", cost: [{ key: "hitPoints", value: 1 }] }] };

/** A level-3 player character: the usual hero's numbers unless told otherwise (its traits spread as its class suggests). */
const pc = extra => deriveDaggerheartTraits({ pc: true, level: 3, traits: GUARDIAN, usual: GUARDIAN, stressMax: 6, scars: 0, inParty: true, ...extra });

/** Every distinct arrangement of a spread over the six traits. */
function arrangements(spread) {
  if ( !spread.length ) return [[]];
  return [...new Set(spread)].flatMap(v => {
    const rest = [...spread];
    rest.splice(rest.indexOf(v), 1);
    return arrangements(rest).map(r => [v, ...r]);
  });
}

describe("a Daggerheart player character's traits, from its sheet", () => {
  test("the usual hero's numbers make the usual hero: traits spread as its class suggests, at the usual level", () => {
    expect(pc().traits).toEqual(PC_BASELINE);
    for ( const spread of [GUARDIAN, WIZARD, ROGUE, SERAPH] ) expect(pc({ traits: spread, usual: spread }).traits).toEqual(PC_BASELINE);
    // (A sheet not filled in yet says nothing.)
    expect(pc({ traits: Object.fromEntries(DH_TRAITS.map(k => [k, 0])) }).traits).toEqual(PC_BASELINE);
  });

  test("with no class to measure it by, a typical spread is read against itself: every arrangement averages out", () => {
    const all = arrangements([2, 1, 1, 0, 0, -1]);
    expect(all).toHaveLength(180);
    const sum = { tactical: 0, brave: 0, selfish: 0, loyal: 0 };
    for ( const a of all ) {
      const { traits } = pc({ traits: Object.fromEntries(DH_TRAITS.map((k, i) => [k, a[i]])), usual: null });
      for ( const k of Object.keys(sum) ) sum[k] += traits[k];
    }
    // (Within rounding: each one is rounded to a whole number.)
    for ( const k of Object.keys(sum) ) expect(Math.abs(sum[k] / all.length - PC_BASELINE[k])).toBeLessThanOrEqual(0.5);
  });

  test("against its class's guide: a wizard with Strength where its Knowledge should be is bolder and less of a planner", () => {
    const usual = pc({ traits: WIZARD, usual: WIZARD, names: { cls: "Wizard" } });
    const strong = pc({ traits: { ...WIZARD, strength: 2, knowledge: 0 }, usual: WIZARD, names: { cls: "Wizard", traits: { strength: "Strength", knowledge: "Knowledge" } } });
    expect(strong.traits.tactical).toBeLessThan(usual.traits.tactical - 4);
    expect(strong.traits.brave).toBeGreaterThan(usual.traits.brave + 3);
    expect(strong.reasons.tactical).toContain("Knowledge");
    expect(strong.reasons.tactical).toContain("Wizard");
  });

  test("no two alike: a wizard thinks ahead, a guardian stands firm, a rogue looks out for itself, a seraph gives itself away", () => {
    const wizard = pc({ traits: WIZARD, usual: WIZARD, domains: ["codex", "splendor"], cards: [{ domain: "codex" }, { domain: "codex" }],
      subclass: SUBCLASS.knowledge, community: { ref: "loreborne", name: "Loreborne" } }).traits;
    const guardian = pc({ traits: GUARDIAN, usual: GUARDIAN, domains: ["valor", "blade"], cards: [{ domain: "valor" }, { domain: "blade" }],
      subclass: SUBCLASS.stalwart, ancestry: { ref: "orc", name: "Orc" }, community: { ref: "ridgeborne", name: "Ridgeborne" }, items: [SHIELD] }).traits;
    const rogue = pc({ traits: ROGUE, usual: ROGUE, domains: ["midnight", "grace"], cards: [{ domain: "midnight" }, { domain: "midnight" }],
      subclass: SUBCLASS.syndicate, community: { ref: "slyborne", name: "Slyborne" } }).traits;
    const seraph = pc({ traits: SERAPH, usual: SERAPH, domains: ["valor", "splendor"], cards: [{ domain: "splendor" }, { domain: "splendor" }],
      subclass: SUBCLASS.wielder, community: { ref: "orderborne", name: "Orderborne" }, items: [HEALING_HANDS] }).traits;
    expect(wizard.tactical).toBeGreaterThan(Math.max(guardian.tactical, rogue.tactical, seraph.tactical));
    expect(guardian.brave).toBeGreaterThan(Math.max(wizard.brave, rogue.brave, seraph.brave));
    expect(rogue.selfish).toBeGreaterThan(Math.max(wizard.selfish, guardian.selfish, seraph.selfish));
    expect(rogue.selfish).toBeGreaterThan(PC_BASELINE.selfish + 10);
    expect(seraph.selfish).toBeLessThan(Math.min(wizard.selfish, guardian.selfish, rogue.selfish));
    expect(seraph.selfish).toBeLessThan(PC_BASELINE.selfish - 10);
    expect(Math.min(guardian.loyal, seraph.loyal)).toBeGreaterThan(rogue.loyal);
    expect(new Set([wizard, guardian, rogue, seraph].map(x => JSON.stringify(x))).size).toBe(4);
  });

  test("its domains: its class's two, and the cards it holds (a rogue of Midnight cards looks out for itself more than one of Grace)", () => {
    const midnight = pc({ traits: ROGUE, usual: ROGUE, domains: ["midnight", "grace"], cards: [{ domain: "midnight" }, { domain: "midnight" }, { domain: "midnight" }] }).traits;
    const grace = pc({ traits: ROGUE, usual: ROGUE, domains: ["midnight", "grace"], cards: [{ domain: "grace" }, { domain: "grace" }, { domain: "grace" }] }).traits;
    expect(midnight.selfish).toBeGreaterThan(grace.selfish);
    expect(grace.loyal).toBeGreaterThan(midnight.loyal);
    const { reasons } = pc({ domains: ["valor"], names: { domains: { valor: "Valor" } } });
    expect(reasons.loyal).toContain("Valor");
  });

  test("features and cards by what they do", () => {
    expect(featureLeans(SHIELD)).toEqual({ loyal: 2, selfish: -1 });
    expect(featureLeans(HEALING_HANDS)).toEqual({ selfish: -1 });
    expect(featureLeans(GORE_AND_GLORY)).toEqual({});
    expect(featureLeans(TERRIFYING)).toEqual({ brave: 2 });
    expect(featureLeans(MOMENTUM)).toEqual({});
    expect(featureLeans(REINFORCEMENTS)).toEqual({ tactical: 2 });
    expect(featureLeans(SPLIT)).toEqual({});
    expect(featureLeans(OMOPHAGOUS)).toEqual({ brave: 2 });
    expect(featureLeans(CONTACTS)).toEqual({});
    expect(featureLeans({ changes: ["system.bonuses.rally"] })).toEqual({ loyal: 2 });
    const shield = pc({ items: [SHIELD] });
    expect(shield.traits.loyal).toBe(PC_BASELINE.loyal + 2);
    expect(shield.reasons.loyal).toContain("I Am Your Shield");
  });

  test("its subclass, ancestry and community, known by the system's ids (the name only as a fallback); a subclass more, the deeper it's gone", () => {
    expect(subclassKey({ source: fromPack("NAFU9roaVG7f3RNJ"), name: "Llamada del Valiente" })).toBe("call-of-the-brave");
    expect(subclassKey({ name: "Call of the Brave" })).toBe("call-of-the-brave");
    expect(loreKey({ ref: "slyborne", name: "Escurridizos" })).toBe("slyborne");
    expect(loreKey({ name: "Slyborne" })).toBe("slyborne");
    const translated = pc({ subclass: { ...SUBCLASS.brave, name: "Llamada del Valiente" } }).traits;
    expect(translated.brave).toBeGreaterThan(PC_BASELINE.brave);
    expect(pc({ subclass: { name: "A homebrew calling" } }).traits).toEqual(PC_BASELINE);
    expect(pc({ subclass: { ...SUBCLASS.brave, state: 3 } }).traits.brave).toBeGreaterThan(translated.brave);
    expect(pc({ ancestry: { ref: "infernis", name: "Infernis" } }).traits.brave).toBeGreaterThan(PC_BASELINE.brave);
    expect(pc({ community: { ref: "highborne", name: "Highborne" } }).traits.selfish).toBeGreaterThan(PC_BASELINE.selfish);
    expect(pc({ community: { ref: "orderborne", name: "Orderborne" } }).traits.loyal).toBeGreaterThan(PC_BASELINE.loyal);
  });

  test("what it's been through: scars dim its nerve, Stress slots it took on steady it, experience makes a planner", () => {
    expect(pc({ scars: 2 }).traits.brave).toBe(PC_BASELINE.brave - 6);
    expect(pc({ stressMax: 8 }).traits.brave).toBe(PC_BASELINE.brave + 3);
    expect(pc({ level: 8 }).traits.tactical).toBeGreaterThan(pc({ level: 1 }).traits.tactical);
  });

  test("one who isn't in the world's party is less bound to the others", () => {
    expect(pc({ inParty: false }).traits.loyal).toBe(PC_BASELINE.loyal - 10);
    expect(pc({ inParty: undefined }).traits.loyal).toBe(PC_BASELINE.loyal);
  });

  test("each trait's reason says where it started and what moved it", () => {
    const { reasons } = pc({ community: { ref: "slyborne", name: "Slyborne" } });
    expect(reasons.selfish).toContain("Slyborne");
    expect(reasons.tactical).toContain(String(PC_BASELINE.tactical));
  });
});

describe("a Daggerheart adversary's traits", () => {
  const adversary = extra => deriveDaggerheartTraits({ pc: false, type: "standard", tier: 1, motives: "Escape, profit, steal", names: { type: "Standard" }, ...extra });

  test("its type and tier as before, its reasons starting from them", () => {
    const plain = adversary();
    expect(plain.traits).toEqual({ tactical: 45, brave: 50, selfish: 50, loyal: 55 });
    expect(plain.reasons.selfish).toContain("Standard");
    expect(plain.reasons.brave).toContain("50");
    const beast = adversary({ motives: "Burrow, drag away, feed" });
    expect(beast.flags.beast).toBe(true);
    expect(beast.traits.tactical).toBe(30);
  });

  test("the damage it needn't fear makes it bolder; immune more than resistant", () => {
    const names = { type: "Standard", harm: { physicalImmunity: "Ghostly", physicalResistance: "Hard-shelled" } };
    const immune = adversary({ resistance: { physical: { immunity: true } }, names });
    const resistant = adversary({ resistance: { physical: { resistance: true } }, names });
    expect(immune.traits.brave).toBeGreaterThan(resistant.traits.brave);
    expect(resistant.traits.brave).toBeGreaterThan(50);
    expect(immune.reasons.brave).toContain("Ghostly");
  });

  test("its features by what they do: a healer of its allies is less selfish, one that calls reinforcements more of a planner", () => {
    expect(adversary({ items: [HEALING_HANDS] }).traits.selfish).toBeLessThan(50);
    expect(adversary({ items: [REINFORCEMENTS] }).traits.tactical).toBeGreaterThan(45);
    expect(adversary({ items: [TERRIFYING, MOMENTUM] }).traits.brave).toBe(52);
  });
});
