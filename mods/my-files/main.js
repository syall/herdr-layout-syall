// Modified from the `files` mod shipped with Herdr 0.1.15 (Apache License 2.0).
// Changes by syall: pinned folders, shortcuts, file filter, markdown preview, side file list.
// A lazy file browser for the focused pane's folder, with bounded read-only previews.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, TextView, InputState, Input } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings, window, shared, setShared, terminals, layout, run } from "herdr";
import * as herdr from "herdr";
// t-194: `herdr-app check` runs init() and a render for real, then exits and leaves every process they
// started (knownAgents()'s login-shell probe, exec(), hc()) running. checking() (Herdr 0.1.16) is true then;
// an older Herdr has no such export, so it is read through the namespace: missing, not true or throwing is live.
const isChecking = () => { try { return herdr.checking?.() === true; } catch { return false; } };

// my-files: a folder that belongs to a Project Agent task links back to it. The task opens in
// the Project panel (shared "project-agent.show"); its live workers (shared
// "project-agent.workers": { space: { address: { task, role } } }) open in the Agents view.
function openTask(space, task) {
  setShared("project-agent.show", { space, task, at: Date.now() });
  run("layout.select", { stack: "panel-body", child: "project-agent" });
}
// The space's live workers by task, read once per render: one shared() and one terminals() call,
// however many shortcuts show chips (t-167: a call per worker per shortcut ran past the render budget).
function liveWorkersByTask(space) {
  const crew = (shared("project-agent.workers") ?? {})[space] ?? {}, byTask = new Map();
  const entries = Object.entries(crew);
  if (!entries.length) return byTask;
  const first = new Map(), live = new Set();
  for (const x of terminals() ?? []) {
    if (!first.has(x.address)) first.set(x.address, x);
    if (x.state === "live") live.add(x.address);
  }
  for (const [address, w] of entries) {
    if (!live.has(address)) continue;
    if (!byTask.has(w.task)) byTask.set(w.task, []);
    byTask.get(w.task).push({ address, role: w.role ?? "worker", status: first.get(address)?.status });
  }
  return byTask;
}
function showAgent(address) {
  const find = (n, id) => { if (n?.id === id) return n; for (const c of n?.children ?? []) { const f = find(c, id); if (f) return f; } return null; };
  const tree = JSON.parse(JSON.stringify(layout() ?? {})), view = find(tree, "agents-view");
  if (!view) { run("terminal.peek", { terminal: address }); return; }
  let live = find(tree, "agents-live");
  if (!live) { live = { id: "agents-live", type: "block" }; view.children = [...(view.children ?? []), live]; }
  live.content = { terminal: address }; live.hidden = false;
  run("layout.set", { layout: tree });
  run("layout.select", { stack: "panel-body", child: "agents-view" });
}

function location() {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  // my-files: another mod can point this view at a folder for the shown space (shared "my-files.root":
  // { space, path, label }), e.g. a task's evidence folder. The header's button goes back.
  const pinned = shared("my-files.root");
  if (pinned?.path && pinned.space === space?.id) return { cwd: pinned.path, on: space?.machine ?? null, space: space?.id, label: pinned.label ?? null };
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on, space: space?.id };
}
const key = () => JSON.stringify(location());
const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
const PER_FOLDER = 500, TOTAL = 5000;

async function directory(path, on) {
  if (isChecking()) return [];
  const windowsDirectory = async () => {
    // Windows PowerShell otherwise uses the console code page; exec decodes UTF-8.
    // Links keep directory attributes even when dangling; check their target.
    // Other reparse points (OneDrive's folders) have no LinkType and are folders.
    // PowerShell reads curly single quotes as quotes too, so they're doubled like '.
    const r = await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 501 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $_.LinkType -or ($_.Target -and [IO.Directory]::Exists(([IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $_.Target[0])))))) } }) | ConvertTo-Json -Compress } '" + path.replace(/['‘’‚‛]/g, "$&$&") + "'"], { on });
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  };
  if (!on && window()?.platform === "windows") return windowsDirectory();
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  let r;
  try { r = await exec("sh", ["-c", script, "files", path], { on }); }
  catch (e) {
    if (on && String(e).includes("cannot start sh: program not found")) return windowsDirectory();
    throw e;
  }
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

export default class Files extends View {
  init(_props, cx) {
    this.saved = new Map();
    this.rendered = localStorage.getItem("md.rendered") !== "0"; // markdown opens rendered until switched to Source
    this.entries = new Map(); this.folders = new Set(); this.pending = new Set(); this.marks = {};
    // my-files: a filter that searches every file under the shown folder, not only the unfolded ones.
    this.filterText = ""; this.allFiles = null; this.allFilesFor = null;
    this.filterInput = InputState.new({ placeholder: "Filter files by name or path" });
    this.filterInput.on("change", (_e, cx) => { this.filterText = this.filterInput.value().trim(); if (this.filterText) this.listAll(cx); cx.notify(); });
    this.refresh(cx);
    cx.timer.every(10000, cx => this.refresh(cx));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    const context = this.context;
    cx.spawn(async cx => {
      try { while (this.context === context) { await watchFolder(root); if (this.current(context)) this.refresh(cx); } }
      catch { if (this.context === context) this.watched = null; }
    });
  }

  current(context) {
    return this.context === context && key() === context.key;
  }

  async loadFolder(path, context) {
    const { on, cwd: root } = context;
    const entries = await directory(path ? `${root}/${path}` : root, on);
    if (!this.current(context) || (path && !this.folders.has(path))) return;
    const used = [...this.entries.entries()].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used))).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }

  refresh(cx) {
    const { cwd, on } = location(), next = key();
    if (next !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, { folders: this.folders, file: this.file });
      const saved = this.saved.get(next);
      this.context = { key: next, cwd, on }; this.root = cwd; this.on = on; this.entries = new Map(); this.folders = new Set(saved?.folders);
      this.pending = new Set(); this.marks = {}; this.show(null); this.watched = null; this.error = null; this.limited = false;
      this.loading = false;
      // my-files: a pinned folder may name the file to open ("my-files.root" { file, at }); a new
      // request wins over the file this folder showed last time.
      const pin = shared("my-files.root");
      if (pin && cwd && pin.path === cwd && pin.at && pin.at !== this.pinAt) { this.pinAt = pin.at; this.openPinned(pin.file, cx); }
      else if (saved?.file) this.show(saved.file, cx);
    }
    if (!cwd || this.loading || isChecking()) return;
    const context = this.context;
    this.loading = true;
    this.limited = false;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...this.folders]) {
          if (!this.current(context)) return;
          await this.loadFolder(path, context);
        }
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
        const marks = {};
        if (top?.code === 0) {
          // Writes nothing under .git (index lock, fsmonitor cookie): the folder watch would refresh again.
          const status = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], { cwd, on }).catch(() => null);
          if (status?.code === 0) for (const entry of status.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
            const xy = entry.slice(0, 2);
            marks[`${top.stdout.trim()}/${entry.slice(3)}`] = xy === "??" || xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M";
          }
        }
        if (!this.current(context)) return;
        this.marks = marks; this.error = null; this.watch(cwd, cx);
      } catch (e) { if (this.current(context)) this.error = String(e); }
      finally { if (this.context === context) this.loading = false; cx.notify(); }
    });
  }

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) {
        this.folders.delete(folder);
        this.entries.delete(folder);
      }
    } else {
      this.folders.add(path);
      if (!this.entries.has(path) && !this.pending.has(path)) {
        const context = this.context;
        this.pending.add(path);
        cx.spawn(async cx => {
          try { await this.loadFolder(path, context); }
          catch (e) { if (this.current(context)) this.error = String(e); }
          finally { if (this.context === context) this.pending.delete(path); cx.notify(); }
        });
      }
    }
    cx.notify();
  }

  show(path, cx) {
    this.code?.release(); this.code = null; this.file = path; this.fileError = null; this.markdown = null;
    if (!path || !cx) return;
    const context = this.context, root = this.root, on = this.on;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(`${root}/${path}`, { on });
        if (this.file !== path || !this.current(context)) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        const t = theme(), ext = path.includes(".") ? path.split(".").pop() : "txt";
        // my-files: a markdown file can be read rendered (the header's Preview / Source toggle).
        if (/^(md|markdown|mdx)$/i.test(ext)) this.markdown = text.length > 400000 ? text.slice(0, 400000) : text;
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
          font_family: settings().font_family, font_size: 12,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch { if (this.file === path && this.current(context)) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
  }

  // Every file under the shown folder, once per folder (and again after a minute): what git
  // tracks plus untracked files it does not ignore, else a plain search that skips dot-folders.
  listAll(cx) {
    const context = this.context, root = this.root, on = this.on;
    if (!context || !root || this.listing || isChecking() || (this.allFilesFor === context.key && Date.now() - (this.allFilesAt ?? 0) < 60000)) return;
    this.listing = true;
    cx.spawn(async (cx) => {
      let files = [];
      try {
        const git = await exec("git", ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard"], { on, timeout: 20000 });
        if (git.code === 0) files = git.stdout.split("\n");
        else files = (await exec("sh", ["-c", 'cd "$1" && find . -type f -not -path "*/.*" 2>/dev/null | head -20000 | sed "s|^\\./||"', "sh", root], { on, timeout: 20000 })).stdout.split("\n");
      } catch {}
      this.listing = false;
      if (this.context !== context) return;
      this.allFiles = files.filter(Boolean).slice(0, 20000); this.allFilesFor = context.key; this.allFilesAt = Date.now();
      cx.notify();
    });
  }

  // The files matching the filter: every word must appear in the path; names that match rank first.
  matches(t) {
    const words = this.filterText.toLowerCase().split(/\s+/).filter(Boolean);
    const all = this.allFilesFor === this.context?.key ? this.allFiles ?? [] : [];
    const hits = all.filter((f) => { const low = f.toLowerCase(); return words.every((w) => low.includes(w)); });
    const inName = (f) => words.some((w) => f.split("/").pop().toLowerCase().includes(w));
    hits.sort((a, b) => Number(inName(b)) - Number(inName(a)) || a.length - b.length || a.localeCompare(b));
    const rows = hits.slice(0, 200).map((path, i) => {
      const parts = path.split("/"), name = parts.pop();
      return h_flex().id(`hit-${i}`).h(28).flex_none().px(8).gap(7).items_center().rounded(7).cursor_pointer().when(this.file === path, el => el.bg(t.selected)).hover(s => s.bg(t.hover))
        .on_click((_e, cx) => this.show(path, cx))
        .child(svg("mods/my-files/file.svg").size(14).flex_none().text_color(t.muted))
        .child(div().flex_none().max_w(220).truncate().child(name))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(parts.join("/")));
    });
    const note = !all.length && this.listing ? "Listing files…" : !hits.length ? "No file matches." : hits.length > 200 ? `Showing 200 of ${hits.length} matches` : null;
    return note ? [...rows, div().p(8).text_size(11.5).text_color(t.dim).child(note)] : rows;
  }

  // Opens the file a pin asked for (unfolding the folders above it), or just the folder's tree.
  openPinned(file, cx) {
    if (!file) { this.show(null); return; }
    const parts = String(file).split("/");
    for (let i = 1; i < parts.length; i++) {
      const folder = parts.slice(0, i).join("/");
      if (!this.folders.has(folder)) this.toggle(folder, cx);
    }
    this.show(file, cx);
  }

  rows(prefix, depth, out, t) {
    if (out.length >= TOTAL || depth > 40) return out;
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name, open = this.folders.has(path), mark = this.marks[`${this.root}/${path}`];
      out.push(h_flex().id(`file-${path}`).h(28).flex_none().pl(8 + depth * 18).pr(8).gap(7).items_center().rounded(7).cursor_pointer().when(this.file === path, el => el.bg(t.selected)).hover(s => s.bg(t.hover))
        .on_click((_e, cx) => entry.dir ? this.toggle(path, cx) : this.show(path, cx))
        .child(entry.dir ? svg(`mods/my-files/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
        .child(svg(`mods/my-files/${entry.dir ? "folder" : "file"}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().child(entry.name))
        .when(Boolean(mark), el => el.child(div().text_size(11).text_color(mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : t.blocked).child(mark))));
      if (entry.dir && open) this.rows(path, depth + 1, out, t);
    }
    return out;
  }

  render(cx) {
    if (key() !== this.context?.key) this.refresh(cx);
    const t = theme();
    // my-files: a new request for the folder already shown (another card of the same task, say).
    const pin = shared("my-files.root"), pinnedHere = Boolean(location().label);
    if (pinnedHere && pin && pin.at && pin.at !== this.pinAt && pin.path === this.root) { this.pinAt = pin.at; this.openPinned(pin.file, cx); }
    // A pinned folder (a task's evidence) keeps its file list beside the open file, foldable.
    this.sidebarHidden ??= localStorage.getItem("side.hidden") === "1";
    const beside = pinnedHere && Boolean(this.file);
    const fold = (hidden, cx) => { this.sidebarHidden = hidden; localStorage.setItem("side.hidden", hidden ? "1" : "0"); cx.notify(); };
    const filtering = Boolean(this.filterText);
    // my-files: shortcuts other mods offer for this space (shared "my-files.places"), such as a
    // Project Agent's evidence folders. Shown above the tree; a click pins the view to that folder.
    const spaceId = location().space, spots = (shared("my-files.places") ?? {})[spaceId] ?? [];
    // The task and live agents of a folder, as small buttons.
    let crew = null;
    const liveWorkers = (task) => (crew ??= liveWorkersByTask(spaceId)).get(task) ?? [];
    const links = (task, key) => !task ? [] : [
      div().id(`ftask-${key}`).flex_none().px(5).h(18).flex().items_center().rounded(5).bg(t.raised).text_size(10.5).text_color(t.muted).cursor_pointer()
        .hover(s => s.text_color(t.foreground)).tooltip(`Open task ${task} in the Project panel`)
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => { cx.stop_propagation(); openTask(spaceId, task); }).child(`${task} →`),
      ...liveWorkers(task).slice(0, 3).map((w, i) => h_flex().id(`fagent-${key}-${i}`).flex_none().h(18).px(5).gap(4).items_center().rounded(5).border_1().border_color(t.border)
        .text_size(10.5).text_color(t.muted).cursor_pointer().hover(s => s.bg(t.raised).text_color(t.foreground)).tooltip(`Show the ${w.role} (${w.address})`)
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => { cx.stop_propagation(); showAgent(w.address); })
        .child(div().size(6).rounded(3).bg(t[w.status] ?? t.idle)).child(`${w.role} ↗`)),
    ];
    const shortcuts = () => {
      const groups = [...new Set(spots.map((p) => p.group ?? "Shortcuts"))];
      return groups.flatMap((group) => {
        const folded = this.placesFolded?.has(group);
        return [
          h_flex().id(`places-${group}`).h(24).flex_none().px(8).gap(6).items_center().cursor_pointer().text_size(11.5).text_color(t.dim).hover(s => s.text_color(t.foreground))
            .on_click((_e, cx) => { this.placesFolded ??= new Set(); folded ? this.placesFolded.delete(group) : this.placesFolded.add(group); cx.notify(); })
            .child(div().child(folded ? "▸" : "▾")).child(div().font_semibold().child(group)).child(div().child(String(spots.filter((p) => (p.group ?? "Shortcuts") === group).length))),
          ...(folded ? [] : spots.filter((p) => (p.group ?? "Shortcuts") === group).map((p, i) =>
            h_flex().id(`place-${group}-${i}`).h(28).flex_none().pl(20).pr(8).gap(7).items_center().rounded(7).cursor_pointer().hover(s => s.bg(t.hover))
              .when(pin?.path === p.path && pinnedHere, el => el.bg(t.selected))
              .on_click(() => setShared("my-files.root", { space: spaceId, path: p.path, label: p.label.split(" · ")[0], file: null, task: p.task ?? null, at: Date.now() }))
              .child(svg("mods/my-files/folder.svg").size(14).flex_none().text_color(t.muted))
              .child(div().flex_none().max_w(230).truncate().child(p.label))
              .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(p.detail ?? ""))
              .children(links(p.task, `${group}-${i}`)))),
          div().h(1).mx(8).my(4).flex_none().bg(t.border),
        ];
      });
    };
    const listRows = () => (filtering ? this.matches(t) : this.rows("", 0, [], t));
    const preview = (el) => el
      .when(this.rendered && typeof this.markdown === "string", e => e.child(div().flex_1().min_h(0).min_w(0).relative()
        .child(div().id("files-md").absolute().inset_0().overflow_y_scroll().px(18).py(14).text_size(13).child(TextView.markdown(`md-${this.file}`, this.markdown).selectable()))))
      .when(!(this.rendered && typeof this.markdown === "string"), e => e.child(this.code ? Editor.new(this.code).flex_1().min_h(0).min_w(0) : div().flex_1().p(12).text_color(t.dim).child(this.fileError || "Loading file…")));
    return v_flex().id("files").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .when(Boolean(this.file), el => el.child(div().id("files-back").w(20).cursor_pointer().text_color(t.muted).on_click((_e, cx) => { this.show(null); cx.notify(); }).child("←")))
        .child(div().font_semibold().child("Files"))
        .when(beside, el => el.child(div().id("files-side-toggle").flex_none().px(7).h(22).flex().items_center().rounded(6).border_1().border_color(t.border)
          .text_size(11.5).text_color(t.muted).cursor_pointer().hover(s => s.text_color(t.foreground).bg(t.hover))
          .on_click((_e, cx) => fold(!this.sidebarHidden, cx)).child(this.sidebarHidden ? "Show files" : "Hide files")))
        .when(Boolean(this.file) && this.markdown !== null && this.markdown !== undefined, el => el.child(div().id("files-md-toggle").flex_none().px(7).h(22).flex().items_center().rounded(6).border_1().border_color(t.border)
          .text_size(11.5).text_color(t.muted).cursor_pointer().hover(s => s.text_color(t.foreground).bg(t.hover))
          .on_click((_e, cx) => { this.rendered = !this.rendered; localStorage.setItem("md.rendered", this.rendered ? "1" : "0"); cx.notify(); })
          .child(this.rendered ? "Source" : "Preview")))
        .when(Boolean(location().label), el => el.child(div().id("files-unpin").flex_none().px(7).h(22).flex().items_center().rounded(6).bg(t.selected).text_size(11.5).text_color(t.muted).cursor_pointer()
          .hover(s => s.text_color(t.foreground)).on_click(() => setShared("my-files.root", null)).child(`${location().label} ×`)))
        // The pinned folder's task and its live agents.
        .when(pinnedHere && Boolean(pin?.task), el => el.children(links(pin.task, "pin")))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(12).text_color(t.dim).child(this.file ?? this.root?.split(/[\\/]/).pop() ?? "")))
      .when(!this.file || (beside && !this.sidebarHidden), el => el.child(h_flex().flex_none().px(8).py(6).gap(6).items_center().border_b(1).border_color(t.border)
        .child(Input.new(this.filterInput).flex_1().h(28).px(8).rounded(7).border_1().border_color(t.input).bg(t.background).text_size(12.5).text_color(t.foreground))
        .when(filtering, e => e.child(div().id("files-filter-clear").flex_none().px(7).h(22).flex().items_center().rounded(6).text_size(11.5).text_color(t.muted).cursor_pointer()
          .hover(s => s.text_color(t.foreground).bg(t.hover)).on_click((_e, cx) => { this.filterInput.set_value(""); this.filterText = ""; cx.notify(); }).child("Clear")))))
      .when(!this.file, el => el.child(v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().p(6)
        .when(!filtering && spots.length > 0, e => e.children(shortcuts()))
        .children(listRows())
        .when(!filtering && (Boolean(this.error) || !this.entries.get("")?.length), el => el.child(div().p(8).text_size(12).text_color(t.dim).child(this.error || (this.loading ? "Loading files…" : this.root ? "No files" : "No folder"))))
        .when(this.limited, el => el.child(div().p(8).text_size(11).text_color(t.dim).child("File list limited to 500 entries per folder and 5,000 total")))))
      .when(Boolean(this.file) && !beside, el => preview(el))
      .when(beside, el => el.child(h_flex().flex_1().min_h(0).items_stretch()
        // The file list beside the open file folds to a thin rail and back.
        .when(!this.sidebarHidden, e => e.child(v_flex().w(210).flex_none().min_h(0).border_r(1).border_color(t.border)
          .child(h_flex().id("files-side-fold").h(26).flex_none().px(8).gap(6).items_center().cursor_pointer().text_size(11).text_color(t.dim).hover(s => s.text_color(t.foreground).bg(t.hover))
            .on_click((_e, cx) => fold(true, cx)).child(div().flex_1().truncate().child(`${this.entries.get("")?.length ?? 0} items`)).child("◂ Hide"))
          .child(v_flex().id("files-side").flex_1().min_h(0).overflow_y_scrollbar().p(6).children(listRows()))))
        .when(this.sidebarHidden, e => e.child(v_flex().id("files-side-rail").w(22).flex_none().min_h(0).items_center().pt(6).border_r(1).border_color(t.border).cursor_pointer()
          .text_size(11).text_color(t.dim).hover(s => s.text_color(t.foreground).bg(t.hover)).tooltip("Show the file list").on_click((_e, cx) => fold(false, cx)).child("▸")))
        .child(preview(v_flex().flex_1().min_w(0).min_h(0)))));
  }
}
