// -----------------------------------------------------------------------------
// Entry point of the RecycleApp integration for Gladys Assistant.
//
// Role of this file: build the real clients and start. Everything else lives
// in src/app.js, which the tests drive with the SDK's fake Gladys.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerHandlers } from './src/app.js';
import { createRecycleAppClient } from './src/recycleapp/api.js';
import { createFileStore } from './src/store.js';

const gladys = new GladysIntegration();

const app = registerHandlers(gladys, {
  client: createRecycleAppClient(),
  // /data: the only writable volume of the container.
  store: createFileStore(),
});

// --- Graceful shutdown -------------------------------------------------------
// The SDK disconnects cleanly and exits with code 0 when the supervisor stops
// the container (SIGTERM/SIGINT).
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  app.stop();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the RecycleApp integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
