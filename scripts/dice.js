/**
 * Daggerheart's dice (the SRD's Core Mechanics).
 *  - A player character rolls the Duality Dice: a Hope d12 and a Fear d12, added, plus its modifier, against the
 *    Difficulty. Advantage adds a d6, disadvantage takes one away. The higher die says how it went: with Hope, or with
 *    Fear. Matching dice are a critical success: it succeeds whatever the total (on an attack, critical damage).
 *  - A reaction roll is made the same way, but brings neither Hope nor Fear, and a critical is only a success.
 *  - An adversary rolls a d20 plus its modifier (advantage: the better of two d20s, disadvantage the worse). A natural
 *    at or above its critical threshold (20 unless it says) always succeeds, and is a critical.
 * Degrees, as the core counts them: 1 a failure, 2 a success, 3 a critical success (there is no critical failure).
 * Pure: no Foundry globals.
 */

/** What a player character's roll is called, where the core asks which dice someone rolls (rules.dieOf). */
export const DUALITY = "duality";

/** How a duality roll went: "hope", "fear", or "crit" (matching dice, which count as with Hope). */
export function dualityWith(hope, fear) {
  return hope === fear ? "crit" : hope > fear ? "hope" : "fear";
}

/**
 * The chances of each degree on a duality roll, [0, failure, success, critical], and of its going with Fear
 * (`fear`), for a modifier against a Difficulty. A reaction roll's critical counts as a plain success.
 */
export function dualityChances(mod, dc, { advantage = 0, reaction = false } = {}) {
  const out = [0, 0, 0, 0];
  let fear = 0;
  const adv = Math.sign(advantage);
  const extras = adv ? [1, 2, 3, 4, 5, 6].map(n => adv * n) : [0];
  const p = 1 / (144 * extras.length);
  for ( let hope = 1; hope <= 12; hope++ ) {
    for ( let f = 1; f <= 12; f++ ) {
      for ( const extra of extras ) {
        const degree = hope === f ? (reaction ? 2 : 3) : hope + f + mod + extra >= dc ? 2 : 1;
        out[degree] += p;
        if ( f > hope ) fear += p;
      }
    }
  }
  return Object.assign(out, { fear });
}

/** The chances of each degree on an adversary's d20, [0, failure, success, critical]. */
export function d20Chances(mod, dc, { advantage = 0, critOn = 20 } = {}) {
  const out = [0, 0, 0, 0];
  const adv = Math.sign(advantage);
  for ( let n = 1; n <= 20; n++ ) {
    const p = adv > 0 ? (2 * n - 1) / 400 : adv < 0 ? (2 * (20 - n) + 1) / 400 : 1 / 20;
    out[n >= critOn ? 3 : n + mod >= dc ? 2 : 1] += p;
  }
  return out;
}

/**
 * A duality roll: {natural (the two dice together), total, degree, hope, fear, with, extra}. `crit`: it's a critical
 * whatever the dice (Blaze of Glory's final action).
 */
export function rollDuality(rng, mod, dc, { advantage = 0, reaction = false, crit = false } = {}) {
  const hope = rng.die(12);
  const fear = rng.die(12);
  const adv = Math.sign(advantage);
  const extra = adv ? adv * rng.die(6) : 0;
  const total = hope + fear + mod + extra;
  const matched = hope === fear || crit;
  const degree = matched ? (reaction ? 2 : 3) : total >= dc ? 2 : 1;
  return { natural: hope + fear, total, degree, hope, fear, with: matched ? "crit" : dualityWith(hope, fear), extra };
}

/** An adversary's d20: {natural, total, degree}. */
export function rollD20(rng, mod, dc, { advantage = 0, critOn = 20 } = {}) {
  let natural = rng.die(20);
  const adv = Math.sign(advantage);
  if ( adv ) {
    const second = rng.die(20);
    natural = adv > 0 ? Math.max(natural, second) : Math.min(natural, second);
  }
  const total = natural + mod;
  return { natural, total, degree: natural >= critOn ? 3 : total >= dc ? 2 : 1 };
}
