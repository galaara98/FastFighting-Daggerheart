/**
 * What Daggerheart says about a character, for the one time FastFighting sets it up by itself (the core's
 * foundry/auto-config.js): the playstyles that fit it, its own answers to the tactics questions, and its biography as
 * plain text for the playstyles' keywords. Read from data, never names: a character's class by its two domains (so a
 * homebrew class counts as its domains say), an adversary by its type, a beast by its motives. Pure.
 */

/** What each domain leans a character toward (a class has two; they add up). */
const DOMAINS = Object.freeze({
  blade: { brawler: 0.4, impatient: 0.1 },
  bone: { speedRunner: 0.3, instigator: 0.1 },
  valor: { tank: 0.5, martyr: 0.3 },
  midnight: { thief: 0.4, wallflower: 0.3 },
  grace: { diplomat: 0.4, peoplePleaser: 0.2 },
  codex: { loreCollector: 0.5, puzzleManiac: 0.2 },
  splendor: { enabler: 0.5, moralist: 0.3 },
  sage: { loreCollector: 0.2, enabler: 0.2 },
  arcana: { unmundane: 0.5, wildcard: 0.1 }
});

/** What each kind of adversary leans toward. */
const TYPES = Object.freeze({
  bruiser: { brawler: 0.6, tank: 0.3 },
  horde: { brawler: 0.4, relentless: 0.3 },
  leader: { leader: 0.8 },
  minion: { peoplePleaser: 0.3, brawler: 0.2 },
  ranged: { wallflower: 0.6 },
  skulk: { wallflower: 0.4, thief: 0.3, cruel: 0.2 },
  social: { diplomat: 0.7, peacekeeper: 0.2 },
  solo: { relentless: 0.6, instigator: 0.2 },
  support: { enabler: 0.6 }
});

/** The playstyles that fit: {id: -1 to 1}. */
export function daggerheartHints({ pc = false, domains = [], type = null, beast = false } = {}) {
  const out = {};
  const add = map => { for ( const [k, v] of Object.entries(map ?? {}) ) out[k] = (out[k] ?? 0) + v; };
  if ( pc ) for ( const d of domains ) add(DOMAINS[d]);
  else add(TYPES[type]);
  // (A beast fights on instinct: no schemer, no talker.)
  if ( beast ) add({ brawler: 0.3, relentless: 0.2, diplomat: -1, peacekeeper: -1, leader: -0.5 });
  for ( const k of Object.keys(out) ) out[k] = Math.max(-1, Math.min(1, out[k]));
  return out;
}

/** The fighting style a class's domains make for: the first of these it has. */
const STYLE_BY_DOMAIN = [["valor", "protector"], ["arcana", "caster"], ["codex", "caster"], ["blade", "frontline"], ["sage", "ranged"], ["midnight", "skirmisher"], ["bone", "skirmisher"], ["splendor", "caster"]];

/** What each kind of adversary does, by the book's description of it. */
const TYPE_TACTICS = Object.freeze({
  bruiser: { style: "frontline", target: "nearest" },
  horde: { style: "frontline", target: "nearest" },
  minion: { style: "frontline", target: "nearest" },
  leader: { target: "dangerous" },
  ranged: { style: "ranged", target: "casters" },
  skulk: { style: "skirmisher", target: "weakest" },
  social: { talk: "first", retreat: "hurt" },
  solo: { style: "frontline", target: "dangerous", retreat: "never" },
  support: { style: "caster", target: "protect" }
});

/** Daggerheart's own answers to the tactics questions, where it knows better than the numbers: {key: answer}. */
export function daggerheartTactics({ pc = false, domains = [], type = null, beast = false } = {}) {
  const out = {};
  if ( pc ) {
    const style = STYLE_BY_DOMAIN.find(([d]) => domains.includes(d))?.[1];
    if ( style ) out.style = style;
    // (Valor stands in front of its friends: it marks Armor Slots freely, and goes to a friend who falls.)
    if ( domains.includes("valor") ) Object.assign(out, { target: "protect", shield: "always", allyDying: "rescue" });
    if ( domains.includes("splendor") ) out.healAggro = "aggressive";
    if ( domains.includes("grace") ) out.talk = "opportune";
  } else Object.assign(out, TYPE_TACTICS[type] ?? {});
  if ( beast ) Object.assign(out, { talk: "never", beyond: "stay" });
  return out;
}

/** Text from the sheet's HTML: the class's own questions (in bold) left out, so only what was written counts. */
export function plainText(html) {
  return String(html ?? "")
    .replace(/<strong[^>]*>[\s\S]*?<\/strong>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ").trim();
}

/** Everything written about it, as one text: its biography and description, its motives, its Experiences' names. */
export function biographyText({ bio = null, description = "", motives = "", experiences = {} } = {}) {
  const parts = [];
  const walk = v => {
    if ( typeof v === "string" ) parts.push(plainText(v));
    else if ( v && typeof v === "object" ) for ( const x of Object.values(v) ) walk(x);
  };
  walk(bio);
  parts.push(plainText(description), String(motives ?? ""));
  for ( const e of Object.values(experiences ?? {}) ) parts.push(String(e?.name ?? ""), plainText(e?.description));
  return parts.filter(Boolean).join(". ");
}
