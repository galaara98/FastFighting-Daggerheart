/**
 * Daggerheart adapter: reads the Foundryborne Daggerheart system's characters and adversaries into CombatantSpecs, and
 * commits outcomes back. Written against the system's 2.10 on Foundry v14.
 *
 * A character: its traits, Evasion, damage thresholds, Hit Points, Stress, Hope (and its most), Armor Slots, Proficiency,
 * Experiences; the weapons it has equipped (else unarmed: its Proficiency in d4s), and the actions on its features and
 * the domain cards in its loadout. It rolls the Duality Dice.
 * An adversary: its type and tier, Difficulty, thresholds, Hit Points, Stress, its standard attack (a Horde's lesser one
 * once it has marked half its Hit Points), and the actions of its action features (a Fear feature costs the GM a Fear).
 * A Minion falls to any damage (Minion (X): each X damage another of its kind falls too); a Solo with Relentless (X) can
 * be spotlit X times a GM turn. It rolls a d20.
 * The encounter (the planner's Daggerheart row): the GM's Fear going in (the world's), and how freely the GM spends it.
 */
import { SystemAdapter, hasWords } from "./core.js";
import { daggerheartRules, FEAR_MAX, FEAR_SPENDING } from "./rules.js";
import { toActionSpec, RANGES } from "./actions.js";
import { deriveDaggerheartTraits, rankDaggerheartLeaders, isBeast } from "./traits.js";
import { commitDaggerheartOutcome, describeDaggerheartOutcome, describeFear, commitFear } from "./commit.js";
import { t, systemWord } from "./words.js";

const SYSTEM = "daggerheart";
const TRAITS = Object.freeze(["agility", "strength", "finesse", "instinct", "presence", "knowledge"]);
/** An adversary's tier, as the level of a character of that tier (for what's typical). */
const TIER_LEVEL = Object.freeze({ 1: 1, 2: 3, 3: 6, 4: 9 });

const setting = key => {
  try {
    return game.settings.get(SYSTEM, key);
  } catch ( err ) {
    return null;
  }
};
const plain = v => (typeof v?.toObject === "function" ? v.toObject() : v);
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** The system's ranges, in feet: its Range Measurement rule's, where it's on. */
function ranges() {
  const rule = plain(setting("VariantRules"))?.rangeMeasurement;
  if ( !rule?.enabled ) return { ...RANGES };
  return { ...RANGES, melee: num(rule.melee) || RANGES.melee, veryClose: num(rule.veryClose) || RANGES.veryClose, close: num(rule.close) || RANGES.close, far: num(rule.far) || RANGES.far, veryFar: Math.max(num(rule.far) * 2, RANGES.veryFar) };
}
const massiveDamage = () => !!plain(setting("VariantRules"))?.massiveDamage?.enabled;
/** The GM's Fear now (the world's). */
export const fearNow = () => Math.max(0, Math.min(FEAR_MAX, num(setting("ResourcesFear"))));

const traitName = k => systemWord(`DAGGERHEART.CONFIG.Traits.${k}.name`, `Trait.${k}`);
const typeName = k => systemWord(`DAGGERHEART.CONFIG.AdversaryType.${k}.label`, `Type.${k}`);

/** An item's effects, by id: {statuses, changes, duration}. */
function effectsOf(item) {
  return new Map([...(item?.effects ?? [])].map(e => [e.id, { statuses: [...(e.statuses ?? [])], changes: e.system?.changes ?? e.changes ?? [], duration: e.system?.duration ?? e.duration }]));
}

/** Damage resistance, immunity and reduction, by type, as the engine's applyIwr reads them. */
function harmOf(sys, { thresholds, armor = 0, minion = 0 } = {}) {
  const r = sys.resistance ?? {};
  const red = sys.rules?.damageReduction ?? {};
  return {
    immune: [], weak: {}, resist: {},
    dh: {
      thresholds: { major: num(thresholds?.major), severe: num(thresholds?.severe) },
      physical: { resistance: !!r.physical?.resistance, immunity: !!r.physical?.immunity, reduction: num(r.physical?.reduction) },
      magical: { resistance: !!r.magical?.resistance, immunity: !!r.magical?.immunity, reduction: num(r.magical?.reduction) },
      reduce: { physical: num(red.reduceSeverity?.physical), magical: num(red.reduceSeverity?.magical) },
      minorImmune: !!red.thresholdImmunities?.minor,
      massive: massiveDamage(),
      armor,
      minion,
      multiplier: num(sys.rules?.attack?.damage?.hpDamageTakenMultiplier) || 1
    }
  };
}

/** Conditions it's immune to (the sheet's rules). */
const conditionImmune = sys => Object.entries(sys.rules?.conditionImmunities ?? {}).filter(([, v]) => v).map(([k]) => k);

/** Conditions it starts with (Vulnerable, Hidden, Restrained). */
function startingConditions(actor) {
  const out = {};
  for ( const s of actor.statuses ?? [] ) {
    if ( s === "vulnerable" || s === "hidden" ) out[s] = 1;
    if ( s === "restrained" ) Object.assign(out, { restrained: 1, immobilized: 1 });
  }
  return out;
}

/** "Minion (3)", "Relentless (2)": the number a feature's name carries. */
const countIn = name => Number(/\((\d+)\)\s*$/.exec(String(name ?? ""))?.[1]) || 0;

export class DaggerheartAdapter extends SystemAdapter {
  static systemId = SYSTEM;

  get label() {
    return t("Label");
  }

  get rules() {
    return daggerheartRules;
  }

  canHandle(actor) {
    return !!actor && ["character", "adversary"].includes(actor.type);
  }

  async toCombatantSpec(tokenDoc) {
    const actor = tokenDoc.actor;
    if ( !this.canHandle(actor) ) return null;
    return actor.type === "character" ? this.#character(tokenDoc, actor) : this.#adversary(tokenDoc, actor);
  }

  #character(tokenDoc, actor) {
    const sys = actor.system;
    const r = ranges();
    const traits = Object.fromEntries(TRAITS.map(k => [k, num(sys.traits?.[k]?.value)]));
    const level = num(sys.levelData?.level?.current) || 1;
    const hp = sys.resources?.hitPoints ?? {};
    const stress = sys.resources?.stress ?? {};
    const hope = sys.resources?.hope ?? {};
    const armorMax = num(sys.armorScore?.max);
    const armorMarked = num(sys.armorScore?.value);
    const proficiency = Math.max(1, num(sys.proficiency));
    const spellcast = sys.spellcastModifierTrait?.key ?? null;
    const id = tokenDoc.id;
    const actions = [];
    const common = { pc: true, traits, spellcast, proficiency, ranges: r };
    // Its weapons (else unarmed: its Proficiency in d4s, Strength or Finesse).
    for ( const w of [sys.primaryWeapon, sys.secondaryWeapon].filter(Boolean) ) {
      const spec = toActionSpec(plain(w.system.attack), { ...common, id: `${id}.${w.id}`, label: w.name, effectsById: effectsOf(w) });
      if ( spec ) actions.push(spec);
    }
    if ( !actions.length ) {
      const trait = traits.finesse > traits.strength ? "finesse" : "strength";
      actions.push(toActionSpec({ type: "attack", range: "melee", roll: { type: "attack", trait }, damage: { main: { type: ["physical"], value: { dice: "d4", multiplier: "prof", flatMultiplier: 1, bonus: 0 } } } },
        { ...common, id: `${id}.unarmed`, label: systemWord("DAGGERHEART.GENERAL.unarmedAttack", "Unarmed") }));
    }
    // Its features' actions, and its loadout's domain cards'.
    for ( const item of actor.items ) {
      if ( item.type === "domainCard" ? item.system.inVault : item.type !== "feature" ) continue;
      for ( const a of item.system.actions ?? [] ) {
        const spec = toActionSpec(plain(a), { ...common, id: `${id}.${item.id}.${a.id ?? a._id}`, label: a.name && a.name !== item.name ? `${item.name}: ${a.name}` : item.name, effectsById: effectsOf(item) });
        if ( spec ) actions.push(spec);
      }
    }
    const experiences = Object.values(sys.experiences ?? {}).map(e => ({ name: e.name, value: num(e.value) })).filter(e => e.value > 0).sort((a, b) => b.value - a.value);
    const names = Object.fromEntries(TRAITS.map(k => [k, traitName(k)]));
    const derived = deriveDaggerheartTraits({ pc: true, traits, names });
    return {
      id, tokenId: id, actorId: actor.id, actorUuid: actor.uuid,
      name: tokenDoc.name ?? actor.name,
      img: tokenDoc.texture?.src ?? actor.img,
      kind: "pc",
      duality: true,
      level,
      hp: { value: Math.max(0, num(hp.max) - num(hp.value)), max: num(hp.max), temp: 0 },
      defenses: { ac: num(sys.evasion), ...traits },
      initiative: { mod: traits.instinct },
      speeds: { walk: r.close },
      actions,
      iwr: harmOf(sys, { thresholds: sys.damageThresholds, armor: armorMax }),
      resources: { hope: num(hope.value), stress: Math.max(0, num(stress.max) - num(stress.value)), armor: Math.max(0, armorMax - armorMarked) },
      hopeMax: num(hope.max) || 6,
      stressMax: num(stress.max),
      armorMax,
      hopeReserve: actions.some(a => a.resource === "hope" && (a.resourceCost ?? 1) >= 3) ? 3 : 0,
      experiences,
      conditionImmune: conditionImmune(sys),
      conditions: startingConditions(actor),
      traits: Object.fromEntries(Object.entries(derived.traits).map(([k, v]) => [k, { base: v, fudge: 0 }])),
      traitReasons: derived.reasons,
      flags: { ...derived.flags },
      diesAtZero: false,
      perception: traits.instinct,
      creatureTraits: ["humanoid"],
      social: {
        pitches: Object.fromEntries(["persuade", "intimidate", "deceive"].map(k => [k, { skill: traitName("presence"), mod: traits.presence }])),
        resist: Object.fromEntries(["persuade", "intimidate", "deceive"].map(k => [k, { dc: 12 + Math.max(0, traits.presence), label: traitName("presence") }])),
        resolve: traits.presence,
        languages: ["common"]
      },
      leadership: { id, name: actor.name, presence: traits.presence, pc: true }
    };
  }

  #adversary(tokenDoc, actor) {
    const sys = actor.system;
    const r = ranges();
    const id = tokenDoc.id;
    const type = sys.type ?? "standard";
    const tier = num(sys.tier) || 1;
    const hp = sys.resources?.hitPoints ?? {};
    const stress = sys.resources?.stress ?? {};
    const features = actor.items.filter(i => i.type === "feature" && !i.system.inactive);
    const minion = type === "minion" ? countIn(features.find(f => countIn(f.name) && !(f.system.actions?.size ?? f.system.actions?.length))?.name) : 0;
    const relentless = type === "solo" ? countIn(features.find(f => countIn(f.name) && [...(f.system.actions ?? [])].some(a => [...(a.cost ?? [])].some(c => c.key === "fear")))?.name) : 0;
    const attackBonus = num(sys.attack?.roll?.bonus);
    const common = { pc: false, attackBonus, difficulty: num(sys.difficulty), critOn: num(sys.criticalThreshold) || 20, ranges: r };
    const actions = [];
    if ( sys.attack ) {
      const attack = plain(sys.attack);
      const horde = type === "horde" && sys.typeData?.hordeDamage;
      const full = toActionSpec(attack, { ...common, id: `${id}.attack`, label: attack.name, horde: horde ? "full" : null });
      if ( full ) actions.push(full);
      if ( horde ) {
        const lesser = { ...attack, damage: { ...attack.damage, main: { ...attack.damage.main, value: { custom: { enabled: true, formula: sys.typeData.hordeDamage } } } } };
        const spec = toActionSpec(lesser, { ...common, id: `${id}.attack.horde`, label: attack.name, horde: "reduced" });
        if ( spec ) actions.push(spec);
      }
    }
    for ( const item of features ) {
      if ( item.system.featureForm !== "action" ) continue;
      for ( const a of item.system.actions ?? [] ) {
        const data = plain(a);
        // (A Minion's Group Attack, many as one for a Fear, isn't played: each one attacks on its own.)
        if ( type === "minion" && [...(data.cost ?? [])].some(c => c.key === "fear") ) continue;
        const spec = toActionSpec(data, { ...common, id: `${id}.${item.id}.${data._id}`, label: item.name, effectsById: effectsOf(item) });
        if ( spec ) actions.push(spec);
      }
    }
    const beast = isBeast(sys.motivesAndTactics);
    const derived = deriveDaggerheartTraits({ pc: false, type, tier, motives: sys.motivesAndTactics, names: { type: typeName(type) } });
    const best = Math.max(0, ...Object.values(sys.experiences ?? {}).map(e => num(e.value)));
    const thresholds = sys.damageThresholds ?? {};
    return {
      id, tokenId: id, actorId: actor.id, actorUuid: actor.uuid,
      name: tokenDoc.name ?? actor.name,
      img: tokenDoc.texture?.src ?? actor.img,
      kind: "npc",
      level: TIER_LEVEL[tier] ?? 1,
      tier,
      adversaryType: type,
      kinKey: actor._stats?.compendiumSource ?? actor.id,
      minion,
      relentless,
      hordeHp: type === "horde" ? num(sys.typeData?.hordeHP) : 0,
      hp: { value: Math.max(0, num(hp.max) - num(hp.value)), max: Math.max(1, num(hp.max)), temp: 0 },
      defenses: { ac: num(sys.difficulty), ...Object.fromEntries(TRAITS.map(k => [k, 0])) },
      initiative: { mod: 0 },
      speeds: { walk: r.close },
      actions,
      iwr: harmOf(sys, { thresholds: type === "minion" ? { major: 0, severe: 0 } : thresholds, minion }),
      resources: { stress: Math.max(0, num(stress.max) - num(stress.value)) },
      stressMax: num(stress.max),
      conditionImmune: conditionImmune(sys),
      conditions: startingConditions(actor),
      traits: Object.fromEntries(Object.entries(derived.traits).map(([k, v]) => [k, { base: v, fudge: 0 }])),
      traitReasons: derived.reasons,
      flags: { ...derived.flags },
      diesAtZero: true,
      perception: best,
      creatureTraits: [type],
      creatureKind: typeName(type),
      social: {
        pitches: beast ? {} : Object.fromEntries(["persuade", "intimidate", "deceive"].map(k => [k, { skill: typeName(type), mod: best + (type === "social" ? 2 : 0) }])),
        resist: Object.fromEntries(["persuade", "intimidate", "deceive"].map(k => [k, { dc: num(sys.difficulty), label: systemWord("DAGGERHEART.GENERAL.difficulty", "Difficulty") }])),
        resolve: tier - 1,
        languages: beast ? [] : ["common"]
      },
      leadership: { id, name: actor.name, type, typeName: typeName(type), tier, pc: false }
    };
  }

  deriveTraits(actor) {
    const sys = actor.system;
    if ( actor.type === "character" ) {
      const traits = Object.fromEntries(TRAITS.map(k => [k, num(sys.traits?.[k]?.value)]));
      return deriveDaggerheartTraits({ pc: true, traits, names: Object.fromEntries(TRAITS.map(k => [k, traitName(k)])) });
    }
    return deriveDaggerheartTraits({ pc: false, type: sys.type, tier: sys.tier, motives: sys.motivesAndTactics, names: { type: typeName(sys.type) } });
  }

  detectLeaders(specs) {
    return rankDaggerheartLeaders(specs.map(s => s.leadership).filter(Boolean));
  }

  /** The planner's Daggerheart row: the GM's Fear going in, and how freely the GM spends it. */
  plannerSettings({ setup }) {
    const asked = setup.system ?? {};
    const fear = Number.isFinite(Number(asked.fear)) && asked.fear !== "" && asked.fear !== undefined ? Number(asked.fear) : fearNow();
    const spending = FEAR_SPENDING[asked.spending] ? asked.spending : "steady";
    return {
      title: t("Plan.Title"),
      hint: t("Plan.Hint"),
      fields: [
        { key: "fear", type: "select", label: t("Plan.Fear"), hint: t("Plan.FearHint"), value: String(fear), choices: Array.from({ length: FEAR_MAX + 1 }, (_, n) => ({ value: String(n), label: String(n) })) },
        { key: "spending", type: "pills", label: t("Plan.Spending"), hint: t("Plan.SpendingHint"), value: spending, choices: Object.keys(FEAR_SPENDING).map(k => ({ value: k, label: t(`Plan.${k}`), hint: t(`Plan.${k}Hint`) })) }
      ]
    };
  }

  applyPlannerSettings(spec, settings, { setup }) {
    const asked = setup.system ?? {};
    const fear = Number.isFinite(Number(asked.fear)) && asked.fear !== "" && asked.fear !== undefined ? Number(asked.fear) : fearNow();
    spec.options.system = { fear: Math.max(0, Math.min(FEAR_MAX, fear)), spending: FEAR_SPENDING[asked.spending] ? asked.spending : "steady" };
  }

  /** The GM's Fear, as the fight leaves it, for Make it So's confirmation. */
  describeEncounter(spec, replay) {
    return describeFear(spec.options?.system, replay);
  }

  /** The GM's Fear, written to the world. */
  async commitEncounter(spec, replay) {
    return commitFear(spec.options?.system, replay);
  }

  /** Daggerheart's words: rolls against a Difficulty (a character's Evasion); no money played yet. */
  term(key) {
    if ( key === "ac" ) return systemWord("DAGGERHEART.GENERAL.difficulty", "Difficulty");
    return null;
  }

  resourceLabel(key) {
    const own = { hope: "hope", stress: "stress", fear: "fear", armor: "armor" }[key];
    return own && hasWords(`DAGGERHEART.GENERAL.${own}`) ? game.i18n.localize(`DAGGERHEART.GENERAL.${own}`) : own ? t(`Resource.${own}`) : null;
  }

  async commitOutcome(tokenDoc, spec, final, options) {
    return commitDaggerheartOutcome(tokenDoc, spec, final, options);
  }

  describeOutcome(spec, final) {
    return describeDaggerheartOutcome(spec, final);
  }
}


