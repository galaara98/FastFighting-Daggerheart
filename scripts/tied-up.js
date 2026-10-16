/**
 * Tied up in Daggerheart: whether it stops a creature's spells, a world setting (on by default). The SRD doesn't say
 * which spells or features need free hands, so the setting says it of them all; the core reads it as
 * rules.tiedStopsSpells (its holds.js needsHands). A weapon needs as many hands as its burden (adapter.js); words never
 * need any.
 */

const MODULE_ID = "fast-fighting-daggerheart";

/** Register the setting (on init). */
export function registerTiedStopsSpells() {
  game.settings.register(MODULE_ID, "tiedStopsSpells", {
    name: "FFDAGGERHEART.Settings.tiedStopsSpells.Name",
    hint: "FFDAGGERHEART.Settings.tiedStopsSpells.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
}

/** The world's setting (on, if there's none to read). */
export function tiedStopsSpells() {
  try {
    return game.settings.get(MODULE_ID, "tiedStopsSpells") !== false;
  } catch ( err ) {
    return true;
  }
}
