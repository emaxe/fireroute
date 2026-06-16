import 'fastify';

/**
 * Extend Fastify type declarations so TypeScript knows about the custom
 * properties we attach at runtime (tokenId, groupId, allowedGroupIds)
 * and the decorated methods (authenticate, verifyBearer).
 */
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
    verifyBearer: (request: any, reply: any) => Promise<void>;
  }
  interface FastifyRequest {
    tokenId?: string;
    tokenName?: string;
    groupId?: string;
    allowedGroupIds?: string[];
  }
}
