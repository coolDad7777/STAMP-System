// Browser compatibility polyfills for TSCB protocol
// Import this file before using tscb-core.ts in browser environments

if (typeof Buffer === 'undefined') {
    (globalThis as any).Buffer = {
        from: (str: string | Uint8Array, enc?: string): Uint8Array => {
            if (typeof str === 'string') {
                if (enc === 'hex') {
                    const result = new Uint8Array(str.length / 2);
                    for (let i = 0; i < str.length; i += 2) {
                        result[i / 2] = parseInt(str.substring(i, i + 2), 16);
                    }
                    return result;
                }
                return new Uint8Array([...str].map(c => c.charCodeAt(0)));
            }
            return new Uint8Array(str);
        },
        concat: (arrays: Uint8Array[], totalLength?: number): Uint8Array => {
            if (totalLength === undefined) {
                totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
            }
            const result = new Uint8Array(totalLength);
            let offset = 0;
            for (const arr of arrays) {
                result.set(arr, offset);
                offset += arr.length;
            }
            return result;
        },
        isBuffer: (obj: any): boolean => obj instanceof Uint8Array
    } as any;
}

if (typeof crypto === 'undefined' || !crypto.subtle) {
    console.warn('Web Crypto API not available. Some cryptographic operations may fail.');
}
