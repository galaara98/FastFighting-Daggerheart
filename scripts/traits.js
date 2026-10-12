/**
 * Daggerheart personality defaults. A player character's from its traits: Instinct and Knowledge make a tactician,
 * Strength and Presence a bold one, Presence a loyal one, Finesse a little more self-serving. An adversary's from its
 * type (a Solo bold, a Skulk cunning, a Minion fragile in spirit ...) and its tier (the higher, the bolder); motives
 * like feeding and hunting mark a beast, which fights on instinct and can't be talked to.
 * Pure, unit-tested.
 */
import { t } from "./words.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** By adversary type: tactical, brave, selfish, loyal. */
const TYPES = Object.freeze({
  bruiser: { tactical: 35, brave: 70, selfish: 50, loyal: 55 },
  horde: { tactical: 30, brave: 60, selfish: 50, loyal: 60 },
  leader: { tactical: 65, brave: 65, selfish: 45, loyal: 60 },
  minion: { tactical: 25, brave: 40, selfish: 50, loyal: 55 },
  ranged: { tactical: 55, brave: 40, selfish: 55, loyal: 50 },
  skulk: { tactical: 60, brave: 45, selfish: 60, loyal: 45 },
  social: { tactical: 55, brave: 35, selfish: 55, loyal: 50 },
  solo: { tactical: 55, brave: 85, selfish: 55, loyal: 50 },
  standard: { tactical: 45, brave: 50, selfish: 50, loyal: 55 },
  support: { tactical: 60, brave: 40, selfish: 45, loyal: 60 }
});

/** Motives that make a beast of it: it feeds, hunts, burrows; it doesn't bargain. */
const BEAST = /\b(?:feed|feeding|hunt|hunting|prey|devour|burrow|graze|nest|swarm|consume|eat)\b/i;

/** Does an adversary's motives (and tactics) say it's a beast? */
export const isBeast = motives => BEAST.test(String(motives ?? ""));

/**
 * @param {object} d
 * @param {boolean} d.pc
 * @param {object} [d.traits]   a character's agility, strength, finesse, instinct, presence, knowledge
 * @param {string} [d.type]     an adversary's type (standard, solo ...)
 * @param {number} [d.tier]     1 to 4
 * @param {string} [d.motives]  its motives and tactics
 * @param {object} [d.names]    the reader's words for the traits and the type (for the reasons shown)
 * @returns {{traits, flags, reasons}}
 */
export function deriveDaggerheartTraits({ pc, traits = {}, type = "standard", tier = 1, motives = "", names = {} }) {
  const reasons = {};
  const flags = {};
  const v = k => Number(traits[k]) || 0;
  const name = k => names[k] ?? k;
  if ( pc ) {
    const wit = Math.max(v("instinct"), v("knowledge"));
    return {
      traits: {
        tactical: clamp(50 + 7 * wit, 35, 85),
        brave: clamp(55 + 5 * v("strength") + 4 * v("presence"), 40, 90),
        selfish: clamp(30 + 4 * v("finesse") - 4 * v("presence"), 5, 60),
        loyal: clamp(65 + 5 * v("presence"), 45, 95)
      },
      flags,
      reasons: {
        tactical: `${name(v("instinct") >= v("knowledge") ? "instinct" : "knowledge")} ${wit}`,
        brave: `${name("strength")} ${v("strength")}, ${name("presence")} ${v("presence")}`,
        selfish: `${name("finesse")} ${v("finesse")}`,
        loyal: `${name("presence")} ${v("presence")}`
      }
    };
  }
  const base = TYPES[type] ?? TYPES.standard;
  const beast = isBeast(motives);
  const out = { ...base, brave: clamp(base.brave + 5 * ((Number(tier) || 1) - 1), 5, 100), tactical: clamp(base.tactical - (beast ? 15 : 0), 5, 100) };
  const kind = names.type ?? type;
  reasons.tactical = beast ? t("Reason.Beast", { kind }) : kind;
  reasons.brave = t("Reason.Tier", { kind, tier: Number(tier) || 1 });
  reasons.selfish = kind;
  reasons.loyal = kind;
  if ( beast ) flags.beast = true;
  if ( type === "solo" ) flags.fearless = true;
  return { traits: out, flags, reasons };
}

/** Leaders: a character's Presence; an adversary's type (a Leader most, then a Solo) and tier. */
export function rankDaggerheartLeaders(entries) {
  const out = [];
  for ( const e of entries ) {
    if ( !e ) continue;
    const score = e.pc ? Math.max(0, e.presence ?? 0) : (e.type === "leader" ? 3 : e.type === "solo" ? 2 : 0) + Math.max(0, (e.tier ?? 1) - 1);
    const reason = e.pc ? t("Lead.Presence", { n: e.presence ?? 0 }) : t("Lead.Type", { kind: e.typeName ?? e.type ?? "", tier: e.tier ?? 1 });
    out.push({ id: e.id, score, reason, bonus: leaderBonus(score) });
  }
  return out.sort((a, b) => b.score - a.score);
}

export function leaderBonus(score) {
  if ( score >= 4 ) return { brave: 20, tacticalFloor: 55, attack: 0, ac: 0 };
  if ( score >= 3 ) return { brave: 15, tacticalFloor: 45, attack: 0, ac: 0 };
  if ( score >= 2 ) return { brave: 10, tacticalFloor: 35, attack: 0, ac: 0 };
  return { brave: 5, tacticalFloor: 0, attack: 0, ac: 0 };
}
