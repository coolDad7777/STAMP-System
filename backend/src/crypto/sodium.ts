import sodium from 'libsodium-wrappers';

export async function initializeSodium() {
  await sodium.ready;
  return sodium;
}

export { sodium };
