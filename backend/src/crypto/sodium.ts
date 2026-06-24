import sodiumImport from 'libsodium-wrappers';

// esbuild/tsx exposes libsodium under `.default`; Node CJS uses the module directly.
const sodium: typeof sodiumImport =
  (sodiumImport as unknown as { default?: typeof sodiumImport }).default ?? sodiumImport;

let ready = false;

export async function initSodium(): Promise<void> {
  if (!ready) {
    await sodium.ready;
    ready = true;
  }
}

export function getSodium(): typeof sodiumImport {
  return sodium;
}
