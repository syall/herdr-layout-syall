#!/bin/sh
# Smoke-renders this checkout's mods (not the installed ones) from a temp copy.
# Usage: tests/run-all.sh [--affected]
# --affected: only the mods named in $PA_CHANGED_FILES (one path per line, relative to the repo root);
#   a change under smoke/ or tests/, or an empty/unset list, runs every mod; other changes run nothing.
# Exit 0 all passed, 1 a failure or no node, 2 bad argument.
set -u
root=$(cd "$(dirname "$0")/.." && pwd)

mode=full
case "${1-}" in
  "") ;;
  --affected) mode=affected ;;
  *) echo "usage: tests/run-all.sh [--affected]" >&2; exit 2 ;;
esac
[ $# -le 1 ] || { echo "usage: tests/run-all.sh [--affected]" >&2; exit 2; }

node=${NODE:-$HOME/.local/share/mise/shims/node}
[ -x "$node" ] || node=$(command -v node 2>/dev/null) || node=
[ -n "$node" ] && [ -x "$node" ] || { echo "run-all: node not found (set NODE)" >&2; exit 1; }

all=$(cd "$root/mods" && for d in */; do [ -f "$d/main.js" ] && printf '%s\n' "${d%/}"; done)
mods=$all
if [ "$mode" = affected ] && [ -n "${PA_CHANGED_FILES-}" ]; then
  if printf '%s\n' "$PA_CHANGED_FILES" | grep -Eq '^(smoke|tests)/'; then
    mods=$all
  else
    mods=$(printf '%s\n' "$PA_CHANGED_FILES" | sed -n 's#^mods/\([^/]*\)/.*#\1#p' | sort -u |
      while read -r m; do [ -f "$root/mods/$m/main.js" ] && printf '%s\n' "$m"; done)
  fi
  [ -n "$mods" ] || { echo "run-all: nothing affected"; exit 0; }
fi

T=$(mktemp -d "${TMPDIR:-/tmp}/run-all.XXXXXX") || { echo "run-all: mktemp failed" >&2; exit 1; }
trap 'rm -rf "$T"' EXIT
trap 'exit 1' INT TERM
mkdir -p "$T/home"
cp -R "$root/mods" "$T/home/mods" && cp -R "$root/smoke" "$T/smoke" || { echo "run-all: copy failed" >&2; exit 1; }
rm -rf "$T/smoke/.run"

pass=0; fail=0
for m in $mods; do
  out=$(cd "$T/smoke" && HERDR_APP_HOME="$T/home" "$node" run.mjs "$m" 2>&1); code=$?
  if [ $code -eq 0 ] && printf '%s\n' "$out" | grep -qx "$m: rendered [0-9][0-9]* state(s) without an error"; then
    pass=$((pass + 1)); echo "ok   $m"
  else
    fail=$((fail + 1)); echo "FAIL $m (exit $code)"; printf '%s\n' "$out" | tail -20
  fi
done
echo "run-all: $pass passed, $fail failed"
[ $fail -eq 0 ]
