/**
 * Direct damage (the system's damage.direct, and the SRD's collisions): no Armor Slot lessens it; the core says so to
 * applyIwr when every part of a hit is direct.
 */
import { describe, expect, test } from "vitest";
import { daggerheartRules } from "../scripts/rules.js";
import { damagePartsOf } from "../scripts/actions.js";

const iwr = { dh: { thresholds: { major: 7, severe: 14 }, armor: 3 } };
const wearer = () => ({ resources: { armor: 3, stress: 0 }, spec: { armorMax: 3 }, tac: { shield: "always" } });

describe("direct damage", () => {
  test("an Armor Slot lessens a hit, not a direct one", () => {
    const plain = wearer();
    const direct = wearer();
    const marked = daggerheartRules.applyIwr(iwr, { physical: 9 }, plain);
    const straight = daggerheartRules.applyIwr(iwr, { physical: 9 }, direct, { direct: true });
    expect(plain.resources.armor).toBe(2);
    expect(direct.resources.armor).toBe(3);
    expect(straight).toBe(marked + 1);
  });

  test("the system's direct damage is marked so; a collision is direct", () => {
    const damage = { direct: true, main: { type: ["physical"], value: { dice: "d8", flatMultiplier: 1, bonus: 2 } } };
    expect(damagePartsOf(damage).every(p => p.direct)).toBe(true);
    expect(damagePartsOf({ ...damage, direct: false }).some(p => p.direct)).toBe(false);
    expect(daggerheartRules.collisionDamage({}, { move: { knockback: true } })[0]).toMatchObject({ direct: true, flat: 5 });
  });
});
