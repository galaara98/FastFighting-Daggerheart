/**
 * The planner's fights on background workers (the core's API 22): this helper opens its rules to them
 * (adapter.workerRules: rules.js's daggerheartRulesFor, the world's "tied up stops spells" given as data), and rules.js
 * loads and plays with nothing of Foundry's, as a worker has it. On real threads (node's worker_threads,
 * tests/fixtures/batch-thread.js), a batch of Daggerheart fights split among workers and put back in order is exactly
 * what the main thread's runBatchSync gives.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, test, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { Worker as NodeWorker } from "node:worker_threads";
import { runBatchSync } from "../../FastFighting/scripts/engine/simulator.js";
import { openPool } from "../../FastFighting/scripts/engine/batch-pool.js";
import { parseFormula } from "../scripts/core.js";
import { daggerheartRules, daggerheartRulesFor } from "../scripts/rules.js";
import { DaggerheartAdapter } from "../scripts/adapter.js";

const RULES = new DaggerheartAdapter().workerRules();
const SCRIPTS = fileURLToPath(new URL("../scripts/", import.meta.url));

const threads = [];
/** A worker thread running the core's batch-worker.js, shaped like a browser's Worker. */
function thread(workerData = null) {
  const t = new NodeWorker(new URL("./fixtures/batch-thread.js", import.meta.url), { workerData });
  threads.push(t);
  const w = { onmessage: null, onerror: null, onmessageerror: null };
  t.on("message", data => w.onmessage?.({ data }));
  t.on("error", err => w.onerror?.({ message: err.message }));
  w.postMessage = message => t.postMessage(message);
  w.terminate = () => { t.terminate(); };
  return w;
}
afterAll(async () => { await Promise.all(threads.map(t => t.terminate())); });

const at = (x, y = 0) => ({ x, y, size: 5 });
const traits = tactical => ({ tactical: { base: tactical, fudge: 0 }, brave: { base: 70, fudge: 0 }, selfish: { base: 30, fudge: 0 }, loyal: { base: 70, fudge: 0 } });
const iwr = (major, severe, armor = 0) => ({ immune: [], resist: {}, weak: {}, dh: { thresholds: { major, severe }, physical: {}, magical: {}, reduce: {}, armor } });
function hero(id, position, extra = {}) {
  return {
    id, name: id, side: "friendly", kind: "pc", duality: true, level: 1, hp: { value: 6, max: 6 }, hopeMax: 6, stressMax: 6, armorMax: 3,
    resources: { hope: 2, stress: 6, armor: 3 }, defenses: { ac: 11, agility: 2, strength: 1, finesse: 0, instinct: 1, presence: 0, knowledge: 0 },
    initiative: { mod: 1 }, speeds: { walk: 30 }, position, sprint: { range: 100, mod: 2 },
    actions: [{ id: `${id}.sword`, name: "Longsword", kind: "strike", bonus: 2, melee: true, reach: 5, damage: [parseFormula("1d10+3", "physical")] }],
    iwr: iwr(8, 16, 3), traits: traits(60), flags: {}, diesAtZero: false, ...extra
  };
}
function bandit(id, position, extra = {}) {
  return {
    id, name: id, side: "hostile", kind: "npc", level: 1, adversaryType: "standard", hp: { value: 5, max: 5 }, stressMax: 3, resources: { stress: 3 },
    defenses: { ac: 12 }, initiative: { mod: 0 }, speeds: { walk: 30 }, position,
    actions: [{ id: `${id}.daggers`, name: "Daggers", kind: "strike", bonus: 1, melee: true, reach: 5, damage: [parseFormula("1d8+1", "physical")] }],
    iwr: iwr(8, 14), traits: traits(40), flags: {}, diesAtZero: true, ...extra
  };
}

/** Three heroes (one in a hurry, one who'd risk it all) against bandits and an archer, 40 feet apart. */
function skirmish() {
  const archer = bandit("archer", at(55, 10), { actions: [{ id: "archer.bow", name: "Shortbow", kind: "strike", bonus: 2, melee: false, range: { increment: 60, max: 120 }, damage: [parseFormula("1d6+2", "physical")] }] });
  return {
    combatants: [
      hero("brakka", at(0)), hero("isel", at(0, 10), { behavior: { rush: 1 } }), hero("tovin", at(0, 20), { playstyles: ["dps"] }),
      bandit("b1", at(45)), bandit("b2", at(45, 10)), bandit("b3", at(45, 20)), archer
    ],
    sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Bandits", enemies: ["friendly"] } },
    options: { positioning: true, maxRounds: 8, talking: false, system: { fear: 3, spending: "steady" } }
  };
}

describe("this helper's rules for the planner's workers", () => {
  test("workerRules: rules.js beside the adapter, its daggerheartRulesFor, the world's setting as data", async () => {
    expect(RULES).toEqual({ url: new URL("../scripts/rules.js", import.meta.url).href, exportName: "daggerheartRulesFor", data: { tiedStopsSpells: true } });
    const made = (await import(RULES.url))[RULES.exportName](RULES.data);
    expect(Object.keys(made).sort()).toEqual(Object.keys(daggerheartRules).sort());
    expect(made.tiedStopsSpells).toBe(true);
    expect(daggerheartRulesFor({ tiedStopsSpells: false }).tiedStopsSpells).toBe(false);
    expect(made.roll).toBe(daggerheartRules.roll);
  });

  test("rules.js imports nothing of the Foundry side (no sheets, cards or chat)", () => {
    const seen = new Set();
    const walk = file => {
      if ( seen.has(file) ) return;
      seen.add(file);
      const src = fs.readFileSync(file, "utf8");
      for ( const m of src.matchAll(/(?:import|export)\s[^;]*?from\s+"(\.\/[^"]+)"/g) ) walk(path.join(path.dirname(file), m[1]));
    };
    walk(path.join(SCRIPTS, "rules.js"));
    const names = [...seen].map(f => path.basename(f)).sort();
    for ( const foundrySide of ["adapter.js", "commit.js", "read-turn.js", "main.js", "strike-roll.js", "check-roll.js", "action-card.js", "lore.js"] ) {
      expect(names).not.toContain(foundrySide);
    }
  });

  test("loaded on a thread with nothing of Foundry's, it reads none of Foundry's globals", async () => {
    const w = thread({ trap: RULES.url });
    const said = await new Promise((resolve, reject) => { w.onmessage = e => resolve(e.data); w.onerror = reject; });
    expect(said).toEqual({ type: "touched", names: [] });
  }, 30000);
});

describe("Daggerheart fights on real threads: what runBatchSync gives", () => {
  test("heroes against bandits and an archer: Hope and Fear, the spotlight, sprints, death moves", async () => {
    const warn = vi.spyOn(console, "warn");
    const spec = skirmish();
    const pool = openPool(RULES, { size: 4, makeWorker: () => thread() });
    const r = await pool.run(spec, daggerheartRules, { runs: 60, seed: 17 });
    pool.close();
    expect(pool.used).toBe(4);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    expect(r).toEqual(runBatchSync(spec, daggerheartRules, { runs: 60, seed: 17 }));
  }, 60000);
});
