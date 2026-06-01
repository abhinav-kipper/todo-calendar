# Almanac desktop widget

A tiny Tauri shell that renders the live `?widget=1` view of the
Almanac web app in an always-on-top, frameless window. The web app
(loaded from `https://abhinav-kipper.github.io/todo-calendar/?widget=1`)
is the source of truth — every fix you ship there reaches the widget
on next launch, and Firestore live-sync keeps it in lockstep with
the main app and other devices.

## What you get

- 380×620 floating window, no title bar, no dock icon noise.
- `alwaysOnTop: true` — sits above all other windows.
- `skipTaskbar: true` — won't show up in Cmd-Tab.
- Reuses the web app's service worker, so subsequent launches work
  offline once you've opened it online once.

## Build locally (macOS)

```bash
# One-time setup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
cargo install tauri-cli --version "^2"

# Build the universal .app
cd desktop
cargo tauri build --target universal-apple-darwin
```

Output: `src-tauri/target/universal-apple-darwin/release/bundle/macos/Almanac.app`

To install: drag it into `/Applications`. First launch needs
**right-click → Open** because the build is unsigned (see
"Distribution" below).

## Distribution

The GitHub Actions workflow at `.github/workflows/desktop-build.yml`
builds a universal `.app` + `.dmg` on every tag that starts with
`desktop-v` and uploads them as a Release. To cut a release:

```bash
git tag desktop-v0.1.0
git push origin desktop-v0.1.0
```

Builds are **unsigned**. macOS Gatekeeper requires users to
right-click → Open the first time. For signed/notarized releases,
add `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, and
`APPLE_TEAM_ID` to the repo secrets and enable signing in
`tauri.conf.json -> bundle.macOS.signingIdentity`.

## Icons

The PNG icons under `src-tauri/icons/` are generated from
`icons/icon-512.svg` in the repo root. To regenerate (after the
SVG changes):

```bash
cd desktop/src-tauri/icons
for size in 32 128 256; do rsvg-convert -w $size -h $size ../../../icons/icon-512.svg -o ${size}x${size}.png; done
cp 256x256.png 128x128@2x.png
rsvg-convert -w 512 -h 512 ../../../icons/icon-512.svg -o icon.png
```

Tauri auto-derives `.icns` from these PNGs during the macOS build.
