/**
 * The Lore-Collector's payoff for sizing a foe up in Daggerheart: how much likelier its next roll against that foe is to
 * succeed, a world setting from 1.25× to 3×.
 *
 * The default is what a spotlight spent sizing up is worth, from Daggerheart's dice: the Lore-Collector gives up an
 * action to Analyze (Knowledge) or Perceive (Instinct) against the foe's Difficulty; a Lore-Collector's best trait, +2,
 * against a typical Difficulty of 12 or 13, succeeds about 78% of the time, and a failure also hands the GM the spotlight.
 * For the one roll it pays off to make up for the action it cost, that roll must be about 1 + 1.1 / 0.78 ≈ 2.4 times as
 * likely to succeed.
 */

export const LORE_BOOST = Object.freeze({ min: 1.25, max: 3, step: 0.05, default: 2.4 });
const MODULE_ID = "fast-fighting-daggerheart";

/** Register the setting (on init). */
export function registerLoreBoost() {
  game.settings.register(MODULE_ID, "loreBoost", {
    name: "FFDAGGERHEART.Settings.loreBoost.Name",
    hint: "FFDAGGERHEART.Settings.loreBoost.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: LORE_BOOST.min, max: LORE_BOOST.max, step: LORE_BOOST.step },
    default: LORE_BOOST.default
  });
}

/** The world's setting, within its bounds (the default if there's none to read). */
export function loreBoost() {
  let v = LORE_BOOST.default;
  try {
    v = Number(game.settings.get(MODULE_ID, "loreBoost"));
  } catch ( err ) {
    return LORE_BOOST.default;
  }
  return Number.isFinite(v) && v > 0 ? Math.min(LORE_BOOST.max, Math.max(LORE_BOOST.min, v)) : LORE_BOOST.default;
}
