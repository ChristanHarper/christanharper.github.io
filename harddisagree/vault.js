// Opens the sealed episodes with the show's passcode, and derives what the passcode
// protects: saved results, and the address of the played-episodes record.
// tools/vault-node.js derives exactly the same values on the computer.

const Vault = {
  PASS_KEY: 'hard-disagree-pass',

  passcode() {
    try {
      return localStorage.getItem(Vault.PASS_KEY);
    } catch {
      return null;
    }
  },

  remember(passcode) {
    try {
      localStorage.setItem(Vault.PASS_KEY, passcode);
    } catch {
      // A private window can refuse storage, so the passcode is asked for again.
    }
  },

  forget() {
    try {
      localStorage.removeItem(Vault.PASS_KEY);
    } catch {
      // Nothing was stored.
    }
  },

  toBytes: (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0)),
  toBase64(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(out);
  },
  toHex: (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(''),

  async hash(text) {
    return Vault.toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
  },

  // Throws if the passcode is wrong, because the sealed file won't authenticate.
  async open(passcode) {
    const sealed = await (await fetch('episodes.sealed.json', { cache: 'no-store' })).json();
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passcode.trim()), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Vault.toBytes(sealed.salt), iterations: sealed.iterations }, base, 768));
    const aes = (bytes) => crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
    const contentKey = await aes(bits.subarray(0, 32));
    const resultsKey = await aes(bits.subarray(32, 64));
    const idSeed = Vault.toHex(bits.subarray(64, 96));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Vault.toBytes(sealed.iv) }, contentKey, Vault.toBytes(sealed.data));
    const { shows } = JSON.parse(new TextDecoder().decode(plain));

    return {
      shows,
      episode: (id) => shows.flatMap((s) => s.episodes).find((e) => e.id === id),
      progressId: () => Vault.hash(`${idSeed}|progress`),
      resultId: (id) => Vault.hash(`${idSeed}|result|${id}`),
      verdictId: (id) => Vault.hash(`${idSeed}|verdict|${id}`),
      async unseal({ iv, data }) {
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Vault.toBytes(iv) }, resultsKey, Vault.toBytes(data));
        return JSON.parse(new TextDecoder().decode(plain));
      },
      async seal(value) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, resultsKey, new TextEncoder().encode(JSON.stringify(value)));
        return { iv: Vault.toBase64(iv), data: Vault.toBase64(new Uint8Array(data)) };
      },
    };
  },
};
