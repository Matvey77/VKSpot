#!/usr/bin/env bash
set -euo pipefail

# A private keyring keeps the synthetic Spotify sessions out of the user's desktop.
keyring_home=$(mktemp -d "${TMPDIR:-/tmp}/vkspot-e2e-keyring-XXXXXXXX")
trap 'rm -rf -- "$keyring_home"' EXIT
export HOME="$keyring_home"
export XDG_RUNTIME_DIR="$keyring_home/run"
export XDG_CURRENT_DESKTOP=GNOME
mkdir -m 700 "$XDG_RUNTIME_DIR"

dbus-run-session -- bash -euo pipefail -c '
  printf "%s\n" "vkspot-synthetic-test-keyring" | gnome-keyring-daemon --unlock --components=secrets >/dev/null
  xvfb-run -a -s "-screen 0 1920x1080x24" npm run test:e2e -- "$@"
' vkspot-linux-e2e "$@"
