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
  "project-agent.workers": { [S]: { t2: { task: "t-001", title: "Add retry", role: "build", state: "in-progress" } } }, "space.home": {}, "my-files.places": { [S]: [{ label: "All evidence", path: "/e", group: "Project Agent" }, { label: "t-001 evidence · 2 files", detail: "Add retry", path: "/e/t-001", group: "Project Agent" }] }, "project-agent.show": { space: S, task: "t-001", at: 1 } };
globalThis.__layout = { id: "root", children: [{ id: "panel-body", children: [{ id: "agents-view", children: [{ id: "agents-picker", size: { px: 200 } }, { id: "agents-live", content: { terminal: "t2" } }] }] }] };
if (mod === "project-agent" && process.argv[3] === "delete-worker") globalThis.__props = { deleteWorker: { space: S, machine: null, address: "t2", name: "t-001-build" } };
const { cx } = await import("./stubs.mjs");
const View = (await import(`./.run/${mod}/main.js`)).default, v = new View();
v.init?.(globalThis.__props ?? {}, cx);
await new Promise((r) => setTimeout(r, 400));
const states = {
  "my-changes": [(v) => { v.places = [{ path: `${top}/src/A`, branch: "main", count: 2, task: null }, { path: `${top}/worktrees/a/src/Pkg`, branch: "t-001", count: 1, task: "t-001" }, { path: "/elsewhere/wt", branch: "x", count: 0, task: null }]; v.placesFor = S; v.real = {}; },
    (v) => { v.layout = "list"; }, (v) => { v.layout = "tasks"; }, (v) => { v.all = true; v.layout = "tree"; v.foldedDirs.add("/worktrees/a/src"); }, (v) => { v.pin(`${top}/src/A`, cx); }, (v) => { v.root = `${top}/src/A`; v.files = [{ path: "a/b.txt", status: "M", add: 1, del: 2 }]; }],
  "my-agent-picker": [() => {}, () => { globalThis.__layout.children[0].children[0].children[0].size.px = 58; }, () => { globalThis.__layout.children[0].children[0].children[0].size.px = 30; }],
  "my-files": [() => {}, (v) => { v.placesFolded = new Set(["Project Agent"]); }, (v) => { v.file = "README.md"; v.markdown = "# hi"; v.rendered = true; }, (v) => { v.rendered = false; },
    (v) => { globalThis.__shared["my-files.root"] = { space: S, path: top, label: "evidence t-001", file: "src/A/x.md", at: 5 }; v.root = top; }, (v) => { v.sidebarHidden = true; }, (v) => { v.sidebarHidden = false; v.filterText = "x md"; v.allFiles = ["src/A/x.md", "README.md", "a/b/xy.md"]; v.allFilesFor = v.context?.key; }, (v) => { globalThis.__shared["my-files.root"] = { space: S, path: top, label: "evidence t-001", file: null, at: 6 }; }],
  "project-agent": [(v) => { v.space = S; v.data = { agent: { name: "proj", project: top, profile: "x", terminal: "t1" }, errors: [], profile: { linkTemplates: [{ match: "PR-\\d+", url: "https://x/{0}" }], actions: [] }, profileDir: "/p", evidence: new Map([["t-001", ["VERIFY.md", "spec.md"]]]),
      schedule: { everyMinutes: 5, paused: false, onlyWhileActive: true, quietHours: null, lastPass: null, nextPass: null }, request: null,
      ledger: { passCount: 2, tasks: [{ id: "t-001", title: "Add retry PR-123", goal: "g", state: "needs-decision", phase: "build", tier: "normal", updated: "2026-11-13T01:00:00Z", workers: [{ address: "t2", role: "build" }, { address: "t9", role: "reviewer" }], links: [{ label: "doc", url: "https://d" }] }, { id: "t-000", title: "old", state: "done" }] } };
      v.cards = [{ id: "d-001", path: "/x/d-001.json", text: "{}", card: { id: "d-001", task: "t-001", question: "Q?", context: "c", options: [{ label: "A", detail: "a" }, { label: "B", detail: "b" }], recommendation: "A", status: "open", created: "2026-11-13T00:00:00Z" } }, { id: "d-bad", path: "/x/b", text: "{", card: null, error: "bad" }, { id: "d-000", path: "/x/0", text: "{}", card: { id: "d-000", task: "t-000", question: "Q", options: [{ label: "A" }], status: "answered", answer: "A", note: "n", answered: "2026-11-13T00:00:00Z" } }];
      v.rules.data = { path: "/r", text: "{}", error: null, rules: [{ id: "r-1", title: "T", text: "x", why: "w", appliesTo: "all", status: "active", order: 20, source: "core" }, { id: "r-2", title: "P", text: "x", status: "proposed", order: 10 }, { id: "r-3", title: "D", text: "x", status: "declined" }] }; },
    (v) => { v.view = "tasks"; v.open.add("t-001"); v.folded.clear(); v.armedTask = "t-001"; }, (v) => { v.view = "decisions"; v.choice["d-001"] = "B"; v.older = true; v.spotlight = "d-001"; },
    (v) => { v.view = "rules"; v.rules.open.add("r-1"); v.rules.declined = true; }, (v) => { v.schedule.open = true; v.schedule.custom = { value: () => "7" }; v.schedule.quietFrom = v.schedule.custom; v.schedule.quietTo = v.schedule.custom; v.data.schedule.paused = true; }],
};
if (v.worker) states[mod] = [() => {}, (v) => { v.worker.info = { address: "t2", state: "live", task: "t-001", title: "x", role: "build", onlyWorker: true, worktree: { path: "/w", kind: "worktree", uncommitted: 2, unpushed: 1, removesBranches: false, branch: "b", sharedWith: [], keep: false } }; },
  (v) => { v.worker.info.worktree.sharedWith = ["t9"]; v.worker.withTask = true; v.worker.error = "x"; }, (v) => { v.worker.info.worktree = null; }];
let n = 0;
for (const prep of states[mod] ?? [() => {}]) { prep(v); v.render(cx); n += 1; }
await new Promise((r) => setTimeout(r, 300));
console.log(`${mod}: rendered ${n} state(s) without an error`);
