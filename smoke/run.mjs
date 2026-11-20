// usage: node run.mjs <mod> : loads a copy of the mod with stubbed imports and renders it with fake data.
import fs from "fs"; import path from "path";
const here = path.dirname(new URL(import.meta.url).pathname);
const mod = process.argv[2], src = `${process.env.HERDR_APP_HOME ?? process.env.HOME + "/.config/herdr-app"}/mods/${mod}`, dst = `${here}/.run/${mod}`;
fs.rmSync(dst, { recursive: true, force: true }); fs.mkdirSync(dst, { recursive: true });
// t-194 hostile case 1: SMOKE_NO_CHECKING=1 loads the mod against stubs without the `checking` export (a Herdr
// older than 0.1.16): the mod must still load, and behave as in a live window.
// (The stubs are first imported below, after the fake data is set: stubs.mjs keeps globalThis.__shared.)
const noChecking = process.env.SMOKE_NO_CHECKING === "1";
const stubPath = noChecking ? "../stubs-no-checking.mjs" : "../../stubs.mjs";
for (const f of fs.readdirSync(src)) if (f.endsWith(".js") && !f.includes(".bak-")) fs.writeFileSync(path.join(dst, f), fs.readFileSync(path.join(src, f), "utf8").replace(/from "(gpui-kit|gpui-base|herdr)"/g, `from "${stubPath}"`));
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
// my-toast: no process at all (a real notifier would post on the desktop and its click would reach the live Herdr).
if (mod === "my-toast") globalThis.__noSpawn = true;
if (mod === "project-agent" && process.argv[3] === "delete-worker") globalThis.__props = { deleteWorker: { space: S, machine: null, address: "t2", name: "t-001-build" } };
const { cx } = await import("./stubs.mjs");
if (noChecking) {
  const names = Object.keys(await import("./stubs.mjs")).filter((k) => k !== "checking");
  fs.writeFileSync(`${here}/.run/stubs-no-checking.mjs`, `export { ${names.join(", ")} } from "../stubs.mjs";\n`);
}
const View = (await import(`./.run/${mod}/main.js`)).default, v = new View();
v.init?.(globalThis.__props ?? {}, cx);
await new Promise((r) => setTimeout(r, 400));
// t-194 hostile case 7: in a live window (checking() false) init asks knownAgents() as often as at 7821ea0.
const LIVE_KNOWN_AGENTS = { "my-tabs": 1, "my-spaces": 1, "my-new-menu": 1 }, liveKnownAgents = globalThis.__knownAgentsCalls ?? 0;
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
// t-012 R6: Changes keeps its repository list per space (at most 8), shows it at once when the space is
// shown again, and the 20 s timer rescans a space on another machine only once its list is 60 s old.
// SCAN is answered by __fakeExec with canned "R" lines for the space shown when the scan starts.
// Each part starts from a new view; every failure is reported.
const changesCache = async () => {
  const keep = { spaces: globalThis.__spaces, now: Date.now }, { spaces } = await import("./stubs.mjs");
  const A = { ...keep.spaces[0] }, sp = (id, machine) => ({ id, name: id, active: true, machine, folder: `/home/u/${id}`, tabs: [] });
  // C is on the same machine and in the same folder as B: only the space id tells them apart.
  const B = sp("m1/sp2", "m1"), C = { ...sp("m1/sp3", "m1"), folder: B.folder };
  const repos = { [S]: [`${top}/src/A`, `${top}/src/A2`], [B.id]: ["/home/u/m1/sp2/x", "/home/u/m1/sp2/y"], [C.id]: ["/home/u/m1/sp3/z", "/home/u/m1/sp3/w"] };
  const show = (s) => { globalThis.__spaces = [...[A, B, C].filter((x) => x.id !== s.id).map((x) => ({ ...x, active: false })), { ...s, active: true }]; };
  let held = null, clock = keep.now();
  const scans = [], settle = () => new Promise((r) => setTimeout(r, 30));
  // fail[id]: how a scan of that space fails ("exit": non-zero and no output, "throw": exec throws, as on a
  // timeout, "partial": killed after part of its output). took: simulated seconds a scan takes (clock moves on).
  const fail = {}; let took = 0;
  globalThis.__fakeExec = (c, a) => {
    if (c !== "sh" || a[2] !== "sh" || !["scan", "status"].includes(a[3])) return { code: 1, stdout: "", stderr: "smoke: fake" };
    if (a[3] === "status") return { code: 0, stdout: "" };
    const id = spaces().find((s) => s.active)?.id; scans.push(id); clock += took * 1000;
    if (fail[id] === "exit") return { code: 1, stdout: "", stderr: "ssh: connect: no route" };
    if (fail[id] === "throw") throw new Error("timed out");
    if (fail[id] === "partial") return { code: 143, stdout: `T\t${a[4]}\t${a[4]}\n` };
    const out = { code: 0, stdout: `T\t${a[4]}\t/resolved/${id}\n` + (repos[id] ?? []).map((p) => `R\t${p}\tmain\t1\t0`).join("\n") + "\n" };
    return held ? new Promise((r) => held.push(() => r(out))) : out;
  };
  const fresh = () => { const timers = [], w = new View(), timedCx = { ...cx, timer: { every: (ms, f) => timers.push([ms, f]), after() {} } }; w.init({}, timedCx);
    w.tick = (ms) => { for (const [m, f] of timers) if (m === ms) f(timedCx); }; return w; };
  const paths = (w) => w.places.map((p) => p.path).sort().join(","), want = (id) => [...repos[id]].sort().join(",");
  const release = () => { const h = held ?? []; held = null; for (const f of h) f(); };
  // A scanned, then B scanned: a view that has kept both.
  const both = async () => { show(A); const w = fresh(); await settle(); show(B); w.findPlaces(cx); await settle(); return w; };
  // C-cache-switch-back (AC6.1): A, then B, then A: A's list is there at once, before any scan settles.
  // B records the same worktrees as A, so the switch alone does not change what render notes as recorded.
  const switchBack = async () => {
    const wt = globalThis.__shared["project-agent.worktrees"]; wt[B.id] = wt[S];
    try {
      const w = await both();
      if (w.placesFor !== B.id) return `setup: B's scan did not commit (placesFor ${w.placesFor})`;
      w.render(cx); w.stale = false; // the first render notes the recorded worktrees (stale): not what is checked here
      held = []; show(A); w.render(cx);
      if (w.placesFor !== S || paths(w) !== want(S)) return `back on A, expected A's kept list at once, got placesFor ${w.placesFor} places ${paths(w)}`;
      if (w.stale !== true) return `a kept list must still be rescanned (stale), got stale ${w.stale}`;
      const n = (globalThis.__execs ?? []).length; w.render(cx); w.render(cx);
      if ((globalThis.__execs ?? []).length !== n) return `a render with a kept list started ${(globalThis.__execs ?? []).length - n} exec(s)`;
      // The kept "real" map (root as given -> resolved) comes back with the list, not B's (M13).
      if (w.real?.[w.top()] !== `/resolved/${S}`) return `back on A, expected A's kept root mapping, got ${JSON.stringify(w.real)}`;
      return null;
    } finally { delete wt[B.id]; }
  };
  const parts = {
    "AC6.1": switchBack,
    // C-cache-updates: a rescan replaces the kept list (a repository appears, then one goes).
    "updates": async () => {
      const w = await both(), was = repos[S];
      try {
        show(A); w.findPlaces(cx); await settle();
        repos[S] = [...repos[S], `${top}/src/A3`]; w.findPlaces(cx); await settle();
        repos[S] = repos[S].filter((p) => !p.endsWith("/A2")); w.findPlaces(cx); await settle();
        show(B); w.findPlaces(cx); await settle(); held = []; show(A); w.render(cx);
        return w.placesFor === S && paths(w) === want(S) ? null : `the kept list did not follow the rescans: expected ${want(S)}, got placesFor ${w.placesFor} places ${paths(w)}`;
      } finally { repos[S] = was; }
    },
    // C-no-cross-space (AC6.3): A's scan finishing while B is shown leaves B's list, and asks for another scan.
    "AC6.3": async () => {
      const w = await both(); show(A); w.findPlaces(cx); await settle();
      held = []; w.findPlaces(cx); show(B); w.render(cx); w.stale = false; release(); await settle();
      if (w.placesFor !== B.id || paths(w) !== want(B.id)) return `a scan of A finishing on B: expected B's kept list, got placesFor ${w.placesFor} places ${paths(w)}`;
      if (w.stale !== true) return `the discarded scan of A must ask for another, got stale ${w.stale}`;
      // C, never scanned, shares B's machine, folder and recorded worktrees: nothing is kept for it.
      const wt = globalThis.__shared["project-agent.worktrees"]; wt[B.id] = wt[C.id] = [];
      try {
        show(C); w.render(cx);
        if (w.placesFor === C.id) return `a space never scanned (same machine and folder as B) shows a kept list (places ${paths(w)})`;
        w.findPlaces(cx); await settle();
        if (w.placesFor !== C.id || paths(w) !== want(C.id)) return `C's own scan: expected C's list, got placesFor ${w.placesFor} places ${paths(w)}`;
        held = []; show(B); w.render(cx);
        if (w.placesFor !== B.id || paths(w) !== want(B.id)) return `C's scan replaced B's kept list (same machine and folder): got placesFor ${w.placesFor} places ${paths(w)}`;
        return null;
      } finally { delete wt[B.id]; delete wt[C.id]; }
    },
    // At most 8 spaces kept, the least recently shown dropped.
    "limit": async () => {
      const nine = Array.from({ length: 9 }, (_, i) => sp(`m2/s${i}`, "m2"));
      for (const s of nine) repos[s.id] = [`/home/u/${s.id}/a`, `/home/u/${s.id}/b`];
      const w = fresh(); await settle();
      for (const s of nine) { globalThis.__spaces = [s]; w.render(cx); w.findPlaces(cx); await settle(); }
      held = []; globalThis.__spaces = [nine[1]]; w.render(cx);
      if (w.placesFor !== nine[1].id || paths(w) !== want(nine[1].id)) return `the 8 most recent spaces must be kept: space 2 of 9 was not (placesFor ${w.placesFor})`;
      globalThis.__spaces = [nine[0]]; w.render(cx);
      return w.placesFor === nine[0].id ? "more than 8 spaces kept: space 1 of 9 still shown from the cache" : null;
    },
    // Showing a kept space again makes it the most recently shown: the next space drops another one.
    "limit recency": async () => {
      const nine = Array.from({ length: 9 }, (_, i) => sp(`m3/s${i}`, "m3"));
      for (const s of nine) repos[s.id] = [`/home/u/${s.id}/a`, `/home/u/${s.id}/b`];
      const w = fresh(); await settle();
      for (const s of nine.slice(0, 8)) { globalThis.__spaces = [s]; w.render(cx); w.findPlaces(cx); await settle(); }
      globalThis.__spaces = [nine[0]]; w.render(cx); // shown again, not rescanned
      globalThis.__spaces = [nine[8]]; w.render(cx); w.findPlaces(cx); await settle();
      held = []; globalThis.__spaces = [nine[0]]; w.render(cx);
      if (w.placesFor !== nine[0].id) return `space 1, shown again before space 9, was dropped instead of space 2 (placesFor ${w.placesFor})`;
      globalThis.__spaces = [nine[1]]; w.render(cx);
      return w.placesFor === nine[1].id ? "space 2, the least recently shown, was kept" : null;
    },
    // C-remote-interval (AC6.2): each scan takes 3 s and the 20 s ticks keep their own times (start + 20 s each).
    // Three ticks (60 s) rescan a remote space once and a local one three times; six ticks (120 s): 2 and 6.
    "AC6.2": async () => {
      took = 3;
      try {
        for (const [s, n] of [[B, 1], [A, 3]]) {
          show(s); const base = clock = keep.now(); const w = fresh(); await settle(); scans.length = 0;
          for (let k = 1; k <= 6; k++) {
            clock = base + 20000 * k; w.tick(20000); await settle();
            const got = scans.filter((x) => x === s.id).length;
            if (k === 3 && got !== n) return `${s.machine ? "remote" : "local"} space, 3 s scans: expected ${n} scan(s) in three 20 s ticks (60 s), got ${got}`;
            if (k === 6 && got !== 2 * n) return `${s.machine ? "remote" : "local"} space, 3 s scans: expected ${2 * n} scan(s) in six 20 s ticks (120 s), got ${got}`;
          }
        }
        return null;
      } finally { took = 0; }
    },
    // C-M2: a scan that fails (non-zero exit, a throw or timeout, a killed scan) keeps the last good list and
    // says it could not refresh, with the list's age; a scan that succeeds and finds nothing empties the list.
    "failed scan": async () => {
      const was = repos[B.id];
      try {
        show(B); const c0 = clock = keep.now(); const w = fresh(); await settle();
        if (typeof w.placesNote !== "function") return "the view has no placesNote(spaceId) (the note shown when a scan failed)";
        if (w.placesNote(B.id) !== null) return `a good scan must show no note, got ${JSON.stringify(w.placesNote(B.id))}`;
        for (const mode of ["exit", "throw", "partial"]) {
          fail[B.id] = mode; clock = c0 + 5 * 60000; w.findPlaces(cx); await settle();
          if (w.placesFor !== B.id || paths(w) !== want(B.id)) return `${mode}: the last good list must stay, got placesFor ${w.placesFor} places ${paths(w)}`;
          const note = w.placesNote(B.id);
          if (!/could not refresh/i.test(note ?? "") || !/5 min/.test(note)) return `${mode}: expected a "could not refresh" note with the list's age (5 min), got ${JSON.stringify(note)}`;
          show(A); w.render(cx); held = []; show(B); w.render(cx); release(); await settle();
          if (w.placesFor !== B.id || paths(w) !== want(B.id)) return `${mode}: after a failed scan, a switch back lost the kept list (placesFor ${w.placesFor} places ${paths(w)})`;
        }
        fail[B.id] = null; repos[B.id] = []; w.findPlaces(cx); await settle();
        if (w.placesFor !== B.id || w.places.length !== 0) return `a good scan that finds nothing must empty the list, got ${paths(w)}`;
        if (w.placesNote(B.id) !== null) return `a good scan must clear the note, got ${JSON.stringify(w.placesNote(B.id))}`;
        return null;
      } finally { repos[B.id] = was; delete fail[B.id]; }
    },
    // M15: renders of the space already shown, with the 2 s stale tick between them, start no scan.
    "steady": async () => {
      show(B); const w = fresh(); await settle(); w.render(cx); w.stale = false; // the first render notes the recorded worktrees
      scans.length = 0; const n = (globalThis.__execs ?? []).length;
      for (let i = 0; i < 10; i++) { w.render(cx); w.tick(2000); await settle(); }
      const execs = (globalThis.__execs ?? []).length - n;
      return scans.length || execs ? `10 renders and 2 s ticks on the shown space started ${scans.length} scan(s), ${execs} exec(s)` : null;
    },
    // R7 (added by the person, 2026-11-16): while Changes is not the shown child of the side panel's stack (or the
    // panel is hidden), it does no periodic work, local or remote; shown again, it shows what it kept at once and
    // refreshes and scans at once (once each).
    "R7 hidden": async () => {
      const keepLayout = globalThis.__layout;
      const panel = (active, hidden = false) => ({ id: "root", children: [{ id: "panel", hidden, children: [{ id: "panel-body", type: "stack", active,
        children: [{ id: "changes", type: "block", content: { mod: "my-changes" } }, { id: "files", type: "block", content: { mod: "my-files" } }] }] }] });
      const count = (from) => { const x = (globalThis.__execs ?? []).slice(from); return { all: x.length, scan: x.filter((e) => e[0] === "sh" && e[4] === "scan").length, refresh: x.filter((e) => e[0] === "git" && e.includes("--show-toplevel")).length }; };
      try {
        for (const [how, hide, wake] of [["another stack child", panel("files"), "render"], ["the panel hidden", panel("changes", true), "render"], ["another stack child", panel("files"), "2 s tick"]]) {
          for (const s of [B, A]) {
            globalThis.__layout = panel("changes"); show(s); const base = clock = keep.now(); const w = fresh(); await settle(); w.render(cx); await settle();
            if (w.placesFor !== s.id) return `setup (${s.machine ? "remote" : "local"}): the first scan did not commit`;
            globalThis.__layout = hide; const n = (globalThis.__execs ?? []).length;
            // Three simulated minutes: every timer at its own pace, renders, a change notice (stale) and a folder-watch refresh.
            for (let k = 1; k <= 90; k++) {
              clock = base + 2000 * k; w.tick(2000); if (k % 5 === 0) w.tick(10000); if (k % 10 === 0) w.tick(20000);
              if (k === 30) w.stale = true; if (k === 40) w.refresh(cx); w.render(cx); await settle();
            }
            const hidden = count(n);
            if (hidden.all) return `${s.machine ? "remote" : "local"}, ${how}: expected no exec in 3 min while hidden, got ${hidden.all} (${hidden.scan} scan(s), ${hidden.refresh} refresh(es))`;
            globalThis.__layout = panel("changes"); const m = (globalThis.__execs ?? []).length;
            if (wake === "render") w.render(cx); else w.tick(2000);
            const now = count(m); // the execs start synchronously: "at once" means before anything settles
            if (now.scan !== 1 || now.refresh !== 1) return `${s.machine ? "remote" : "local"}, ${how}, shown again by a ${wake}: expected 1 scan and 1 refresh started at once, got ${now.scan} scan(s), ${now.refresh} refresh(es)`;
            if (w.placesFor !== s.id || paths(w) !== want(s.id)) return `${how}: shown again, expected the kept list at once, got placesFor ${w.placesFor} places ${paths(w)}`;
            await settle(); w.tick(2000); await settle(); w.render(cx); await settle();
            const shown = count(m);
            if (shown.scan !== 1 || shown.refresh !== 1) return `${s.machine ? "remote" : "local"}, ${how}, shown again by a ${wake}: expected 1 scan and 1 refresh at once, got ${shown.scan} scan(s), ${shown.refresh} refresh(es)`;
          }
        }
        return null;
      } finally { globalThis.__layout = keepLayout; }
    },
    // A switch, and the stale flag, still rescan a remote space at once, however young its list.
    "AC6.2 forced": async () => {
      show(B); clock = keep.now(); const w = fresh(); await settle(); show(A); w.render(cx); w.tick(2000); await settle();
      scans.length = 0; show(B); w.render(cx); w.tick(2000); await settle();
      if (scans.filter((x) => x === B.id).length !== 1) return `a switch back to a remote space must rescan it at once, got ${scans.length} scan(s)`;
      scans.length = 0; w.stale = true; w.tick(2000); await settle();
      return scans.length === 1 ? null : `the stale flag must rescan a remote space at once, got ${scans.length} scan(s)`;
    },
  };
  const errs = [];
  Date.now = () => clock;
  try {
    for (const [name, part] of Object.entries(parts)) {
      let err; try { err = await part(); } catch (e) { err = `threw ${e?.stack ?? e}`; }
      release(); await settle(); if (err) errs.push(`t-012 ${name} ${err}`);
    }
  } finally { release(); Date.now = keep.now; globalThis.__fakeExec = undefined; globalThis.__spaces = keep.spaces; }
  return errs.length ? errs.join("\n  ") : null;
};
// Both run: a failing AC3.2 does not hide the R6 results.
if (mod === "my-changes") { const ac32 = after[mod]; after[mod] = async (v) => [await ac32(v), await changesCache()].filter(Boolean).join("\n  ") || null; }
// t-010: a machine whose login sh has no ~/.local/bin on PATH (the remote desktop) still gets the
// launcher when pa-session is installed there; a "not installed" answer is checked again later.
// The real sh runs, with HOME a temp folder and a PATH without pa-session.
const launcherCase = async (newSpaceRun) => {
  const keep = { HOME: process.env.HOME, PATH: process.env.PATH }, now = Date.now, h = `${here}/.run/home-t010`, bin = `${h}/.local/bin/pa-session`;
  const wait = () => new Promise((r) => setTimeout(r, 400)), same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  fs.rmSync(h, { recursive: true, force: true }); fs.mkdirSync(`${h}/.local/bin`, { recursive: true });
  process.env.HOME = h; process.env.PATH = "/usr/bin:/bin";
  try {
    newSpaceRun("m1"); await wait();
    const none = newSpaceRun("m1");
    if (same(none, ["pa-session", "--ask"]) || same(none, [bin, "--ask"])) return `t-010 no pa-session installed, expected no launcher, got ${JSON.stringify(none)}`;
    fs.writeFileSync(bin, "#!/bin/sh\n", { mode: 0o755 });
    newSpaceRun("m2"); await wait();
    const got = newSpaceRun("m2");
    if (!same(got, [bin, "--ask"])) return `t-010 pa-session in ~/.local/bin but not on sh -l PATH: expected ${JSON.stringify([bin, "--ask"])}, got ${JSON.stringify(got)}`;
    Date.now = () => now() + 61000; // a "not installed" answer a minute old is asked again
    newSpaceRun("m1"); await wait();
    const again = newSpaceRun("m1");
    if (!same(again, [bin, "--ask"])) return `t-010 a "no launcher" answer was not checked again after a minute: got ${JSON.stringify(again)}`;
    return null;
  } finally { Date.now = now; process.env.HOME = keep.HOME; process.env.PATH = keep.PATH; }
};
// t-010 test gaps (VERIFY.md mutations M3, M3b, M3c, M4, M6b, M6c, M7, M8, M9): exec counts, a thrown check,
// the plain name on PATH, the fallback, and the shared "my-spaces.launcher" answers per machine.
const launcherMore = async (v) => {
  const keep = { HOME: process.env.HOME, PATH: process.env.PATH }, now = Date.now, h = `${here}/.run/home-t010b`;
  const wait = () => new Promise((r) => setTimeout(r, 400)), same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const shs = (m) => (globalThis.__execs ?? []).filter((x) => x[0] === "sh").length, run = (m) => v.newSpaceRun(m, cx), many = (m, k = 10) => { for (let i = 0; i < k; i++) run(m); };
  const L = () => globalThis.__shared["my-spaces.launcher"] ?? {};
  fs.rmSync(h, { recursive: true, force: true }); fs.mkdirSync(`${h}/.local/bin`, { recursive: true }); fs.mkdirSync(`${h}/onpath`, { recursive: true });
  process.env.HOME = h; process.env.PATH = "/usr/bin:/bin";
  v.launcher = {}; globalThis.__shared["my-spaces.launcher"] = { other: ["/o/pa-session", "--ask"] };
  try {
    // Neither found: the Claude entry, shared null, other machines' answers kept (M7, M8, M9).
    let n = shs(); many("n1"); await wait();
    if (shs() - n !== 1) return `t-010 first check: expected 1 sh for 10 calls, got ${shs() - n} (M3b)`;
    if (!same(run("n1"), v.claudeRun) || !v.claudeRun) return `t-010 no launcher: expected the Claude entry ${JSON.stringify(v.claudeRun)}, got ${JSON.stringify(run("n1"))} (M7)`;
    if (!("n1" in L()) || L().n1 !== null) return `t-010 no launcher: expected shared my-spaces.launcher.n1 === null, got ${JSON.stringify(L())} (M8)`;
    if (!same(L().other, ["/o/pa-session", "--ask"])) return `t-010 the shared write dropped another machine's answer: ${JSON.stringify(L())} (M9)`;
    // A fresh "no" is not checked again on every call (M3, M3b).
    await wait(); n = shs(); many("n1"); await wait(); // settle first: the checks above call newSpaceRun too
    if (shs() !== n) return `t-010 a fresh "no launcher" was checked again within the interval: ${shs() - n} sh (M3)`;
    // Found on PATH (this computer, key ""): the plain name, shared under "" (M6b, M6c, M8).
    fs.writeFileSync(`${h}/onpath/pa-session`, "#!/bin/sh\n", { mode: 0o755 }); process.env.PATH = `${h}/onpath:/usr/bin:/bin`;
    run(null); await wait();
    if (!same(run(null), ["pa-session", "--ask"])) return `t-010 pa-session on PATH: expected ["pa-session","--ask"], got ${JSON.stringify(run(null))} (M6b, M6c)`;
    if (!same(L()[""], ["pa-session", "--ask"]) || L().n1 !== null || !L().other) return `t-010 shared my-spaces.launcher after a local answer: ${JSON.stringify(L())} (M8, M9)`;
    // After the interval: one re-check for the "no" (in flight once), none for a positive answer (M3b, M3c).
    Date.now = () => now() + 61000;
    n = shs(); many("n1"); many(null); await wait();
    if (shs() - n !== 1) return `t-010 after the interval: expected 1 sh (one re-check of n1, none of the positive ""), got ${shs() - n} (M3b, M3c)`;
    n = shs(); many("n1"); many(null); await wait();
    if (shs() !== n) return `t-010 just re-checked: expected no sh, got ${shs() - n} (M3)`;
    // A thrown check is forgotten, not cached: the next call checks again (M4).
    globalThis.__onExec = (c) => { if (c === "sh") throw new Error("smoke: unreachable"); };
    n = shs(); run("t1"); await wait();
    globalThis.__onExec = undefined;
    if (v.launcher.t1 !== undefined) return `t-010 a thrown check was kept: launcher.t1 = ${JSON.stringify(v.launcher.t1)} (M4)`;
    if ("t1" in L()) return `t-010 a thrown check was shared: ${JSON.stringify(L())} (M4)`;
    run("t1"); await wait(); // __onExec throws before the stub records the call: only this retry is counted
    if (shs() - n !== 1) return `t-010 after a thrown check the next call did not check again: ${shs() - n} sh (M4)`;
    return null;
  } finally { Date.now = now; globalThis.__onExec = undefined; process.env.HOME = keep.HOME; process.env.PATH = keep.PATH; }
};
// t-010 review M1: a login profile that writes to stdout (a title escape with no newline, a banner) must not
// end up in argv[0]. Only a marked line naming "pa-session" or an absolute .../pa-session counts; else no launcher.
const launcherNoisy = async (v) => {
  const { launcherFrom } = await import(`./.run/${mod}/main.js`);
  if (typeof launcherFrom !== "function") return "t-010 M1 my-spaces exports no launcherFrom(result)";
  const ESC = "\x1b]0;title\x07", cases = [
    [{ code: 0, stdout: `${ESC}\n@pa-launcher:pa-session\n` }, ["pa-session", "--ask"]],
    [{ code: 0, stdout: "Welcome\n@pa-launcher:/h/.local/bin/pa-session\n" }, ["/h/.local/bin/pa-session", "--ask"]],
    [{ code: 0, stdout: "\n@pa-launcher:pa-session\nlogout banner\n" }, ["pa-session", "--ask"]], // output after the marker (an exit trap)
    [{ code: 0, stdout: `${ESC}pa-session\n` }, null], [{ code: 0, stdout: "pa-session\n" }, null], [{ code: 0, stdout: "" }, null],
    [{ code: 1, stdout: "\n@pa-launcher:pa-session\n" }, null], [{ code: 0, stdout: "\n@pa-launcher:rel/pa-session\n" }, null],
    [{ code: 0, stdout: "\n@pa-launcher:/a/pa-session-old\n" }, null], [{ code: 0, stdout: `\n@pa-launcher:/a${ESC}/pa-session\n` }, null],
    [{ code: 0 }, null]];
  for (const [r, want] of cases) { const got = launcherFrom(r); if (JSON.stringify(got) !== JSON.stringify(want)) return `t-010 M1 launcherFrom(${JSON.stringify(r)}) expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`; }
  // End to end with the real sh: a ~/.profile printing a title escape without a newline.
  const keep = { HOME: process.env.HOME, PATH: process.env.PATH, ENV: process.env.ENV }, h = `${here}/.run/home-t010c`, wait = () => new Promise((r) => setTimeout(r, 400));
  fs.rmSync(h, { recursive: true, force: true }); fs.mkdirSync(`${h}/onpath`, { recursive: true }); fs.mkdirSync(`${h}/.local/bin`, { recursive: true });
  fs.writeFileSync(`${h}/.profile`, "printf '\\033]0;title\\007'\n"); fs.writeFileSync(`${h}/onpath/pa-session`, "#!/bin/sh\n", { mode: 0o755 });
  process.env.HOME = h; process.env.PATH = `${h}/onpath:/usr/bin:/bin`; delete process.env.ENV;
  try {
    v.launcher = {}; v.newSpaceRun("q1", cx); await wait();
    const got = v.newSpaceRun("q1", cx);
    if (JSON.stringify(got) !== JSON.stringify(["pa-session", "--ask"])) return `t-010 M1 noisy ~/.profile, pa-session on PATH: expected ["pa-session","--ask"], got ${JSON.stringify(got)}`;
    fs.rmSync(`${h}/onpath/pa-session`); fs.writeFileSync(`${h}/.local/bin/pa-session`, "#!/bin/sh\n", { mode: 0o755 });
    v.newSpaceRun("q2", cx); await wait();
    const got2 = v.newSpaceRun("q2", cx);
    if (JSON.stringify(got2) !== JSON.stringify([`${h}/.local/bin/pa-session`, "--ask"])) return `t-010 M1 noisy ~/.profile, pa-session in ~/.local/bin: expected the absolute path, got ${JSON.stringify(got2)}`;
    return null;
  } finally { process.env.HOME = keep.HOME; process.env.PATH = keep.PATH; if (keep.ENV !== undefined) process.env.ENV = keep.ENV; }
};
if (mod === "my-spaces") after[mod] = async (v) => { v.launcher = {}; return (await launcherCase((m) => v.newSpaceRun(m, cx))) ?? (await launcherMore(v)) ?? launcherNoisy(v); };
// t-010 (my-new-menu): New space on a remote machine runs the launcher there too, not a plain shell.
if (mod === "my-new-menu") after[mod] = async (v) => {
  if (typeof v.newSpaceArgs !== "function") return "t-010 my-new-menu has no newSpaceArgs(space)";
  globalThis.__shared["my-spaces.launcher"] = { m9: ["/x/pa-session", "--ask"] };
  const remote = v.newSpaceArgs({ id: "m9/sp9", machine: "m9" }), local = v.newSpaceArgs({ id: S, machine: null }), unknown = v.newSpaceArgs({ id: "m8/sp8", machine: "m8" });
  if (JSON.stringify(remote) !== JSON.stringify({ argv: ["/x/pa-session", "--ask"] })) return `t-010 remote New space expected the launcher, got ${JSON.stringify(remote)}`;
  if (JSON.stringify(local) !== JSON.stringify({ argv: ["pa-session", "--ask"] })) return `t-010 local New space expected pa-session --ask, got ${JSON.stringify(local)}`;
  if (JSON.stringify(unknown) !== "{}") return `t-010 remote New space with no launcher known expected {}, got ${JSON.stringify(unknown)}`;
  // The New space row really runs space.new with newSpaceArgs (M5b): render with the row's action captured, then run it.
  const keep = globalThis.__spaces, row = v.row; let action = null;
  v.row = function (id, icon, name, act, ...rest) { if (id === "space") action = act; return row.call(this, id, icon, name, act, ...rest); };
  try {
    for (const [sp, want] of [[{ id: "m9/sp9", name: "r", active: true, machine: "m9", folder: "/r", tabs: [] }, { argv: ["/x/pa-session", "--ask"] }], [{ ...keep[0] }, { argv: ["pa-session", "--ask"] }]]) {
      globalThis.__spaces = [sp]; action = null; v.render(cx);
      if (!action) return "t-010 my-new-menu renders no New space row (id space)";
      globalThis.__runs = []; action();
      const got = globalThis.__runs.filter((r) => r.name === "space.new");
      if (got.length !== 1 || JSON.stringify(got[0].args) !== JSON.stringify(want)) return `t-010 New space row (${sp.machine ?? "local"}) expected space.new ${JSON.stringify(want)}, got ${JSON.stringify(globalThis.__runs)} (M5b)`;
    }
  } finally { v.row = row; globalThis.__spaces = keep; }
  return null;
};
// t-167 (my-files): the Files view with the Project Agent section open, 31 task shortcuts, 5 workers per
// task in "project-agent.workers" (3 live, 1 exited, 1 with no terminal) and 200 terminals. One render
// asks the host for terminals() at most 2 times (each call is a host call; per worker calls ran past
// Herdr's render budget: "interrupted"), and each shortcut still shows the chips of its live workers only.
const filesManyWorkers = (v) => {
  const keep = { terminals: globalThis.__terminals, shared: { ...globalThis.__shared }, filterText: v.filterText, folded: v.placesFolded };
  const crew = {}, terms = [], places = [{ label: "All evidence", path: "/e", group: "Project Agent" }], want = [];
  for (let i = 0; i < 31; i += 1) {
    const task = `t-${100 + i}`;
    places.push({ label: `${task} evidence · 3 files`, detail: "x", path: `/e/${task}`, group: "Project Agent", task });
    crew[`w${i}-gone`] = { task, role: "check" };
    crew[`w${i}-exited`] = { task, role: "design" }; terms.push({ address: `w${i}-exited`, state: "exited", status: "idle", labels: {} });
    for (const role of ["build", "verifier", "reviewer"]) {
      const address = `w${i}-${role}`;
      crew[address] = { task, role }; terms.push({ address, state: "live", status: "working", labels: {} }); want.push(`Show the ${role} (${address})`);
    }
  }
  while (terms.length < 200) terms.push({ address: `x${terms.length}`, state: "live", status: "idle", labels: {} });
  globalThis.__terminals = [...keep.terminals, ...terms];
  Object.assign(globalThis.__shared, { "project-agent.workers": { [S]: crew }, "my-files.places": { [S]: places }, "my-files.root": null });
  v.filterText = ""; v.placesFolded = new Set();
  try {
    // A first render moves the view off the pinned folder (it may reopen the file it showed there); then the tree.
    v.render(cx); v.show(null);
    globalThis.__tooltips = []; globalThis.__terminalsCalls = 0;
    v.render(cx);
    const calls = globalThis.__terminalsCalls, chips = globalThis.__tooltips.filter((x) => String(x).startsWith("Show the "));
    if (calls > 2) return `t-167 one render with 31 task shortcuts and 155 workers called terminals() ${calls} times (at most 2 wanted)`;
    if (JSON.stringify(chips) !== JSON.stringify(want)) return `t-167 worker chips wrong: expected ${want.length} live-worker chips ${JSON.stringify(want.slice(0, 3))}..., got ${chips.length} ${JSON.stringify(chips.slice(0, 3))}...`;
    return null;
  } finally {
    globalThis.__terminals = keep.terminals; globalThis.__shared = Object.assign(globalThis.__shared, keep.shared);
    v.filterText = keep.filterText; v.placesFolded = keep.folded; delete globalThis.__tooltips; delete globalThis.__terminalsCalls;
  }
};
if (mod === "my-files") after[mod] = async (v) => filesManyWorkers(v);
if (mod === "my-toast") after[mod] = async () => (globalThis.__execs ?? []).length ? `I1 my-toast tried to start a process: ${globalThis.__execs.map((x) => x[0]).join(", ")}` : null;
let n = 0, failed = 0;
const fail = (msg) => { console.log(`FAIL ${mod} ${msg}`); failed += 1; process.exitCode = 1; };
for (const [i, prep] of (states[mod] ?? [() => {}]).entries()) {
  prep(v); globalThis.__runs = []; v.render(cx); n += 1;
  const err = checks[mod]?.[i]?.(v, globalThis.__runs);
  if (err) fail(`state ${i}: ${err}`);
}
await new Promise((r) => setTimeout(r, 300));
if (after[mod]) { const err = await after[mod](v); if (err) fail(`after: ${err}`); }
// Self-check, every mod: the stub exec must refuse these programs even without __noSpawn (bare and by path).
{ const { exec } = await import("./stubs.mjs"), keep = globalThis.__noSpawn; globalThis.__noSpawn = false;
  for (const c of ["terminal-notifier", "osascript", "herdr-app", "herdr", "hc"]) for (const p of [c, `/nonexistent/bin/${c}`]) {
    const r = await exec(p, []); if (r.stderr !== "smoke: not spawned") fail(`I1 stub exec did not refuse ${p}`); }
  globalThis.__noSpawn = keep; }
if (liveKnownAgents !== (LIVE_KNOWN_AGENTS[mod] ?? 0)) fail(`t-194 live: init called knownAgents() ${liveKnownAgents} time(s), ${LIVE_KNOWN_AGENTS[mod] ?? 0} expected (R3)`);
// t-194: `herdr-app check` runs init() and one render for real, then exits without waiting for or ending what
// they started: every process (knownAgents()'s login-shell probe, exec(), hc()) is left running with ppid 1.
// While checking() is true a mod starts none, from init or anything it starts (spawns, promises, timers) or
// from render. Each pass: fresh views, a cx whose timers fire once, one render, 400 ms; every call is counted.
const checkingPass = async (label, { views = 1, machine = null, checkingFn, live = noChecking, props, win, share } = {}) => {
  await new Promise((r) => setTimeout(r, 300));
  const keep = { spaces: globalThis.__spaces, shared: JSON.stringify(globalThis.__shared), noSpawn: globalThis.__noSpawn, props: globalThis.__props, win: globalThis.__window };
  if (props) globalThis.__props = props;
  if (win) globalThis.__window = win;
  if (share) Object.assign(globalThis.__shared, share);
  Object.assign(globalThis, { __knownAgentsCalls: 0, __knownAgentsArgs: [], __execs: [], __hcs: [], __noSpawn: true, __checking: true });
  if (checkingFn) globalThis.__checkingFn = checkingFn;
  globalThis.__spaces = keep.spaces.map((x) => ({ ...x, machine }));
  const errors = []; let on = true;
  const later = (f) => { setTimeout(() => { if (on) try { f(checkCx); } catch (e) { errors.push(`timer: ${e?.message ?? e}`); } }, 50); };
  const checkCx = { ...cx, spawn(f) { const p = f(checkCx); if (p?.catch) p.catch((e) => errors.push(`spawn: ${e?.message ?? e}`)); return p; }, timer: { every: (_ms, f) => later(f), after: (_ms, f) => later(f) } };
  try {
    const { default: Mod } = await import(`./.run/${mod}/main.js`), vs = Array.from({ length: views }, () => new Mod());
    for (const x of vs) { try { x.init?.(globalThis.__props ?? {}, checkCx); } catch (e) { errors.push(`init: ${e?.message ?? e}`); } }
    for (const x of vs) { try { x.render(checkCx); } catch (e) { errors.push(`render: ${e?.message ?? e}`); } }
    await new Promise((r) => setTimeout(r, 400));
  } finally {
    on = false;
    delete globalThis.__checking; delete globalThis.__checkingFn;
    globalThis.__spaces = keep.spaces; globalThis.__noSpawn = keep.noSpawn; globalThis.__props = keep.props; globalThis.__window = keep.win;
    for (const k of Object.keys(globalThis.__shared)) delete globalThis.__shared[k];
    Object.assign(globalThis.__shared, JSON.parse(keep.shared));
  }
  const ka = globalThis.__knownAgentsCalls, execs = globalThis.__execs, hcs = globalThis.__hcs, want = live ? views * (LIVE_KNOWN_AGENTS[mod] ?? 0) : 0;
  const bad = [...errors];
  if (ka !== want) bad.push(`knownAgents() called ${ka} time(s) (${JSON.stringify(globalThis.__knownAgentsArgs)}), ${want} expected`);
  if (!live && execs.length) bad.push(`exec() called ${execs.length} time(s): ${[...new Set(execs.map((x) => x.slice(0, 2).join(" ")))].join(", ")}`);
  if (!live && hcs.length) bad.push(`hc() called ${hcs.length} time(s): ${[...new Set(hcs.map((x) => x.slice(0, 2).join(" ")))].join(", ")}`);
  for (const b of bad) fail(`t-194 checking (${label}): ${b}`);
};
await checkingPass("local, two instances", { views: 2 }); // hostile cases 4 and 6
await checkingPass("remote space m1", { machine: "m1" }); // hostile case 5
// Mods whose init starts a process only with some props or window: the space menu of a space (a git
// look), a toast while Herdr is behind another app (a macOS notification).
if (mod === "my-menu") await checkingPass("space menu", { props: { tab: "space", target: { id: S } } });
// Files with a pinned folder naming a file to open (it unfolds the file's folders: a directory listing each).
if (mod === "my-files") await checkingPass("pinned folder with a file", { share: { "my-files.root": { space: S, path: top, label: "evidence t-001", file: "src/A/x.md", task: "t-001", at: 7 } } });
if (mod === "my-toast") await checkingPass("Herdr not in front", { win: { platform: "macos", active: false } });
if (!noChecking) {
  // Hostile cases 2 and 3: only checking() === true counts; anything else, or a throw, is a live window.
  for (const [label, f] of [["checking() returns 1", () => 1], ['checking() returns "yes"', () => "yes"], ["checking() returns undefined", () => undefined], ["checking() throws", () => { throw new Error("no"); }]])
    await checkingPass(label, { checkingFn: f, live: true });
}
console.log(`${mod}: rendered ${n} state(s) ${failed ? `with ${failed} failure(s)` : "without an error"}`);
