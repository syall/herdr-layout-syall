# Herdr layouts: syall and syall-project-agent

My Herdr window: the layout file, the key bindings, and the chrome mods it uses. It expects two
other mods to be installed: `project-agent` (repo `herdr-project-agent`) and `space-home`
(repo `herdr-space-home`).

| Path | What it is |
|---|---|
| `layouts/syall.json` | The same window without the Project Agent pieces (the layout this one grew from) |
| `layouts/syall-project-agent.json` | The layout: sidebar, tab bar, panes, a right panel stacking Changes, Files, Agents and Project, and the hidden `pa-timer` block |
| `mods/my-tabs/` | Tab bar (clone of `tabs`): panel buttons, pins, home-folder tabs and splits, close guards for the Project Agent tab |
| `mods/my-spaces/` | Spaces sidebar (clone of `spaces`): new spaces start `pa-session --ask` (found on `sh -l` PATH or in `~/.local/bin`; a "not found" is checked again after a minute) |
| `mods/my-new-menu/` | The "+" menu (clone of `new-menu`): tabs start in the space's home folder |
| `mods/my-menu/` | Right-click menus (clone of `menu`): "Set home folder…", no Close on a Project Agent tab |
| `mods/my-pane/` | Pane header (clone of `pane`): home-folder splits, no close on the Project Agent's pane |
| `mods/my-changes/` | Changes view (clone of `changes`): a picker for the space's other repositories and worktrees |
| `mods/my-files/` | Files view (clone of `files`): can be pointed at a folder through shared `my-files.root` |
| `mods/my-toast/` | Notifications (clone of `toast`): also a macOS notification when Herdr is not in front, through `terminal-notifier` if installed, else the system's script command |
| `mods/my-agent-picker/` | The Agents view's picker |
| `config/keys.json` | Key bindings: Cmd-N, Cmd-T, Cmd-D, Cmd-Shift-D, Cmd-W, Cmd-Shift-W go to the mods above |
| `config/programs.json` | Herdr's Claude entry runs `pa-claude` (written by `pa-profile apply`) |

## Install

```sh
./install.sh           # layout and mods
./install.sh --keys    # also keys.json and programs.json (replaces yours; backups are kept)
./install.sh --check   # what differs from the installed copy
```

Herdr rewrites `gpui-kit.d.ts` and `jsconfig.json` in each mod folder; they are not tracked.
Herdr also writes into the installed layout file as you use it (panel widths, the shown panel, the
terminal the Agents view shows), so `--check` usually lists the layout as different. The copy here
is the clean one, without that state.
The mods are clones of Herdr 0.1.15's shipped mods and do not get its updates.

## Smoke test

`herdr-app check` renders a mod once with no data, so it misses errors in code that only runs with
real data. It also runs `init()` for real and leaves any process init starts running (a `knownAgents()`
login-shell probe, `exec()`, `hc()`), so init starts none while `checking()` is true (each mod reads it as
`herdr.checking?.()`: Herdr before 0.1.16 has no such export).
`smoke/run.mjs` runs an installed mod's render code under Node with a stubbed UI kit and fake spaces,
agents, tasks and repositories, and checks that no mod starts a process while `checking()` is true:

```sh
cd smoke && for m in my-changes my-agent-picker my-files project-agent my-tabs my-menu my-pane my-spaces my-new-menu space-home; do node run.mjs $m; done
```

It catches calls on missing values and misspelt fields, not layout or looks.
`tests/run-all.sh` runs every mod in this checkout (not the installed ones) from a temp copy and exits 1 on any failure (`--affected`: only the mods named in `PA_CHANGED_FILES`, newline-separated paths relative to the repo root).

## Shared state these mods read

- `project-agent.tabs` (from `project-agent`): which tab is a space's Project Agent tab.
- `project-agent.open`: open decision cards per space, for the "Project · n" button.
- `space.home` (from `space-home`): each space's home folder.
- `project-agent.worktrees`: each space's task worktrees, offered in the Changes picker.
- `project-agent.workers`: which task each worker belongs to, for the Agents view's task bar.

They write `project-agent.show` (`{ space, task, at }`) to open a task in the Project panel.

## Licence

Apache License 2.0; see `LICENSE` and `NOTICE`. Most of the mods here are modified copies of the mods Herdr ships (also Apache-2.0); `NOTICE` lists which, and each one says so at the top of its `main.js`.
