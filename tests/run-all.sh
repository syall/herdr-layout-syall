#!/bin/sh
# Smoke-renders this checkout's mods (not the installed ones) from a temp copy.
# Usage: tests/run-all.sh [--affected]
# --affected: only the mods named in $PA_CHANGED_FILES (one path per line, relative to the repo root,
#   an optional leading ./ allowed); a change under smoke/ or tests/, or an empty/blank list, runs every mod;
#   other changes run nothing.
# Exit 0 all passed, 1 a failure, no mods or no node, 2 bad argument.
set -u
unset CDPATH
root=$(cd -- "$(dirname -- "$0")/.." && pwd)

mode=full
case "${1-}" in
  "") ;;
  --affected) mode=affected ;;
  *) echo "usage: tests/run-all.sh [--affected]" >&2; exit 2 ;;
esac
[ $# -le 1 ] || { echo "usage: tests/run-all.sh [--affected]" >&2; exit 2; }

node=${NODE:-${HOME-}/.local/share/mise/shims/node}
[ -x "$node" ] || node=$(command -v node 2>/dev/null) || node=
[ -n "$node" ] && [ -x "$node" ] || { echo "run-all: node not found (set NODE)" >&2; exit 1; }

all=$(cd "$root/mods" 2>/dev/null && for d in */; do [ -f "$d/main.js" ] && printf '%s\n' "${d%/}"; done)
[ -n "$all" ] || { echo "run-all: no mods found in $root/mods" >&2; exit 1; }
mods=$all
# Changed paths without CR, blank lines and a leading ./
changed=$(printf '%s\n' "${PA_CHANGED_FILES-}" | tr -d '\r' | sed -e 's#^\./##' -e '/^[[:space:]]*$/d')
if [ "$mode" = affected ] && [ -n "$changed" ]; then
  if printf '%s\n' "$changed" | grep -Eq -e '^(smoke|tests)/'; then
    mods=$all
  else
    mods=$(printf '%s\n' "$changed" | sed -n 's#^mods/\([^/]*\)/.*#\1#p' | sort -u |
      while read -r m; do [ -f "$root/mods/$m/main.js" ] && printf '%s\n' "$m"; done)
  fi
  [ -n "$mods" ] || { echo "run-all: nothing affected"; exit 0; }
fi

T=$(mktemp -d "${TMPDIR:-/tmp}/run-all.XXXXXX") || { echo "run-all: mktemp failed" >&2; exit 1; }
trap 'rm -rf "$T"' EXIT
trap 'exit 1' HUP INT TERM
mkdir -p "$T/home"
cp -R "$root/mods" "$T/home/mods" && cp -R "$root/smoke" "$T/smoke" || { echo "run-all: copy failed" >&2; exit 1; }
rm -rf "$T/smoke/.run"

pass=0; fail=0
# Mod names are split on whitespace: a folder name with a space runs as two names that do not
# exist, so it fails (FAIL, exit 1) rather than passing unseen. Globbing is off for the list.
set -f
# Each mod runs twice: against the stubs, and against stubs without Herdr 0.1.16's `checking` export
# (SMOKE_NO_CHECKING=1, an older Herdr: the mod must load and behave as in a live window; t-194).
for m in $mods; do
  for stubs in with no; do
    if [ $stubs = no ]; then name="$m (no checking export)"; else name=$m; fi
    out=$(cd "$T/smoke" && if [ $stubs = no ]; then SMOKE_NO_CHECKING=1; export SMOKE_NO_CHECKING; fi && HERDR_APP_HOME="$T/home" "$node" run.mjs "$m" 2>&1); code=$?
    if [ $code -eq 0 ] && printf '%s\n' "$out" | grep -qx -e "$m: rendered [0-9][0-9]* state(s) without an error"; then
      pass=$((pass + 1)); echo "ok   $name"
    else
      fail=$((fail + 1)); echo "FAIL $name (exit $code)"; printf '%s\n' "$out" | tail -20
    fi
  done
done
echo "run-all: $pass passed, $fail failed"
[ $fail -eq 0 ] && [ $pass -gt 0 ]
