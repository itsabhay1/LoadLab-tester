import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const app = express();

const PORT = parseInt(process.env.PORT || '5050', 10);
const HOST = '0.0.0.0';

// Security and request parsing settings
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// 1. Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'loadlab-test-target'
  });
});

// 2. LoadLab verification endpoint
app.get('/.well-known/loadlab-verification.txt', (req, res) => {
  const token = process.env.LOADLAB_VERIFICATION_TOKEN;
  if (!token || token.trim() === '') {
    return res.status(503).type('text/plain').send('Verification token not configured');
  }
  // Return ONLY the exact token as text/plain without trailing newline or wrappers
  res.status(200).type('text/plain').send(token);
});

// 3. Fast response endpoint
app.get('/fast', (req, res) => {
  res.status(200).json({
    status: 'ok',
    route: '/fast',
    message: 'Fast response'
  });
});

// 4. Slow response endpoint (~500 ms)
app.get('/slow', (req, res) => {
  setTimeout(() => {
    res.status(200).json({
      status: 'ok',
      route: '/slow',
      delayMs: 500
    });
  }, 500);
});

// 5. Variable latency response endpoint (50 ms - 800 ms)
app.get('/variable', (req, res) => {
  const min = 50;
  const max = 800;
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  setTimeout(() => {
    res.status(200).json({
      status: 'ok',
      route: '/variable',
      delayMs: delay
    });
  }, delay);
});

// 6. Flaky response endpoint (deterministic: fails 1 in every 3 requests by default)
let flakyRequestCount = 0;

export function resetFlakyCounter() {
  flakyRequestCount = 0;
}

app.get('/flaky', (req, res) => {
  flakyRequestCount++;
  const failureInterval = Math.max(1, parseInt(process.env.FLAKY_FAILURE_INTERVAL || '3', 10) || 3);

  if (flakyRequestCount % failureInterval === 0) {
    return res.status(500).json({
      status: 'error',
      error: 'Internal Server Error',
      route: '/flaky',
      message: 'Flaky endpoint simulated failure',
      requestCount: flakyRequestCount
    });
  }

  res.status(200).json({
    status: 'ok',
    route: '/flaky',
    message: 'Flaky endpoint succeeded',
    requestCount: flakyRequestCount
  });
});

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message || err);
  res.status(500).json({
    error: 'Internal Server Error'
  });
});

let serverInstance = null;

export function startServer(port = PORT, host = HOST) {
  const server = app.listen(port, host, () => {
    console.log(`loadlab-test-target listening on http://${host}:${port}`);
  });

  server.on('error', (err) => {
    console.error('Startup error:', err.message);
    process.exit(1);
  });

  serverInstance = server;
  return server;
}

function handleShutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  if (serverInstance) {
    serverInstance.close(() => {
      console.log('HTTP server closed successfully.');
      process.exit(0);
    });

    setTimeout(() => {
      console.error('Forced shutdown due to timeout.');
      process.exit(1);
    }, 5000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// If executed directly, start listening
const currentFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryFile.toLowerCase() === currentFile.toLowerCase()) {
  startServer();
}
