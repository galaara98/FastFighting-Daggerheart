/**
 * FastFighting Daggerheart: teaches FastFighting Core how Daggerheart fights. Registers the Daggerheart adapter
 * (characters and adversaries, the Duality Dice and the spotlight, Hope and Fear, thresholds and Armor Slots, death
 * moves, Make it So) through the core's public API.
 */
import { DaggerheartAdapter } from "./adapter.js";
import { registerLoreBoost } from "./lore.js";

export const MODULE_ID = "fast-fighting-daggerheart";

/** The core API this helper is written against (rolls by who rolls, the system's own round, shared pools). */
const NEEDS_API = 11;

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
});

Hooks.once("fastFighting.init", api => {
  // module.json limits this module to Daggerheart worlds; this guard covers anything that slips past.
  if ( game.system.id !== "daggerheart" ) {
    console.warn(`${MODULE_ID} | not a Daggerheart world (${game.system.id}); FastFighting Daggerheart stays inactive.`);
    return;
  }
  if ( (api.version ?? 1) < NEEDS_API ) {
    console.error(`${MODULE_ID} | FastFighting Core is too old for this version of FastFighting Daggerheart; update it.`);
    ui.notifications?.error(game.i18n.localize("FFDAGGERHEART.CoreTooOld"), { permanent: true });
    return;
  }
  api.registerAdapter("daggerheart", DaggerheartAdapter, { priority: 10, source: MODULE_ID });
  api.adviseTranslation?.(MODULE_ID, game.system.title, KNOWN_TRANSLATIONS);
});

Hooks.once("ready", () => {
  if ( !game.modules.get("fast-fighting")?.active && game.user.isGM ) {
    ui.notifications.warn(game.i18n.localize("FFDAGGERHEART.NeedsCore"));
  }
});
