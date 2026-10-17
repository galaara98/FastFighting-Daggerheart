/**
 * A strike in a live battle (core API 19 rollStrike), rolled the daggerheart system's way: every strike in a turn
 * FastFighting plays, and a reaction's, as its player (or the GM) would roll it from the sheet, its card in the chat.
 * FastFighting plays the strike with what the card says (read-turn.js readDaggerheartStrike).
 *   - The attack: the one the engine's strike names (the adapter's action id): an adversary's or a companion's standard
 *     attack (a Horde's lesser one is the same attack, its damage as the sheet has it now), a character's weapon, or its
 *     unarmed attack. Anything else (a feature's action, a spell, a domain card) is left to the engine's dice.
 *   - The target: the system reads it from the user's targets, so the user's target is set to it for the roll and the
 *     user's own put back after. Not on the scene this user is looking at: nothing is rolled.
 *   - Rolled with the action's own use(), Shift down (the system's way past its dialogs); a hit's damage as the card's
 *     Roll Damage button rolls it, where the system's Automation hasn't rolled it already. The card says how it went:
 *     the attack at the target (a critical on matching dice, or the d20 at its threshold), and the damage it holds.
 *   - FastFighting deals the blow, pays the attack's costs, lays its effects and counts its Hope and Fear (its rules,
 *     from the card's Duality Dice: rules.js asRolled; written back with the turn): the system's workflow is kept
 *     from doing them for this roll (its Automation's damage and effects applied, its costs paid, the Hope, Fear and
 *     Stress the Duality Dice bring). Its countdowns and its features' triggers go as the system has them.
 */
import { readDaggerheartStrike } from "./read-turn.js";

const SYSTEM = "daggerheart";

/** The adapter's ids for a creature's own attack ("<token id>.<what>"), and the actor types that have each. */
const OWN_ATTACKS = Object.freeze({ attack: ["adversary", "companion"], "attack.horde": ["adversary"], unarmed: ["character"] });

/**
 * The steps of the system's action workflow FastFighting does itself: each step's name (its pre- and post- hooks) and
 * the key of the workflow's config it goes by, emptied while the step runs. (The system builds each hook's name from
 * its step's key, `daggerheart.pre${key.capitalize()}Action` in executeWorkflow: no search of its code finds them.)
 */
const HELD = Object.freeze([["Cost", "costs"], ["ApplyDamage", "damage"], ["Effects", "hasEffect"]]);

/** How long the system's write of a damage roll onto its card may take: it sends it without waiting. */
const LANDING_MS = 3000;

/**
 * The actor's attack action an engine strike stands for, by the id the adapter gave it ("<token id>.attack", ".unarmed"
 * or ".<weapon id>"), or null.
 * @param {TokenDocument} token   the one who strikes
 * @param {object} action         the engine's strike, {id, name}
 */
export function attackFor(token, action) {
  const actor = token?.actor;
  const id = typeof action?.id === "string" ? action.id : "";
  const prefix = `${token?.id}.`;
  if ( !actor || !token.id || !id.startsWith(prefix) ) return null;
  const what = id.slice(prefix.length);
  if ( Object.hasOwn(OWN_ATTACKS, what) ) return OWN_ATTACKS[what].includes(actor.type) ? actor.system?.attack ?? null : null;
  const item = actor.items?.get?.(what);
  return item?.type === "weapon" ? item.system?.attack ?? null : null;
}

/** Whether this helper rolls an attack as a strike: an attack roll with damage, not one its targets roll to resist. */
export const rollsStrike = attack => !!attack && typeof attack.use === "function" && !!attack.hasRoll && !!attack.hasDamage && !attack.hasSave;

/**
 * This user's target set to a token for a roll: a function that puts the user's own targets back, or null where the
 * token isn't on the scene this user is looking at (the system would read no target).
 * @param {TokenDocument} target
 */
function aimAt(target) {
  const layer = globalThis.canvas?.tokens;
  if ( !target?.id || typeof layer?.setTargets !== "function" ) return null;
  if ( globalThis.canvas.scene?.id !== target.parent?.id || !layer.get?.(target.id) ) return null;
  const before = [...(game.user?.targets ?? [])].map(t => t.id);
  layer.setTargets([target.id], { mode: "replace" });
  return () => layer.setTargets(before, { mode: "replace" });
}

/**
 * A click as the system's buttons read one: Shift down, its own way past the roll's dialogs (the action's, the roll's
 * and the damage's); Alt and Ctrl up, so the roll has advantage or disadvantage only as the action says.
 */
export const click = () => ({ shiftKey: true, altKey: false, ctrlKey: false, metaKey: false, stopPropagation() {}, preventDefault() {} });

/** The strike as its card holds it, once the card holds its damage or LANDING_MS has passed. */
async function landed(id, tokenId) {
  const read = () => readDaggerheartStrike(game.messages?.get?.(id), tokenId);
  let out = read();
  for ( let waited = 0; out && !out.damage && waited < LANDING_MS; waited += 25 ) {
    await new Promise(resolve => setTimeout(resolve, 25));
    out = read();
  }
  return out;
}

/**
 * A strike rolled with the daggerheart system's own roller, its card in the chat: {attack: {degree, natural, total, dice},
 * damage: {byType} | null} (damage null on a miss, or where none landed on the card in time: the engine's dice for it),
 * or null where it can't be rolled here or read (the engine rolls it).
 * @param {TokenDocument} token    the one who strikes
 * @param {object} options
 * @param {object} options.action  the engine's strike, {id, name}
 * @param {TokenDocument} options.target
 * @param {boolean} [options.secret]  for the GMs only (its card in the GMs' mode)
 */
export async function rollDaggerheartStrike(token, { action, target, secret = false } = {}) {
  const attack = attackFor(token, action);
  // (An attack roll with damage: not one its targets roll to resist, which the engine plays as a save.)
  if ( !rollsStrike(attack) ) return null;
  const restore = aimAt(target);
  if ( !restore ) return null;
  // (This roll's workflow, as the system starts it; the steps FastFighting does itself, emptied while they run.)
  let mine = null;
  const held = new Map();
  const putBack = () => {
    for ( const [key, value] of held ) mine[key] = value;
    held.clear();
  };
  const hooks = [[`${SYSTEM}.preUseAction`, (acting, config) => {
    if ( acting === attack && !mine ) mine = config;
  }]];
  for ( const [step, key] of HELD ) {
    hooks.push([`${SYSTEM}.pre${step}Action`, (acting, config) => {
      if ( !mine || config !== mine ) return;
      held.set(key, config[key]);
      config[key] = Array.isArray(config[key]) ? [] : null;
    }]);
    hooks.push([`${SYSTEM}.post${step}Action`, (acting, config) => {
      if ( mine && config === mine ) putBack();
    }]);
  }
  const ids = hooks.map(([name, fn]) => [name, Hooks.on(name, fn)]);
  let used = null;
  try {
    used = await attack.use(click(), { dialog: { configure: false }, skips: { resources: true }, ...(secret ? { selectedMessageMode: "gm" } : {}) });
  } finally {
    for ( const [name, id] of ids ) Hooks.off(name, id);
    if ( mine ) putBack();
    restore();
  }
  const card = typeof used?.message?.id === "string" ? game.messages?.get?.(used.message.id) : null;
  const read = readDaggerheartStrike(card, target.id);
  if ( !read ) return null;
  // (Its Duality Dice too: Hope or Fear, as the card has them, are the engine's: rules.js asRolled.)
  const out = { attack: { degree: read.degree, natural: read.natural, total: read.total, ...(read.dice ? { dice: read.dice } : {}) }, damage: null };
  if ( read.degree < 2 ) return out;
  // (Its damage: rolled already, by the system's Automation; else as the card's own Roll Damage button rolls it.)
  if ( !read.damage && !used.damage && typeof card.onRollDamage === "function" ) await card.onRollDamage(click());
  const rolled = await landed(card.id, target.id);
  if ( rolled?.damage ) out.damage = { byType: rolled.damage };
  return out;
}
