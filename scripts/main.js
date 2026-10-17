/**
 * FastFighting Daggerheart: teaches FastFighting Core how Daggerheart fights. Registers the Daggerheart adapter
 * (characters and adversaries, the Duality Dice and the spotlight, Hope and Fear, thresholds and Armor Slots, death
 * moves, live battles written back a turn at a time) through the core's public API.
 */
import { DaggerheartAdapter } from "./adapter.js";
import { registerLoreBoost } from "./lore.js";
import { registerTiedStopsSpells } from "./tied-up.js";

export const MODULE_ID = "fast-fighting-daggerheart";

/**
 * The core API majors this helper is known to work with (the core's api.major). Its own call: the core never refuses a
 * helper. Older than the oldest, it doesn't run (it uses what came since); any other it doesn't know, it runs, and the
 * GM is told it hasn't been tried with that core yet. Add a major once this helper has been tried with it.
 */
const KNOWN_API = Object.freeze([19]);

/** The core's API major, when it's one this helper doesn't know: the GM is told when the world is ready. */
let untested = null;

/**
 * The last translation module we knew of for this game system, by language: in a language other than English, this
 * module's settings recommend it when it isn't on (FastFighting Core's api.adviseTranslation).
 */
const KNOWN_TRANSLATIONS = {
  es: { id: "daggerheart-es", title: "Translation: Español [Daggerheart]", url: "https://github.com/erizocosmico/fvtt-daggerheart-es" }
};

Hooks.once("init", () => {
  // How much a Lore-Collector's sizing a foe up pays off (lore.js).
  registerLoreBoost();
  // Whether a creature tied up can still cast (tied-up.js).
  registerTiedStopsSpells();
});

Hooks.once("fastFighting.init", api => {
  // module.json limits this module to Daggerheart worlds; this guard covers anything that slips past.
  if ( game.system.id !== "daggerheart" ) {
    console.warn(`${MODULE_ID} | not a Daggerheart world (${game.system.id}); FastFighting Daggerheart stays inactive.`);
    return;
  }
  const major = Number(api.major) || 0;
  if ( major < Math.min(...KNOWN_API) ) {
    console.error(`${MODULE_ID} | FastFighting Core is too old for this version of FastFighting Daggerheart; update it.`);
    ui.notifications?.error(game.i18n.localize("FFDAGGERHEART.CoreTooOld"), { permanent: true });
    return;
  }
  if ( !KNOWN_API.includes(major) ) untested = major;
  api.registerAdapter("daggerheart", DaggerheartAdapter, { priority: 10, source: MODULE_ID });
  api.adviseTranslation(MODULE_ID, game.system.title, KNOWN_TRANSLATIONS);
  // Words kept in English for now, while the system isn't translated (hardcoded-toEN.json).
  api.keepEnglish(MODULE_ID);
});

Hooks.once("ready", () => {
  if ( untested !== null && game.user.isGM ) ui.notifications.warn(game.i18n.format("FFDAGGERHEART.CoreUntested", { major: untested }));
  if ( !game.modules.get("fast-fighting")?.active && game.user.isGM ) {
    ui.notifications.warn(game.i18n.localize("FFDAGGERHEART.NeedsCore"));
  }
});
