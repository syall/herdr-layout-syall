// Modified from the `tabs` mod shipped with Herdr 0.1.15 (Apache License 2.0).
// Changes by syall: panel buttons, pins, the Project Agent tab guards, home-folder tabs and splits, the full-width panel toggle.
import { View, div, svg, image } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, window, shared, setShared, layout, settings, knownAgents, terminals, machines, focused, nextCommand, notify, readTextFile, home } from "herdr";
import * as herdr from "herdr";
// t-194: `herdr-app check` runs init() and a render for real, then exits and leaves every process they
// started (knownAgents()'s login-shell probe, exec(), hc()) running. checking() (Herdr 0.1.16) is true then;
// an older Herdr has no such export, so it is read through the namespace: missing, not true or throwing is live.
const isChecking = () => { try { return herdr.checking?.() === true; } catch { return false; } };

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// A space's Project Agent tab: the project-agent mod keeps shared state "project-agent.tabs"
// (tab id -> { space, project, profile, name, terminal }) and does the tracking, ordering and
// reopening. This tab bar only reads it: no close or pin control on that tab, and the close
// shortcuts refuse it.
const localId = (id) => String(id ?? "").split("/").pop();
// The space's home folder (shared "space.home", set from the space menu): where its new terminals start.
const homeOf = (id) => (shared("space.home") ?? {})[id] || undefined;
const PA_NOTICE = { title: "The Project Agent stays open", body: "It ends when its space is closed." };

export default class Tabs extends View {
  init(_props, cx) {
    this.pressed = null;
    this.scroll = ScrollHandle.new();
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
    // A space's replacement last tab starts Herdr's Claude entry (programs.json "claude" run, set by the profile).
    this.claudeRun = ["claude"];
    if (isChecking()) return;
    knownAgents().then((list) => { const c = list.find((a) => a.key === "claude"); if (c?.run?.length) this.claudeRun = c.run; }).catch(() => {});
    cx.spawn(async (cx) => {
      for (;;) {
        const command = String(await nextCommand()).split(/[.:]/).pop();
        const at = focused();
        // New tabs and splits start in the space's home folder when it has one.
        if (command === "new-tab") run("tab.new", { space: at?.space, folder: homeOf(at?.space) });
        else if (command === "split-right" || command === "split-down") {
          const direction = command.slice(6), folder = homeOf(at?.space);
          if (folder && at?.pane) run("terminal.open", { folder, place: direction }); else run("pane.split", { direction });
        }
        else if (command === "panel-full") this.panelFull();
        else if (command === "close-tab") this.closeTab(focused()?.tab);
        else if (command === "close-pane") this.closePane(focused()?.pane);
        cx.notify();
      }
    });
  }

  pa() { return shared("project-agent.tabs") ?? {}; }

  // The side panel full width (the terminals hidden, still running), and back. `want`: true or
  // false; left out, it toggles. The panel's width before is remembered to restore it.
  panelFull(want) {
    const tree = JSON.parse(JSON.stringify(layout() ?? {})), main = find(tree, "main"), panel = find(tree, "panel");
    if (!main || !panel) return;
    const full = Boolean(main.hidden), next = want ?? !full;
    if (next === full) return;
    if (next) {
      if (panel.hidden) return; // nothing to show full
      localStorage.setItem("panel.before", JSON.stringify({ size: panel.size ?? null, max: panel.max ?? null }));
      main.hidden = true; panel.size = { weight: 1 }; delete panel.max;
    } else {
      const before = JSON.parse(localStorage.getItem("panel.before") ?? "{}");
      main.hidden = false; panel.size = before.size ?? { px: 550 }; panel.max = before.max ?? 900;
    }
    run("layout.set", { layout: tree });
    // Herdr keeps the width it last measured as a click; say the restored width that way too.
    if (!next && panel.size?.px) run("layout.resize", { id: "panel", px: panel.size.px });
  }

  // Close a tab the way the tab bar does: never the Project Agent's, and a space's
  // last tab gets a replacement first so the space survives.
  closeTab(id) {
    if (!id) return;
    if (this.pa()[id]) { notify(PA_NOTICE); return; }
    const space = spaces().find((s) => s.tabs.some((tab) => tab.id === id));
    if (space && space.tabs.length <= 1) run("tab.new", { space: space.id, folder: homeOf(space.id), argv: this.claudeRun });
    run("tab.close", { id });
  }

  closePane(id) {
    const pane = id && panes().find((p) => p.pane === id);
    const record = pane && this.pa()[pane.tab];
    if (record && record.terminal === pane.terminal) { notify(PA_NOTICE); return; }
    if (id) run("pane.close", { pane: id }); else run("pane.close");
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    const t = theme();
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const active = shown.findIndex(tab => tab.active);
    const selected = shown[active]?.id;
    if (selected !== this.selected || active !== this.selectedIndex) {
      this.selected = selected;
      this.selectedIndex = active;
      if (active >= 0) this.scroll.scroll_to_item(active);
    }
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const pins = shared("my-tabs.pinned") ?? {};
    const pa = this.pa();
    const paFirst = (space?.tabs ?? []).some(x => pa[x.id]) ? 1 : 0; // position 1 is the Project Agent's
    const pinnedCount = paFirst + (space?.tabs ?? []).filter(x => pins[x.id] && !pa[x.id]).length;
    const togglePin = (c) => {
      const next = { ...pins }, on = !pins[c.id];
      if (on) next[c.id] = true; else delete next[c.id];
      setShared("my-tabs.pinned", next);
      run("tab.move", { id: c.id, index: on ? pinnedCount + 1 : pinnedCount });
      for (const p of panes().filter(p => p.tab === c.id && p.terminal && p.program?.agent)) run("terminal.pin", { terminal: p.terminal, pinned: on });
    };
    const item = (c, i) => {
      const agentTab = Boolean(pa[c.id]);
      const pinned = !agentTab && Boolean(pins[c.id]);
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
      const lead = panes().find(p => p.tab === c.id && p.program?.agent) ?? panes().find(p => p.tab === c.id);
      const live = (lead?.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
      const isPath = /^[~/]|^[A-Za-z]:\\/.test((lead?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
      const telling = live && !isPath && !live.includes("@") && live !== program?.name && live.toLowerCase() !== program?.key ? live : null;
      const fallback = /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;
      const name = !c.named && telling ? telling : fallback;
      return h_flex().id(`tab-${c.id}`).h(29).px(10).gap(7).rounded(7).items_center().flex_none().text_size(12.8)
        // A rename or status dot on this or an earlier tab can push the active one out.
        .when(i <= active, el => el.on_size_change((_size, cx) => { this.scroll.scroll_to_item(active); cx.notify(); }))
        .border(1).border_color(c.active ? t.border : t.chrome).bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) { if (!pa[shown[from].id]) run("tab.move", { id: shown[from].id, index: Math.max(1 + paFirst, space.tabs.findIndex(x => x.id === c.id) + 1) }); }
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "my-menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).text_color(t.muted) : image(program.icon).size(14)))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status])))
        .when(!agentTab && (pinned || c.active), el => el.child(div().id(`pin-${c.id}`).text_color(pinned ? t.accent : t.dim).hover(s => s.text_color(t.foreground)).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); togglePin(c); }).child(svg("mods/my-tabs/pin.svg").size(12))))
        .when(c.active && !pinned && !agentTab, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); this.closeTab(c.id); }).child(svg("mods/pane/close.svg").size(12))));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    // Full-width panel with no panel left to show (it was closed, or this space has none): bring the terminals back.
    const panelIsFull = Boolean(find(root, "main")?.hidden);
    if (panelIsFull && (!panel || panel.hidden)) this.panelFull(false);
    const enabled = ["changes", "files", "agents-view", "project-agent"]; // my-tabs: fixed views, in this order
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(14)).child(label);
    };
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(3).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().track_scroll(this.scroll)
        .on_size_change((_size, cx) => { if (active >= 0) { this.scroll.scroll_to_item(active); cx.notify(); } })
        .children(shown.map(item)))
      .child(button("tab-new", "+", () => openOverlay({ mod: "my-new-menu", kind: "popup", width: 250, height: 512 })))
      .child(panelButton("changes", "Changes", "mods/changes/changes.svg"))
      .child(panelButton("files", "Files", "mods/files/file.svg"))
      .child(panelButton("agents-view", "Agents", "mods/my-agent-picker/agents.svg"))
      .child(panelButton("project-agent", (shared("project-agent.open") ?? {})[space?.id] ? `Project · ${shared("project-agent.open")[space.id]}` : "Project", "mods/project-agent/project.svg"))
      // The open panel full width, or back beside the terminals.
      .when(Boolean(panel) && !panel.hidden, el => el.child(div().id("panel-full").h(26).px(7).flex().flex_none().items_center().rounded(6).text_size(12)
        .bg(panelIsFull ? t.selected : t.chrome).text_color(panelIsFull ? t.foreground : t.muted).hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .tooltip(panelIsFull ? "Show the terminals again" : "Make this panel full width").on_click(() => this.panelFull()).child(panelIsFull ? "⤡ Split" : "⤢ Full")))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/my-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/my-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/my-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
