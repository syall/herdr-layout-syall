#!/bin/sh
# Installs the syall-project-agent layout and its tab bar, sidebar, menu and pane mods into Herdr.
#   ./install.sh           the layout and the mods
#   ./install.sh --keys    also replace keys.json and programs.json (the old ones are kept as .bak-layout-install)
#   ./install.sh --check   list installed files that differ from this repo
set -e
here=$(cd "$(dirname "$0")" && pwd)
APP=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
PA=${HERDR_PA_HOME:-$HOME/.config/herdr-pa}
check=0; [ "$1" = "--check" ] && check=1 && shift
drift=0
# copy <folder in this repo> <destination>: installs every file, deletes nothing.
# With --check it only reports files that differ from what is installed.
copy() {
  (cd "$here/$1" && find . -type f ! -name .DS_Store) | while read -r f; do
    src="$here/$1/$f"; dst="$2/${f#./}"
    if cmp -s "$src" "$dst"; then continue; fi
    if [ "$check" = 1 ]; then echo "differs: $dst"; else mkdir -p "$(dirname "$dst")"; cp -p "$src" "$dst"; echo "installed $dst"; fi
  done
}

copy mods "$APP/mods"
copy layouts "$APP/layouts"
if [ "$check" = 1 ]; then for f in keys.json programs.json; do cmp -s "$here/config/$f" "$APP/$f" || echo "differs: $APP/$f"; done; exit 0; fi
if [ "$1" = "--keys" ]; then
  for f in keys.json programs.json; do
    cmp -s "$here/config/$f" "$APP/$f" && continue
    [ -e "$APP/$f" ] && cp -p "$APP/$f" "$APP/$f.bak-layout-install"
    cp -p "$here/config/$f" "$APP/$f"; echo "installed $APP/$f"
  done
fi
echo "Layout installed. Switch to it with: herdr-app do layout.switch --name syall-project-agent"
