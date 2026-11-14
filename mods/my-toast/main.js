// Modified from the `toast` mod shipped with Herdr 0.1.15 (Apache License 2.0).
// Changes by syall: also posts a macOS notification when the window is not in front.
// How notifications look. Anything can post one with notify({ title, body,
// level, icon, action }); replace this mod to restyle them all. Click to
// run its action (e.g. go to the agent) and dismiss it.

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, window, agents, spaces, shared, setShared, exec } from "herdr";

// What the notification is about, from the command it runs when clicked: the space, and the
// agent or task. Herdr's own toasts go to an agent (`terminal`); others may name a space (`id`).
function subject(p) {
  const args = p.action?.args ?? {};
  const agent = args.terminal ? agents().find((a) => a.address === args.terminal) : null;
  const space = spaces().find((s) => s.id === (agent?.space ?? args.id ?? args.space));
  const job = agent && space ? (shared("project-agent.workers") ?? {})[space.id]?.[agent.address] : null;
  const who = job ? `${job.task} · ${job.role ?? "worker"}` : agent ? agent.tab_name || agent.title || "" : "";
  return { space: space?.name ?? "", who };
}

// A macOS notification: terminal-notifier when it is installed (a click comes back to Herdr and
// runs the toast's command; a newer one about the same thing replaces the older), else the
// system's own script command (text only). Looked for once every ten minutes.
async function system(p) {
  const { space, who } = subject(p);
  const title = space || "Herdr", subtitle = [who, p.title].filter(Boolean).join(" · "), message = p.body || p.title || "";
  let tool = shared("my-toast.notifier");
  if (!tool || Date.now() - tool.at > 600000) {
    const found = await exec("sh", ["-lc", "command -v terminal-notifier"], { timeout: 8000 }).catch(() => ({ code: 1, stdout: "" }));
    tool = { path: found.code === 0 ? found.stdout.trim().split("\n").pop() : null, at: Date.now() };
    setShared("my-toast.notifier", tool);
  }
  if (tool.path) {
    const args = ["-title", title, "-subtitle", subtitle, "-message", message, "-activate", "dev.herdr.app",
      "-group", `herdr-${p.action?.args?.terminal ?? p.action?.args?.id ?? p.title ?? "note"}`];
    if (p.action?.name) args.push("-execute", `herdr-app do ${p.action.name} '${JSON.stringify(p.action.args ?? {}).replace(/'/g, "'\\''")}'`);
    await exec(tool.path, args, { timeout: 15000 });
  } else {
    await exec("osascript", ["-e", "on run argv", "-e", "display notification (item 1 of argv) with title (item 2 of argv) subtitle (item 3 of argv)", "-e", "end run", message, title, subtitle], { timeout: 15000 });
  }
}

const DOT = { error: "blocked", warning: "working", success: "done", info: "accent" };

export default class Toast extends View {
  init(_props, cx) {
    // With Herdr in front the toast is enough; behind another app, say it through macOS too.
    const p = props() ?? {};
    if (window()?.platform === "macos" && !window().active && (p.title || p.body)) cx.spawn(async () => { try { await system(p); } catch {} });
  }

  render(cx) {
    const t = theme();
    const p = props() ?? {};
    const login = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/.exec(p.body ?? "");
    const command = login ? `hc machine login ${login[1]}` : null;
    return h_flex()
      .id("toast")
      .size_full()
      .px(18)
      .gap(12)
      .items_center()
      .bg(t.popover)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => {
        if (p.action?.name) run(p.action.name, p.action.args ?? {});
        closeOverlay(p.overlay);
      })
      .child(p.icon ? image(p.icon).w(18).h(18).flex_none() : div().size(8).rounded(4).flex_none().bg(t[DOT[p.level] ?? "accent"]))
      .child(
        v_flex()
          .flex_1()
          .overflow_hidden()
          .child(div().truncate().font_semibold().text_size(13).text_color(t.foreground).child(login ? `${login[1]} needs a login: run` : p.title ?? ""))
          .when(!login && Boolean(p.body), (el) => el.child(div().truncate().text_size(12).text_color(t.muted).child(p.body ?? "")))
          .when(Boolean(login), (el) => el.child(h_flex().gap(8).items_center()
            .child(div().flex_1().min_w(0).truncate().tooltip(command).text_size(12).text_color(t.muted).child(command))
            .child(div().id("toast-login-copy").flex_none().px(6).py(3).rounded(4).bg(t.raised)
              .text_size(12).text_color(t.foreground).cursor_pointer().hover(s => s.bg(t.hover))
              .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(command); this.copied = true; cx.notify(); })
              .child(this.copied ? "Copied" : "Copy")))),
      );
  }
}
