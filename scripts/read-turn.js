/**
 * A player character's spotlight in a live battle, read from the cards the daggerheart system made for it (its action
 * rolls: system.targets, the Duality Dice, the damage): what FastFighting's engine would have logged, so the turn is
 * told like any other.
 *   - An action roll at a target with damage: an attack (a hit when it meets the target's Difficulty or Evasion, a
 *     critical on matching dice); its damage (the sheets settle the Hit Points marked).
 *   - A Presence roll: words, for the GM to confirm (whether it was talk at all, at whom and how well).
 *   - Healing: told as healing (the sheets say how much).
 * And the spotlight's hand-off: a roll with Fear, or one that failed, gives it to the GM (each event's `handoff`; a roll
 * that told nothing else, {type: "handoff"}).
 * Each event says whether it's `sure`. A damage or healing card is also read on its own as it's made
 * (readDaggerheartDamage), for the core to apply or put before a GM; a strike FastFighting had the system roll, at
 * the token it struck (readDaggerheartStrike); and a save or a check it had the system roll (readDaggerheartCheck).
 */
import { tokenIdIn as tokenIdOf } from "./core.js";

/** The Hope and Fear dice of a Duality roll: {hope, fear}, or null for a d20. */
function dualityOf(roll) {
  const hope = roll?.dHope?.total ?? roll?.dice?.[0]?.total;
  const fear = roll?.dFear?.total ?? roll?.dice?.[1]?.total;
  if ( !Number.isFinite(hope) || !Number.isFinite(fear) || (roll?.dice?.[0]?.faces ?? 12) === 20 ) return null;
  return { hope, fear };
}

/** The name of the item a card came from ({actor: uuid, item: id}), where it's at hand. */
function itemName(source) {
  if ( !source?.actor || !source.item || typeof globalThis.fromUuidSync !== "function" ) return null;
  try {
    return globalThis.fromUuidSync(source.actor)?.items?.get?.(source.item)?.name ?? null;
  } catch ( err ) {
    return null;
  }
}

/** A roll's total, as a card holds it (a Roll, or its JSON), at least 0; null for none. */
function totalOf(roll) {
  let total = roll?.total;
  if ( typeof roll === "string" ) {
    try {
      total = JSON.parse(roll)?.total;
    } catch ( err ) {
      return null;
    }
  }
  return roll != null && Number.isFinite(Number(total)) ? Math.max(0, Number(total)) : null;
}

/** A roll's damage, as its card holds it (rolled with it, or rolled later on the same card). */
const damageOf = m => totalOf(m.system?.damage?.main);

/** A heal, as its card holds it: the Hit Points it clears, else all it restores (Stress, Hope, Armor Slots). */
function healingOf(m) {
  const resources = m.system?.damage?.resources;
  if ( !resources || typeof resources !== "object" ) return null;
  const totals = Object.entries(resources).map(([key, roll]) => [key, totalOf(roll)]).filter(([, n]) => n !== null);
  const hp = totals.find(([key]) => key === "hitPoints");
  if ( hp ) return hp[1];
  return totals.length ? totals.reduce((sum, [, n]) => sum + n, 0) : null;
}

/** A card's list, where it is one (a card's data is its author's to write). */
const listOf = v => (Array.isArray(v) ? v : []);

/** A card's action roll: the roll, its Duality Dice, a critical (matching dice), its total, the action's Difficulty. */
function actionRoll(m) {
  const roll = m.system?.roll ?? m.rolls?.[0] ?? null;
  const dice = dualityOf(roll);
  const crit = !!roll?.isCritical || (dice ? dice.hope === dice.fear : false);
  return { roll, dice, crit, total: Number(roll?.total), difficulty: roll?.options?.roll?.difficulty ?? null };
}

/** What a roll had to meet at a target: the action's own Difficulty, else the target's Difficulty or Evasion. */
const dcAt = (t, difficulty) => difficulty ?? t?.difficulty ?? t?.evasion ?? null;

/** Whether a roll met that (a critical always hits). */
const meets = (r, dc) => r.crit || (Number.isFinite(dc) && r.total >= dc);

/** A roll's dice as they fell: the Duality Dice together, else the d20. */
const naturalOf = r => (r.dice ? r.dice.hope + r.dice.fear : (r.roll?.dice?.[0]?.total ?? null));

/** The cards the system makes for an action: its rolls (a character's, an adversary's) and damage on a card of its own. */
const ROLL_CARDS = Object.freeze(["dualityRoll", "adversaryRoll", "damageRoll"]);

/**
 * @param {ChatMessage[]} messages  the cards made during the turn, oldest first
 * @param {object} context          {tokenId, actorId, ids: {tokenId: battle id}}
 * @returns {object[]} engine log events, each with `sure`
 */
export function readDaggerheartTurn(messages, { tokenId, actorId = null, ids = {} } = {}) {
  const events = [];
  // (A battle id by token id: only the battle's own, never one of Object's.)
  const idOf = id => (typeof id === "string" && Object.hasOwn(ids, id) ? ids[id] : null);
  const mine = m => m.speaker?.token === tokenId || tokenIdOf(m.system?.source?.actor) === tokenId
    || (!m.speaker?.token && actorId && m.speaker?.actor === actorId);
  for ( const m of messages ) {
    try {
      if ( !mine(m) || !ROLL_CARDS.includes(m.type) ) continue;
      const sys = m.system ?? {};
      const r = actionRoll(m);
      const { roll, dice, crit, difficulty } = r;
      // (By the item it came from, "Longsword", rather than the card's title, "Longsword - Attack".)
      const action = itemName(sys.source) ?? sys.title ?? "";
      if ( m.type === "damageRoll" || !sys.hasRoll ) {
        // (Damage or healing on its own card: the last hit with no damage yet, or a heal.)
        const amount = damageOf(m) ?? (Number(roll?.total) || 0);
        if ( sys.hasHealing ) {
          for ( const t of listOf(sys.targets).length ? listOf(sys.targets) : [{ id: null }] ) events.push({ type: "heal", targetId: idOf(t?.id), action, amount, sure: !!idOf(t?.id) });
          continue;
        }
        const strike = [...events].reverse().find(e => e.type === "attack" && e.degree >= 2 && !e.damage);
        if ( strike && amount > 0 ) strike.damage = amount;
        continue;
      }
      const withFear = dice ? dice.fear > dice.hope && !crit : false;
      const targets = listOf(sys.targets).map(t => ({ id: idOf(t?.id), dc: dcAt(t, difficulty) })).filter(t => t.id);
      const total = r.total;
      const hits = t => meets(r, t.dc);
      const failed = targets.length ? !targets.some(hits) : (Number.isFinite(difficulty) ? !crit && total < difficulty : false);
      // (The spotlight goes to the GM after a roll with Fear, or one that failed.)
      const handoff = !!dice && (withFear || failed);
      const natural = naturalOf(r);
      const before = events.length;
      if ( targets.length && (sys.hasDamage || damageOf(m) !== null) ) {
        const damage = damageOf(m) ?? 0;
        for ( const t of targets ) {
          const hit = hits(t);
          events.push({
            type: "attack", targetId: t.id, action, degree: crit ? 3 : hit ? 2 : 1, natural, total: Number.isFinite(total) ? total : null,
            dc: t.dc, margin: Number.isFinite(t.dc) && Number.isFinite(total) ? total - t.dc : 0, damage: hit ? damage : 0, crit,
            withFear, handoff, sure: Number.isFinite(t.dc)
          });
        }
      } else if ( sys.hasHealing ) {
        for ( const t of targets.length ? targets : [{ id: null }] ) events.push({ type: "heal", targetId: t.id, action, amount: damageOf(m) ?? 0, handoff, sure: !!t.id });
      } else if ( roll?.options?.roll?.trait === "presence" ) {
        // (Words: whether it was talk at all, at whom and how well, the GM says.)
        events.push({ type: "talk", targetId: targets[0]?.id ?? null, kind: "persuade", skill: action, degree: null, natural, total: Number.isFinite(total) ? total : null, handoff, sure: false });
      }
      if ( events.length === before && handoff ) events.push({ type: "handoff", handoff: true, sure: true });
    } catch ( err ) {
      console.warn("FastFighting Daggerheart | a card of the turn couldn't be read", err);
    }
  }
  return events;
}

/**
 * A damage or healing card, as the core's live battles take one when it's made (adapter.damageCard): {amount, kind:
 * "damage" | "healing", targets (token ids), save}, or null for any other card. Damage is its Hit Point damage (the
 * card's main roll); a heal, the Hit Points it clears, else all it restores. Its targets are those the card names: of
 * an attack, only those it hit (as readDaggerheartTurn reads it), and null when it hit none; a card with no roll, or a
 * heal, all of them. `save`: the action has its targets make a reaction roll first (how much lands is the GM's call).
 * @param {ChatMessage} m
 */
export function readDaggerheartDamage(m) {
  if ( !m || !ROLL_CARDS.includes(m.type) ) return null;
  const sys = m.system ?? {};
  const healing = !!sys.hasHealing;
  const amount = healing ? healingOf(m) : damageOf(m);
  if ( amount === null ) return null;
  let targets = listOf(sys.targets).filter(t => typeof t?.id === "string" && t.id);
  if ( !healing && sys.hasRoll && m.type !== "damageRoll" && targets.length ) {
    const r = actionRoll(m);
    targets = targets.filter(t => meets(r, dcAt(t, r.difficulty)));
    if ( !targets.length ) return null;
  }
  return { amount, kind: healing ? "healing" : "damage", targets: targets.map(t => t.id), save: !!sys.hasSave };
}

/** A damage roll's type, as its card holds it (the first of its types, as actions.js reads an action's), else physical. */
function typeOf(roll) {
  let options = roll?.options;
  if ( typeof roll === "string" ) {
    try {
      options = JSON.parse(roll)?.options;
    } catch ( err ) {
      options = null;
    }
  }
  const types = options?.damageTypes;
  return [...(types instanceof Set ? types : listOf(types))].find(k => typeof k === "string" && k) ?? "physical";
}

/**
 * A card's damage by type, as rolled (before the target's resistances and thresholds; a critical's with what the system
 * adds for it): its main roll under its type, and the Stress it marks. Null for none.
 */
function damageByType(m) {
  const out = {};
  const main = damageOf(m);
  if ( main > 0 ) out[typeOf(m.system.damage.main)] = main;
  const stress = totalOf(m.system?.damage?.resources?.stress);
  if ( stress > 0 ) out.stress = stress;
  return Object.keys(out).length ? out : null;
}

/**
 * A strike's card, as the system made it for a strike FastFighting asked of it (strike-roll.js): the attack at the token
 * it struck and, a hit, the damage the card holds. {degree: 3 a critical (matching dice, or the d20 at its threshold),
 * 2 a hit (the target's Difficulty or Evasion met), 1 a miss (neither roll fails critically), natural (the Duality Dice
 * together, or the d20), total, dice ({hope, fear}: the Duality Dice; null, a d20), damage: {type: amount} | null};
 * null where the card holds no action roll at that token, or what the roll had to meet there isn't known.
 * @param {ChatMessage} m
 * @param {string} tokenId
 */
export function readDaggerheartStrike(m, tokenId) {
  const sys = m?.system;
  if ( !sys?.hasRoll || !ROLL_CARDS.includes(m.type) || m.type === "damageRoll" ) return null;
  const target = listOf(sys.targets).find(t => typeof t?.id === "string" && t.id === tokenId);
  const r = actionRoll(m);
  if ( !target || !Number.isFinite(r.total) ) return null;
  const dc = dcAt(target, r.difficulty);
  if ( !r.crit && !Number.isFinite(dc) ) return null;
  const degree = r.crit ? 3 : meets(r, dc) ? 2 : 1;
  return { degree, natural: naturalOf(r), total: r.total, dice: r.dice, damage: degree >= 2 ? damageByType(m) : null };
}

/** A number as a card may hold it (a Difficulty: a number, or its text), else null. */
const numberIn = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * A save's or a check's card, as the system made it for one FastFighting asked of it (check-roll.js): {degree: 3 a
 * critical (matching dice, or the d20 at its threshold), 2 a success (the Difficulty met; a reaction roll's critical
 * too, which is only a success), 1 a failure, natural (the Duality Dice together, or the d20), total, dice ({hope,
 * fear}: the Duality Dice; none for a d20)}; null where the card holds no action roll, or what it had to meet isn't
 * known.
 * @param {ChatMessage} m
 * @param {object} options  {dc (the Difficulty asked for; the card's own first), reaction (a reaction roll)}
 */
export function readDaggerheartCheck(m, { dc = null, reaction = false } = {}) {
  if ( !m?.system?.hasRoll || !ROLL_CARDS.includes(m.type) || m.type === "damageRoll" ) return null;
  const r = actionRoll(m);
  if ( !Number.isFinite(r.total) ) return null;
  const need = numberIn(r.difficulty) ?? numberIn(dc);
  if ( !r.crit && need === null ) return null;
  const degree = r.crit ? (reaction ? 2 : 3) : r.total >= need ? 2 : 1;
  return { degree, natural: naturalOf(r), total: r.total, ...(r.dice ? { dice: r.dice } : {}) };
}
