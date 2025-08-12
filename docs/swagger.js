const swaggerJsdoc  = require('swagger-jsdoc');
const swaggerUi     = require('swagger-ui-express');

const spec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'KBAI API', version: '1.0.0' },
    servers: [{ url: '/api' }],
  },
  apis: ['./routes/*.js'], // JSDoc comments!
});

module.exports = (app) => {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec));
};