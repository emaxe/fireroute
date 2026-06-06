import 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
    verifyBearer: (request: any, reply: any) => Promise<void>;
  }
  interface FastifyRequest {
    tokenId?: string;
    tokenUser?: { id: string; email: string; name: string | null };
  }
}
