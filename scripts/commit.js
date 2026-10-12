/**
 * Daggerheart "Make it So": write one simulated outcome onto a token's actor, returning an undo record.
 * A character: Hit Points and Stress marked, Hope, Armor Slots marked (on its armor), and how it ended up (out cold from
 * Avoid Death, a scar; dead). An adversary: Hit Points and Stress marked, and defeated (dead) or gone. The GM's Fear
 * (the world's), as the fight left it. Consumables used come off what it carries; gold or an item it gave up (a deal, a
 * demand, a theft) goes to whoever it went to.
 *
 * Undo record shape (consumed by the core's make-it-so.js):
 *   { tokenUuid, actorUuid, actorUpdate, itemUpdates: [{id, update}], createdItems, deletedItems, createdEffects,
 *     tokenUpdate, createdActors, createdTokens, deletedTokens, statuses: [{id, active}], combatant, setting }
 */
import { STATUS } from "./core.js";
import { t, systemWord } from "./words.js";

const SYSTEM = "daggerheart";

export function statusesOf(actor) {
  const out = new Set(actor?.statuses ?? []);
  for ( const e of actor?.effects ?? [] ) if ( !e.disabled ) for ( const s of e.statuses ?? [] ) out.add(s);
  return out;
}

const emptyRecord = (tokenDoc, actor) => ({
  tokenUuid: tokenDoc?.uuid ?? null, actorUuid: actor?.uuid ?? null, actorUpdate: {}, itemUpdates: [], createdItems: [], deletedItems: [], createdEffects: [],
  tokenUpdate: null, createdActors: [], createdTokens: [], deletedTokens: [], statuses: [],
  statusesBefore: actor ? [...statusesOf(actor)] : []
});

/** Hit Points marked, from the Hit Points it had left. */
const hpMarked = (spec, left) => Math.max(0, Math.min(spec.hp.max, spec.hp.max - Math.max(0, left)));
/** Stress marked, from the Stress it had left. */
const stressMarked = (spec, left) => Math.max(0, (spec.stressMax ?? 0) - Math.max(0, left));
const deathMoveName = move => systemWord(`DAGGERHEART.CONFIG.DeathMoves.${{ avoid: "avoidDeath", risk: "riskItAll", blaze: "blazeOfGlory" }[move] ?? "avoidDeath"}.name`, `DeathMove.${move}`);

/** Human-readable list of what will change, for the confirmation dialog. */
export function describeDaggerheartOutcome(spec, final) {
  const lines = [];
  const s = final.system ?? {};
  const hpBefore = hpMarked(spec, spec.hp.value);
  const hpAfter = hpMarked(spec, final.hp);
  if ( hpAfter !== hpBefore ) lines.push(t("Out.HitPoints", { from: hpBefore, to: hpAfter, max: spec.hp.max }));
  if ( Number.isFinite(s.stress) ) {
    const before = stressMarked(spec, spec.resources?.stress ?? 0);
    const after = stressMarked(spec, s.stress);
    if ( after !== before ) lines.push(t("Out.Stress", { from: before, to: after, max: spec.stressMax ?? 0 }));
  }
  if ( spec.duality ) {
    if ( Number.isFinite(s.hope) && s.hope !== spec.resources?.hope ) lines.push(t("Out.Hope", { from: spec.resources?.hope ?? 0, to: s.hope }));
    if ( s.armorMarked > 0 ) lines.push(t("Out.Armor", { n: s.armorMarked }));
    for ( const [key, left] of Object.entries(s.items ?? {}) ) {
      const used = (spec.resources?.[key] ?? 0) - left;
      const name = spec.actions?.find(a => a.resource === key)?.name ?? "";
      if ( used > 0 ) lines.push(t("Out.Used", { name, n: used }));
    }
    if ( s.deathMove ) lines.push(t("Out.DeathMove", { move: deathMoveName(s.deathMove) }));
    if ( final.status === STATUS.DEAD ) lines.push(t("Out.Dies"));
    else if ( final.status === STATUS.DOWN ) lines.push(t("Out.Unconscious"));
    else if ( final.status === STATUS.FLED ) lines.push(t("Out.Retreated"));
    if ( s.scarred ) lines.push(t("Out.Scar"));
    return lines;
  }
  if ( final.status === STATUS.DEAD ) lines.push(t("Out.Killed"));
  else if ( final.status === STATUS.BEATEN ) lines.push(t("Out.Defeated"));
  else if ( final.status === STATUS.FLED ) lines.push(final.swayed ? t("Out.TalkedAway") : t("Out.Fled"));
  else if ( final.status === STATUS.SURRENDERED ) lines.push(t("Out.Surrenders"));
  else if ( final.status === STATUS.STOOD_DOWN ) lines.push(t("Out.StandsDown"));
  return lines;
}

async function setStatus(actor, id, active, undo, { overlay = false } = {}) {
  if ( statusesOf(actor).has(id) === active ) return;
  await actor.toggleStatusEffect(id, { active, overlay });
  undo.statuses.push({ id, active: !active, overlay });
}

/**
 * @param {TokenDocument} tokenDoc
 * @param {object} spec
 * @param {object} final
 * @param {object} options  {fledMode}
 */
export async function commitDaggerheartOutcome(tokenDoc, spec, final, options = {}) {
  const actor = tokenDoc.actor;
  const undo = emptyRecord(tokenDoc, actor);
  const s = final.system ?? {};
  const update = {};
  const set = (path, value) => {
    const before = foundry.utils.getProperty(actor, path);
    if ( before === value ) return;
    update[path] = value;
    undo.actorUpdate[path] = before ?? 0;
  };
  set("system.resources.hitPoints.value", hpMarked(spec, final.hp));
  if ( Number.isFinite(s.stress) ) set("system.resources.stress.value", stressMarked(spec, s.stress));
  if ( spec.duality ) {
    if ( Number.isFinite(s.hope) ) set("system.resources.hope.value", s.hope);
    if ( s.scarred ) set("system.scars", (Number(actor.system.scars) || 0) + 1);
    // Consumables used.
    for ( const [key, left] of Object.entries(s.items ?? {}) ) {
      const item = actor.items.get(key.slice("item:".length));
      const used = (spec.resources?.[key] ?? 0) - left;
      if ( !item || !(used > 0) ) continue;
      const before = Number(item.system.quantity) || 0;
      undo.itemUpdates.push({ id: item.id, update: { "system.quantity": before } });
      await item.update({ "system.quantity": Math.max(0, before - used) });
    }
    // Armor Slots marked: on the armor it wears.
    const armor = actor.system.armor ?? actor.items.find(i => i.type === "armor" && i.system.equipped);
    if ( armor && s.armorMarked > 0 ) {
      const before = Number(armor.system.armor?.current) || 0;
      const after = Math.min(Number(armor.system.armor?.max) || 0, before + s.armorMarked);
      if ( after !== before ) {
        undo.itemUpdates.push({ id: armor.id, update: { "system.armor.current": before } });
        await armor.update({ "system.armor.current": after });
      }
    }
    if ( final.status === STATUS.DEAD ) await setStatus(actor, "dead", true, undo, { overlay: true });
    else if ( final.status === STATUS.DOWN ) await setStatus(actor, "unconscious", true, undo);
    if ( Object.keys(update).length ) await actor.update(update);
    return undo;
  }
  if ( Object.keys(update).length ) await actor.update(update);
  // Defeated (beaten: the table says what that means), or killed by one who would.
  if ( final.status === STATUS.DEAD || final.status === STATUS.BEATEN ) {
    await setStatus(actor, final.status === STATUS.DEAD ? "dead" : "defeated", true, undo, { overlay: true });
    const combatant = game.combat?.getCombatantsByToken?.(tokenDoc)?.[0];
    if ( combatant && !combatant.defeated ) {
      await combatant.update({ defeated: true });
      undo.combatant = { uuid: combatant.uuid, defeated: false };
    }
  } else if ( final.status === STATUS.FLED && options.fledMode !== "leave" ) {
    undo.tokenUpdate = { hidden: tokenDoc.hidden };
    await tokenDoc.update({ hidden: true });
  }
  return undo;
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
      const undo = emptyRecord(giverDoc, giver);
      undo.actorUpdate["system.gold"] = before;
      await giver.update({ "system.gold": { ...before, ...after } });
      records.push(undo);
    }
    if ( receiver?.system.gold ) {
      const before = { ...receiver.system.gold };
      const after = goldFor(worth(before) + concession.amount, kinds);
      const undo = emptyRecord(receiverDoc, receiver);
      undo.actorUpdate["system.gold"] = before;
      await receiver.update({ "system.gold": { ...before, ...after } });
      records.push(undo);
    }
    return records;
  }
  const item = giver.items.get(concession.item?.id);
  if ( !item ) return [];
  const undo = emptyRecord(giverDoc, giver);
  const data = item.toObject();
  delete data._id;
  data.system.quantity = 1;
  data.system.equipped = false;
  if ( (Number(item.system.quantity) || 1) > 1 ) {
    undo.itemUpdates.push({ id: item.id, update: { "system.quantity": item.system.quantity } });
    await item.update({ "system.quantity": item.system.quantity - 1 });
  } else {
    undo.deletedItems.push(item.toObject());
    await item.delete();
  }
  records.push(undo);
  if ( receiver?.type === "character" ) {
    const got = emptyRecord(receiverDoc, receiver);
    const [created] = await receiver.createEmbeddedDocuments("Item", [data]);
    if ( created ) got.createdItems.push(created.id);
    records.push(got);
  }
  return records;
}

/** The GM's Fear going in, and as the fight left it: {before, after}. */
export function fearAfter(plan, replay) {
  const before = Number(plan?.fear) || 0;
  const unit = Object.values(replay?.units ?? {}).find(u => Number.isFinite(u?.final?.system?.fear));
  return { before, after: unit ? unit.final.system.fear : before };
}

/** The GM's Fear, for Make it So's confirmation: {title, lines}, or null when it doesn't change. */
export function describeFear(plan, replay) {
  if ( !plan ) return null;
  const { before, after } = fearAfter(plan, replay);
  if ( before === after ) return null;
  return { title: t("Encounter.Title"), lines: [t("Encounter.Fear", { from: before, to: after })] };
}

/** The GM's Fear, written to the world (its undo puts it back). */
export async function commitFear(plan, replay) {
  if ( !plan ) return [];
  const { after } = fearAfter(plan, replay);
  let now = null;
  try {
    now = Number(game.settings.get(SYSTEM, "ResourcesFear"));
  } catch ( err ) {
    return [];
  }
  if ( now === after ) return [];
  await game.settings.set(SYSTEM, "ResourcesFear", after);
  return [{ ...emptyRecord(null, null), setting: { namespace: SYSTEM, key: "ResourcesFear", value: now } }];
}
