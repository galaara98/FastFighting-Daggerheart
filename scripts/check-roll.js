/**
 * A save or a check in a live battle (core API 19 rollSave, rollCheck), rolled the daggerheart system's way: every one
 * in a turn FastFighting plays, as its player (or the GM) would roll it from the sheet, its card in the chat. A player's
 * character's may be rolled on its player's screen, where who it's against isn't known: nothing here needs it.
 * FastFighting plays it with what the card says (read-turn.js readDaggerheartCheck).
 *   - A save is a reaction roll, as the system rolls one for an action that calls for it (its SaveField's rollSave): the
 *     trait the save names (of several, the better on the sheet), against the save's Difficulty. It brings no Hope or
 *     Fear, and a critical is only a success.
 *   - A check is an action roll with the trait the adapter's sheets give it: words, Presence; a theft, Finesse; first
 *     aid, the better of Knowledge and Instinct; an escape, the better of Strength and Agility; a trait move, by its id
 *     (actions.js traitMoves: Grapple and Shove, Strength; Maneuver, Agility; Hide, Finesse). Anything else (a spell
 *     check, healing, a disengage: the helper makes none) is left to the engine's dice, as is a companion's check (the
 *     system rolls it as its partner's, with the partner's Spellcast). A check's `skill` is the spec's word for the log,
 *     never read.
 *   - A player character (or a companion) rolls the Duality Dice, anyone else the d20 (a critical at its threshold, a
 *     reaction roll's at 20): the actor's own diceRoll, as the sheet's trait roll uses it, with no dialog and no
 *     Experience (the engine decides those), and the effects the system gathers for a roll of that kind.
 *   - No GM is asked ({gm: true}): each one the helper makes is a trait roll against a Difficulty the engine has set,
 *     which the code grades as the SRD does.
 *   - FastFighting counts Hope and Fear (rules.js asRolled, from the card's Duality Dice; written back with the turn):
 *     skips.resources keeps the dice's Hope, Fear and Stress off the sheets. What its features' triggers return is
 *     applied as the sheet's own trait roll applies it (not for a save: the system's own reaction roll doesn't); its
 *     countdowns go as the system has them.
 */
import { localize } from "./core.js";
import { readDaggerheartCheck } from "./read-turn.js";

const TRAITS = Object.freeze(["agility", "strength", "finesse", "instinct", "presence", "knowledge"]);

/** The trait moves anyone can make (actions.js traitMoves), by the end of the id the adapter gave each: its trait. */
const MOVE_TRAITS = Object.freeze({ grapple: "strength", shove: "strength", maneuver: "agility", hide: "finesse" });

/** Each other check the helper makes, by its purpose: the traits it's rolled with, as the adapter's sheets have them. */
const CHECK_TRAITS = Object.freeze({ talk: ["presence"], theft: ["finesse"], firstAid: ["knowledge", "instinct"], escape: ["strength", "agility"] });

/** A trait as the sheet has it (0 for none: an adversary's). */
const traitValue = (actor, key) => Number(actor?.system?.traits?.[key]?.value) || 0;

/** The better of these traits on the sheet (the first, when they're even). */
const better = (actor, keys) => keys.reduce((best, key) => (traitValue(actor, key) > traitValue(actor, best) ? key : best));

/**
 * The trait a save names (of several, the better on the sheet), or null where it names none.
 * @param {Actor} actor
 * @param {string|string[]} save  the save's key as the rules name it (the system's trait key)
 */
export function saveTrait(actor, save) {
  const keys = [].concat(save ?? []).filter(k => TRAITS.includes(k));
  return keys.length ? better(actor, keys) : null;
}

/**
 * The trait a check is rolled with: a trait move's by its id ("<token id>.grapple"), any other's by its purpose; null
 * for one the helper doesn't make.
 * @param {TokenDocument} token   the one who rolls
 * @param {object} request        {purpose, action: {id, name}}
 */
export function checkTrait(token, { purpose = null, action = null } = {}) {
  if ( purpose === "control" || purpose === "aid" ) {
    const id = typeof action?.id === "string" ? action.id : "";
    const prefix = `${token?.id}.`;
    const move = token?.id && id.startsWith(prefix) ? id.slice(prefix.length) : "";
    return Object.hasOwn(MOVE_TRAITS, move) ? MOVE_TRAITS[move] : null;
  }
  return typeof purpose === "string" && Object.hasOwn(CHECK_TRAITS, purpose) ? better(token?.actor, CHECK_TRAITS[purpose]) : null;
}

/** A roll's title, as the system titles its own: a character's by its trait; anyone else's, a reaction or action roll. */
function titleOf(actor, trait, reaction) {
  if ( !actor.isNPC ) return localize("DAGGERHEART.UI.Chat.dualityRoll.abilityCheckTitle", { ability: localize(`DAGGERHEART.CONFIG.Traits.${trait}.name`) });
  return localize(reaction ? "DAGGERHEART.GENERAL.reactionRoll" : "DAGGERHEART.GENERAL.Roll.action");
}

/**
 * A trait roll with the actor's own diceRoll, its card in the chat: {degree, natural, total, dice}, or null where it
 * was cancelled, or its card can't be read.
 */
async function traitRoll(actor, trait, { dc, reaction = false, secret = false }) {
  if ( typeof actor?.diceRoll !== "function" || dc === null || dc === "" || !Number.isFinite(Number(dc)) ) return null;
  const actionType = reaction ? "reaction" : "action";
  // (The effects that may add to it, as the system gathers them for a roll of this kind.)
  const base = game.system?.api?.data?.actions?.actionsTypes?.base;
  const effects = typeof base?.getActionRelevantEffects === "function"
    ? await base.getActionRelevantEffects({ action: { actionType, roll: { type: "trait", trait } } }, actor) : [];
  const used = await actor.diceRoll({
    event: null, title: titleOf(actor, trait, reaction), effects, roll: { trait, type: "trait", difficulty: Number(dc) }, hasRoll: true, actionType,
    dialog: { configure: false }, skips: { resources: true }, ...(secret ? { selectedMessageMode: "gm" } : {})
  });
  if ( !used ) return null;
  // (Its features' triggers: what they return, as the sheet's trait roll applies it. The dice's Hope and Fear aren't in it.)
  if ( !reaction && used.resourceUpdates?.size ) await used.resourceUpdates.updateResources();
  const card = typeof used.message?.id === "string" ? game.messages?.get?.(used.message.id) : null;
  return readDaggerheartCheck(card, { dc: Number(dc), reaction });
}

/**
 * A save rolled with the daggerheart system's own roller, its card in the chat: a reaction roll. {degree, natural,
 * total, dice}, or null where the save isn't a trait, or the roll was cancelled or can't be read (the engine rolls it).
 * @param {TokenDocument} token   the one who saves
 * @param {object} options        {save, dc, secret (its card for the GMs only)}; what it's against isn't needed
 */
export async function rollDaggerheartSave(token, { save = null, dc = null, secret = false } = {}) {
  const actor = token?.actor;
  const trait = saveTrait(actor, save);
  return trait ? traitRoll(actor, trait, { dc, reaction: true, secret }) : null;
}

/**
 * A check rolled with the daggerheart system's own roller, its card in the chat: an action roll. {degree, natural,
 * total, dice}, or null where the helper doesn't make that check, or the roll was cancelled or can't be read (the
 * engine rolls it).
 * @param {TokenDocument} token   the one who rolls
 * @param {object} options        {purpose, dc, action: {id, name}, secret}; its skill and target aren't needed
 */
export async function rollDaggerheartCheck(token, { purpose = null, dc = null, action = null, secret = false } = {}) {
  const actor = token?.actor;
  if ( !actor || actor.type === "companion" ) return null;
  const trait = checkTrait(token, { purpose, action });
  return trait ? traitRoll(actor, trait, { dc, reaction: false, secret }) : null;
}
