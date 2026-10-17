/**
 * An action's own card in a live battle, and the damage of one that isn't an attack (core API 19 useAction,
 * rollDamage), the daggerheart system's way, in a turn FastFighting plays (a spell, a feature's, a domain card's):
 *   - Its card (useAction): the action's own chat card, as the system shows one when it's used (Action#toChat: its
 *     name, its item's, its description), in the chat's own mode (the GMs' when secret). Nothing rolled, spent or
 *     applied. None for a strike rollStrike rolls (its card shows it), one the system keeps out of the chat (its
 *     Display in Chat off), or anything that isn't one of the sheet's actions (a trait move, Help an Ally).
 *   - Its damage (rollDamage): rolled once for all it catches, as the Damage button on an item's card rolls an action's
 *     damage on its own (the action's damage step, DamageField, with no roll before it), on a card of its own, with no
 *     dialog and no targets (who it catches is FastFighting's to say). useAction's card holds no damage, so it's left
 *     as it is. Read off the card by type (read-turn.js readDaggerheartDamageRoll); FastFighting applies each target's
 *     share with applyDamageCard (commit.js), its save's multiplier on the main damage.
 *   - Neither runs the action's workflow (its use()): no action roll, no reaction rolls, no damage applied or effects
 *     laid, no cost or use paid, no Hope, Fear or Stress, no countdown, no trigger. FastFighting does those as its rules
 *     say. The sheet's costs and uses aren't checked either: the system checks them only when it skips its dialogs,
 *     and FastFighting has paid them.
 */
import { attackFor, click, rollsStrike } from "./strike-roll.js";
import { readDaggerheartDamageRoll } from "./read-turn.js";

/** How long the system's card may take to reach the chat: its toChat sends it without waiting. */
const LANDING_MS = 3000;

/**
 * The sheet's action an engine action stands for, by the id the adapter gave it: a creature's own attack
 * (strike-roll.js attackFor), else a feature's, a domain card's or a consumable's ("<token id>.<item id>.<action id>").
 * Null for anything else (a trait move, Help an Ally, another's).
 * @param {TokenDocument} token   the one who acts
 * @param {object} action         the engine's action, {id, name}
 */
export function actionFor(token, action) {
  const id = typeof action?.id === "string" ? action.id : "";
  const prefix = `${token?.id}.`;
  if ( !token?.actor || !token.id || !id.startsWith(prefix) ) return null;
  const own = attackFor(token, action);
  if ( own ) return own;
  const [itemId, actionId, ...rest] = id.slice(prefix.length).split(".");
  if ( !itemId || !actionId || rest.length ) return null;
  const actions = token.actor.items?.get?.(itemId)?.system?.actions;
  if ( !actions ) return null;
  return actions.get?.(actionId) ?? [...actions].find(a => (a?.id ?? a?._id) === actionId) ?? null;
}

/**
 * A card the system sends to the chat without waiting (`send`), once it's there: the one `mine` picks out that this
 * user made, or null where none came in LANDING_MS. `secret`: for the GMs' eyes only, whatever the chat's mode.
 */
async function posted(send, mine, secret) {
  let arrived = null;
  let timer = null;
  const came = new Promise(resolve => {
    arrived = resolve;
    timer = setTimeout(() => resolve(null), LANDING_MS);
  });
  const ours = (m, userId) => userId === game.user?.id && mine(m);
  const hooks = [
    ["preCreateChatMessage", (m, data, options, userId) => {
      if ( secret && ours(m, userId) && typeof m.applyMode === "function" ) m.applyMode("gm");
    }],
    ["createChatMessage", (m, options, userId) => {
      if ( ours(m, userId) ) arrived(m);
    }]
  ];
  const ids = hooks.map(([name, fn]) => [name, Hooks.on(name, fn)]);
  try {
    await send();
    return await came;
  } finally {
    clearTimeout(timer);
    for ( const [name, id] of ids ) Hooks.off(name, id);
  }
}

/**
 * An action's own card, as its user shows it from the sheet: {card: message id}, or null (a strike rollStrike rolls,
 * one kept out of the chat, not one of the sheet's actions, or no card came).
 * @param {TokenDocument} token    the one who acts
 * @param {object} options
 * @param {object} options.action  the engine's action, {id, name}
 * @param {boolean} [options.secret]  for the GMs only
 */
export async function useDaggerheartAction(token, { action, secret = false } = {}) {
  // (A strike the system rolls: its card shows it.)
  if ( rollsStrike(attackFor(token, action)) ) return null;
  const act = actionFor(token, action);
  if ( !act || typeof act.toChat !== "function" || act.chatDisplay === false ) return null;
  const actor = act.actor ?? token.actor;
  const mine = m => m?.type === "abilityUse" && m.system?.source?.action === act.id && m.system?.source?.actor === actor?.uuid;
  const card = await posted(() => act.toChat(null), mine, secret);
  return typeof card?.id === "string" ? { card: card.id } : null;
}

/**
 * The damage of an action that isn't an attack, rolled with the system's own roller once for all it catches, on a card
 * of its own: {damage: {byType}, card: message id} (as rolled, before resistances and thresholds), or null (no damage
 * of the sheet's to roll: the engine rolls it).
 * @param {TokenDocument} token    the one who acts
 * @param {object} options
 * @param {object} options.action  the engine's action, {id, name}
 * @param {boolean} [options.secret]  for the GMs only (its dice too)
 */
export async function rollDaggerheartDamage(token, { action, secret = false } = {}) {
  const act = actionFor(token, action);
  const step = act?.hasDamage ? act.workflow?.get?.("damage") : null;
  if ( typeof step?.execute !== "function" || typeof act.prepareConfig !== "function" ) return null;
  // (Its config as the system makes one for a use, as for one with a dialog to come: the sheet's costs and uses aren't
  // checked, FastFighting pays them.)
  const config = act.prepareConfig(click(), {
    dialog: { configure: true }, skips: { resources: true }, ...(secret ? { selectedMessageMode: "gm", rollMode: "gm" } : {})
  });
  if ( !config ) return null;
  // (As the Damage button rolls it: no roll before it, then no dialog. Nobody's targeted yet.)
  config.hasRoll = false;
  config.targets = [];
  config.dialog = { ...config.dialog, configure: false };
  if ( (await step.execute(config, null, true)) === false ) return null;
  const card = typeof config.message?.id === "string" ? game.messages?.get?.(config.message.id) : null;
  const byType = readDaggerheartDamageRoll(card);
  return byType ? { damage: { byType }, card: card.id } : null;
}
