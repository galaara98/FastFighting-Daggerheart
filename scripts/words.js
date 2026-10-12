/**
 * Words for the table, in its language: this module's (FFDAGGERHEART in languages/), or the Daggerheart system's own
 * where it has them. The words are in the language files, never here.
 */
import { localize, hasWords } from "./core.js";

/** This module's words. */
export const t = (key, data = null) => localize(`FFDAGGERHEART.${key}`, data);

/** The system's own word for something (its key), else this module's (its key). */
export const systemWord = (key, own, data = null) => (hasWords(key) ? localize(key, data) : t(own, data));

/** The system's word for one of its resources (Hope, Stress, Fear, Armor Slots, Hit Points), else this module's. */
const RESOURCE_KEYS = { hope: "hope", stress: "stress", fear: "fear", armor: "armorSlots", hp: "HitPoints.plural" };
export const resourceWord = key => systemWord(`DAGGERHEART.GENERAL.${RESOURCE_KEYS[key] ?? key}`, `Resource.${key}`);
