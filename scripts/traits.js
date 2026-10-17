/**
 * Daggerheart personality defaults. Every number here is a starting point the GM can fudge.
 * Inputs are plain values so this stays testable without Foundry.
 *
 * A player character starts as the usual hero (the core's PC_BASELINE) and everything on its sheet moves it a little,
 * each part shown in the trait's reason:
 *  - its six traits, against the spread its class suggests (one who spread them as its class's guide does moves
 *    nothing; a wizard who put its best in Strength is bolder and less of a planner): Knowledge and Instinct make a
 *    planner, Strength, Presence and Agility a bold one, Finesse a self-serving one, Presence a loyal one;
 *  - its level (experience makes a planner);
 *  - its domains, its class's and its domain cards' (Valor bold and loyal, Blade bold, Bone and Codex tactical, Midnight
 *    self-serving and secretive, Splendor selfless, Grace warm, Sage giving, Arcana impulsive, Dread ruthless);
 *  - its subclass (more, the deeper it's gone into it), ancestry and community, known by the system's own ids (the
 *    compendium a subclass came from, an ancestry's or community's lore reference), the name only as a fallback;
 *  - its features and the domain cards in its loadout, by what their actions do (help aimed at its allies, mending
 *    others, paying in its own blood, taking its foes' Hope, calling help, a Rally die for its friends);
 *  - its scars and its Stress slots, and whether it's in the party.
 * An adversary is read from its type (a Solo bold, a Skulk cunning, a Minion faint-hearted ...) and its tier (the
 * higher, the bolder); motives like feeding and hunting mark a beast, which fights on instinct and can't be talked to.
 * Then its features, by what they do, and the damage it's immune to or resists.
 * A companion is bonded to its partner (loyal, on instinct); an NPC is no fighter (timid); each then by its features.
 */
import { clamp, traitsFromParts, partsOf, signedNumber, PC_BASELINE } from "./core.js";
import { t } from "./words.js";

/** A character's six traits. */
export const DH_TRAITS = Object.freeze(["agility", "strength", "finesse", "instinct", "presence", "knowledge"]);

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

/**
 * A companion: an animal bonded to its partner, going on instinct, at its side whatever comes. An NPC: someone the story
 * needs, not a fighter.
 */
const COMPANION = Object.freeze({ tactical: 35, brave: 55, selfish: 25, loyal: 85 });
const BYSTANDER = Object.freeze({ tactical: 50, brave: 30, selfish: 50, loyal: 50 });

/** Motives that make a beast of it: it feeds, hunts, burrows; it doesn't bargain. */
const BEAST = /\b(?:feed|feeding|hunt|hunting|prey|devour|burrow|graze|nest|swarm|consume|eat)\b/i;

/**
 * Motives that show a mind behind the hunger: it talks, schemes, tempts, obeys, rules (a vampire feeds, a siren lures,
 * a demon of avarice consumes: none of them is a beast).
 */
const MIND = /\b(?:charm|charms|deceive|lie|lies|trick|manipulate|seduce|bargain|negotiate|persuade|command|scheme|plot|rule|preach|curse|enslave|corrupt|tempt|recruit|interrogate|blackmail|bribe|lure|mock|taunt|speak|talk|bewitch|beguile|convert|torment|worship|obey|intimidate|dissent|entice|misdirect|sacrifices?|ranks|greed|exchange|information)\b/i;

/** Adversary types that are never a mere beast: those who talk, lead or support others. */
const MINDED_TYPES = new Set(["social", "leader", "support"]);

/** Does an adversary's motives (and tactics) say it's a beast? Its type too: a social, leader or support adversary never is. */
export const isBeast = (motives, type = null) => !MINDED_TYPES.has(type) && BEAST.test(String(motives ?? "")) && !MIND.test(String(motives ?? ""));

/**
 * What each of a character's traits says, for each point it stands above the rest of its spread (and below, the other
 * way). Knowledge (recall, analyze) and Instinct (perceive, navigate) make a planner; Strength, Presence and Agility a
 * bold one; Finesse (hide, sleight of hand) a self-serving one; Presence (charm, bonds) a loyal one.
 */
const TRAIT_LEANS = Object.freeze({
  agility: { brave: 1 },
  strength: { brave: 2.5 },
  finesse: { selfish: 2 },
  instinct: { tactical: 2 },
  presence: { brave: 1.5, loyal: 2, selfish: -1 },
  knowledge: { tactical: 3 }
});

/** The level the usual hero has reached; each level above makes it more of a planner, each below less. */
const USUAL_LEVEL = 3;
/** The Stress slots a character starts with; each one more makes it bolder. */
const USUAL_STRESS = 6;

/**
 * What each domain leans toward, at full weight (a class's two domains count half each, and its domain cards half
 * between them, as many of each as it holds). Balanced so the SRD's classes, taken together, sit near the usual hero.
 */
const DOMAIN_LEANS = Object.freeze({
  valor: { brave: 3, loyal: 4, selfish: -2 },
  blade: { brave: 2, tactical: -2 },
  bone: { tactical: 5 },
  codex: { tactical: 6, brave: -2 },
  midnight: { selfish: 5, loyal: -3, brave: -2, tactical: 1 },
  splendor: { selfish: -6, loyal: 2 },
  grace: { loyal: 2, selfish: -1 },
  sage: { selfish: -2, tactical: 1 },
  arcana: { brave: 1, tactical: -3 },
  dread: { brave: 2, selfish: 4, loyal: -2 }
});

/** The SRD's subclasses, by the id of the system's compendium entry they came from. */
const SUBCLASS_IDS = Object.freeze({
  NAFU9roaVG7f3RNJ: "call-of-the-brave", bcNe5qP3o6CKadhK: "call-of-the-slayer", rKRxFBlkbh9cDK8K: "stalwart",
  SUo8NPBPO8aN193u: "vengeance", qqQlgCqhOivUFoQn: "school-of-knowledge", "4y9Ph7RsCIAbkwTk": "school-of-war",
  M5mpGoAj8LRkylrY: "divine-wielder", y7ERWRIpJsdP9Re4: "winged-sentinel", TIUsIlTS1WkK5vr2: "beastbound",
  zsUglcU4NgZ8tNgZ: "wayfinder", "95QxNZwgyEm1LqdG": "syndicate", h161OSIK24Up4qNd: "nightwalker",
  ld8MIvk0xVJydSBz: "troubadour", XTSODVM8st75Os8M: "wordsmith", xp0XMjYT85Q7E90o: "warden-of-renewal",
  W9hs5kxOWeY7eA4Q: "warden-of-the-elements", GLpRVxnY5E82khxH: "primal-origin", wg1H0hROc2acHwZh: "elemental-origin",
  yA10Wf90HYb0DTbK: "pact-of-the-endless", TsJSGjecybUfKfpP: "pact-of-the-wrathful", "7dU2iosTyQaig0Sc": "hedge",
  icIkkMKmVmq1WgRz: "moon", "4x8jiolc2hhs41dt": "poisoners-guild", F8uUCjTnvw57oNuQ: "executioners-guild",
  "9zyjac09CXquXQSo": "juggernaut", QdoKFfErTEgx6326: "martial-artist"
});

/** What a subclass leans toward (its foundation; more as it goes deeper), by its key (SUBCLASS_IDS, or its name). */
const SUBCLASS_LEANS = Object.freeze({
  "call-of-the-brave": { brave: 5 }, "call-of-the-slayer": { brave: 2, tactical: 1 }, stalwart: { brave: 2, loyal: 3 },
  vengeance: { loyal: 2, brave: 2, tactical: -1 }, "school-of-knowledge": { tactical: 5, brave: -1 }, "school-of-war": { brave: 2, tactical: 1 },
  "divine-wielder": { selfish: -3, loyal: 2 }, "winged-sentinel": { brave: 2 }, beastbound: { loyal: 4 }, wayfinder: { brave: 1, tactical: 2 },
  syndicate: { selfish: 3, tactical: 1 }, nightwalker: { selfish: 2, loyal: -2, brave: -1 }, troubadour: { loyal: 2, selfish: -2 },
  wordsmith: { loyal: 2, brave: 1 }, "warden-of-renewal": { selfish: -4, loyal: 1 }, "warden-of-the-elements": { brave: 2, tactical: -1 },
  "primal-origin": { tactical: 1 }, "pact-of-the-endless": { brave: 1, loyal: 1 }, "pact-of-the-wrathful": { brave: 1, selfish: 2, tactical: -1 },
  hedge: { selfish: -2, tactical: 1 }, moon: { selfish: 1 }, "poisoners-guild": { tactical: 3, selfish: 2 },
  "executioners-guild": { tactical: 2, selfish: 2, brave: 1 }, juggernaut: { brave: 3, tactical: -2 }, "martial-artist": { tactical: 3, brave: 1 }
});

/** What an ancestry leans toward, only where its own features say so (an infernis's fearlessness, a galapa's shell). */
const ANCESTRY_LEANS = Object.freeze({
  infernis: { brave: 4 }, orc: { brave: 3 }, firbolg: { brave: 3 }, dwarf: { brave: 2 }, giant: { brave: 2 }, earthkin: { brave: 2 },
  galapa: { brave: -2, tactical: 2 }, goblin: { tactical: 2 }, aetheris: { loyal: 2 }
});

/** The outlook a community raises its own with, by its lore reference. */
const COMMUNITY_LEANS = Object.freeze({
  highborne: { selfish: 4 }, loreborne: { tactical: 4 }, orderborne: { loyal: 5, selfish: -2 }, ridgeborne: { brave: 3 },
  seaborne: { brave: 2, loyal: 2 }, slyborne: { selfish: 5, loyal: -2 }, underborne: { tactical: 2 }, wanderborne: { brave: 2, tactical: 1 },
  wildborne: { selfish: -2, tactical: 1 }, duneborne: { loyal: 2, selfish: -2 }, freeborne: { brave: 3 }, frostborne: { brave: 3 },
  hearthborne: { loyal: 4, selfish: -2 }, reborne: { loyal: 3 }, warborne: { brave: 4, tactical: 1 }
});

/** A name as a slug ("Call Of The Brave": "call-of-the-brave"): how an item with no id of its own is known, as a fallback. */
export const slugOf = name => String(name ?? "").toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "")
  .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** A subclass's key: the system's compendium entry it came from ("Compendium.daggerheart.subclasses.Item.<id>"), else its name. */
export const subclassKey = ({ source, name } = {}) => SUBCLASS_IDS[String(source ?? "").split(".").pop()] ?? slugOf(name);

/** An ancestry's or community's key: its lore reference, else its name. */
export const loreKey = ({ ref, name } = {}) => (ref ? String(ref) : slugOf(name));

/** Resources a healing action can give back (not the GM's Fear, nor a card's own tokens). */
const MENDED = new Set(["hitPoints", "stress", "hope", "armor"]);
const resourcesOf = a => Object.entries(a?.damage?.resources ?? {}).map(([k, r]) => r?.applyTo ?? k);

/**
 * What a feature or domain card says of who has it, read from what its actions and effects do:
 *  - an action aimed at its allies (I Am Your Shield, Lean on Me): a more loyal, less selfish one;
 *  - else healing that reaches past itself (Healing Hands, at Melee range): a less selfish one;
 *  - striking at a cost in its own Hit Points: a bolder one; striking at its foes' Hope (Terrifying): a fearsome one;
 *  - calling help when it acts (a summons, not a reaction): a planner;
 *  - an effect on its Rally die: a more loyal one.
 * @param {{form?: string, actions?: object[], changes?: string[]}} item   its form (action, reaction, passive), its
 *        actions (plain data) and its effects' change keys
 * @returns {{tactical?: number, brave?: number, selfish?: number, loyal?: number}}
 */
export function featureLeans({ form = null, actions = [], changes = [] } = {}) {
  const out = {};
  const add = (k, n) => { out[k] = (out[k] ?? 0) + n; };
  const list = [...(actions ?? [])].filter(a => a && typeof a === "object");
  const reachesOthers = a => a.target?.type === "any" && !["", "self"].includes(String(a.range ?? ""));
  if ( list.some(a => a.target?.type === "friendly") ) { add("loyal", 2); add("selfish", -1); }
  else if ( list.some(a => a.type === "healing" && reachesOthers(a) && resourcesOf(a).some(k => MENDED.has(k))) ) add("selfish", -1);
  const strikes = list.filter(a => ["attack", "damage"].includes(a.type));
  if ( strikes.some(a => [...(a.cost ?? [])].some(c => c?.key === "hitPoints")) ) add("brave", 2);
  if ( strikes.some(a => resourcesOf(a).includes("hope") || a.damage?.main?.applyTo === "hope") ) add("brave", 2);
  if ( form !== "reaction" && list.some(a => a.type === "summon") ) add("tactical", 2);
  if ( (changes ?? []).some(k => /(?:^|\.)bonuses\.rally$/.test(String(k))) ) add("loyal", 2);
  return out;
}

/**
 * Its traits against the rest of its spread: against what its class suggests (each trait's lead or lag on its class's
 * guide, past what it gained on all of them), or without a guide, against its own average. A sheet not filled in yet
 * (every trait 0) says nothing.
 */
function traitParts(d, names) {
  const value = k => Number(d.traits?.[k]) || 0;
  if ( DH_TRAITS.every(k => value(k) === 0) ) return [];
  const usual = d.usual && DH_TRAITS.some(k => Number(d.usual[k])) ? d.usual : null;
  const lead = DH_TRAITS.map(k => value(k) - (usual ? Number(usual[k]) || 0 : 0));
  const mean = lead.reduce((s, x) => s + x, 0) / lead.length;
  const parts = [];
  DH_TRAITS.forEach((k, i) => {
    const off = lead[i] - mean;
    if ( !off ) return;
    const name = names.traits?.[k] ?? k;
    const why = usual
      ? t("Reason.TraitFor", { name, n: signedNumber(value(k)), cls: names.cls ?? "", usual: signedNumber(Number(usual[k]) || 0) })
      : t("Reason.Ability", { name, n: signedNumber(value(k)) });
    parts.push(...partsOf(TRAIT_LEANS[k], why, off));
  });
  return parts;
}

/** Its domains: its class's two at half weight (a multiclass's at a quarter), and half again shared by its domain cards. */
function domainParts(d, names) {
  const weight = {};
  const add = (k, n) => { if ( k ) weight[k] = (weight[k] ?? 0) + n; };
  for ( const k of new Set(d.domains ?? []) ) add(k, 0.5);
  for ( const k of new Set(d.multiclassDomains ?? []) ) add(k, 0.25);
  const cards = (d.cards ?? []).filter(c => c?.domain);
  for ( const c of cards ) add(c.domain, 0.5 / cards.length);
  return Object.entries(weight).flatMap(([k, w]) => partsOf(DOMAIN_LEANS[k], names.domains?.[k] ?? k, w));
}

/**
 * A player character's parts: everything on its sheet that moves it from the usual hero.
 * @param {object} d   see deriveDaggerheartTraits
 */
export function pcParts(d) {
  const names = d.names ?? {};
  const parts = [];
  const add = (trait, n, why) => parts.push({ trait, n, why });

  // Its spread of traits, and its experience.
  parts.push(...traitParts(d, names));
  const level = Number(d.level) || 1;
  add("tactical", level - USUAL_LEVEL, t("Reason.Ability", { name: names.level ?? "", n: level }));

  // Its class's domains and its domain cards; its subclass, the deeper the more; its ancestry and community.
  parts.push(...domainParts(d, names));
  const depth = s => clamp(1 + 0.25 * ((Number(s?.state) || 1) - 1), 1, 1.5);
  if ( d.subclass ) parts.push(...partsOf(SUBCLASS_LEANS[subclassKey(d.subclass)], d.subclass.name, depth(d.subclass)));
  if ( d.multiclassSubclass ) parts.push(...partsOf(SUBCLASS_LEANS[subclassKey(d.multiclassSubclass)], d.multiclassSubclass.name, 0.5 * depth(d.multiclassSubclass)));
  if ( d.ancestry ) parts.push(...partsOf(ANCESTRY_LEANS[loreKey(d.ancestry)], d.ancestry.name));
  if ( d.community ) parts.push(...partsOf(COMMUNITY_LEANS[loreKey(d.community)], d.community.name));

  // What its features and loadout cards do.
  for ( const item of d.items ?? [] ) parts.push(...partsOf(featureLeans(item), item.name));

  // What it's been through: scars (each a Hope slot lost) dim its nerve; Stress slots it took on steady it.
  const scars = Math.max(0, Number(d.scars) || 0);
  if ( scars ) add("brave", -3 * Math.min(3, scars), t("Reason.Ability", { name: names.scars ?? "", n: scars }));
  const stress = Number(d.stressMax);
  if ( stress > 0 ) add("brave", clamp((stress - USUAL_STRESS) * 1.5, -6, 6), t("Reason.Ability", { name: names.stress ?? "", n: stress }));

  // Its friends: one who isn't in the world's party is less bound to the others.
  if ( d.inParty === false ) add("loyal", -10, t("Reason.NoParty"));
  return parts;
}

/**
 * An adversary's parts, on top of its type and tier: its features by what they do, and the damage it needn't fear
 * (immune to a kind: bolder; resistant: a little).
 * @param {object} d   see deriveDaggerheartTraits
 */
export function adversaryParts(d) {
  const names = d.names ?? {};
  const parts = [];
  for ( const item of d.items ?? [] ) parts.push(...partsOf(featureLeans(item), item.name));
  for ( const kind of ["physical", "magical"] ) {
    const r = d.resistance?.[kind] ?? {};
    if ( r.immunity ) parts.push({ trait: "brave", n: 4, why: names.harm?.[`${kind}Immunity`] ?? kind });
    else if ( r.resistance ) parts.push({ trait: "brave", n: 2, why: names.harm?.[`${kind}Resistance`] ?? kind });
  }
  return parts;
}

/**
 * @param {object} d
 * @param {boolean} d.pc
 * A player character's:
 * @param {Record<string, number>} [d.traits]   agility, strength, finesse, instinct, presence, knowledge
 * @param {Record<string, number>} [d.usual]    the spread its class suggests (the class's character guide)
 * @param {number} [d.level]  @param {number} [d.stressMax]  @param {number} [d.scars]
 * @param {boolean} [d.inParty]   undefined when the world has no party
 * @param {string[]} [d.domains]  its class's  @param {string[]} [d.multiclassDomains]
 * @param {{domain: string}[]} [d.cards]   its domain cards (loadout and vault)
 * @param {{source?: string, name: string, state?: number}} [d.subclass]   and d.multiclassSubclass: the compendium entry
 *        it came from, its name, how deep it's gone (1 foundation, 2 specialization, 3 mastery)
 * @param {{ref?: string, name: string}} [d.ancestry]   and d.community: its lore reference and name
 * @param {{name: string, form?: string, actions: object[], changes: string[]}[]} [d.items]   its features and the domain
 *        cards in its loadout (an adversary's features), with what they do
 * @param {object} [d.names]   the words shown: {traits: {agility ...}, cls, level, stress, scars, domains: {valor ...}}
 * An adversary's:
 * @param {string} [d.type]     its type (standard, solo ...)
 * @param {number} [d.tier]     1 to 4
 * @param {string} [d.motives]  its motives and tactics
 * @param {object} [d.resistance]   {physical: {resistance, immunity}, magical: {...}}
 *        (d.names: {type, harm: {physicalImmunity, physicalResistance, magicalImmunity, magicalResistance}})
 * A companion's (d.companion) or an NPC's (d.npc): its features (d.items), and d.names: {kind (the system's word for
 * it), partner (a companion's partner's name)}.
 * @returns {{traits, flags, reasons}}
 */
export function deriveDaggerheartTraits(d = {}) {
  const flags = {};
  if ( d.pc ) {
    const built = traitsFromParts(PC_BASELINE, pcParts(d), { from: t("Reason.Pc") });
    return { traits: built.traits, flags, reasons: built.reasons };
  }
  if ( d.companion || d.npc ) {
    const kind = d.names?.kind ?? "";
    const partner = d.companion && d.names?.partner ? t("Reason.Partner", { name: d.names.partner }) : kind;
    const built = traitsFromParts(d.companion ? COMPANION : BYSTANDER, adversaryParts(d), { from: { tactical: kind, brave: kind, selfish: kind, loyal: partner }, min: 0, max: 100 });
    return { traits: built.traits, flags, reasons: built.reasons };
  }
  const type = d.type ?? "standard";
  const tier = Number(d.tier) || 1;
  const base = TYPES[type] ?? TYPES.standard;
  const beast = isBeast(d.motives, type);
  const start = { ...base, brave: clamp(base.brave + 5 * (tier - 1), 5, 100), tactical: clamp(base.tactical - (beast ? 15 : 0), 5, 100) };
  const kind = d.names?.type ?? type;
  const from = { tactical: beast ? t("Reason.Beast", { kind }) : kind, brave: t("Reason.Tier", { kind, tier }), selfish: kind, loyal: kind };
  if ( beast ) flags.beast = true;
  if ( type === "solo" ) flags.fearless = true;
  const built = traitsFromParts(start, adversaryParts(d), { from, min: 0, max: 100 });
  return { traits: built.traits, flags, reasons: built.reasons };
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
