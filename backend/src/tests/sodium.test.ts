import { describe, it, expect } from '@jest/globals';
import { initializeSodium, sodium } from '../crypto/sodium';

/**
 * backend/src/crypto/sodium.ts wraps the `libsodium-wrappers` default export
 * so the rest of the backend can `import { sodium } from './sodium'` and get
 * the fully-loaded module (with `crypto_sign_*` methods available) instead of
 * the bare namespace object, which was the source of the pre-existing
 * "sodium.crypto_sign_keypair is not a function" startup crash under
 * esbuild/tsx.
 */
describe('sodium crypto initialization', () => {
  it('resolves once libsodium is ready and returns the shared sodium instance', async () => {
    const readySodium = await initializeSodium();

    expect(readySodium).toBe(sodium);
  });

  it('exposes working Ed25519 primitives once ready', async () => {
    await initializeSodium();

    expect(typeof sodium.crypto_sign_keypair).toBe('function');
    expect(typeof sodium.crypto_sign_detached).toBe('function');
    expect(typeof sodium.crypto_sign_verify_detached).toBe('function');

    const keypair = sodium.crypto_sign_keypair();
    expect(keypair.publicKey).toHaveLength(32);
    expect(keypair.privateKey).toHaveLength(64);
  });

  it('can sign and verify a message after initialization', async () => {
    await initializeSodium();

    const keypair = sodium.crypto_sign_keypair();
    const message = Buffer.from('stamp-checkin-message');
    const signature = sodium.crypto_sign_detached(message, keypair.privateKey);

    expect(sodium.crypto_sign_verify_detached(signature, message, keypair.publicKey)).toBe(true);
    expect(
      sodium.crypto_sign_verify_detached(signature, Buffer.from('tampered'), keypair.publicKey)
    ).toBe(false);
  });

  it('can be awaited multiple times without throwing', async () => {
    await expect(initializeSodium()).resolves.toBeDefined();
    await expect(initializeSodium()).resolves.toBeDefined();
    await expect(sodium.ready).resolves.toBeUndefined();
  });
});