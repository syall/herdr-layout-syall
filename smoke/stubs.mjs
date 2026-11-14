// Chainable stand-ins for the UI kit, and fake live data, to run a mod's render code under Node.
const el = () => new Proxy(function () {}, { get: (_t, k) => (k === Symbol.toPrimitive ? () => "" : k === "then" ? undefined : (...a) => { if (k === "when" && !a[0]) return el(); for (const x of a) if (typeof x === "function" && !["on_click", "on_mouse_down", "on_mouse_up", "on_key_down", "on_hover", "on_size_change", "on_scroll_wheel"].includes(k)) { try { const r = x(el(), cx); void r; } catch (e) { throw e; } } return el(); }), apply: () => el() });
export const cx = { notify() {}, spawn(f) { const p = f(cx); if (p?.catch) p.catch((e) => { console.log("ASYNC ERROR", e); process.exitCode = 1; }); return p; }, timer: { every() {}, after() {} }, focus_handle: () => ({ focus() {} }), stop_propagation() {} };
export class View {}
export const div = el, svg = el, image = el, v_flex = el, h_flex = el, v_virtual_list = el;
export const Input = { new: el }, Editor = { new: el }, Scrollbar = { vertical: el }, TextView = { markdown: el, html: el };
export const InputState = { new: ({ value } = {}) => { let v = value ?? ""; return { value: () => v, set_value(n) { v = n; }, on() {}, focus() {}, release() {}, set_selected_range() {} }; } };
export const EditorState = { new: () => ({ release() {} }) }, ScrollHandle = { new: () => ({ scroll_to_item() {} }) };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const S = globalThis.__shared ??= {};
export const shared = (k) => S[k], setShared = (k, v) => { S[k] = v; };
export const spaces = () => globalThis.__spaces ?? [], panes = () => globalThis.__panes ?? [], terminals = () => globalThis.__terminals ?? [], agents = () => [], machines = () => [{ name: null, layout: "ready" }];
export const focused = () => globalThis.__focused ?? null, layout = () => globalThis.__layout ?? ({ id: "root", children: [] }), theme = () => new Proxy({}, { get: () => "#000000" }), settings = () => ({ zoom: 1 }), window = () => ({ platform: "macos" });
export const home = () => process.env.HOME, props = () => globalThis.__props ?? {}, run = () => null, notify = () => "", openOverlay = () => "o", closeOverlay = () => null, knownAgents = async () => [], nextCommand = () => new Promise(() => {}), watchFolder = () => new Promise(() => {}), pickFolder = async () => null, keys = () => [];
import fs from "fs"; import { spawnSync } from "child_process";
export const readTextFile = async (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } }, writeTextFile = async () => null;
export const exec = async (c, a = []) => { const r = spawnSync(c, a, { encoding: "utf8" }); return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" }; }, hc = async () => ({ code: 0, stdout: "", stderr: "" });
