# Electron packaging and update metadata

Build the web assets with `pnpm build`, then run
`pnpm --dir electron package --linux`, `--mac` or `--win`.
Set `VERSION` to override the root package version. macOS builds include a DMG and an update ZIP.
For a stable package, build the web assets and package with `SABLE_BUILD_FLAVOR=stable`.

To build `Sable Sandboxed`, run `SABLE_BUILD_FLAVOR=stable pnpm build`, then
`pnpm --dir electron package --sandboxed --mac`. It uses the MAS runtime with App Sandbox
and Hardened Runtime. Signing requires the team's Developer ID Application certificate;
pass `-c.mac.identity=YOUR_TEAM_ID` to use another team.

Packages are written to `electron/release/sandboxed`. The app stores data in its own
`moe.sable.client.sandboxed` container and requires a fresh login. Update by installing
a new DMG. It shares stable's link schemes; macOS must route links to the app you are
using.

`package.mjs` picks `electron-builder.stable.yml` or `electron-builder.nightly.yml`, both
extending `electron-builder.yml`, from `SABLE_BUILD_FLAVOR`: only `stable` builds the stable
package. Stable builds keep the Tauri identity (`moe.sable.client`) and its data directory;
nightlies keep the Tauri nightly identity (`moe.sable.next.nightly`) and install alongside
stable as `Sable Nightly`.
On first launch the app copies the Tauri app's permission grants, telemetry consent and
smooth-scrolling choice (`src/tauri-import.ts`).

Sign-in opens the system browser and returns to a one-shot listener on `127.0.0.1`
(RFC 8252 loopback redirect).

Link schemes are unchanged by app renames: stable uses `moe.sable.app` and `sable`;
nightly uses `moe.sable.next`, not `moe.sable.next.nightly`.
Flatpak, deb and rpm declare them in their desktop entry. Only AppImage, tarball and
development runs register a handler in `~/.local/share/applications` at startup.

Update feeds:

- Stable: `https://git.sable.moe/SableClient/sable-next/releases/download/latest/`
- Nightly: `https://git.sable.moe/SableClient/sable-next/releases/download/nightly/`

Packaging generates `latest-mac.yml`, `latest-linux.yml`, `latest-linux-arm64.yml` and `latest.yml` (Windows); versions containing
`-nightly.` use `nightly` instead of `latest`. `--publish never` disables
electron-builder uploads but still generates these manifests.

CI runs `node electron/publish-updates.mjs` with `TAG`, `VERSION`, `SHA` and
`FORGEJO_TOKEN`. The tagged release must exist. `FORGEJO_URL` and
`FORGEJO_REPOSITORY` default to this repository.

The script uploads installers and blockmaps to the tagged release, then publishes
channel manifests with versioned download URLs. Failed uploads leave the channel
manifest unchanged. Nightly pruning preserves releases referenced by those manifests.

The main process uses `electron-updater` with the feed for the channel chosen in
Settings → About. Stable macOS releases are signed and notarized, so they can install updates. Nightlies built without the signing secrets are unsigned and cannot.
Pass `-c.extraMetadata.autoUpdate=false` to disable it.

## Proxy

Pass Chromium's `--proxy-server` switch:

```sh
# Linux
sable --proxy-server=socks5://127.0.0.1:9050
# macOS
open -a Sable --args --proxy-server=socks5://127.0.0.1:9050
# Windows
Sable.exe --proxy-server=socks5://127.0.0.1:9050
```

It applies to the window and the Sable core. `socks5://` resolves host names on the proxy,
`socks://` is SOCKS4 and `host:port` is an HTTP proxy. Credentials and per-scheme rules
(`http=a:1;https=b:2`) are not supported, and the core refuses to start with the latter.

Calls use WebRTC over UDP, which SOCKS does not carry. Set Settings → Calls → Network interfaces
for calls to "Only through a proxy" to keep them off the direct route.

## Build Windows from Linux

The native Rust modules can be cross-compiled with `cargo-xwin`. Install
`cargo-xwin`, LLVM (including `clang-cl` and `lld-link`), CMake and Ninja, then add
Rust's `x86_64-pc-windows-msvc` target
(`rustup target add x86_64-pc-windows-msvc`). `cargo-xwin` downloads the Microsoft
SDK and CRT on its first build. Run `mise install` and `mise exec -- pnpm install
--frozen-lockfile` once to install the repository's web build tools and dependencies.
Use Bash in WSL/Linux, from the repository root. `mise exec` puts the pinned
`wasm-bindgen` and `wasm-opt` tools on PATH.

Build the web assets, then compile and bundle the Electron main process for Windows:

```sh
# Build sequentially; disable LTO and limit Cargo workers on memory-limited hosts.
CARGO_BUILD_JOBS=1 CARGO_PROFILE_WASM_RELEASE_LTO=false \
  CARGO_PROFILE_WASM_RELEASE_CODEGEN_UNITS=16 mise exec -- pnpm build
CARGO_BUILD_JOBS=1 CARGO_PROFILE_RELEASE_LTO=false \
  CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16 \
  SABLE_NATIVE_TARGET=x86_64-pc-windows-msvc \
  SABLE_IDENTIFIER=moe.sable.next.nightly \
  mise exec -- node electron/build.mjs --release
```

The commands above prepare the app; they do not produce an installer. To create
the `.exe`, continue with the packaging step below.

Package those compiled assets with Wine installed, or use electron-builder's
Wine container. Run from the repository root:

```sh
docker run --rm --name sable-windows-package --memory=4g --memory-swap=5g --cpus=2 \
  --user "$(id -u):$(id -g)" \
  --env ELECTRON_CACHE=/tmp/sable-electron \
  --env ELECTRON_BUILDER_CACHE=/tmp/sable-builder \
  --env USE_SYSTEM_WINE=true \
  --env XDG_CACHE_HOME=/tmp/sable-cache \
  --env CSC_IDENTITY_AUTO_DISCOVERY=false \
  --volume "$PWD:/project" --workdir /project/electron \
  electronuserland/builder@sha256:f3a8d451994c881d0972e7b1846ee4d4fdc15eb41fc6b1f350b38cbf99ca90fe \
  sh -c 'export WINEPREFIX=/tmp/sable-wine
    mkdir -p "$WINEPREFIX" && chmod 700 "$WINEPREFIX" &&
    exec ./node_modules/.bin/electron-builder \
    --win nsis --x64 --publish never \
    --config electron-builder.nightly.yml \
    -c.extraMetadata.version="$(node -p "require(\"../package.json\").version")" \
    -c.extraMetadata.autoUpdate=false'
```

The fixed container name prevents two copies of this command from packaging
into the same output directory at once. Wait for an existing run to finish before
starting another.

Wine needs a prefix directory owned by the container user. The command creates
`/tmp/sable-wine` as that user; do not set `WINEPREFIX=/tmp`, since `/tmp` itself
is owned by root.

This creates an unsigned Nightly installer in `electron/release`, including
local source changes, with automatic updates disabled. The command invokes
`electron-builder` directly because `package.mjs` also compiles the native
modules; those have already been compiled on the host. Linux-installed
`node_modules` can be reused inside this Linux container. The container image
is pinned to a digest. On Linux with a systemd user session,
wrap each build command in `systemd-run --user --scope -p MemoryMax=6G
-p MemorySwapMax=1G env ...` to enforce a memory limit; exceeding it fails that
build instead of allowing it to consume the host's remaining memory.
