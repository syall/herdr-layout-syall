// Agent picker for the Agents view: this space's agents and their workers (sub-agents).
// Only workers can be picked; main agents are group labels. Picking one shows its live terminal
// in the block below (layout.set; the main area stays put).
// The header folds the list away. It hides that block when its worker is not in the shown space
// (left over from a space switch or a restart). Reads only Herdr's live data; runs no programs and reads no files.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, spaces, panes, run, theme, layout, shared, setShared, openOverlay } from "herdr";

// The task a worker belongs to, from the Project Agent (shared "project-agent.workers":
// { space: { address: { task, title, role } } }); null for agents it did not start.
const taskOf = (space, address) => (shared("project-agent.workers") ?? {})[space?.id]?.[address] ?? null;
// Opens that task in the Project panel.
function openTask(space, task) {
  setShared("project-agent.show", { space: space.id, task, at: Date.now() });
  run("layout.select", { stack: "panel-body", child: "project-agent" });
}

const FOLDED = 30; // px: just the header
const BAR = 28; // px: the task bar of the shown worker, which stays when the list is folded

function findNode(n, id) { if (n?.id === id) return n; for (const c of n?.children ?? []) { const f = findNode(c, id); if (f) return f; } return null; }

// Whether a terminal belongs to the space: a row of the picker, a worker the Project Agent recorded
// for the space (what Files offers), or its parent chain (the terminal and up to 6 parents, live or
// not) reaches a terminal in one of the space's tabs (what Changes offers) or an agent of the space.
// Accepts at least every worker Changes and Files link to, so one they show is never hidden.
function inSpace(space, all, rows, address) {
  if (rows.some((r) => r.address === address) || taskOf(space, address)) return true;
  const tabs = new Set((space.tabs ?? []).map((x) => x.id));
  const roots = new Set(panes().filter((p) => tabs.has(p.tab) && p.terminal).map((p) => p.terminal));
  for (const a of agents()) if (a.space === space.id) roots.add(a.address);
  let x = all.find((k) => k.address === address);
  for (let hops = 0; x && hops <= 6; hops += 1) {
    if (roots.has(x.address)) return true;
    x = x.parent ? all.find((k) => k.address === x.parent) : null;
  }
  return false;
}

// Whether Herdr has reported the space's panes yet (a space with tabs always has some). Until then
// membership cannot be judged.
function panesKnown(space) {
  const tabs = new Set((space.tabs ?? []).map((x) => x.id));
  return !tabs.size || panes().some((p) => tabs.has(p.tab));
}

// Point the live block at one terminal. Herdr can drop that block when its terminal ends,
// so put it back under the picker if it's missing.
function showInPanel(address) {
  const tree = JSON.parse(JSON.stringify(layout()));
  let live = findNode(tree, "agents-live");
  if (!live) {
    const view = findNode(tree, "agents-view");
    if (!view) return run("terminal.peek", { terminal: address });
    live = { id: "agents-live", type: "block", hidden: true };
    view.children = [...(view.children ?? []), live];
  }
  live.content = { terminal: address };
  live.hidden = false;
  run("layout.set", { layout: tree });
}

// The agent's own title (Claude and Codex set one from the session) when it says more than
// the program name; else the given fallbacks.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
function telling(title, program) {
  const live = clean(title);
  const path = /^[~/]|^[A-Za-z]:\\/.test((title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  if (!live || path || live.includes("@")) return null;
  if (live === program?.name || live.toLowerCase() === program?.key) return null;
  return live;
}
const label = (x, ...fallbacks) => telling(x.title, x.program) ?? fallbacks.find(Boolean) ?? x.address;

export default class AgentPicker extends View {
  init() {
    this.armed = null; // worker armed for close (second click ends it)
    this.hid = null; // the terminal this view last hid, so a render before the layout updates does not hide it again
    this.open = Number(localStorage.getItem("openPx")) || 180;
  }

  render(cx) {
    const t = theme();
    const space = spaces().find((p) => p.active); // only this space; the sidebar panel shows all
    const listed = agents().filter((a) => a.space === space?.id);
    const all = terminals();
    const known = new Set(listed.map((a) => a.address));
    const liveNode = findNode(layout(), "agents-live");
    const selected = liveNode && !liveNode.hidden ? liveNode.content?.terminal ?? null : null;
    const px = findNode(layout(), "agents-picker")?.size?.px ?? this.open;
    const job = selected ? taskOf(space, selected) : null;
    const foldedPx = FOLDED + (job ? BAR : 0); // folded keeps the header, and the task bar when there is one
    const folded = px <= FOLDED + BAR + 2;
    // Folded, and the bar came or went with the shown worker: fit the block to it.
    if (folded && Math.abs(px - foldedPx) > 1) run("layout.resize", { id: "agents-picker", px: foldedPx });

    const rows = [];
    const addKids = (addr, depth) => {
      for (const k of all.filter((k) => k.parent === addr && k.state === "live")) {
        rows.push({ address: k.address, name: label(k, k.name, (k.argv ?? [])[0]), status: k.status, app: k.program?.name, depth });
        addKids(k.address, depth + 1);
      }
    };
    for (const a of listed) {
      const parent = all.find((k) => k.address === a.address)?.parent;
      if (parent && known.has(parent)) continue; // shown under its parent
      rows.push({ address: a.address, name: label(a, a.tab_name), status: a.status, app: a.program?.name ?? a.app, depth: 0 });
      addKids(a.address, 1);
    }

    // The live block shows another space's worker (left over from a switch or a restart): hide it.
    // A terminal not reported yet, or the space's panes not reported yet (still loading), waits until they are.
    const shownTerm = selected ? all.find((k) => k.address === selected) : null;
    if (space && shownTerm && (shownTerm.state !== "live" || (panesKnown(space) && !inSpace(space, all, rows, selected))) && this.hid !== selected) {
      this.hid = selected; run("layout.hide", { id: "agents-live" });
    }
    if (!selected) this.hid = null;

    const toggle = () => {
      if (folded) run("layout.resize", { id: "agents-picker", px: Math.max(this.open, FOLDED + BAR + 40) });
      else { this.open = px; localStorage.setItem("openPx", String(px)); run("layout.resize", { id: "agents-picker", px: foldedPx }); }
    };
    const dot = (s) => div().size(7).flex_none().rounded(4).bg(t[s] ?? t.dim);
    const closeBtn = (r) => div().id(`close-${r.address}`).flex_none().px(5).h(18).rounded(4).flex().items_center()
      .text_size(10.5).text_color(this.armed === r.address ? t.blocked : t.dim)
      .bg(this.armed === r.address ? t.blocked + "26" : t.chrome).hover((s) => s.text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => {
        cx.stop_propagation();
        // A Project Agent's worker: its delete dialog (the worker, its worktree, optionally its task).
        if (taskOf(space, r.address)) { openOverlay({ mod: "project-agent", kind: "dialog", width: 540, height: 400, props: { deleteWorker: { space: space.id, machine: space.machine ?? null, address: r.address, name: r.name } } }); return; }
        if (this.armed === r.address) { this.armed = null; run("terminal.kill", { terminal: r.address }); }
        else this.armed = r.address;
        cx.notify();
      })
      .child(this.armed === r.address ? "Close?" : "×");
    const row = (r) => r.depth === 0
      ? h_flex().id(`agent-${r.address}`).h(22).gap(6).px(8).mt(4).items_center().text_color(t.dim)
          .child(dot(r.status))
          .child(div().flex_1().min_w(0).truncate().text_size(11.5).font_semibold().child(r.name))
          .child(div().flex_none().text_size(10.5).child(`${r.app ?? ""} ${r.address}`.trim()))
      : h_flex().id(`agent-${r.address}`).h(24).gap(6).pl(8 + r.depth * 14).pr(8).items_center().rounded(5)
      .bg(r.address === selected ? t.selected : t.chrome).hover((s) => s.bg(t.hover))
      .on_click(() => showInPanel(r.address))
      .child(dot(r.status))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.foreground).child(r.name))
      .child(div().flex_none().text_size(10.5).text_color(t.dim).child(`${r.app ?? ""} ${r.address}`.trim()))
      .when(r.depth > 0 && Boolean(taskOf(space, r.address)), (el) => el.child(div().id(`task-${r.address}`).flex_none().px(5).h(18).flex().items_center().rounded(4)
        .text_size(10.5).text_color(t.muted).bg(t.raised).hover((s) => s.text_color(t.foreground)).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => { cx.stop_propagation(); openTask(space, taskOf(space, r.address).task); }).child(`${taskOf(space, r.address).task} →`)))
      .when(r.depth > 0, (el) => el.child(closeBtn(r)));

    return v_flex().id("agent-picker").size_full().min_h(0).bg(t.chrome).text_color(t.foreground)
      .child(h_flex().id("agent-picker-header").h(FOLDED).px(10).gap(6).flex_none().items_center().border_b(1).border_color(t.border)
        .hover((s) => s.bg(t.hover)).on_click(toggle)
        .child(div().flex_none().text_size(11).text_color(t.dim).child(folded ? "▸" : "▾"))
        .child(div().flex_1().min_w(0).text_size(13).font_semibold().truncate().child(space ? `Agents in ${space.name || "this space"}` : "Agents"))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(`${rows.filter((r) => r.depth > 0).length} workers`)))
      .when(!folded, (el) => el.child(v_flex().id("agent-rows").flex_1().min_h(0).p(4).gap(1).overflow_y_scrollbar()
        .when(!rows.length, (e) => e.child(div().p(6).text_size(12).text_color(t.dim).child(rows.length ? "" : "No agents in this space yet. Start one, or have an agent start workers with hc run.")))
        .children(rows.map(row))))
      // A bar above the shown worker's terminal: the task it is working on, one click away.
      .when(Boolean(job), (el) => {
        const worker = all.find((k) => k.address === selected), tone = { "needs-decision": t.blocked, review: t.done, "in-progress": t.working, investigating: t.working }[job.state] ?? t.dim;
        return el.child(h_flex().id("agent-task-bar").h(BAR).flex_none().px(10).gap(8).items_center().border_t(1).border_color(t.border).bg(t.surface)
          .cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => openTask(space, job.task))
          // The worker's own status, then the task and its state.
          .child(div().size(7).flex_none().rounded(4).bg(t[worker?.status] ?? t.dim))
          .child(div().flex_none().text_size(11).text_color(t.dim).child(`${worker?.status ?? "ended"} · ${job.role ? `${job.role} on` : "on"}`))
          .child(div().flex_none().text_size(11.5).font_semibold().text_color(t.foreground).child(String(job.task)))
          .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.muted).child(job.title))
          .when(Boolean(job.state), (b) => b.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(tone + "26").text_size(10.5).font_semibold().text_color(tone).child(String(job.state))))
          .child(div().flex_none().text_size(11).text_color(t.accent).child("Open task →")));
      });
  }
}
