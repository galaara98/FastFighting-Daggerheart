/**
 * What Daggerheart says about a character, for the one time FastFighting sets it up by itself (the core's
 * foundry/auto-config.js): the playstyles that fit it, what it would do (its answers to the tactics questions, and what
 * it offers and expects to end an argument, each with its reason: what "Let this character decide" stands for), and its
 * biography (what's said of it, its story) for the keywords. Read from data, never names: a character's class by its two
 * domains (so a homebrew class counts as its domains say), its features and cards by what their actions and effects do,
 * its community by its lore reference; an adversary by its type, its standard attack and what its features do. Pure.
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

/**
 * The fighting style a class's domains make for: the first of these it has. Valor stands in front of its friends; Dread,
 * Arcana and Codex cast; Midnight slips about (before Blade: an Assassin is a skirmisher, a Warrior holds the front);
 * Sage keeps its distance (a Ranger); Bone slips about; Splendor casts. Every SRD class lands on one: Grace, the one
 * left, always comes with one of these.
 */
const STYLE_BY_DOMAIN = Object.freeze([["valor", "protector"], ["dread", "caster"], ["arcana", "caster"], ["codex", "caster"], ["midnight", "skirmisher"], ["blade", "frontline"], ["sage", "ranged"], ["bone", "skirmisher"], ["splendor", "caster"]]);

/** Ranges that keep their distance (Far, Very Far), and those that close in (Melee, Very Close). Close is neither. */
const FAR = new Set(["far", "veryFar"]);
const NEAR = new Set(["melee", "veryClose"]);

/**
 * What each kind of adversary does, by the SRD's account of its type:
 *  - a Bruiser, a Horde, a Minion: the front line, at whoever is nearest;
 *  - a Leader commands and summons others: it goes for the most dangerous, and runs for help;
 *  - a Ranged one is fragile up close: it shoots, at the casters first;
 *  - a Skulk maneuvers and ambushes: it flanks the weakest, and slips away when hurt;
 *  - a Social one would rather talk, and is no fighter: it talks first, and gets out when hurt;
 *  - a Solo is a fight on its own: the front line, the most dangerous, never giving up;
 *  - a Support enhances its friends and hinders its foes: it casts, and goes for whoever threatens its friends.
 * A Standard one is the rank and file: its type says nothing more.
 */
const TYPE_TACTICS = Object.freeze({
  bruiser: { style: "frontline", target: "nearest" },
  horde: { style: "frontline", target: "nearest" },
  minion: { style: "frontline", target: "nearest" },
  leader: { target: "dangerous", beyond: "seekHelp" },
  ranged: { style: "ranged", target: "casters" },
  skulk: { style: "skirmisher", target: "weakest", retreat: "hurt" },
  social: { talk: "first", retreat: "hurt" },
  solo: { style: "frontline", target: "dangerous", retreat: "never" },
  support: { style: "caster", target: "protect" }
});

/** Subclasses that are their class's healer (by traits.js subclassKey): what they heal with, they heal eagerly. */
const HEALER_SUBCLASSES = new Set(["warden-of-renewal"]);

/** Subclasses that make more of a consumable (by traits.js subclassKey: a Hedge witch's Herbal Remedies clears one more). */
const CONSUMABLE_SUBCLASSES = new Set(["hedge"]);

/** When a potion is drunk (tactics' potionThreshold), most Hit Points left first: drunk below that share of them. */
const POTION_AT = Object.freeze(["75", "50", "25"]);

/** Adversary types whose features are the whole of them (a Solo's, a Leader's): they reach for them first. */
const FEATURED = new Set(["solo", "leader"]);

/** A character's tier, by its level (1; 2 to 4; 5 to 7; 8 to 10). */
export const tierOf = level => Math.max(1, Math.min(4, Math.floor(((Number(level) || 1) + 1) / 3) + 1));

/**
 * Daggerheart's own answers to the tactics questions, and what it offers and expects to end an argument, wherever its
 * data says something (the core reads the rest from the hidden scores): {key: {value, why}} (why: the reason the GM
 * sees, the system's own name for what decided it). Where two things on its sheet answer the same question, the first
 * said stands: the surer word is said first.
 *
 * A player character (its build, leaving room for its player):
 *  - preferredAction: its primary weapon (the secondary is its off hand);
 *  - style: its class's domains (STYLE_BY_DOMAIN); a front-line or skirmishing class with a Far or Very Far primary
 *    weapon fights at range, a Sage class (a Ranger) with a Melee or Very Close one at the front;
 *  - target: a protector (Valor) goes for whoever threatens its friends;
 *  - retreat: a protector (Valor) doesn't leave its friends while the fight can be won;
 *  - shield (how freely it marks Armor Slots), with Armor Slots to mark: a feature or card built on marking them (more
 *    marked at once, more slots for good) or a Valor class, against any hit; anyone else, against Major or worse;
 *  - healAggro, with a feature or card that clears others' Hit Points: eagerly for a Splendor class or a healer
 *    subclass, else as the fight allows; allyDying: a Valor class, or one that heals others, goes to a friend who falls;
 *  - selfRevived: a Valor class gets back up and back in; talk: a Grace class talks when it could work;
 *  - specialty: a caster (by its domains) with a spell or grimoire it attacks with leans on them hard; anyone with a
 *    feature or card it attacks with, some;
 *  - potionThreshold: with a potion (a consumable that clears its own Hit Points), it drinks once it has marked as many
 *    as its best one clears, so none of it goes to waste;
 *  - consumables: a subclass that makes more of them (a Hedge witch's) uses them freely;
 *  - offer and expect: a Highborne character buys its way out with a handful of gold (if it has one); a Slyborne one
 *    wants paying, a handful a tier.
 * An adversary:
 *  - its standard attack: a front-line type's that reaches Far shoots, and a Leader's, Social's or Standard one's
 *    closes in (Melee, Very Close) or shoots (Far, Very Far); then its type (TYPE_TACTICS) for the rest;
 *  - healAggro, with an action feature that clears others' Hit Points: eagerly for a Support, else as the fight allows;
 *  - beyond: an action feature that summons others calls them (runs for help);
 *  - specialty: with action features it attacks with, a Solo or a Leader leans on them hard, anyone else some;
 *  - offer: a Social one with gold to its name buys its way out with a handful.
 * Its motives and tactics, and anyone's Experiences, are words: they're left to the core's keywords. How freely it spends
 * Hope or Stress (resourceUse) its sheet doesn't say: every class's Hope feature costs three, which the rules keep back
 * already. Nothing for an environment.
 *
 * @param {object} d
 * @param {boolean} [d.pc]
 * @param {boolean} [d.talks]   it has words (offer and expect only then)
 * @param {{money: number, handful: number, tier: number}} [d.purse]   its gold (in the smallest coin), a handful's
 *        worth in it, its tier
 * A character's:
 * @param {string[]} [d.domains]   its class's
 * @param {string} [d.subclass]    its subclass's key (traits.js subclassKey)
 * @param {{name: string, range: string, action?: string}|null} [d.weapon]   its primary weapon (action: its attack's
 *        id, as its CombatantSpec has it)
 * @param {{name: string, heals: number}[]} [d.potions]   its own drinks: what each clears on average
 * @param {number} [d.hpMax]       its Hit Points
 * @param {number} [d.armor]       its Armor Slots
 * @param {string[]} [d.armorBuilders]   features and loadout cards built on marking Armor Slots (names)
 * @param {string[]} [d.healers]   features and loadout cards that clear others' Hit Points (names)
 * @param {{name: string, spell: boolean}[]} [d.specialties]   features and loadout cards it attacks with (a spell or
 *        grimoire, or not)
 * @param {{key: string, name: string}|null} [d.community]   its lore reference (traits.js loreKey) and name
 * An adversary's:
 * @param {string} [d.type]
 * @param {{name: string, range: string}|null} [d.attack]   its standard attack
 * @param {string[]} [d.healers]   @param {string[]} [d.summons]   @param {string[]} [d.specialties]   its action
 *        features that clear others' Hit Points, that summon, that attack (names)
 * @param {object} [d.names]   the words shown: {domains: {valor ...}, armor (Armor Slots), subclass, type}
 * @returns {Record<string, {value: string|object, why: string}>}
 */
export function daggerheartTactics(d = {}) {
  const out = {};
  const say = (key, value, why) => { if ( !(key in out) && value !== undefined && why ) out[key] = { value, why: String(why) }; };
  if ( d.pc ) characterTactics(d, say);
  else if ( d.type ) adversaryTactics(d, say);
  return out;
}

/** So many handfuls of gold, as the survey stores an amount. */
const handfuls = (n, purse) => ({ kind: "money", amount: n, coin: purse.handful });

function characterTactics(d, say) {
  const names = d.names ?? {};
  const domains = d.domains ?? [];
  const domain = k => names.domains?.[k] ?? k;
  const valor = domains.includes("valor");

  // Its primary weapon, its everyday attack; its fighting style: its class's domains, and a martial class's primary
  // weapon says whether it keeps its distance.
  if ( d.weapon?.action ) say("preferredAction", d.weapon.action, d.weapon.name);
  const [key, style] = STYLE_BY_DOMAIN.find(([k]) => domains.includes(k)) ?? [];
  const range = d.weapon?.range;
  if ( ["frontline", "skirmisher"].includes(style) && FAR.has(range) ) say("style", "ranged", d.weapon.name);
  else if ( style === "ranged" && NEAR.has(range) ) say("style", "frontline", d.weapon.name);
  else if ( style ) say("style", style, domain(key));
  if ( style === "protector" ) say("target", "protect", domain(key));
  // (A protector stays with its friends while the fight can be won.)
  if ( valor ) say("retreat", "losing", domain("valor"));

  // Its Armor Slots: built to mark them, or Valor, against any hit; else against Major or worse.
  if ( Number(d.armor) > 0 ) {
    const builder = d.armorBuilders?.[0];
    if ( builder ) say("shield", "always", builder);
    else if ( valor ) say("shield", "always", domain("valor"));
    else say("shield", "spare", names.armor);
  }

  // Healing others, and a friend who falls.
  const healer = d.healers?.[0];
  if ( healer ) say("healAggro", domains.includes("splendor") || HEALER_SUBCLASSES.has(d.subclass) ? "aggressive" : "balanced", healer);
  if ( valor ) say("allyDying", "rescue", domain("valor"));
  else if ( healer ) say("allyDying", "rescue", healer);
  if ( valor ) say("selfRevived", "rejoin", domain("valor"));
  if ( domains.includes("grace") ) say("talk", "opportune", domain("grace"));

  // Its specialties: its spells and grimoires, for a caster; any feature or card it attacks with, some.
  const spell = (d.specialties ?? []).find(s => s.spell);
  if ( style === "caster" && spell ) say("specialty", "strong", spell.name);
  else if ( d.specialties?.length ) say("specialty", "some", d.specialties[0].name);

  // Its potions: drunk once it has marked as many Hit Points as its best one clears (none of it wasted), and with a
  // quarter of them left at the latest. (Drunk below a share of them: with that share rounded up, less one, at most.)
  const potion = [...(d.potions ?? [])].sort((a, b) => b.heals - a.heals)[0];
  const hp = Number(d.hpMax);
  if ( potion && hp > 0 ) {
    const unwasted = at => hp - (Math.ceil((Number(at) / 100) * hp) - 1) >= potion.heals;
    say("potionThreshold", POTION_AT.find(unwasted) ?? POTION_AT.at(-1), potion.name);
  }
  // Consumables made more of: used freely.
  if ( CONSUMABLE_SUBCLASSES.has(d.subclass) ) say("consumables", "freely", names.subclass);

  // What its community brings to a standoff.
  const purse = d.purse ?? {};
  if ( d.talks === false || !(purse.handful > 0) ) return;
  if ( d.community?.key === "highborne" && purse.money >= purse.handful ) say("offer", handfuls(1, purse), d.community.name);
  if ( d.community?.key === "slyborne" ) say("expect", handfuls(Math.max(1, Number(purse.tier) || 1), purse), d.community.name);
}

function adversaryTactics(d, say) {
  const names = d.names ?? {};
  const kind = names.type ?? d.type;
  const plan = TYPE_TACTICS[d.type] ?? {};

  // Its standard attack: one that reaches Far shoots; a rank-and-file one (or a Leader's, a Social's) closes in or shoots.
  // (What it fights with is surer than its type: said first.)
  const range = d.attack?.range;
  if ( FAR.has(range) && (plan.style === "frontline" || !plan.style) ) say("style", "ranged", d.attack.name);
  else if ( NEAR.has(range) && !plan.style ) say("style", "frontline", d.attack.name);

  // What its features do: mend its friends, call others in, strike.
  const healer = d.healers?.[0];
  if ( healer ) say("healAggro", d.type === "support" ? "aggressive" : "balanced", healer);
  const summon = d.summons?.[0];
  if ( summon ) say("beyond", "seekHelp", summon);
  const special = d.specialties?.[0];
  if ( special ) say("specialty", FEATURED.has(d.type) ? "strong" : "some", special);

  // Its type, for the rest.
  for ( const [k, v] of Object.entries(plan) ) say(k, v, kind);

  // A Social one with gold buys its way out.
  const purse = d.purse ?? {};
  if ( d.type === "social" && d.talks !== false && purse.handful > 0 && purse.money >= purse.handful ) say("offer", handfuls(1, purse), kind);
}

/** Text from the sheet's HTML: the class's own questions (in bold) left out, so only what was written counts. */
export function plainText(html) {
  return String(html ?? "")
    .replace(/<strong[^>]*>[\s\S]*?<\/strong>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ").trim();
}

/**
 * Its biography as the core reads it (adapter-base biography()): what's said of it, its story, what it's against.
 *  - A character: its faith and its Experiences (what it's made of, in its own words) are about it; its background (its
 *    answers to its class's questions, the questions left out) is its story. Its connections are about the others in
 *    its party, so they're left out. Nothing it's against: the sheet keeps no dislikes.
 *  - An adversary or an environment: its description, its motives and tactics (an environment's impulses) and its
 *    Experiences are about it; the GM's notes are its story.
 * @returns {{about: string, story: string, against: string}}
 */
export function biographyOf({ pc = false, bio = null, description = "", motives = "", notes = "", experiences = {} } = {}) {
  // (One text, each part its own sentence, so a negation in one doesn't reach into the next.)
  const join = parts => parts.map(s => String(s ?? "").trim()).filter(Boolean).reduce((all, s) => (!all ? s : /[.!?…]$/u.test(all) ? `${all} ${s}` : `${all}. ${s}`), "");
  const known = Object.values(experiences ?? {}).flatMap(e => [e?.name, plainText(e?.description)]);
  if ( pc ) return { about: join([bio?.characteristics?.faith, ...known]), story: plainText(bio?.background), against: "" };
  return { about: join([plainText(description), motives, ...known]), story: plainText(notes), against: "" };
}
