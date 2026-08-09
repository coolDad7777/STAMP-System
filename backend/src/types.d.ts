declare module 'libsodium-wrappers' {
    interface KeyPair {
        publicKey: Uint8Array;
        privateKey: Uint8Array;
    }
    const sodium: {
        ready: Promise<void>;
        crypto_sign_keypair(): KeyPair;
        crypto_sign_detached(msg: Uint8Array, key: Uint8Array): Uint8Array;
        crypto_sign_verify_detached(sig: Uint8Array, msg: Uint8Array, key: Uint8Array): boolean;
    };
    export default sodium;
}

declare module 'fastify-cors' {
    import { FastifyInstance, FastifyPluginOptions } from 'fastify';
    function fastifyCors(instance: FastifyInstance, opts: FastifyPluginOptions): void;
    export = fastifyCors;
}

declare module 'fastify-rate-limit' {
    import { FastifyInstance, FastifyPluginOptions } from 'fastify';
    function fastifyRateLimit(instance: FastifyInstance, opts: FastifyPluginOptions): void;
    export = fastifyRateLimit;
}

declare module 'fastify-websocket' {
    import { FastifyInstance, FastifyPluginOptions } from 'fastify';
    function fastifyWebsocket(instance: FastifyInstance, opts: FastifyPluginOptions): void;
    export = fastifyWebsocket;
}
