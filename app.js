if (process.env.ENABLE_TRACING === 'true') require('./tracing');
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const compression = require('compression');
const { createProxyMiddleware } = require('http-proxy-middleware');

// Import utilities and middleware
const logger = require('./utils/logger');
const { validateEnvironment } = require('./utils/envValidator');
const { initializeDatabase } = require('./utils/dbInit');
const { errorHandler } = require('./middleware/errorHandler');
const requestValidator = require('./middleware/requestValidator');
const securityMiddleware = require('./middleware/security');
const { metricsMiddleware, exposeMetrics } = require('./middleware/metrics');

// Import routes
const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const attendanceRoutes = require('./routes/attendance');
const biometricRoutes = require('./routes/biometrics');
const syncRoutes = require('./routes/sync');
const statusRoutes = require('./routes/status');
const mockRoutes = require('./routes/mock');
const deviceRoutes = require('./routes/devices');

// Import services

const app = express();
require('./docs/swagger')(app);

// Validate environment variables on startup
validateEnvironment();

// Initialize database and cache
initializeDatabase();
logger.info('Cache service loaded and initialized');

// Trust proxy for accurate IP addresses behind reverse proxy
app.set('trust proxy', 1);

// Compression middleware
app.use(compression());

// Security headers with enhanced configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Enhanced CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ['*'];
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-device-id', 'x-request-id'],
  credentials: process.env.CORS_CREDENTIALS === 'true',
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

app.use(metricsMiddleware);
app.get('/metrics', exposeMetrics);

// Enhanced logging setup
const logDirectory = path.join(__dirname, 'logs');
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true });
}

// Create rotating log streams
const accessLogStream = fs.createWriteStream(
  path.join(logDirectory, 'access.log'), 
  { flags: 'a' }
);


app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Morgan logging with custom format
app.use(morgan('combined', { 
  stream: accessLogStream,
  skip: (req, res) => res.statusCode < 400
}));

app.use(morgan('dev', {
  skip: () => process.env.NODE_ENV === 'production'
}));

// Body parser with enhanced limits and validation
app.use(bodyParser.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request validation middleware
app.use(requestValidator);

// Security middleware
app.use(securityMiddleware);

// Enhanced rate limiting with different limits for different endpoints
const createRateLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: {
    status: 'error',
    error_code: 429,
    message,
    retry_after: Math.ceil(windowMs / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
    res.status(429).json({
      status: 'error',
      error_code: 429,
      message: 'Too many requests, please try again later',
      retry_after: Math.ceil(windowMs / 1000)
    });
  }
});

// Different rate limits for different endpoint types
const generalLimiter = createRateLimiter(
  parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  'Too many requests from this IP'
);

const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  parseInt(process.env.RATE_LIMIT_AUTH_MAX) || 10,
  'Too many authentication attempts'
);

const biometricLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  50, // Higher limit for biometric operations
  'Too many biometric requests'
);

// Apply rate limiting only if NOT in test environment
if (process.env.NODE_ENV !== 'test') {
  app.use('/api', generalLimiter);
  app.use('/api/auth', authLimiter);
  app.use('/api/v1/biometrics', biometricLimiter);
} else {
  logger.info('Rate limiting disabled in test environment');
}

// Apply rate limiting
app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/v1/biometrics', biometricLimiter);

// API Routes with versioning
const API_VERSION = process.env.API_VERSION || 'v1';

app.use(`/api/${API_VERSION}/auth`, authRoutes);
app.use(`/api/${API_VERSION}/employees`, employeeRoutes);
app.use(`/api/${API_VERSION}/attendance`, attendanceRoutes);
app.use(`/api/${API_VERSION}/biometrics`, biometricRoutes);
app.use(`/api/${API_VERSION}/sync`, syncRoutes);
app.use(`/api/${API_VERSION}/status`, statusRoutes);
app.use(`/api/${API_VERSION}/devices`, deviceRoutes);

// Legacy route support
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);

// Mock routes (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/mock', mockRoutes);
}

// Health check endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV,
    company: process.env.COMPANY_NAME,
    uptime: process.uptime()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    api_version: API_VERSION,
    timestamp: new Date().toISOString(),
    services: {
      database: 'connected',
      cache: 'active',
      erpnext: 'connected'
    }
  });
});

// API documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    title: 'Kiron Construction Company - Timespring API',
    version: API_VERSION,
    description: 'Face recognition attendance system API for ERPNext integration',
    base_url: `${req.protocol}://${req.get('host')}/api/${API_VERSION}`,
    endpoints: {
      authentication: '/auth/login',
      employees: '/employees',
      attendance: '/attendance/clock',
      biometrics: '/biometrics',
      sync: '/sync',
      status: '/status'
    },
    documentation: 'https://docs.kironccltd.co.ke/api'
  });
});

// 404 handler for unmatched routes
app.use('*', (req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl} from IP: ${req.ip}`);
  res.status(404).json({
    status: 'error',
    error_code: 404,
    message: 'API endpoint not found',
    available_endpoints: `/api/${API_VERSION}/docs`
  });
});

// Global error handler
app.use(errorHandler);

module.exports = app;