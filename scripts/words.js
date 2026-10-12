/**
 * Words for the table, in its language: this module's (FFDAGGERHEART in languages/), or the Daggerheart system's own
 * where it has them. The words are in the language files, never here.
 */
import { localize, hasWords } from "./core.js";

/** This module's words. */
export const t = (key, data = null) => localize(`FFDAGGERHEART.${key}`, data);

/** The system's own word for something (its key), else this module's (its key). */
export const systemWord = (key, own, data = null) => (hasWords(key) ? localize(key, data) : t(own, data));
