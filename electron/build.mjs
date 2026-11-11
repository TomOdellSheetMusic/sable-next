import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { browserCsp } from '../scripts/build/csp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const appVersion =
  process.env.VITE_APP_VERSION ||
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const release = process.argv.includes('--release');
const out = join(here, 'dist');
// Native builds use the host platform. Linux can cross-compile Windows modules
// with cargo-xwin, whose SDK and linker setup also covers C/C++ dependencies.
const nativeTarget = process.env.SABLE_NATIVE_TARGET;
if (nativeTarget && !['x86_64-pc-windows-msvc', 'aarch64-pc-windows-msvc'].includes(nativeTarget)) {
  throw new Error(`Unsupported SABLE_NATIVE_TARGET: ${nativeTarget}`);
}
const nativePlatform = nativeTarget ? 'win32' : process.platform;
const crossWindows = nativeTarget && process.platform !== 'win32';

execFileSync(
  'cargo',
  [
    ...(crossWindows ? ['xwin'] : []),
    'build',
    '-p',
    'sable-node',
    '-p',
    'sable-audiofox',
    ...(nativeTarget ? ['--target', nativeTarget] : []),
    ...(release ? ['--release'] : []),
  ],
  {
    cwd: root,
    stdio: 'inherit',
  }
);

const target = process.env.CARGO_TARGET_DIR ?? join(root, 'target');
mkdirSync(out, { recursive: true });
for (const name of ['sable_node', 'sable_audiofox']) {
  const library = {
    darwin: `lib${name}.dylib`,
    linux: `lib${name}.so`,
    win32: `${name}.dll`,
  }[nativePlatform];
  copyFileSync(
    join(target, ...(nativeTarget ? [nativeTarget] : []), release ? 'release' : 'debug', library),
    join(out, `${name}.node`)
  );
}

if (nativePlatform === 'linux') {
  const prebuild = join(
    here,
    'node_modules/@vencord/venmic/prebuilds',
    `venmic-addon-linux-${process.arch}`,
    'node-napi-v7.node'
  );
  if (existsSync(prebuild)) copyFileSync(prebuild, join(out, `venmic-${process.arch}.node`));
}

const { csp } = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8')).app
  .security;
const policy = browserCsp(csp);

await build({
  entryPoints: {
    main: join(here, 'src/main.ts'),
    preload: join(here, 'src/preload.ts'),
    'core-host': join(here, 'src/core-host.ts'),
    'audiofox-host': join(here, 'src/audiofox-host.ts'),
  },
  outdir: out,
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron', './sable_node.node'],
  define: {
    __SABLE_CSP__: JSON.stringify(policy),
    __SABLE_IDENTIFIER__: JSON.stringify(process.env.SABLE_IDENTIFIER ?? 'moe.sable.next'),
    __SABLE_APP_VERSION__: JSON.stringify(appVersion),
    __SABLE_SENTRY__: JSON.stringify({
      dsn: process.env.VITE_SENTRY_DSN,
      environment: process.env.VITE_SENTRY_ENVIRONMENT,
      release: process.env.VITE_APP_VERSION,
    }),
  },
  sourcemap: true,
});
