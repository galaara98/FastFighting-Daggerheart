/**
 * The Lore-Collector's payoff for sizing a foe up in Daggerheart: how much likelier its next roll against that foe is to
 * succeed, a world setting from 1.25× to 3× (the core's numberSetting).
 *
 * The default is what a spotlight spent sizing up is worth, from Daggerheart's dice: the Lore-Collector gives up an
 * action to Analyze (Knowledge) or Perceive (Instinct) against the foe's Difficulty; a Lore-Collector's best trait, +2,
 * against a typical Difficulty of 12 or 13, succeeds about 78% of the time, and a failure also hands the GM the spotlight.
 * For the one roll it pays off to make up for the action it cost, that roll must be about 1 + 1.1 / 0.78 ≈ 2.4 times as
 * likely to succeed.
 */
import { numberSetting } from "./core.js";

export const LORE_BOOST = Object.freeze({ min: 1.25, max: 3, step: 0.05, default: 2.4 });

const setting = numberSetting("fast-fighting-daggerheart", "loreBoost", {
  ...LORE_BOOST, name: "FFDAGGERHEART.Settings.loreBoost.Name", hint: "FFDAGGERHEART.Settings.loreBoost.Hint"
});

/** Register the setting (on init). */
export const registerLoreBoost = () => setting.register();

/** The world's setting, within its bounds (the default if there's none to read). */
export const loreBoost = () => setting.read();
