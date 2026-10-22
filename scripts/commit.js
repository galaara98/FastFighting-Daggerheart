/**
 * Daggerheart's live battles, written back: one turn's changes onto a token's actor, returning an undo record.
 * A character: Hit Points and Stress marked, Hope, Armor Slots marked (on its armor), and how it ended up (out cold from
 * Avoid Death, a scar; dead). An adversary: Hit Points and Stress marked, and defeated (dead) or gone. A companion: its
 * Stress marked (what it took), and defeated as the world says. An NPC: how it ended up (it marks nothing). Any of them:
 * the conditions it gained or lost (Vulnerable, Hidden, Restrained), as the system's statuses. The GM's Fear
 * (the world's), by as much as the turn moved it. Consumables used come off what it carries; gold or an item it gave up
 * (a deal, a demand, a theft) goes to whoever it went to. A damage card (a player's, or one the system rolled in a turn
 * FastFighting plays), applied through the system's own damage handling. And what a fight changes, in words, for the
 * planner.
 *
 * Undo record shape (consumed by the core, to rewind a turn or the whole encounter):
 *   { tokenUuid, actorUuid, actorUpdate, itemUpdates: [{id, update}], createdItems, deletedItems, createdEffects,
 *     deletedEffects, tokenUpdate, createdActors, createdTokens, deletedTokens, statuses: [{id, active}], statusesBefore,
 *     combatant, setting }
 */
import { STATUS, commonOutcome, statusesOf, statusEntry, toggleStatus, undoRecord, handOverItem } from "./core.js";
import { FEAR_MAX } from "./rules.js";
import { CONDITION_KEYS } from "./actions.js";
import { t, systemWord, resourceWord, deathMoveName } from "./words.js";

const SYSTEM = "daggerheart";

/** Hit Points marked, from the Hit Points it had left. */
const hpMarked = (spec, left) => Math.max(0, Math.min(spec.hp.max, spec.hp.max - Math.max(0, left)));
/**
 * Where the harm it took is marked on its sheet: its Hit Points; a companion's Stress (any damage marks one); nowhere
 * for an NPC (its sheet has neither).
 */
const harmTrack = spec => (spec.actorType === "companion" ? "stress" : spec.actorType === "npc" ? null : "hitPoints");
/** Stress marked, from the Stress it had left. */
const stressMarked = (spec, left) => Math.max(0, (spec.stressMax ?? 0) - Math.max(0, left));

/**
 * Human-readable list of what the fight changes, for the planner's summary of it. How it ended up is in the core's words
 * (commonOutcome: dead, gone, surrendered, stood down; tied up, a change of side), with Daggerheart's own around them:
 * a death move, out cold, a scar; defeated.
 */
export function describeDaggerheartOutcome(spec, final) {
  const lines = [];
  const s = final.system ?? {};
  const common = commonOutcome(spec, final, { hp: false });
  const track = harmTrack(spec);
  const hpBefore = hpMarked(spec, spec.hp.value);
  const hpAfter = hpMarked(spec, final.hp);
  if ( track && hpAfter !== hpBefore ) {
    const stress = track === "stress";
    lines.push(t(stress ? "Out.Stress" : "Out.HitPoints", { name: resourceWord(stress ? "stress" : "hp"), from: hpBefore, to: hpAfter, max: spec.hp.max }));
  }
  if ( Number.isFinite(s.stress) ) {
    const before = stressMarked(spec, spec.resources?.stress ?? 0);
    const after = stressMarked(spec, s.stress);
    if ( after !== before ) lines.push(t("Out.Stress", { name: resourceWord("stress"), from: before, to: after, max: spec.stressMax ?? 0 }));
  }
  if ( spec.duality ) {
    if ( Number.isFinite(s.hope) && s.hope !== spec.resources?.hope ) lines.push(t("Out.Hope", { name: resourceWord("hope"), from: spec.resources?.hope ?? 0, to: s.hope }));
    if ( s.armorMarked > 0 ) lines.push(t("Out.Armor", { name: resourceWord("armor"), n: s.armorMarked }));
    for ( const [key, left] of Object.entries(s.items ?? {}) ) {
      const used = (spec.resources?.[key] ?? 0) - left;
      const name = spec.actions?.find(a => a.resource === key)?.name ?? "";
      if ( used > 0 ) lines.push(t("Out.Used", { name, n: used }));
    }
    if ( s.deathMove ) lines.push(t("Out.DeathMove", { move: deathMoveName(s.deathMove) }));
    if ( final.status === STATUS.DOWN ) lines.push(t("Out.Unconscious"));
    lines.push(...common);
    if ( s.scarred ) lines.push(t("Out.Scar"));
    return lines;
  }
  if ( final.status === STATUS.BEATEN ) {
    // (What defeated means is the table's: the world's Defeated automation, when it's on, says which status.)
    const as = beatenStatus(spec.actorType);
    lines.push(as === "defeated" ? t("Out.Defeated") : t("Out.DefeatedAs", { status: statusName(as) }));
  } else if ( final.status === STATUS.DOWN ) lines.push(t("Out.Unconscious"));
  lines.push(...common);
  return lines;
}

/** Daggerheart's statuses for one out of the fight. */
const DEFEAT = ["dead", "defeated", "unconscious", "deathMove"];

/**
 * The status the world's own Defeated automation lays on one whose last Hit Point is marked (its setting: an
 * adversary's, a character's, a companion's), or null with it off.
 */
function worldDefeat(type) {
  try {
    const d = game.settings.get("daggerheart", "Automation")?.defeated;
    if ( !d?.enabled ) return null;
    return (type === "character" ? d.characterDefault : type === "companion" ? d.companionDefault : d.adversaryDefault) || null;
  } catch ( err ) {
    return null;
  }
}

/**
 * A beaten adversary's or companion's status: what the world's Defeated automation says for its kind (the table
 * decides), else defeated (an NPC's, which the automation leaves alone).
 */
function beatenStatus(type = "adversary") {
  const own = type === "npc" ? null : worldDefeat(type);
  return DEFEAT.includes(own) && own !== "deathMove" ? own : "defeated";
}

/** A status's name, as the system calls it. */
function statusName(id) {
  const s = statusEntry(id);
  return s?.name ? game.i18n.localize(s.name) : id;
}

/**
 * One status for how it ended, the one wanted (or none): any other the system laid on by itself when its last Hit
 * Point was marked (its Defeated automation: a death move to make, dead) comes off, the fight having settled it.
 */
async function settleDefeat(actor, want, undo) {
  for ( const id of DEFEAT ) {
    if ( id !== want && statusesOf(actor).has(id) && !undo.statusesBefore.includes(id) ) await toggleStatus(actor, id, false, undo);
  }
  if ( want ) await toggleStatus(actor, want, true, undo, { overlay: want !== "unconscious" });
}

/**
 * The conditions a turn laid or took off (the change set's, by the engine's keys), as the system's statuses
 * (actions.js CONDITION_KEYS), read back by the same table. Restrained is the engine's restrained and immobilized
 * both: on when either is laid; off when either comes off and neither is laid (one that can move again is no longer
 * Restrained). The engine's others the system has no status for: the core keeps them.
 */
async function settleConditions(actor, conditions, undo) {
  const laid = Object.keys(conditions?.set ?? {});
  const lifted = conditions?.cleared ?? [];
  for ( const [status, keys] of Object.entries(CONDITION_KEYS) ) {
    if ( keys.some(k => laid.includes(k)) ) await toggleStatus(actor, status, true, undo);
    else if ( keys.some(k => lifted.includes(k)) ) await toggleStatus(actor, status, false, undo);
  }
}

/**
 * A live battle: one turn's changes (the core's engine/changes.js) written onto a token. Hit Points and Stress marked,
 * Hope, as the turn left them; Armor Slots marked, consumables used and a scar, by what this turn changed
 * (options.before); the conditions laid or taken off (the GM's in the Battle Vantage too); and how it ended up: out
 * cold, dead, defeated, gone.
 * @returns {Promise<object>} an undo record (its shape is at the top of this file)
 */
export async function commitDaggerheartChanges(tokenDoc, spec, changes, final, options = {}) {
  const actor = tokenDoc.actor;
  const undo = undoRecord(tokenDoc, actor);
  const s = final.system ?? {};
  const was = options.before?.system ?? {};
  const update = {};
  const set = (path, value) => {
    const before = foundry.utils.getProperty(actor, path);
    if ( before === value ) return;
    update[path] = value;
    undo.actorUpdate[path] = before ?? 0;
  };
  const track = harmTrack(spec);
  if ( track && changes.hp ) set(`system.resources.${track}.value`, hpMarked(spec, changes.hp.to));
  if ( Number.isFinite(s.stress) && s.stress !== was.stress ) set("system.resources.stress.value", stressMarked(spec, s.stress));
  if ( spec.duality ) {
    if ( Number.isFinite(s.hope) && s.hope !== was.hope ) set("system.resources.hope.value", s.hope);
    if ( s.scarred && !was.scarred ) set("system.scars", (Number(actor.system.scars) || 0) + 1);
    // Consumables used this turn.
    for ( const [key, left] of Object.entries(s.items ?? {}) ) {
      const item = actor.items.get(key.slice("item:".length));
      const used = (was.items?.[key] ?? left) - left;
      if ( !item || !(used > 0) ) continue;
      const before = Number(item.system.quantity) || 0;
      undo.itemUpdates.push({ id: item.id, update: { "system.quantity": before } });
      await item.update({ "system.quantity": Math.max(0, before - used) });
    }
    // Armor Slots marked this turn: on the armor it wears.
    const marked = (s.armorMarked ?? 0) - (was.armorMarked ?? 0);
    const armor = actor.system.armor ?? actor.items.find(i => i.type === "armor" && i.system.equipped);
    if ( armor && marked > 0 ) {
      const before = Number(armor.system.armor?.current) || 0;
      const after = Math.min(Number(armor.system.armor?.max) || 0, before + marked);
      if ( after !== before ) {
        undo.itemUpdates.push({ id: armor.id, update: { "system.armor.current": before } });
        await armor.update({ "system.armor.current": after });
      }
    }
  }
  // (The Hit Points first: the system's own Defeated automation reacts to them, and its status is then settled.)
  if ( Object.keys(update).length ) await actor.update(update);
  // The conditions it gained or lost: Vulnerable, Hidden, Restrained.
  if ( changes.conditions ) await settleConditions(actor, changes.conditions, undo);
  if ( changes.status ) {
    const to = changes.status.to;
    const want = to === STATUS.DEAD ? "dead" : to === STATUS.BEATEN ? beatenStatus(spec.actorType) : to === STATUS.DOWN ? "unconscious" : null;
    if ( want || changes.revived ) await settleDefeat(actor, want, undo);
    if ( !spec.duality && [STATUS.DEAD, STATUS.BEATEN, STATUS.DOWN].includes(to) ) {
      const combatant = game.combat?.getCombatantsByToken?.(tokenDoc)?.[0];
      if ( combatant && !combatant.defeated ) {
        await combatant.update({ defeated: true });
        undo.combatant = { uuid: combatant.uuid, defeated: false };
      }
    } else if ( to === STATUS.FLED && options.fledMode !== "leave" && !spec.duality ) {
      undo.tokenUpdate = { hidden: tokenDoc.hidden };
      await tokenDoc.update({ hidden: true });
    }
  }
  return undo;
}

/**
 * A live turn's change to the GM's Fear (the world's), written by how much it moved: spent on an adversary's feature,
 * or gained from a simulated character's roll with Fear. Returns undo records.
 */
export async function commitFearTurn(before, after) {
  const fearOf = units => Object.values(units ?? {}).find(u => Number.isFinite(u?.system?.fear))?.system.fear;
  const was = fearOf(before);
  const now = fearOf(after);
  if ( !Number.isFinite(was) || !Number.isFinite(now) || was === now ) return [];
  let current = null;
  try {
    current = Number(game.settings.get(SYSTEM, "ResourcesFear"));
  } catch ( err ) {
    return [];
  }
  const fear = Math.max(0, Math.min(FEAR_MAX, (Number.isFinite(current) ? current : was) + now - was));
  await game.settings.set(SYSTEM, "ResourcesFear", fear);
  return [{ ...undoRecord(null, null), setting: { namespace: SYSTEM, key: "ResourcesFear", value: current } }];
}

/** How long the system's writes of a damage card may take to show on the sheet: it sends them without waiting. */
const LANDING_MS = 3000;

/** A card's roll (a Roll, or its JSON) as the system's takeDamage and takeHealing read one: {total, options}, or null. */
function rollData(roll) {
  let data = roll;
  if ( typeof roll === "string" ) {
    try {
      data = JSON.parse(roll);
    } catch ( err ) {
      return null;
    }
  }
  const total = Number(data?.total);
  if ( data == null || !Number.isFinite(total) ) return null;
  const options = data.options ?? {};
  return { total: Math.max(0, total), options: { damageTypes: [...(options.damageTypes ?? [])], fullRestore: !!options.fullRestore, itemId: options.itemId ?? null } };
}

/** A sheet's resources as they stand (Hit Points and Stress marked, Hope): {key: {value, max, reversed}}. */
function resourcesOf(actor) {
  const out = {};
  for ( const [key, r] of Object.entries(actor.system?.resources ?? {}) ) {
    if ( Number.isFinite(Number(r?.value)) ) out[key] = { value: Number(r.value), max: r.max, reversed: !!r.isReversed };
  }
  return out;
}

/** Where one of the system's resource updates leaves a resource (Actor#modifyResource's arithmetic). */
function landsAt(was, u) {
  const value = u.clear ? (was.max && !was.reversed ? was.max : 0) : was.value + Number(u.value);
  return Math.max(Math.min(value, was.max), 0);
}

/**
 * Until the sheet shows what the system wrote ({key: value} of its resources), or LANDING_MS has passed: its
 * modifyResource sends the update without waiting for it, and the core reads the sheet next.
 */
async function landed(actor, expected) {
  const wanted = Object.entries(expected).filter(([, v]) => Number.isFinite(v));
  const done = () => wanted.every(([key, v]) => Number(actor.system?.resources?.[key]?.value) === v);
  for ( let waited = 0; !done() && waited < LANDING_MS; waited += 25 ) await new Promise(resolve => setTimeout(resolve, 25));
}

/**
 * A character's Armor Slots where the system marks them: its armor items, and the armor effects of its own (an item's
 * effect it can't be put back from here).
 */
function armorOf(actor) {
  const items = [...(actor.items ?? [])].filter(i => i.type === "armor").map(i => ({ id: i.id, current: Number(i.system?.armor?.current) || 0 }));
  const effects = [...(actor.effects ?? [])].filter(e => e.system?.armorData && typeof e.toObject === "function").map(e => e.toObject());
  return { items, effects };
}

/**
 * A damage card (or heal) applied to one token through the system's own Actor#takeDamage (resistances, thresholds to
 * Hit Points marked, a character's Armor Slots, its hooks and triggers) or Actor#takeHealing: a player's, a strike's
 * rollStrike rolled, or an action's damage rollDamage rolled (action-card.js). `multiplier` (the GM's Half or Double; a
 * save's share) goes on the Hit Point damage as the system's own Apply puts a save's on it: after the target's
 * damage-taken multiplier (rounded up), before its thresholds, a half left as it comes (9 halved is 4.5, short of a
 * threshold of 5). On a heal, on all it restores (rounded up). The card's own save results aren't read (FastFighting's
 * multiplier, or the GM's call).
 * Returns undo records: the resources it changed, as they were (actorUpdate); Armor Slots on armor (itemUpdates) and on
 * the character's own armor effects (taken off and put back as they were); the GM's Fear (a setting); and statuses laid
 * along the way come off (statusesBefore).
 * @param {ChatMessage} message
 * @param {TokenDocument} tokenDoc
 * @returns {Promise<object[]>}
 */
export async function applyDaggerheartDamage(message, tokenDoc, { multiplier = 1 } = {}) {
  const actor = tokenDoc?.actor;
  const sys = message?.system;
  if ( !actor || !sys ) return [];
  const times = Number.isFinite(Number(multiplier)) ? Math.max(0, Number(multiplier)) : 1;
  const healing = !!sys.hasHealing;
  const resources = {};
  for ( const [key, roll] of Object.entries(sys.damage?.resources ?? {}) ) {
    const r = rollData(roll);
    // (One counted on an item's uses belongs to the acting item, not to the target.)
    if ( !r || r.options.itemId ) continue;
    if ( healing ) r.total = Math.ceil(r.total * times);
    resources[key] = r;
  }
  const main = healing ? null : rollData(sys.damage?.main);
  if ( main ) {
    const taken = Number(actor.system?.rules?.attack?.damage?.hpDamageTakenMultiplier);
    main.total = Math.ceil(main.total * (Number.isFinite(taken) ? taken : 1)) * times;
  }
  if ( !main && !Object.keys(resources).length ) return [];
  const undo = undoRecord(tokenDoc, actor);
  const before = resourcesOf(actor);
  const armor = actor.type === "character" ? armorOf(actor) : null;
  let fear = null;
  if ( "fear" in resources ) {
    try {
      fear = Number(game.settings.get(SYSTEM, "ResourcesFear"));
    } catch ( err ) {
      fear = null;
    }
  }
  const result = healing
    ? await actor.takeHealing({ resources })
    : await actor.takeDamage({ ...(main ? { main } : {}), resources }, !!sys.isDirect);
  // (A companion marks a Stress for any damage, and says nothing back; null or none: nothing was done.)
  const updates = Array.isArray(result) ? result : result === undefined && !healing && actor.type === "companion" ? [{ key: "stress", value: 1 }] : [];
  if ( !updates.length ) return [];
  const records = [undo];
  const expected = {};
  let armorKept = false;
  for ( const u of updates ) {
    if ( !u || u.itemId ) continue;
    if ( u.key === "fear" ) {
      if ( Number.isFinite(fear) && !records.some(r => r.setting) ) records.push({ ...undoRecord(null, null), setting: { namespace: SYSTEM, key: "ResourcesFear", value: fear } });
    } else if ( u.key === "armor" ) {
      if ( !armor || armorKept ) continue;
      armorKept = true;
      for ( const i of armor.items ) undo.itemUpdates.push({ id: i.id, update: { "system.armor.current": i.current } });
      for ( const e of armor.effects ) {
        undo.createdEffects.push(e._id);
        undo.deletedEffects.push(e);
      }
    } else if ( Object.hasOwn(before, u.key) ) {
      undo.actorUpdate[`system.resources.${u.key}.value`] = before[u.key].value;
      expected[u.key] = landsAt(before[u.key], u);
    }
  }
  await landed(actor, expected);
  return records;
}

/** Gold as the world's currency has it, from an amount in its smallest coin: {chests, bags, handfuls, coins}. */
function goldFor(amount, kinds) {
  const out = {};
  let left = Math.max(0, Math.floor(amount));
  for ( const k of kinds ) {
    out[k.key] = Math.floor(left / k.value);
    left -= out[k.key] * k.value;
  }
  return out;
}

/**
 * Hand over what a creature gave up (or had stolen): gold, or one item. A character pays from its gold (made back into
 * chests, bags, handfuls and coins); an adversary counts no gold (the SRD doesn't), so only the one it goes to gains.
 * An item (the core's handOverItem) goes unequipped, and only to a character.
 * Returns undo records.
 * @param {object[]} kinds  the world's currency, largest first: [{key, value}]
 */
export async function commitDaggerheartConcession(giverDoc, receiverDoc, concession, kinds) {
  const giver = giverDoc?.actor;
  if ( !giver ) return [];
  const receiver = receiverDoc?.actor ?? null;
  const records = [];
  const worth = gold => kinds.reduce((sum, k) => sum + (Number(gold?.[k.key]) || 0) * k.value, 0);
  if ( concession.kind === "money" ) {
    if ( giver.system.gold ) {
      const before = { ...giver.system.gold };
      const after = goldFor(Math.max(0, worth(before) - concession.amount), kinds);
      const undo = undoRecord(giverDoc, giver);
      undo.actorUpdate["system.gold"] = before;
      await giver.update({ "system.gold": { ...before, ...after } });
      records.push(undo);
    }
    if ( receiver?.system.gold ) {
      const before = { ...receiver.system.gold };
      const after = goldFor(worth(before) + concession.amount, kinds);
      const undo = undoRecord(receiverDoc, receiver);
      undo.actorUpdate["system.gold"] = before;
      await receiver.update({ "system.gold": { ...before, ...after } });
      records.push(undo);
    }
    return records;
  }
  return handOverItem(giverDoc, receiver?.type === "character" ? receiverDoc : null, concession.item?.id, {
    prepare: data => { data.system.equipped = false; }
  });
}

/** The GM's Fear going in, and as the fight left it: {before, after}. */
export function fearAfter(plan, replay) {
  const before = Number(plan?.fear) || 0;
  const unit = Object.values(replay?.units ?? {}).find(u => Number.isFinite(u?.final?.system?.fear));
  return { before, after: unit ? unit.final.system.fear : before };
}

/** The GM's Fear, for the planner's summary of the fight: {title, lines}, or null when it doesn't change. */
export function describeFear(plan, replay) {
  if ( !plan ) return null;
  const { before, after } = fearAfter(plan, replay);
  if ( before === after ) return null;
  return { title: t("Encounter.Title"), lines: [t("Encounter.Fear", { name: resourceWord("fear"), from: before, to: after })] };
}
