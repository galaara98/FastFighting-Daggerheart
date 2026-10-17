/**
 * A save or a check in a live battle (core API 19 rollSave, rollCheck), rolled the daggerheart system's way: every one
 * in a turn FastFighting plays, as its player (or the GM) would roll it from the sheet, its card in the chat. A player's
 * character's may be rolled on its player's screen, where who it's against isn't known: nothing here needs it.
 * FastFighting plays it with what the card says (read-turn.js readDaggerheartCheck).
 *   - A save is a reaction roll, as the system rolls one for an action that calls for it (its SaveField's rollSave): the
 *     trait the save names (of several, the better on the sheet), against the save's Difficulty. It brings no Hope or
 *     Fear, and a critical is only a success.
 *   - A check is an action roll with the trait the adapter's sheets give it: words, Presence; a theft, Finesse; first
 *     aid, the better of Knowledge and Instinct; an escape, the trait its `skill` names by its key (rules.js breakFree
 *     names its own: out of bonds, or freeing a friend, Strength or Finesse), else the better of Strength and Agility (the
 *     core's own holds); a trait move, by its id
 *     (actions.js traitMoves: Grapple and Shove, Strength; Maneuver, Agility; Hide, Finesse). Anything else (a spell
 *     check, healing, a disengage: the helper makes none) is left to the engine's dice, as is a companion's check (the
 *     system rolls it as its partner's, with the partner's Spellcast). Any other `skill` is the spec's word for the log,
 *     not read.
 *   - A player character (or a companion) rolls the Duality Dice, anyone else the d20 (a critical at its threshold, a
 *     reaction roll's at 20): the actor's own diceRoll, as the sheet's trait roll uses it, with no dialog, and the
 *     effects the system gathers for a roll of that kind. It adds what the engine plans with: a character's trait (the
 *     system adds it); on an adversary's save, nothing; on its check, what the adapter gives it (d20Adds: its best
 *     Experience on words, added as the system adds one, no Fear spent; its attack modifier on an escape). A d20 check
 *     is left to the engine where the sheet's critical threshold isn't 20 (the system crits these at it, the engine's
 *     model at 20), and so is any but words or an escape. A character spends no Experience (the engine decides those).
 *   - No GM is asked ({gm: true}): each one the helper makes is a trait roll against a Difficulty the engine has set,
 *     which the code grades as the SRD does.
 *   - FastFighting counts Hope and Fear (rules.js asRolled, from the card's Duality Dice; written back with the turn):
 *     skips.resources keeps the dice's Hope, Fear and Stress off the sheets. What its features' triggers return is
 *     applied as the sheet's own trait roll applies it (not for a save: the system's own reaction roll doesn't); its
 *     countdowns go as the system has them.
 */
import { localize } from "./core.js";
import { experienceList, num, SOCIAL_WORDS } from "./actions.js";
import { readDaggerheartCheck } from "./read-turn.js";
import { systemWord } from "./words.js";

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
 * The trait a check is rolled with: a trait move's by its id ("<token id>.grapple"), any other's by its purpose (or
 * the trait its skill names by its key); null for one the helper doesn't make.
 * @param {TokenDocument} token   the one who rolls
 * @param {object} request        {purpose, skill, action: {id, name}}
 */
export function checkTrait(token, { purpose = null, skill = null, action = null } = {}) {
  if ( purpose === "control" || purpose === "aid" ) {
    const id = typeof action?.id === "string" ? action.id : "";
    const prefix = `${token?.id}.`;
    const move = token?.id && id.startsWith(prefix) ? id.slice(prefix.length) : "";
    return Object.hasOwn(MOVE_TRAITS, move) ? MOVE_TRAITS[move] : null;
  }
  if ( typeof purpose !== "string" || !Object.hasOwn(CHECK_TRAITS, purpose) ) return null;
  return TRAITS.includes(skill) ? skill : better(token?.actor, CHECK_TRAITS[purpose]);
}

/** Who rolls the Duality Dice (a character, a companion); anyone else rolls the d20. */
const rollsDuality = actor => ["character", "companion"].includes(actor?.type);

/**
 * What a d20 roller's check adds, as the engine plans it (adapter.js #adversary): words, its best Experience (a Social
 * adversary, SOCIAL_WORDS more); an escape, an adversary's attack modifier (its escapeWork). {experiences,
 * baseModifiers} for the roll's config, as the system's own rolls carry them; null for any other check.
 * @param {Actor} actor
 * @param {string} purpose
 */
export function d20Adds(actor, purpose) {
  const sys = actor?.system ?? {};
  const adversary = actor?.type === "adversary";
  if ( purpose === "talk" ) {
    const best = experienceList(sys)[0];
    const social = adversary && sys.type === "social";
    return {
      experiences: best ? [best.key] : [],
      baseModifiers: social ? [{ label: systemWord("DAGGERHEART.CONFIG.AdversaryType.social.label", "Type.social"), value: SOCIAL_WORDS }] : []
    };
  }
  if ( purpose === "escape" ) {
    const bonus = adversary ? num(sys.attack?.roll?.bonus) : 0;
    return { experiences: [], baseModifiers: bonus ? [{ label: systemWord("DAGGERHEART.ACTIONS.Settings.attackModifier", "AttackModifier"), value: bonus }] : [] };
  }
  return null;
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
async function traitRoll(actor, trait, { dc, reaction = false, secret = false, adds = null }) {
  if ( typeof actor?.diceRoll !== "function" || dc === null || dc === "" || !Number.isFinite(Number(dc)) ) return null;
  const actionType = reaction ? "reaction" : "action";
  // (The effects that may add to it, as the system gathers them for a roll of this kind.)
  const base = game.system?.api?.data?.actions?.actionsTypes?.base;
  const effects = typeof base?.getActionRelevantEffects === "function"
    ? await base.getActionRelevantEffects({ action: { actionType, roll: { type: "trait", trait } } }, actor) : [];
  // (What it adds besides: an Experience by its key, a modifier, as the system's own rolls carry them.)
  const roll = { trait, type: "trait", difficulty: Number(dc), ...(adds?.baseModifiers?.length ? { baseModifiers: adds.baseModifiers } : {}) };
  const used = await actor.diceRoll({
    event: null, title: titleOf(actor, trait, reaction), effects, roll, hasRoll: true, actionType, ...(adds?.experiences?.length ? { experiences: adds.experiences } : {}),
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
 * total, dice}, or null where the helper doesn't make that check, its card's odds wouldn't be the engine's (a d20
 * roller's, above), or the roll was cancelled or can't be read (the engine rolls it).
 * @param {TokenDocument} token   the one who rolls
 * @param {object} options        {purpose, skill (a trait's key, where it names one), dc, action: {id, name}, secret};
 *                                its target isn't needed
 */
export async function rollDaggerheartCheck(token, { purpose = null, skill = null, dc = null, action = null, secret = false } = {}) {
  const actor = token?.actor;
  if ( !actor || actor.type === "companion" ) return null;
  const trait = checkTrait(token, { purpose, skill, action });
  if ( !trait ) return null;
  if ( rollsDuality(actor) ) return traitRoll(actor, trait, { dc, reaction: false, secret });
  const adds = Number(actor.system?.criticalThreshold) === 20 ? d20Adds(actor, purpose) : null;
  return adds ? traitRoll(actor, trait, { dc, reaction: false, secret, adds }) : null;
}
