import fp from 'fastify-plugin';

export const errorHandlerPlugin = fp(async (server) => {
  server.setErrorHandler((error, request, reply) => {
    server.log.error(error);
    reply.status(error.statusCode || 500).send({
      error: error.message || 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    });
  });
});
