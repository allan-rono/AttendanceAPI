const client = require('prom-client');
client.collectDefaultMetrics();

const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

module.exports = {
  metricsMiddleware(req, res, next) {
    res.on('finish', () => {
      httpRequestCounter.inc({
        method: req.method,
        route: req.route?.path || req.originalUrl,
        status: res.statusCode,
      });
    });
    next();
  },
  exposeMetrics: (req, res) => {
    res.set('Content-Type', client.register.contentType);
    res.end(client.register.metrics());
  },
};