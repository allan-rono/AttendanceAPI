const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

new NodeSDK({
  serviceName: 'kbai-api',
  instrumentations: [getNodeAutoInstrumentations()],
  traceExporter: new OTLPTraceExporter({ url: 'http://jaeger:4318/v1/traces' }),
}).start();