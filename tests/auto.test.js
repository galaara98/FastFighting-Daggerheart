/**
 * Setting a character up by itself, as Daggerheart reads it: a class by its domains, an adversary by its type, a beast
 * by its motives; what it would do (its answers, each with its reason; where Daggerheart says nothing, nothing); its
 * biography (about it, its story), the class's questions and its connections left out.
 */
import { describe, expect, test } from "vitest";
import { daggerheartHints, daggerheartTactics, biographyOf, plainText, tierOf } from "../scripts/auto.js";
import { TACTIC_CHOICES } from "../../FastFighting/scripts/engine/tactics.js";
import { withHints } from "../../FastFighting/scripts/foundry/auto-config.js";

describe("the playstyles Daggerheart says fit", () => {
  test("a class by its domains (they add up): valor a Tank, midnight a Thief, arcana Un-Mundane", () => {
    expect(daggerheartHints({ pc: true, domains: ["blade", "valor"] })).toMatchObject({ tank: 0.5, brawler: 0.4, martyr: 0.3 });
    expect(daggerheartHints({ pc: true, domains: ["midnight", "grace"] }).thief).toBe(0.4);
    expect(daggerheartHints({ pc: true, domains: ["arcana", "midnight"] }).unmundane).toBe(0.5);
  });

  test("an adversary by its type; a beast, no talker", () => {
    expect(daggerheartHints({ type: "leader" })).toEqual({ leader: 0.8 });
    expect(daggerheartHints({ type: "standard" })).toEqual({});
    const beast = daggerheartHints({ type: "bruiser", beast: true });
    expect(beast.brawler).toBeCloseTo(0.9);
    expect(beast.diplomat).toBe(-1);
  });
});

describe("what a character would do: Daggerheart's answers, each with its reason", () => {
  const names = { domains: { valor: "Valor", blade: "Blade", bone: "Bone", sage: "Sage", codex: "Codex", splendor: "Splendor", midnight: "Midnight", grace: "Grace", arcana: "Arcana", dread: "Dread" }, armor: "Armor Slots" };
  const purse = { money: 10, handful: 10, tier: 1 };
  const pc = d => daggerheartTactics({ pc: true, talks: true, armor: 0, purse, names, ...d });
  const foe = d => daggerheartTactics({ talks: true, purse: { money: 0, handful: 10, tier: 1 }, names: { type: d.type }, ...d });
  /** Just the answers. */
  const values = out => Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.value]));
  /**
   * Answers the core wouldn't take (one not among its question's choices, an action it doesn't have, an offer or
   * expectation the survey doesn't store), or without a reason.
   */
  const unfair = (out, actions = ["t.w", "t.w1"]) => {
    const { lets, why } = withHints({}, out, { actions: actions.map(id => ({ id })) });
    return Object.keys(out).filter(k => !(k in lets) || !why[k]);
  };

  test("a Guardian (Valor): guards its friends, stays while the fight can be won, marks Armor Slots against any hit (its card built on them), goes to a friend who falls", () => {
    const out = pc({ domains: ["valor", "blade"], weapon: { name: "Longsword", range: "melee" }, armor: 4, armorBuilders: ["Iron Will"], specialties: [{ name: "Forceful Push", spell: false }] });
    expect(out).toEqual({
      style: { value: "protector", why: "Valor" }, target: { value: "protect", why: "Valor" }, retreat: { value: "losing", why: "Valor" }, shield: { value: "always", why: "Iron Will" },
      allyDying: { value: "rescue", why: "Valor" }, selfRevived: { value: "rejoin", why: "Valor" }, specialty: { value: "some", why: "Forceful Push" }
    });
    // (Valor marks them freely even without such a card.)
    expect(pc({ domains: ["valor", "blade"], armor: 4 }).shield).toEqual({ value: "always", why: "Valor" });
    expect(unfair(out)).toEqual([]);
  });

  test("a Wizard (Codex, Splendor): a caster leaning on its grimoire, healing eagerly with what it has; Highborne, it buys its way out", () => {
    const out = pc({ domains: ["codex", "splendor"], weapon: { name: "Greatstaff", range: "veryFar" }, armor: 3, healers: ["Mending Touch"],
      specialties: [{ name: "Book of Illiat", spell: true }], community: { key: "highborne", name: "Highborne" } });
    expect(out).toEqual({
      style: { value: "caster", why: "Codex" }, shield: { value: "spare", why: "Armor Slots" }, healAggro: { value: "aggressive", why: "Mending Touch" },
      allyDying: { value: "rescue", why: "Mending Touch" }, specialty: { value: "strong", why: "Book of Illiat" },
      offer: { value: { kind: "money", amount: 1, coin: 10 }, why: "Highborne" }
    });
    expect(unfair(out)).toEqual([]);
    // Nothing to heal with, no gold, no armor: none of those answers.
    expect(Object.keys(pc({ domains: ["codex", "splendor"], community: { key: "highborne", name: "Highborne" }, purse: { money: 0, handful: 10, tier: 1 } }))).toEqual(["style"]);
  });

  test("its primary weapon: a front-line or skirmishing class with a bow shoots; a Ranger with a sword closes in; a caster stays a caster", () => {
    expect(pc({ domains: ["bone", "sage"], weapon: { name: "Shortbow", range: "far" } }).style).toEqual({ value: "ranged", why: "Sage" });
    expect(pc({ domains: ["bone", "sage"], weapon: { name: "Longsword", range: "melee" } }).style).toEqual({ value: "frontline", why: "Longsword" });
    expect(pc({ domains: ["blade", "bone"], weapon: { name: "Longbow", range: "veryFar" } }).style).toEqual({ value: "ranged", why: "Longbow" });
    expect(pc({ domains: ["blade", "bone"], weapon: { name: "Javelin", range: "close" } }).style).toEqual({ value: "frontline", why: "Blade" });
    expect(pc({ domains: ["arcana", "midnight"], weapon: { name: "Dualstaff", range: "far" } }).style).toEqual({ value: "caster", why: "Arcana" });
  });

  test("every class's domains make a style: an Assassin skirmishes, a Witch casts, a Rogue skirmishes and talks when it could work", () => {
    expect(values(pc({ domains: ["blade", "midnight"] }))).toEqual({ style: "skirmisher" });
    expect(values(pc({ domains: ["sage", "dread"] }))).toEqual({ style: "caster" });
    expect(values(pc({ domains: ["midnight", "grace"] }))).toEqual({ style: "skirmisher", talk: "opportune" });
    expect(values(pc({ domains: ["grace", "codex"] }))).toEqual({ style: "caster", talk: "opportune" });
    // A homebrew class whose domains it doesn't know: nothing.
    expect(pc({ domains: ["storm"] })).toEqual({});
  });

  test("a healer subclass heals eagerly, another healer as the fight allows; a Slyborne character wants paying by its tier", () => {
    expect(pc({ domains: ["sage", "arcana"], subclass: "warden-of-renewal", healers: ["Regeneration"] }).healAggro).toEqual({ value: "aggressive", why: "Regeneration" });
    expect(pc({ domains: ["sage", "arcana"], subclass: "warden-of-the-elements", healers: ["Healing Field"] }).healAggro).toEqual({ value: "balanced", why: "Healing Field" });
    const sly = pc({ domains: ["midnight", "grace"], community: { key: "slyborne", name: "Slyborne" }, purse: { money: 0, handful: 10, tier: 3 } });
    expect(sly.expect).toEqual({ value: { kind: "money", amount: 3, coin: 10 }, why: "Slyborne" });
    expect(sly.offer).toBeUndefined();
    expect(unfair(sly)).toEqual([]);
  });

  test("its primary weapon is its everyday attack; its best potion is drunk once it has marked what it clears; a Hedge witch uses consumables freely", () => {
    const out = pc({ domains: ["sage", "dread"], subclass: "hedge", names: { ...names, subclass: "Hedge" }, weapon: { name: "Dualstaff", range: "far", action: "t.w1" }, hpMax: 6,
      potions: [{ name: "Minor Health Potion", heals: 2.5 }, { name: "Health Potion", heals: 3.5 }] });
    expect(out.preferredAction).toEqual({ value: "t.w1", why: "Dualstaff" });
    // (Six Hit Points, a potion clearing 3.5: drunk with under half of them left, none of it wasted.)
    expect(out.potionThreshold).toEqual({ value: "50", why: "Health Potion" });
    expect(out.consumables).toEqual({ value: "freely", why: "Hedge" });
    expect(unfair(out)).toEqual([]);
    // (A small potion for many Hit Points: early; a big one for few: late, with a quarter left at the latest.)
    expect(pc({ hpMax: 12, potions: [{ name: "p", heals: 2.5 }] }).potionThreshold.value).toBe("75");
    expect(pc({ hpMax: 5, potions: [{ name: "p", heals: 4.5 }] }).potionThreshold.value).toBe("25");
    // (No weapon action, no potions, another subclass: none of those answers.)
    expect(Object.keys(pc({ domains: ["sage", "dread"], subclass: "moon", weapon: { name: "Staff", range: "far" }, hpMax: 6 }))).toEqual(["style"]);
  });

  test("where two things answer one question, the first said stands: a front-line type's bow, a Leader's summons, before its type", () => {
    expect(foe({ type: "bruiser", attack: { name: "Boulder", range: "far" } }).style).toEqual({ value: "ranged", why: "Boulder" });
    expect(foe({ type: "leader", summons: ["Call the Guard"] }).beyond).toEqual({ value: "seekHelp", why: "Call the Guard" });
    // (A Skulk's own way of fighting is surer than a melee attack's.)
    expect(foe({ type: "skulk", attack: { name: "Knife", range: "melee" } }).style).toEqual({ value: "skirmisher", why: "skulk" });
  });

  test("an adversary by its type: a Skulk flanks the weakest and slips away hurt; a Solo never gives up, and leans on its features", () => {
    expect(foe({ type: "skulk", attack: { name: "Daggers", range: "melee" } })).toEqual({
      style: { value: "skirmisher", why: "skulk" }, target: { value: "weakest", why: "skulk" }, retreat: { value: "hurt", why: "skulk" }
    });
    const dragon = foe({ type: "solo", attack: { name: "Fire Breath", range: "far" }, specialties: ["Ashen Tears"] });
    expect(values(dragon)).toEqual({ style: "ranged", target: "dangerous", retreat: "never", specialty: "strong" });
    expect(dragon.style.why).toBe("Fire Breath");
    expect(unfair(dragon)).toEqual([]);
  });

  test("a Leader goes for the most dangerous and calls others in (its summons, by name); a Standard one by its attack alone", () => {
    const lieutenant = foe({ type: "leader", attack: { name: "Javelin", range: "close" }, summons: ["More Where That Came From"], specialties: ["Coup de Grace"] });
    expect(lieutenant).toEqual({
      target: { value: "dangerous", why: "leader" }, beyond: { value: "seekHelp", why: "More Where That Came From" }, specialty: { value: "strong", why: "Coup de Grace" }
    });
    expect(foe({ type: "leader" }).beyond).toEqual({ value: "seekHelp", why: "leader" });
    expect(foe({ type: "standard", attack: { name: "Sword", range: "melee" } })).toEqual({ style: { value: "frontline", why: "Sword" } });
    expect(foe({ type: "standard", attack: { name: "Bow", range: "far" } })).toEqual({ style: { value: "ranged", why: "Bow" } });
    // (Close range says neither.)
    expect(foe({ type: "standard", attack: { name: "Javelin", range: "close" } })).toEqual({});
    expect(foe({ type: "minion", attack: { name: "Daggers", range: "melee" }, specialties: ["Slash"] }).specialty).toEqual({ value: "some", why: "Slash" });
  });

  test("healers mend their friends (a Support eagerly); a Social one talks first and buys its way out; motives are left to the core", () => {
    expect(values(foe({ type: "support", healers: ["Mending Chant"] }))).toEqual({ style: "caster", target: "protect", healAggro: "aggressive" });
    expect(foe({ type: "standard", healers: ["Healing Touch"] }).healAggro).toEqual({ value: "balanced", why: "Healing Touch" });
    const merchant = foe({ type: "social", attack: { name: "Club", range: "melee" }, purse: { money: 10, handful: 10, tier: 1 } });
    expect(values(merchant)).toEqual({ talk: "first", retreat: "hurt", style: "frontline", offer: { kind: "money", amount: 1, coin: 10 } });
    expect(unfair(merchant)).toEqual([]);
    // (No words, or no gold: no offer.)
    expect(foe({ type: "social", talks: false, purse: { money: 10, handful: 10, tier: 1 } }).offer).toBeUndefined();
    expect(foe({ type: "social" }).offer).toBeUndefined();
    // (Its motives and tactics are words, for the core's keywords: they decide no answer here.)
    expect(foe({ type: "bruiser", motives: "Feed, hunt" })).toEqual(foe({ type: "bruiser" }));
    expect(foe({ type: "bruiser" }).talk).toBeUndefined();
  });

  test("nothing where Daggerheart says nothing: an environment, an unknown type, the questions it can't speak to", () => {
    expect(daggerheartTactics({})).toEqual({});
    expect(foe({ type: "unknown" })).toEqual({});
    // (Without a weapon to name, potions or a subclass that makes more of them; how freely it spends, never.)
    const said = new Set([pc({ domains: ["valor", "blade"], armor: 4, healers: ["Lay on Hands"], specialties: [{ name: "x", spell: true }] }), foe({ type: "solo" })].flatMap(Object.keys));
    for ( const k of ["preferredAction", "resourceUse", "consumables", "potionThreshold"] ) expect(said.has(k)).toBe(false);
  });

  /** Everyone, with everything its sheet could say. */
  const everyone = () => [
    ...["valor", "dread", "arcana", "codex", "midnight", "blade", "sage", "bone", "splendor", "grace"].map(k => pc({ domains: [k], armor: 3, healers: ["h"], specialties: [{ name: "s", spell: true }], community: { key: "highborne", name: "H" },
      weapon: { name: "w", range: "far", action: "t.w" }, potions: [{ name: "p", heals: 2.5 }], hpMax: 6, subclass: "hedge", names: { ...names, subclass: "Hedge" } })),
    pc({ domains: ["midnight", "grace"], community: { key: "slyborne", name: "S" }, purse: { money: 0, handful: 10, tier: 2 } }),
    ...["bruiser", "horde", "leader", "minion", "ranged", "skulk", "social", "solo", "standard", "support"].flatMap(type => ["melee", "far"].map(range => foe({ type, attack: { name: "a", range }, healers: ["h"], summons: ["s"], specialties: ["f"], purse: { money: 20, handful: 10, tier: 2 } })))
  ];

  test("every answer is one of its question's choices", () => {
    for ( const out of everyone() ) {
      for ( const [k, { value }] of Object.entries(out) ) if ( TACTIC_CHOICES[k] ) expect([k, TACTIC_CHOICES[k].includes(value)]).toEqual([k, true]);
      expect(unfair(out)).toEqual([]);
    }
  });

  test("every answer has its reason, and the core's withHints keeps every one", () => {
    for ( const out of everyone() ) {
      for ( const [k, { value, why }] of Object.entries(out) ) {
        expect([k, typeof why === "string" && why.length > 0]).toEqual([k, true]);
        if ( k === "preferredAction" ) expect(value).toBe("t.w");
        else if ( k === "offer" || k === "expect" ) expect(["", "money", "noHarm", "passage", "leave"]).toContain(value.kind);
        else expect(TACTIC_CHOICES[k], `${k}: ${value}`).toContain(value);
      }
      const kept = withHints({}, out, { actions: [{ id: "t.w" }] });
      expect(Object.keys(kept.why).sort()).toEqual(Object.keys(out).sort());
    }
    // (An answer without a reason isn't given at all.)
    expect(daggerheartTactics({ pc: true, domains: ["blade"], armor: 2, names: { domains: { blade: "Blade" } } }).shield).toBeUndefined();
  });

  test("a character's tier by its level", () => {
    expect([1, 2, 4, 5, 7, 8, 10].map(tierOf)).toEqual([1, 2, 2, 3, 3, 4, 4]);
  });
});

describe("its biography: what's said of it, its story", () => {
  test("a character: its faith and Experiences are about it; its background (not the class's questions) its story; its connections left out", () => {
    expect(plainText("<p><strong>Who taught you to fight?</strong></p><p>My greedy uncle.</p>")).toBe("My greedy uncle.");
    const bio = { background: "<p><strong>Why?</strong> A sellsword.</p>", connections: "<p><strong>Who?</strong> Mira, a coward.</p>", characteristics: { faith: "The Sun" } };
    const { about, story, against } = biographyOf({ pc: true, bio, experiences: { a: { name: "Thief", description: "" } } });
    expect(about).toContain("Thief");
    expect(about).toContain("The Sun");
    expect(story).toBe("A sellsword.");
    expect(against).toBe("");
    expect([about, story].join(" ")).not.toContain("coward");
    expect(story).not.toContain("Why?");
  });

  test("an adversary: its description, motives and Experiences are about it; the GM's notes its story", () => {
    const { about, story } = biographyOf({ description: "<p>A greedy bandit.</p>", motives: "Escape, steal", notes: "<p>Robbed the mill.</p>", experiences: { a: { name: "Thief", value: 2 } } });
    expect(about).toContain("A greedy bandit.");
    expect(about).toContain("Escape, steal");
    expect(about).toContain("Thief");
    expect(story).toBe("Robbed the mill.");
  });
});
