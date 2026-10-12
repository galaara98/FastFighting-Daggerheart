/**
 * Setting a character up by itself, as Daggerheart reads it: a class by its domains, an adversary by its type, a beast
 * by its motives; its biography as text, the class's questions left out.
 */
import { describe, expect, test } from "vitest";
import { daggerheartHints, daggerheartTactics, biographyText, plainText } from "../scripts/auto.js";

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

describe("Daggerheart's answers to the tactics questions", () => {
  test("a class's style by its domains; valor guards its friends and marks Armor Slots freely", () => {
    expect(daggerheartTactics({ pc: true, domains: ["blade", "valor"] })).toMatchObject({ style: "protector", target: "protect", shield: "always" });
    expect(daggerheartTactics({ pc: true, domains: ["codex", "splendor"] })).toMatchObject({ style: "caster", healAggro: "aggressive" });
    expect(daggerheartTactics({ pc: true, domains: ["bone", "sage"] }).style).toBe("ranged");
  });

  test("an adversary's by its type; a beast never talks", () => {
    expect(daggerheartTactics({ type: "skulk" })).toEqual({ style: "skirmisher", target: "weakest" });
    expect(daggerheartTactics({ type: "solo", beast: true })).toMatchObject({ retreat: "never", talk: "never" });
  });
});

describe("its biography as text", () => {
  test("what was written, not the class's questions (in bold); motives, description and Experiences too", () => {
    expect(plainText("<p><strong>Who taught you to fight?</strong></p><p>My greedy uncle.</p>")).toBe("My greedy uncle.");
    const text = biographyText({ bio: { background: "<p><strong>Why?</strong> A sellsword.</p>", characteristics: {} }, motives: "Escape, steal", experiences: { a: { name: "Thief", description: "" } } });
    expect(text).toContain("A sellsword.");
    expect(text).toContain("Escape, steal");
    expect(text).toContain("Thief");
    expect(text).not.toContain("Why?");
  });
});
