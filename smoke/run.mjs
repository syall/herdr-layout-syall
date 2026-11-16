// usage: node run.mjs <mod> : loads a copy of the mod with stubbed imports and renders it with fake data.
import fs from "fs"; import path from "path";
const here = path.dirname(new URL(import.meta.url).pathname);
const mod = process.argv[2], src = `${process.env.HERDR_APP_HOME ?? process.env.HOME + "/.config/herdr-app"}/mods/${mod}`, dst = `${here}/.run/${mod}`;
fs.rmSync(dst, { recursive: true, force: true }); fs.mkdirSync(dst, { recursive: true });
for (const f of fs.readdirSync(src)) if (f.endsWith(".js") && !f.includes(".bak-")) fs.writeFileSync(path.join(dst, f), fs.readFileSync(path.join(src, f), "utf8").replace(/from "(gpui-kit|gpui-base|herdr)"/g, 'from "../../stubs.mjs"'));
const S = "sp1", top = `${here}/.run/top`;
fs.mkdirSync(`${top}/src/A`, { recursive: true });
globalThis.__spaces = [{ id: S, name: "proj", active: true, machine: null, folder: top, tabs: [{ id: "tb1", index: 1, name: "PA: proj", named: true, active: true, status: "working" }, { id: "tb2", index: 2, name: "2", active: false }] }];
globalThis.__panes = [{ pane: "p1", terminal: "t1", tab: "tb1", cwd: top, focused: true, program: { agent: true, name: "Claude Code", key: "claude" }, title: "x" }];
globalThis.__focused = { space: S, tab: "tb1", pane: "p1", terminal: "t1", cwd: top };
globalThis.__terminals = [{ address: "t1", state: "live", labels: { "herdr.pa": S, "herdr.pa.name": "proj", "herdr.pa.project": top }, status: "working", cwd: top, program: { agent: true } },
  { address: "t2", state: "live", parent: "t1", name: "t-001-build", status: "working", cwd: `${top}/worktrees/a/src/Pkg`, program: { agent: true, name: "Claude Code" }, labels: {} },
  { address: "t3", state: "live", parent: "t1", name: "t-002-design", status: "idle", cwd: `${top}/worktrees/a`, program: { agent: true }, labels: {} }];
globalThis.__shared = { "project-agent.tabs": { tb1: { space: S, project: top, profile: "x", name: "proj", terminal: "t1" } }, "project-agent.worktrees": { [S]: [{ task: "t-001", path: `${top}/worktrees/a` }] },
  "project-agent.workers": { [S]: { t2: { task: "t-001", title: "Add retry", role: "build", state: "in-progress" } } }, "space.home": {}, "my-files.places": { [S]: [{ label: "All evidence", path: "/e", group: "Project Agent" }, { label: "t-001 evidence · 2 files", detail: "Add retry", path: "/e/t-001", group: "Project Agent", task: "t-001" }] }, "project-agent.show": { space: S, task: "t-001", at: 1 } };
globalThis.__layout = { id: "root", children: [{ id: "panel-body", children: [{ id: "agents-view", children: [{ id: "agents-picker", size: { px: 200 } }, { id: "agents-live", content: { terminal: "t2" } }] }] }] };
if (mod === "my-toast") globalThis.__props = { title: "Claude Code finished", body: "done", level: "success", action: { name: "agent.focus", args: { terminal: "t2" } }, overlay: "o1" };
if (mod === "project-agent" && process.argv[3] === "delete-worker") globalThis.__props = { deleteWorker: { space: S, machine: null, address: "t2", name: "t-001-build" } };
const { cx } = await import("./stubs.mjs");
const View = (await import(`./.run/${mod}/main.js`)).default, v = new View();
v.init?.(globalThis.__props ?? {}, cx);
await new Promise((r) => setTimeout(r, 400));
const states = {
  "my-changes": [(v) => { v.places = [{ path: `${top}/src/A`, branch: "main", count: 2, task: null }, { path: `${top}/worktrees/a/src/Pkg`, branch: "t-001", count: 1, task: "t-001" }, { path: "/elsewhere/wt", branch: "x", count: 0, task: null }]; v.placesFor = S; v.real = {}; },
    (v) => { v.layout = "list"; }, (v) => { v.layout = "tasks"; }, (v) => { v.places[1].ahead = 3; v.places[1].count = 0; v.base = { ref: "main", sha: "abc", commits: 3 }; v.branchScope = true; v.dirty = 0; }, (v) => { v.all = true; v.layout = "tree"; v.foldedDirs.add("/worktrees/a/src"); }, (v) => { v.pin(`${top}/src/A`, cx); }, (v) => { v.root = `${top}/src/A`; v.files = [{ path: "a/b.txt", status: "M", add: 1, del: 2 }]; },
    (v) => { for (const r of [{ kind: "@", text: "@@ -1 +1 @@" }, { kind: "+", number: 1, text: "new" }, { kind: "-", number: 1, text: "old" }, { kind: " ", number: 2, text: "same" }, { kind: "", text: "note" }]) v.diffRow(r, new Proxy({}, { get: () => "#000000" })); }],
  "my-toast": [() => {}],
  "my-agent-picker": [() => {}, () => { globalThis.__layout.children[0].children[0].children[0].size.px = 58; }, () => { globalThis.__layout.children[0].children[0].children[0].size.px = 30; }],
  "my-files": [() => {}, (v) => { v.placesFolded = new Set(["Project Agent"]); }, (v) => { v.file = "README.md"; v.markdown = "# hi"; v.rendered = true; }, (v) => { v.rendered = false; },
    (v) => { globalThis.__shared["my-files.root"] = { space: S, path: top, label: "evidence t-001", file: "src/A/x.md", task: "t-001", at: 5 }; v.root = top; }, (v) => { v.sidebarHidden = true; }, (v) => { v.sidebarHidden = false; v.filterText = "x md"; v.allFiles = ["src/A/x.md", "README.md", "a/b/xy.md"]; v.allFilesFor = v.context?.key; }, (v) => { globalThis.__shared["my-files.root"] = { space: S, path: top, label: "evidence t-001", file: null, at: 6 }; }],
  "project-agent": [(v) => { v.space = S; v.data = { agent: { name: "proj", project: top, profile: "x", terminal: "t1" }, errors: [], profile: { linkTemplates: [{ match: "PR-\\d+", url: "https://x/{0}" }], actions: [] }, profileDir: "/p", evidence: new Map([["t-001", ["VERIFY.md", "spec.md"]]]),
      schedule: { everyMinutes: 5, paused: false, onlyWhileActive: true, quietHours: null, lastPass: null, nextPass: null }, request: null, stale: ["orchestrator.md"],
      ledger: { passCount: 2, tasks: [{ id: "t-001", title: "Add retry PR-123", goal: "g", state: "needs-decision", phase: "build", tier: "normal", updated: "2026-11-13T01:00:00Z", workers: [{ address: "t2", role: "build" }, { address: "t9", role: "reviewer" }], links: [{ label: "doc", url: "https://d" }] }, { id: "t-000", title: "old", state: "done" }] } };
      v.cards = [{ id: "d-001", path: "/x/d-001.json", text: "{}", card: { id: "d-001", task: "t-001", question: "Q?", context: "c", options: [{ label: "A", detail: "a" }, { label: "B", detail: "b" }], recommendation: "A", status: "open", created: "2026-11-13T00:00:00Z" } }, { id: "d-bad", path: "/x/b", text: "{", card: null, error: "bad" }, { id: "d-000", path: "/x/0", text: "{}", card: { id: "d-000", task: "t-000", question: "Q", options: [{ label: "A" }], status: "answered", answer: "A", note: "n", answered: "2026-11-13T00:00:00Z" } },
        { id: "d-0a", path: "/x/a", text: "{}", card: { id: "d-0a", task: "t-000", question: "Q", options: [{ label: "A" }], status: "answered", answer: "A", note: "go with A", answeredBy: "person, in conversation", answered: "2026-11-13T00:00:00Z" } },
        { id: "d-0w", path: "/x/w", text: "{}", card: { id: "d-0w", task: "t-000", question: "Q", options: [{ label: "A" }], status: "withdrawn", answer: null, note: "moot", answeredBy: "orchestrator: withdrawn", answered: "2026-11-13T00:00:00Z" } }];
      v.rules.data = { path: "/r", text: "{}", error: null, rules: [{ id: "r-1", title: "T", text: "x", why: "w", appliesTo: "all", status: "active", order: 20, source: "core" }, { id: "r-2", title: "P", text: "x", status: "proposed", order: 10 }, { id: "r-3", title: "D", text: "x", status: "declined" }] }; },
    (v) => { v.view = "tasks"; v.open.add("t-001"); v.folded.clear(); v.armedTask = "t-001"; }, (v) => { v.view = "decisions"; v.choice["d-001"] = "B"; v.older = true; v.spotlight = "d-001"; },
    (v) => { v.view = "rules"; v.rules.open.add("r-1"); v.rules.declined = true; }, (v) => { v.schedule.open = true; v.schedule.custom = { value: () => "7" }; v.schedule.quietFrom = v.schedule.custom; v.schedule.quietTo = v.schedule.custom; v.data.schedule.paused = true; }],
};
if (v.worker) states[mod] = [() => {}, (v) => { v.worker.info = { address: "t2", state: "live", task: "t-001", title: "x", role: "build", onlyWorker: true, worktree: { path: "/w", kind: "worktree", uncommitted: 2, unpushed: 1, removesBranches: false, branch: "b", sharedWith: [], keep: false } }; },
  (v) => { v.worker.info.worktree.sharedWith = ["t9"]; v.worker.withTask = true; v.worker.error = "x"; }, (v) => { v.worker.info.worktree = null; }];
// t-002: checks run after a state's render, given the run() calls that render made: an error message, or null.
const checks = {}, after = {};
const live = () => globalThis.__layout.children[0].children[0].children[1], term = (a) => globalThis.__terminals.find((k) => k.address === a);
const hides = (runs) => runs.filter((r) => r.name === "layout.hide" && JSON.stringify(r.args) === JSON.stringify({ id: "agents-live" }));
const layoutCalls = (runs) => runs.filter((r) => r.name.startsWith("layout."));
const only = (runs) => runs.filter((r) => !["layout.hide", "layout.resize"].includes(r.name)).map((r) => r.name);
const expectHides = (n, ac) => (_v, runs) => only(runs).length ? `AC4.3 unexpected run(): ${only(runs)}` : layoutCalls(runs).length !== n || hides(runs).length !== n ? `${ac} expected ${n} layout.hide {id:"agents-live"}, got ${JSON.stringify(runs)}` : null;
const show = (address, hidden = false) => { live().content = { terminal: address }; live().hidden = hidden; };
if (mod === "my-agent-picker") {
  const extra = [
    // (a) a worker of this space
    [() => { globalThis.__layout.children[0].children[0].children[0].size.px = 200; globalThis.__agents = [{ address: "t1", space: S, status: "working", program: { name: "Claude Code" } }]; show("t2"); }, expectHides(0, "AC1.1")],
    // (b) a live worker of another space
    [() => { globalThis.__terminals.push({ address: "m/t9", state: "live", parent: "m/t8", status: "working", program: { agent: true }, labels: {} }); show("m/t9"); }, expectHides(1, "AC1.2")],
    // (c1) Herdr renders again before the layout updates; (c2) the node is hidden
    [() => {}, expectHides(0, "AC1.3 (guard)")],
    [() => { show("m/t9", true); }, expectHides(0, "AC1.3 (hidden)")],
    // (d) reported but not live
    [() => { term("t2").state = "exited"; show("t2"); }, expectHides(1, "AC1.4")],
    // (e) not reported yet
    [() => { term("t2").state = "live"; show("zz/t1"); }, expectHides(0, "AC1.5")],
    // (f) a child of this space's agent t1: a picker row
    [() => { show("t3"); }, expectHides(0, "AC1.6 (row, child of an agent)")],
    // (f2) not a row: its parent s1 is a pane terminal in tab tb2 that is not an agent (G1: the pane-tab branch)
    [() => { globalThis.__panes.push({ pane: "p2", terminal: "s1", tab: "tb2", cwd: top, focused: false, program: { name: "zsh" }, title: "zsh" });
      globalThis.__terminals.push({ address: "s1", state: "live", status: "idle", labels: {} }, { address: "s2", state: "live", parent: "s1", status: "working", program: { agent: true }, labels: {} });
      show("s2"); }, expectHides(0, "AC1.6 (pane-tab parent, G1)")],
    // (g) hidden, then a pick shows a worker of this space again
    [() => { show("m/t9"); }, expectHides(1, "AC1.2 (setup for AC1.6)")],
    [() => { show("t2"); }, expectHides(0, "AC1.6 (after a pick)")],
    [() => {}, expectHides(0, "AC1.6 (next render)")],
    // (h) an agent of this space with no parent in its tabs: a picker row
    [() => { globalThis.__agents.push({ address: "r/t5", space: S, status: "idle" }); globalThis.__terminals.push({ address: "r/t5", state: "live", status: "idle", program: { agent: true }, labels: {} }); show("r/t5"); }, expectHides(0, "AC1.6 (agent row)")],
    // (h2) not a row (its parent ended), reached only through an agent of the space (N1, G1: the agents() branch)
    [() => { globalThis.__agents.push({ address: "a/t6", space: S, status: "idle" });
      globalThis.__terminals.push({ address: "a/t6", state: "live", status: "idle", program: { agent: true }, labels: {} }, { address: "a/t7", state: "exited", parent: "a/t6", labels: {} }, { address: "a/t8", state: "live", parent: "a/t7", status: "working", program: { agent: true }, labels: {} });
      show("a/t8"); }, expectHides(0, "AC1.6 (agents() root, N1)")],
    // (i1) a worker the Project Agent recorded for this space (Files offers it): no parent, no pane, not an agent (I1)
    [() => { globalThis.__terminals.push({ address: "w9", state: "live", status: "working", program: { agent: true }, labels: {} }); globalThis.__shared["project-agent.workers"][S].w9 = { task: "t-002", title: "x", role: "build" }; show("w9"); }, expectHides(0, "AC1.6 (PA-recorded worker, I1)")],
    // (m) panes not reported yet: wait, for an own worker (m1) and a foreign one (m2); then decide (m3, m4) (M1)
    [() => { globalThis.__keepPanes = globalThis.__panes; globalThis.__keepAgents = globalThis.__agents; globalThis.__panes = []; globalThis.__agents = []; show("t3"); }, expectHides(0, "AC1.5 (panes loading, own worker, M1)")],
    [() => { show("m/t9"); }, expectHides(0, "AC1.5 (panes loading, foreign worker, M1)")],
    [() => { show("m/t9", true); }, expectHides(0, "AC1.3 (hidden)")],
    [() => { globalThis.__panes = globalThis.__keepPanes; globalThis.__agents = globalThis.__keepAgents; show("m/t9"); }, expectHides(1, "AC1.2 (panes loaded)")],
    [() => { show("t3"); }, expectHides(0, "AC1.6 (panes loaded, own worker)")],
  ];
  checks[mod] = [...states[mod].map(() => null), ...extra.map((x) => x[1])];
  states[mod] = [...states[mod], ...extra.map((x) => x[0])];
}
if (mod === "my-changes") {
  const base = states[mod][0];
  const stale = (want, ac) => (v, runs) => runs.length ? `AC4.3 unexpected run(): ${runs.map((r) => r.name)}` : v.stale !== want ? `${ac} expected stale === ${want}, got ${v.stale}` : null;
  const extra = [
    [(v) => { base(v); v.stale = false; v.placesFor = "other"; v.finding = false; }, stale(true, "AC3.1")],
    [(v) => { v.stale = false; v.places = []; v.finding = false; }, stale(true, "AC3.1 (fewer than 2 places)")],
    [(v) => { base(v); v.stale = false; v.render(cx); v.stale = false; }, stale(false, "AC3.3")],
  ];
  checks[mod] = [...states[mod].map(() => null), ...extra.map((x) => x[1])];
  states[mod] = [...states[mod], ...extra.map((x) => x[0])];
  // AC3.2: the space changes while a scan runs; the discarded scan must ask for another.
  after[mod] = async (v) => {
    const keep = globalThis.__spaces;
    v.finding = false; v.stale = false; v.placesFor = S; const before = v.places;
    globalThis.__onExec = () => { globalThis.__spaces = [{ ...keep[0], active: false }, { id: "sp2", name: "other", active: true, machine: null, folder: top, tabs: [] }]; };
    v.findPlaces(cx);
    await new Promise((r) => setTimeout(r, 300));
    globalThis.__onExec = undefined; globalThis.__spaces = keep;
    return v.places !== before || v.placesFor !== S ? "AC3.2 the scan for the old space was not discarded" : v.stale !== true ? `AC3.2 expected stale === true after a discarded scan, got ${v.stale}` : null;
  };
}
let n = 0, failed = 0;
const fail = (msg) => { console.log(`FAIL ${mod} ${msg}`); failed += 1; process.exitCode = 1; };
for (const [i, prep] of (states[mod] ?? [() => {}]).entries()) {
  prep(v); globalThis.__runs = []; v.render(cx); n += 1;
  const err = checks[mod]?.[i]?.(v, globalThis.__runs);
  if (err) fail(`state ${i}: ${err}`);
}
await new Promise((r) => setTimeout(r, 300));
if (after[mod]) { const err = await after[mod](v); if (err) fail(`after: ${err}`); }
console.log(`${mod}: rendered ${n} state(s) ${failed ? `with ${failed} failure(s)` : "without an error"}`);
