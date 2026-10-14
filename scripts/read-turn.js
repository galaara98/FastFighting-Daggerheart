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
 * Each event says whether it's `sure`.
 */

/** The token id inside a uuid ("Scene.x.Token.y.Actor.z"), or null. */
const tokenIdOf = uuid => (typeof uuid === "string" && uuid.includes("Token.") ? uuid.split("Token.").pop().split(".")[0] : null);

/** The Hope and Fear dice of a Duality roll: {hope, fear}, or null for a d20. */
function dualityOf(roll) {
  const hope = roll?.dHope?.total ?? roll?.dice?.[0]?.total;
  const fear = roll?.dFear?.total ?? roll?.dice?.[1]?.total;
  if ( !Number.isFinite(hope) || !Number.isFinite(fear) || (roll?.dice?.[0]?.faces ?? 12) === 20 ) return null;
  return { hope, fear };
}

/** A roll's damage, as its card holds it (rolled with it, or rolled later on the same card). */
function damageOf(m) {
  const main = m.system?.damage?.main;
  const total = typeof main === "string" ? JSON.parse(main)?.total : main?.total;
  return Number.isFinite(Number(total)) ? Math.max(0, Number(total)) : null;
}

/**
 * @param {ChatMessage[]} messages  the cards made during the turn, oldest first
 * @param {object} context          {tokenId, actorId, ids: {tokenId: battle id}}
 * @returns {object[]} engine log events, each with `sure`
 */
export function readDaggerheartTurn(messages, { tokenId, actorId = null, ids = {} } = {}) {
  const events = [];
  const mine = m => m.speaker?.token === tokenId || tokenIdOf(m.system?.source?.actor) === tokenId
    || (!m.speaker?.token && actorId && m.speaker?.actor === actorId);
  for ( const m of messages ) {
    if ( !mine(m) || !["dualityRoll", "adversaryRoll", "damageRoll"].includes(m.type) ) continue;
    const sys = m.system ?? {};
    const roll = sys.roll ?? m.rolls?.[0] ?? null;
    const action = sys.title ?? "";
    if ( m.type === "damageRoll" || !sys.hasRoll ) {
      // (Damage or healing on its own card: the last hit with no damage yet, or a heal.)
      const amount = damageOf(m) ?? (Number(roll?.total) || 0);
      if ( sys.hasHealing ) {
        for ( const t of sys.targets?.length ? sys.targets : [{ id: null }] ) events.push({ type: "heal", targetId: ids[t.id] ?? null, action, amount, sure: !!ids[t.id] });
        continue;
      }
      const strike = [...events].reverse().find(e => e.type === "attack" && e.degree >= 2 && !e.damage);
      if ( strike && amount > 0 ) strike.damage = amount;
      continue;
    }
    const dice = dualityOf(roll);
    const crit = !!roll?.isCritical || (dice ? dice.hope === dice.fear : false);
    const withFear = dice ? dice.fear > dice.hope && !crit : false;
    const difficulty = roll?.options?.roll?.difficulty ?? null;
    const targets = (sys.targets ?? []).map(t => ({ id: ids[t.id] ?? null, dc: difficulty ?? t.difficulty ?? t.evasion ?? null })).filter(t => t.id);
    const total = Number(roll?.total);
    const hits = t => crit || (Number.isFinite(t.dc) && total >= t.dc);
    const failed = targets.length ? !targets.some(hits) : (Number.isFinite(difficulty) ? !crit && total < difficulty : false);
    // (The spotlight goes to the GM after a roll with Fear, or one that failed.)
    const handoff = !!dice && (withFear || failed);
    const natural = dice ? dice.hope + dice.fear : (roll?.dice?.[0]?.total ?? null);
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
  }
  return events;
}
