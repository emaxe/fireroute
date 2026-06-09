import 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
    verifyBearer: (request: any, reply: any) => Promise<void>;
  }
  interface FastifyRequest {
    tokenId?: string;
    groupId?: string;
    allowedGroupIds?: string[];
  }
}
