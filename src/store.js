// -----------------------------------------------------------------------------
// What survives a restart, in one JSON file under /data.
//
// /data is the only writable path of the container (the rootfs is read-only).
// Two things are kept there:
//   - the last calendar read, so a restart while RecycleApp is down still
//     knows the next collections;
//   - the day each scene trigger last fired, so a restart at 20:00 does not
//     send the "collection tomorrow" reminder of 19:00 a second time.
//
// A store that cannot be written is not fatal: the integration keeps working
// from memory and says so in the logs.
// -----------------------------------------------------------------------------

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'store' });

export const DEFAULT_DATA_DIR = process.env.RECYCLEAPP_DATA_DIR || '/data';
const FILE_NAME = 'recycleapp-state.json';

/** A store kept in memory only, for the tests. */
export function createMemoryStore(initial = {}) {
  let data = structuredClone(initial);
  return {
    load: () => structuredClone(data),
    save: (next) => {
      data = structuredClone(next);
    },
  };
}

/** The store of the container: `<dir>/recycleapp-state.json`. */
export function createFileStore(dir = DEFAULT_DATA_DIR) {
  const file = join(dir, FILE_NAME);
  return {
    load() {
      try {
        return JSON.parse(readFileSync(file, 'utf8'));
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Cannot read ${file}, starting from scratch: ${err.message}`);
        }
        return {};
      }
    },
    save(data) {
      try {
        mkdirSync(dir, { recursive: true });
        // Written aside then renamed: a crash mid-write never leaves half a file.
        const tmp = `${file}.tmp`;
        writeFileSync(tmp, JSON.stringify(data));
        renameSync(tmp, file);
      } catch (err) {
        logger.warn(`Cannot write ${file}, keeping the state in memory: ${err.message}`);
      }
    },
  };
}
