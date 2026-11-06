#!/bin/sh
# adds the built app to your app launcher (rofi, wofi, fuzzel, walker...).
# run `npm run build-linux` first. run this again after a rebuild only if the folder moved.
set -e
root="$(cd "$(dirname "$0")" && pwd)"
app="$root/release/Nurtron-linux-x64/Nurtron"
if [ ! -x "$app" ]; then
  echo "Nothing built yet. Run: npm run build-linux" >&2
  exit 1
fi
mkdir -p "$HOME/.local/share/applications" "$HOME/.local/share/icons/hicolor/512x512/apps"
cp "$root/assets/icon.png" "$HOME/.local/share/icons/hicolor/512x512/apps/nurtron.png"
cat > "$HOME/.local/share/applications/nurtron.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Nurtron
Comment=Wire up a living creature's body, then raise what you've made
Exec="$app"
Icon=nurtron
Terminal=false
Categories=Game;Simulation;
StartupWMClass=Nurtron
EOF
echo "Nurtron is now in your app launcher."
