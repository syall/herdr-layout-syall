// Modified from the `changes` mod shipped with Herdr 0.1.15 (Apache License 2.0).
// Changes by syall: a repository picker (tree, list, by task) with links to agents and tasks.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, v_virtual_list } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings, shared, setShared, terminals, layout, run } from "herdr";

// my-changes: the view can be pinned to another repository of the shown space (a worktree,
// or one repository of a folder that holds several). Per space; null follows the focused pane.
const pinned = {};

// Where the focused pane is, whatever is pinned.
function here() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on, space: space?.id };
}

function location() {
  const at = here(), pin = pinned[at.space];
  return pin ? { cwd: pin, on: spaces().find((s) => s.active)?.machine ?? null } : { cwd: at.cwd, on: at.on };
}

// Finds the repositories under a folder, without looking inside one: a line "R<tab>path<tab>
// branch<tab>changed files" for each, and "W<tab>path" for each of its git worktrees (which may
// live elsewhere). A folder that is itself a repository is just that one. Dot-folders and
// build output are skipped; four levels deep is enough for workspace/worktrees/<name>/src/<repo>.
const SCAN = `
emit() { b=$(git -C "$1" rev-parse --abbrev-ref HEAD 2>/dev/null); n=$(git --no-optional-locks -C "$1" status --porcelain 2>/dev/null | wc -l | tr -d ' '); a=$(git -C "$1" rev-list --count HEAD --not --remotes 2>/dev/null || echo 0); printf 'R\\t%s\\t%s\\t%s\\t%s\\n' "$1" "$b" "$n" "$a"; }
scan() {
  if [ -e "$1/.git" ]; then
    emit "$1"
    git -C "$1" worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p' | while read -r w; do printf 'W\\t%s\\n' "$w"; done
    return
  fi
  [ "$2" -ge 4 ] && return
  for d in "$1"/*/; do
    [ -d "$d" ] || continue
    case "\${d%/}" in */node_modules|*/build|*/env|*/logs|*/target|*/dist) continue;; esac
    scan "\${d%/}" $(($2 + 1))
  done
}
mode=$1; shift
# Paths are printed resolved (as git prints its worktrees), with a "T" line mapping each root.
if [ "$mode" = scan ]; then
  for r in "$@"; do real=$(cd "$r" 2>/dev/null && pwd -P) || continue; printf 'T\\t%s\\t%s\\n' "\${r%/}" "$real"; scan "$real" 0; done
else
  for r in "$@"; do [ -e "$r/.git" ] && emit "$r"; done
fi
`;

const key = () => JSON.stringify(location());
// Reads write nothing under .git (no index refresh or lock, no fsmonitor cookie):
// the folder watch would see it, and every refresh would start the next one.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const countLines = (text) => text ? text.split("\n").length - Number(text.endsWith("\n")) : 0;

// Text draws a tab as nothing: pad each to the next 4-column stop.
const untab = (text) => text.replace(/[^\t]*\t/g, (s) => s.slice(0, -1).padEnd((s.length - 1) - (s.length - 1) % 4 + 4));

// Numbers each diff line once, so a frame only draws the rows on screen.
function diffRows(lines) {
  let old = 0, next = 0;
  return lines.map((line) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (match) { old = +match[1]; next = +match[2]; return { kind: "@", text: line }; }
    const kind = line[0];
    if (kind === "-") return { kind, number: old++, text: untab(line.slice(1)) || " " };
    if (kind === "+") return { kind, number: next++, text: untab(line.slice(1)) || " " };
    if (kind === " ") { old++; return { kind, number: next++, text: untab(line.slice(1)) || " " }; }
    return { kind: "", text: line };
  });
}

export default class Changes extends View {
  init(_props, cx) {
    this.files = []; this.rows = []; this.diffWidth = 0; this.message = ""; this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Commit message" });
    this.input.on("change", (_e, cx) => {
      const hadMessage = Boolean(this.message.trim());
      this.message = this.input.value();
      if (hadMessage !== Boolean(this.message.trim())) cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.commit(cx));
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    this.places = []; // [{ path, branch, count, task }] repositories this space's work is in
    this.placesBy = new Map(); // space id -> { places, real, at }: the last scan of each space, 8 at most, oldest shown dropped
    this.layout = ["list", "tasks"].includes(localStorage.getItem("places.layout")) ? localStorage.getItem("places.layout") : "tree";
    this.all = localStorage.getItem("places.all") === "1"; // show repositories without changes too
    this.foldedDirs = new Set(JSON.parse(localStorage.getItem("places.closed") ?? "[]")); // folded tree folders
    this.refresh(cx);
    this.findPlaces(cx);
    cx.timer.every(10000, (cx) => this.refresh(cx));
    cx.timer.every(20000, (cx) => this.findPlaces(cx, { tick: true }));
    cx.timer.every(2000, (cx) => { if (this.stale) { this.stale = false; this.findPlaces(cx); } });
    this.scope = null; // "work": uncommitted changes; "branch": everything since the base branch; null: decided per repository
  }

  // The folder everything is shown relative to: the space's home folder (shared "space.home"),
  // else its Project Agent's project, else the folder the space was made in.
  top() {
    const space = spaces().find((s) => s.active);
    const agent = Object.values(shared("project-agent.tabs") ?? {}).find((r) => r.space === space?.id);
    return ((shared("space.home") ?? {})[space?.id] || agent?.project || space?.folder || here().cwd || "").replace(/\/+$/, "");
  }

  // A path as shown: relative to the top folder when inside it.
  rel(path) {
    const top = this.top();
    for (const base of [top, this.real?.[top]]) {
      if (base && path === base) return ".";
      if (base && path.startsWith(`${base}/`)) return path.slice(base.length + 1);
    }
    return path;
  }

  // Every repository under the top folder, the focused folder and each worktree a Project Agent
  // recorded for this space (shared "project-agent.worktrees"), plus those repositories' own git
  // worktrees wherever they live.
  // The 20 s timer passes tick: a space on another machine is then looked at again only once its
  // list is a minute old (a scan there takes seconds). Anything else (a switch, the stale flag,
  // Refresh) looks now.
  findPlaces(cx, { tick = false } = {}) {
    const at = here(), top = this.top();
    this.restore(at.space);
    const space = spaces().find((s) => s.active), on = space?.machine ?? null;
    if (tick && on && Date.now() - (this.placesBy.get(at.space)?.at ?? -Infinity) < 60000) return;
    if (!(top || at.cwd) || this.finding) return;
    this.finding = true;
    const trees = (shared("project-agent.worktrees") ?? {})[at.space] ?? [];
    const inside = (p, dir) => p === dir || p.startsWith(`${dir}/`);
    // Roots: the top folder, then anything not already inside an earlier root.
    const roots = [];
    for (const r of [top, at.cwd, ...trees.map((w) => w.path)]) if (r && !roots.some((x) => inside(r, x))) roots.push(r);
    cx.spawn(async (cx) => {
      const found = new Map(), extra = new Set(), real = {};
      const read = (out) => {
        for (const line of out.split("\n").filter(Boolean).slice(0, 1500)) {
          const [kind, path, branch, count, ahead] = line.split("\t");
          if (kind === "T") real[path] = branch; // a root as given -> resolved
          else if (kind === "R" && path && found.size < 300) found.set(path, { path, branch, count: Number(count) || 0, ahead: Number(ahead) || 0 });
          else if (kind === "W" && path) extra.add(path);
        }
      };
      try {
        read((await exec("sh", ["-c", SCAN, "sh", "scan", ...roots.slice(0, 12)], { on, timeout: 60000 })).stdout);
        const more = [...extra].filter((p) => !found.has(p)).slice(0, 40);
        if (more.length) read((await exec("sh", ["-c", SCAN, "sh", "status", ...more], { on, timeout: 60000 })).stdout);
      } catch {}
      this.finding = false;
      if (spaces().find((s) => s.active)?.id !== at.space) { this.stale = true; return; } // the space changed: look again
      this.real = real;
      for (const p of found.values()) p.task = trees.find((w) => inside(p.path, w.path) || inside(p.path, real[w.path] ?? w.path))?.task ?? null;
      this.places = [...found.values()].sort((x, y) => this.rel(x.path).localeCompare(this.rel(y.path)));
      this.placesFor = at.space;
      this.placesBy.delete(at.space); this.placesBy.set(at.space, { places: this.places, real, at: Date.now() });
      while (this.placesBy.size > 8) this.placesBy.delete(this.placesBy.keys().next().value);
      cx.notify();
    });
  }

  // Shows the list kept for a space shown again at once (no exec), and asks for a new scan of it.
  // An empty list shows nothing, so it is left to the scan as before.
  restore(id) {
    const kept = this.placesBy.get(id);
    if (!kept?.places.length || this.placesFor === id) return;
    this.places = kept.places; this.real = kept.real; this.placesFor = id; this.stale = true;
    this.placesBy.delete(id); this.placesBy.set(id, kept); // now the most recently shown
  }

  pin(path, cx) {
    const at = here();
    if (path) pinned[at.space] = path; else delete pinned[at.space];
    this.refresh(cx); cx.notify();
  }

  // This space's live agents other than its Project Agent, each with the folder it was started
  // in (resolved the way the scan resolves paths): [{ address, name, status, cwd }].
  workers() {
    const space = spaces().find((s) => s.active);
    if (!space) return [];
    const all = terminals().filter((x) => x.state === "live"), tabs = new Set(space.tabs.map((x) => x.id));
    const roots = new Set(panes().filter((p) => tabs.has(p.tab) && p.terminal).map((p) => p.terminal));
    const mine = (x, hops = 0) => roots.has(x.address) || (hops < 6 && x.parent && all.some((p) => p.address === x.parent && mine(p, hops + 1)));
    const agentTabs = new Set(Object.values(shared("project-agent.tabs") ?? {}).map((r) => r.terminal));
    const resolve = (path) => { for (const [given, real] of Object.entries(this.real ?? {})) if (path === given || path.startsWith(`${given}/`)) return real + path.slice(given.length); return path; };
    return all.filter((x) => mine(x) && !agentTabs.has(x.address) && (x.program?.agent || x.status) && x.cwd)
      .map((x) => ({ address: x.address, name: x.name || x.address.split("/").pop(), status: x.status, cwd: resolve(String(x.cwd).replace(/\/+$/, "")) }));
  }

  // Shows an agent's live terminal: in the layout's Agents view when it has one (a stack child
  // "agents-view" holding a block "agents-live"), else as a peek over the tab.
  showAgent(address) {
    const find = (n, id) => { if (n?.id === id) return n; for (const c of n?.children ?? []) { const f = find(c, id); if (f) return f; } return null; };
    const tree = JSON.parse(JSON.stringify(layout() ?? {})), view = find(tree, "agents-view");
    if (!view) { run("terminal.peek", { terminal: address }); return; }
    let live = find(tree, "agents-live");
    if (!live) { live = { id: "agents-live", type: "block" }; view.children = [...(view.children ?? []), live]; }
    live.content = { terminal: address }; live.hidden = false;
    run("layout.set", { layout: tree });
    run("layout.select", { stack: "panel-body", child: "agents-view" });
  }

  // The repositories as a tree of folders under the top folder. A folder with one sub-folder
  // and nothing else is drawn joined to it ("worktrees/fix-login/src").
  tree(list) {
    const root = { name: "", dirs: new Map(), repos: [] };
    for (const p of list) {
      const parts = this.rel(p.path).split("/").filter(Boolean);
      const name = parts.pop() ?? ".";
      let node = root;
      // Each folder keeps its full path, to match the agents working in it.
      let abs = p.path.split("/").slice(0, p.path.split("/").length - parts.length - 1).join("/");
      for (const part of parts) { abs = `${abs}/${part}`; if (!node.dirs.has(part)) node.dirs.set(part, { name: part, abs, dirs: new Map(), repos: [] }); node = node.dirs.get(part); }
      node.repos.push({ ...p, name });
    }
    const squash = (node) => {
      for (const [k, child] of [...node.dirs]) {
        let c = child;
        while (c.dirs.size === 1 && !c.repos.length) { const [only] = c.dirs.values(); c = { ...only, name: `${c.name}/${only.name}` }; }
        squash(c); node.dirs.set(k, c);
      }
    };
    squash(root);
    return root;
  }

  // The repositories of this space, as a list or a collapsible tree; a click pins the view to one.
  picker(t) {
    const at = here(), pin = pinned[at.space] ?? null;
    const mine = this.placesFor === at.space ? this.places : [];
    const crew = this.workers(), near = (p, dir) => p === dir || p.startsWith(`${dir}/`);
    // Listed: uncommitted files, commits that are on no remote yet, a task's worktree, or an agent at work there.
    const active = (p) => p.count > 0 || p.ahead > 0 || Boolean(p.task) || crew.some((w) => near(w.cwd, p.path));
    const shown = this.all ? mine : mine.filter((p) => active(p) || p.path === pin);
    if (this.placesFor !== at.space && !this.finding) this.stale = true; // another space: look now, not in 20 s
    if (mine.length < 2 && !pin) return null; // one repository: nothing to choose
    // New worktrees: look again as soon as the Project Agent records one.
    const recorded = JSON.stringify((shared("project-agent.worktrees") ?? {})[at.space] ?? []);
    if (recorded !== this.recorded) { this.recorded = recorded; this.stale = true; }
    const changed = mine.filter(active).length;
    const toggle = (id, label, on, click) => div().id(id).px(6).h(20).flex().flex_none().items_center().rounded(5).text_size(11).cursor_pointer()
      .bg(on ? t.selected : t.background).text_color(on ? t.foreground : t.dim).hover((s) => s.bg(t.hover)).on_click(click).child(label);
    const count = (n) => div().flex_none().text_size(10.5).text_color(n ? t.blocked : t.dim).child(n > 999 ? "999+" : String(n));
    // Commits that exist only here (on no remote): "3↑".
    const aheadOf = (n) => div().flex_none().text_size(10.5).text_color(t.working).child(`${n > 99 ? "99+" : n}↑`);
    // Agents by where they work: in a repository, else in the nearest folder shown, else at the top.
    const agents = this.workers(), within = (p, dir) => p === dir || p.startsWith(`${dir}/`);
    const inRepo = (w) => mine.some((p) => within(w.cwd, p.path));
    const jump = (ws, key) => ws.slice(0, 3).map((w, i) => h_flex().id(`agent-${key}-${i}`).flex_none().h(18).px(5).gap(4).items_center().rounded(5).border(1).border_color(t.border)
      .text_size(10.5).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.raised).text_color(t.foreground)).tooltip(`Show ${w.name} (${w.address})`)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => { cx.stop_propagation(); this.showAgent(w.address); })
      .child(div().size(6).rounded(3).bg(t[w.status] ?? t.idle)).child(div().max_w(110).truncate().child(w.name)).child("↗"))
      .concat(ws.length > 3 ? [div().flex_none().text_size(10.5).text_color(t.dim).child(`+${ws.length - 3}`)] : []);
    const repo = (p, label, depth, i) => h_flex().id(`place-${i}-${p.path}`).h(24).flex_none().pl(8 + depth * 14).pr(8).gap(6).items_center().rounded(6).cursor_pointer()
      .when(p.path === pin, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.pin(p.path, cx))
      .child(label)
      .when(Boolean(p.branch) && p.branch !== "HEAD", (el) => el.child(div().flex_none().max_w(150).truncate().text_size(10.5).text_color(t.dim).child(p.branch)))
      // The task this worktree belongs to: a click opens it in the Project panel.
      .when(Boolean(p.task), (el) => el.child(div().id(`task-${i}`).flex_none().px(5).h(18).flex().items_center().rounded(5).bg(t.raised).text_size(10.5).text_color(t.muted)
        .cursor_pointer().hover((s) => s.text_color(t.foreground)).tooltip(`Open task ${p.task} in the Project panel`)
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => { cx.stop_propagation(); setShared("project-agent.show", { space: at.space, task: p.task, at: Date.now() }); run("layout.select", { stack: "panel-body", child: "project-agent" }); })
        .child(`${p.task} →`)))
      .children(jump(agents.filter((w) => within(w.cwd, p.path)), `r${i}`))
      .when(p.ahead > 0, (el) => el.child(aheadOf(p.ahead)))
      .child(count(p.count));
    const rows = [];
    if (this.layout === "list") {
      shown.forEach((p, i) => {
        const parts = this.rel(p.path).split("/"), name = parts.pop();
        rows.push(repo(p, h_flex().flex_1().min_w(0).text_size(12).child(div().text_color(t.dim).truncate().child(parts.length ? `${parts.join("/")}/` : ""))
          .child(div().flex_none().max_w(240).truncate().text_color(t.foreground).child(name)), 0, i));
      });
    } else if (this.layout === "tasks") {
      // Grouped by the Project Agent's tasks: each task's worktree repositories under a heading
      // with its agents, then everything that belongs to no task.
      const trees = (shared("project-agent.worktrees") ?? {})[at.space] ?? [];
      const line = (p, i) => {
        const parts = this.rel(p.path).split("/"), name = parts.pop();
        return repo(p, h_flex().flex_1().min_w(0).text_size(12).child(div().text_color(t.dim).truncate().child(parts.length ? `${parts.join("/")}/` : ""))
          .child(div().flex_none().max_w(240).truncate().text_color(t.foreground).child(name)), 1, i);
      };
      const heading = (id, label, detail, total, extra) => h_flex().id(`group-${id}`).h(24).flex_none().px(8).gap(6).items_center()
        .child(div().flex_none().text_size(11.5).font_semibold().text_color(t.muted).child(label))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(detail))
        .children(extra).child(count(total));
      for (const task of [...new Set(shown.map((p) => p.task).filter(Boolean))].sort()) {
        const repos = shown.filter((p) => p.task === task), tree = trees.find((w) => w.task === task);
        rows.push(heading(task, task, tree?.title ?? "", repos.reduce((a, r) => a + r.count, 0),
          jump(agents.filter((w) => tree && (within(w.cwd, tree.path) || within(w.cwd, this.real?.[tree.path] ?? tree.path))), `g${task}`)));
        repos.forEach((p, i) => rows.push(line({ ...p, task: null }, `${task}-${i}`)));
      }
      const rest = shown.filter((p) => !p.task);
      if (rest.length) {
        if (rows.length) rows.push(heading("none", "No task", "", rest.reduce((a, r) => a + r.count, 0), []));
        rest.forEach((p, i) => rows.push(line(p, `rest-${i}`)));
      }
    } else {
      const walk = (node, depth, path) => {
        for (const dir of [...node.dirs.values()].sort((x, y) => x.name.localeCompare(y.name))) {
          const id = `${path}/${dir.name}`, folded = this.foldedDirs.has(id);
          const total = (n) => n.repos.reduce((a, r) => a + r.count, 0) + [...n.dirs.values()].reduce((a, d) => a + total(d), 0);
          rows.push(h_flex().id(`dir-${id}`).h(24).flex_none().pl(8 + depth * 14).pr(8).gap(6).items_center().rounded(6).cursor_pointer().hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => { folded ? this.foldedDirs.delete(id) : this.foldedDirs.add(id); localStorage.setItem("places.closed", JSON.stringify([...this.foldedDirs])); cx.notify(); })
            .child(div().w(10).flex_none().text_size(10).text_color(t.dim).child(folded ? "▸" : "▾"))
            .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child(`${dir.name}/`))
            // Agents started in this folder itself (a worktree's root, say), or anywhere in it while it is folded.
            .children(jump(agents.filter((w) => dir.abs && within(w.cwd, dir.abs) && (folded || !inRepo(w) && ![...dir.dirs.values()].some((d) => d.abs && within(w.cwd, d.abs)))), `d${id}`))
            .child(count(total(dir))));
          if (!folded) walk(dir, depth + 1, id);
        }
        node.repos.sort((x, y) => x.name.localeCompare(y.name)).forEach((p, i) =>
          rows.push(repo(p, h_flex().flex_1().min_w(0).gap(6).child(div().w(10).flex_none()).child(div().min_w(0).truncate().text_size(12).text_color(t.foreground).child(p.name)), depth, `${path}-${i}`)));
      };
      walk(this.tree(shown), 0, "");
    }
    const top = this.top();
    return v_flex().id("changes-places").flex_none().border_b(1).border_color(t.border)
      .child(h_flex().h(28).px(10).gap(6).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(`${top.split("/").pop() || "/"} · ${mine.length} repositories, ${changed} with work in them`))
        .child(toggle("places-refresh", this.finding ? "Looking…" : "↻ Refresh", false, (_e, cx) => { this.findPlaces(cx); this.refresh(cx); cx.notify(); }))
        // Agents working at the top folder itself, or somewhere no row shows.
        .children(jump(agents.filter((w) => !shown.some((p) => within(w.cwd, p.path)) && (this.layout === "list" || !within(w.cwd, this.real?.[top] ?? top) || w.cwd === (this.real?.[top] ?? top))), "top"))
        .child(toggle("places-here", "Follow focus", !pin, (_e, cx) => this.pin(null, cx)))
        .child(toggle("places-tree", "Tree", this.layout === "tree", (_e, cx) => { this.layout = "tree"; localStorage.setItem("places.layout", "tree"); cx.notify(); }))
        .child(toggle("places-list", "List", this.layout === "list", (_e, cx) => { this.layout = "list"; localStorage.setItem("places.layout", "list"); cx.notify(); }))
        .child(toggle("places-tasks", "Tasks", this.layout === "tasks", (_e, cx) => { this.layout = "tasks"; localStorage.setItem("places.layout", "tasks"); cx.notify(); }))
        .child(toggle("places-all", this.all ? "All" : "Active", this.all, (_e, cx) => { this.all = !this.all; localStorage.setItem("places.all", this.all ? "1" : "0"); cx.notify(); })))
      .child(div().h(Math.min(Math.max(rows.length, 1) * 24 + 8, 224)).relative()
        .child(v_flex().id("places-rows").absolute().inset_0().overflow_y_scroll().p(4)
          .when(!rows.length, (el) => el.child(div().px(8).py(4).text_size(11.5).text_color(t.dim).child(this.finding ? "Looking for repositories…" : "No repository here has changes.")))
          .children(rows))
        .child(Scrollbar.vertical("places-rows").absolute().inset_0()));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async (cx) => {
      try {
        while (this.watched === root) {
          await watchFolder(root);
          if (this.watched === root) this.refresh(cx);
        }
      } catch { this.watched = null; }
    });
  }

  refresh(cx) {
    if (this.loading || this.busy) return;
    const { cwd, on } = location(), context = key();
    if (context !== this.context) {
      this.context = context; this.root = null; this.files = []; this.open = null;
      this.setLines([]); this.message = ""; this.input.set_value(""); this.error = null; this.note = null; this.watched = null; this.closed = false; this.limited = false;
    }
    if (!cwd) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (key() !== context) return;
        if (top.code !== 0) { this.root = null; this.files = []; this.setLines([]); this.open = null; this.error = "Not a git repository"; return; }
        const root = top.stdout.trim(), git = (args) => exec("git", [...READ, ...args], { cwd: root, on });
        const status = await git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]);
        if (status.code !== 0) throw new Error(status.stderr);
        const head = await git(["rev-parse", "--verify", "HEAD"]);
        // The base to compare a branch against: where it left its upstream or the main branch.
        let base = null;
        if (head.code === 0) {
          const own = (await git(["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();
          // Its upstream, the remote's default branch, then the usual main-branch names plus any a
          // Project Agent's profile names for this space (shared "project-agent.mainBranches").
          const names = ["main", "master", "trunk", ...((shared("project-agent.mainBranches") ?? {})[here().space] ?? [])];
          for (const ref of ["@{upstream}", "origin/HEAD", ...names.map((n) => `origin/${n}`), ...names]) {
            if (ref === own) continue;
            const mb = await git(["merge-base", "HEAD", ref]);
            if (mb.code !== 0 || !mb.stdout.trim()) continue;
            const n = Number((await git(["rev-list", "--count", `${mb.stdout.trim()}..HEAD`])).stdout.trim()) || 0;
            base = { ref: ref.replace(/^origin\//, "").replace("@{upstream}", "upstream"), sha: mb.stdout.trim(), commits: n };
            break;
          }
        }
        const dirty = status.stdout.split("\0").filter(Boolean).length;
        // Nothing uncommitted but commits since the base (an agent that commits as it goes): show the branch.
        const branchScope = Boolean(base?.commits) && (this.scope === "branch" || (this.scope === null && !dirty));
        const against = branchScope ? base.sha : "HEAD";
        const stats = {};
        const results = head.code === 0 ? [await git(["diff", against, "--numstat", "-z", "--no-renames"])] : [await git(["diff", "--cached", "--numstat", "-z", "--no-renames"]), await git(["diff", "--numstat", "-z", "--no-renames"])];
        for (const result of results) {
          if (result.code !== 0) throw new Error(result.stderr);
          for (const entry of result.stdout.split("\0")) {
            const [a, d, ...parts] = entry.split("\t");
            if (!parts.length) continue;
            const path = parts.join("\t"), old = stats[path] ?? { add: 0, del: 0 };
            stats[path] = { add: old.add + (Number(a) || 0), del: old.del + (Number(d) || 0), binary: a === "-" };
          }
        }
        const files = [];
        let entries = status.stdout.split("\0").filter(Boolean);
        if (branchScope) {
          // Files changed since the base, committed or not, in the same "XY path" shape as git status.
          const names = (await git(["diff", against, "--name-status", "-z", "--no-renames"])).stdout.split("\0").filter(Boolean);
          const listed = new Set(), since = [];
          for (let i = 0; i + 1 < names.length; i += 2) { listed.add(names[i + 1]); since.push(`${names[i][0]}  ${names[i + 1]}`); }
          entries = [...since, ...entries.filter((e) => e.startsWith("??") && !listed.has(e.slice(3)))];
        }
        for (const entry of entries.slice(0, 1000)) {
          const xy = entry.slice(0, 2), path = entry.slice(3), fresh = xy === "??";
          const conflict = xy.includes("U") || xy === "AA" || xy === "DD";
          const s = conflict ? "U" : xy.includes("D") ? "D" : fresh || xy.includes("A") ? "A" : "M";
          const stat = stats[path] ?? { add: 0, del: 0 };
          files.push({ path, status: s, fresh, ...stat });
        }
        if (key() !== context) return;
        this.base = base; this.against = against; this.branchScope = branchScope; this.dirty = dirty;
        this.root = root; this.on = on; this.hasHead = head.code === 0; this.files = files; this.limited = entries.length > 1000; this.error = null;
        this.watch(root, cx);
        if (this.open && !files.some((f) => f.path === this.open)) { this.open = null; this.setLines([]); }
        // The first file's diff shows until you pick another.
        if (!this.open && !this.closed && files.length) this.open = files[0].path;
        if (this.open) {
          try { await this.load(this.open, context); }
          catch { if (key() === context) this.setLines(["Cannot preview this diff (too large or unreadable)"]); }
        }
      } catch (e) { if (key() === context) this.error = String(e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  async load(path, context) {
    const file = this.files.find((f) => f.path === path), root = this.root, on = this.on;
    if (!file) return;
    let lines;
    if (file.fresh || (!this.hasHead && file.status === "A")) {
      const text = await readTextFile(`${root}/${path}`, { on }).catch(() => null);
      if (text === null) lines = ["Cannot preview this file (binary, too large, or unreadable)"];
      else if (text.includes("\0")) lines = ["Binary file · no text diff"];
      else {
        file.add = countLines(text);
        lines = [`@@ -0,0 +1,${file.add} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").slice(0, 1500).map(l => `+${l}`)];
      }
    } else {
      const r = await exec("git", [...READ, "diff", ...(this.hasHead ? [this.against ?? "HEAD"] : []), "--no-ext-diff", "--no-textconv", "--no-color", "--", path], { cwd: root, on });
      if (r.code !== 0) throw new Error(r.stderr);
      const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex((l) => l.startsWith("@@"));
      lines = first < 0 ? [file.binary ? "Binary file changed" : "No text diff available"] : all.slice(first);
    }
    if (key() === context && this.open === path) this.setLines(lines.slice(0, 1500).map(line => line.length > 4000 ? line.slice(0, 4000) + "… (line truncated)" : line));
  }

  setLines(lines) {
    this.rows = diffRows(lines);
    this.diffWidth = Math.max(300, ...this.rows.map(row => (row.text.length + 1) * 7 + 50));
  }

  pick(path, cx) {
    this.open = this.open === path ? null : path; this.setLines([]); this.note = null;
    this.closed = !this.open;
    const context = this.context;
    if (this.open) cx.spawn(async (cx) => {
      try { await this.load(path, context); }
      catch (e) { if (key() === context && this.open === path) this.note = `Cannot preview this diff (too large or unreadable): ${e}`; }
      cx.notify();
    });
    cx.notify();
  }

  commit(cx) {
    if (!this.message.trim() || !this.root || this.busy || this.loading || this.context !== key()) return;
    const root = this.root, on = this.on, context = this.context, message = this.message.trim();
    this.busy = true; this.note = null;
    cx.spawn(async (cx) => {
      try {
        for (const args of [["add", "-A"], ["commit", "-m", message]]) {
          const r = await exec("git", args, { cwd: root, on });
          if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
        }
        if (key() === context) { this.message = ""; this.input.set_value(""); }
      } catch (e) { if (key() === context) this.note = `Commit failed: ${e}`; }
      finally { this.busy = false; this.refresh(cx); cx.notify(); }
    });
    cx.notify();
  }

  diffRow({ kind, number, text }, t) {
    if (kind === "@") return div().w_full().px(12).h(20).flex_none().truncate().bg(t.raised).text_color(t.dim).child(text);
    // my-changes: added and removed lines are told apart three ways: a stronger tint, a solid
    // bar at the left edge, and a + or − sign in the line's colour.
    const tone = kind === "+" ? t.ansi2 : kind === "-" ? t.ansi1 : null;
    return h_flex().w_full().h(20).flex_none().gap(8).when(Boolean(tone), (e) => e.bg(tone + "38"))
      .child(div().w(3).h_full().flex_none().when(Boolean(tone), (e) => e.bg(tone)))
      .child(div().w(30).flex_none().text_right().text_color(tone ?? t.dim).child(number === undefined ? "" : String(number)))
      .child(div().w(8).flex_none().font_semibold().text_color(tone ?? t.dim).child(kind === "+" ? "+" : kind === "-" ? "−" : ""))
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(text));
  }

  render(cx) {
    if (key() !== this.context) this.refresh(cx);
    this.restore(here().space);
    const t = theme(), add = this.files.reduce((n, f) => n + f.add, 0), del = this.files.reduce((n, f) => n + f.del, 0);
    const enabled = Boolean(this.message.trim() && this.root && !this.busy && !this.loading);
    return v_flex().id("changes").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13).track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape" && this.typing) { this.typing = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); }
      })
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Changes"))
        // Uncommitted changes, or everything on this branch since its base (what an agent has committed too).
        .when(Boolean(this.base?.commits), (el) => el.child(h_flex().flex_none().gap(2)
          .child(div().id("scope-work").px(6).h(20).flex().items_center().rounded(5).text_size(11).cursor_pointer().bg(!this.branchScope ? t.selected : t.background).text_color(!this.branchScope ? t.foreground : t.dim)
            .hover((s) => s.bg(t.hover)).on_click((_e, cx) => { this.scope = "work"; this.refresh(cx); cx.notify(); }).child(`Uncommitted · ${this.dirty ?? 0}`))
          .child(div().id("scope-branch").px(6).h(20).flex().items_center().rounded(5).text_size(11).cursor_pointer().bg(this.branchScope ? t.selected : t.background).text_color(this.branchScope ? t.foreground : t.dim)
            .hover((s) => s.bg(t.hover)).on_click((_e, cx) => { this.scope = "branch"; this.refresh(cx); cx.notify(); }).child(`Since ${this.base.ref} · ${this.base.commits} commits`))))
        .when(Boolean(this.root), (el) => el.child(div().min_w(0).truncate().text_size(12).text_color(t.muted).tooltip(this.root ?? "").child(this.rel(this.root ?? ""))))
        .child(div().px(5).py(1).rounded(4).border_1().border_color(t.border).text_size(10).text_color(t.muted).child(`${this.files.length} files`))
        .child(div().flex_1()).child(div().text_size(11).text_color(t.ansi2).child(`+${add}`)).child(div().text_size(11).text_color(t.ansi1).child(`−${del}`)))
      .when(Boolean(this.picker(t)), (el) => el.child(this.picker(t)))
      // overflow_y_scrollbar() wraps the list, so its flex sizing never reached the panel's layout.
      .child(div().flex_1().min_h(44).max_h(this.files.length * 28 + 12).relative().border_b(1).border_color(t.border)
        .child(v_flex().id("changes-list").absolute().inset_0().overflow_y_scroll().p(6).children(this.files.map((f) => {
        const parts = f.path.split("/"), name = parts.pop();
        return h_flex().id(`change-${f.path}`).h(28).flex_none().px(8).gap(8).items_center().rounded(7).cursor_pointer().when(this.open === f.path, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.pick(f.path, cx))
          .child(div().w(14).text_size(11).text_color(f.status === "A" ? t.ansi2 : f.status === "D" ? t.ansi1 : f.status === "U" ? t.ansi1 : t.blocked).child(f.status))
          .child(h_flex().flex_1().min_w(0).child(div().text_color(t.dim).truncate().child(parts.length ? parts.join("/") + "/" : "")).child(div().max_w(260).min_w(0).truncate().child(name)))
          .when(f.add > 0, (e) => e.child(div().text_size(11).text_color(t.ansi2).child(`+${f.add}`))).when(f.del > 0, (e) => e.child(div().text_size(11).text_color(t.ansi1).child(`−${f.del}`)));
      })).when(!this.files.length, (e) => e.child(div().p(8).text_color(t.dim).child(this.error || (this.loading ? "Loading changes…" : this.root ? (this.branchScope ? "No changes since the base" : "No uncommitted changes") : "No folder")))))
        .child(Scrollbar.vertical("changes-list").absolute().inset_0()))
      .when(this.limited, el => el.child(div().px(12).py(4).text_size(11).text_color(t.dim).child("Showing the first 1,000 changed files")))
      .child(div().flex_1().min_h(0).relative().font_family(settings().font_family ?? "JetBrains Mono").text_size(11)
        .child(div().id("changes-diff-x").size_full().overflow_x_scrollbar()
          .child(div().w_full().min_w(this.diffWidth).h_full().child(v_virtual_list("changes-diff", this.rows.length, 20, (i) => String(i),
            (range) => this.rows.slice(range.start, range.end).map((row) => this.diffRow(row, t))).size_full())))
        .child(Scrollbar.vertical("changes-diff").viewport_from_layout().absolute().inset_0())
        .when(!this.open && this.files.length > 0, (e) => e.child(div().absolute().top(6).px(12).text_color(t.dim).child("Select a file to view its changes"))))
      .when(Boolean(this.note), (e) => e.child(div().px(10).pb(8).text_size(11).text_color(t.ansi1).child(this.note)))
      .child(h_flex().flex_none().p(10).gap(8).border_t(1).border_color(t.border)
        .child(div().id("commit-message").flex_1().min_w(0).h(32).px(10).flex().items_center().rounded(8).border_1().border_color(this.typing ? t.accent : t.border).cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Input.new(this.input).h_full().text_size(12).text_color(t.foreground)))
        .child(div().id("commit").h(32).px(14).flex().items_center().rounded(8).bg(enabled ? t.solid : t.raised).text_color(enabled ? t.solid_foreground : t.dim).text_size(12).when(enabled, (e) => e.cursor_pointer()).on_click((_e, cx) => this.commit(cx)).child(this.busy ? "Committing…" : "Commit")));
  }
}
