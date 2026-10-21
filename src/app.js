// -----------------------------------------------------------------------------
// The integration, wired to a Gladys client.
//
// `registerHandlers(gladys, deps)` registers every SDK handler (they must be in
// place before `connect()`) and owns the minute tick. It takes the Gladys
// client and the RecycleApp client as arguments, so the tests run the whole
// integration against the SDK's fake Gladys and a fake API.
//
// The minute tick is the heart of it:
//   1. read the calendar when it is due (every `refresh_hours`, see
//      src/recycleapp/service.js);
//   2. publish what changed: the device list when a waste type appears, the
//      states when a day passes, the transport badges and the connection
//      status when RecycleApp starts or stops answering;
//   3. fire the scene triggers that are due (src/capabilities/scenes.js).
// Everything is deduplicated: a quiet minute sends nothing to Gladys.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { hasAddress, normalizeConfig } from './config.js';
import { createCalendarService } from './recycleapp/service.js';
import { buildDevices, buildStates, buildTransportEntries } from './devices.js';
import { describeError } from './messages.js';
import { ACTIONS } from './capabilities/actions.js';
import { checkSceneTriggers, SCENE_ACTIONS } from './capabilities/scenes.js';
import { getWidgetImage, refreshWidgets, WIDGETS } from './capabilities/widget.js';

const logger = createLogger({ name: 'app' });

export const TICK_MS = 60 * 1000;
// An unchanged state is re-sent every 6 hours, so it stays recently dated.
const STATE_HEARTBEAT_MS = 6 * 60 * 60 * 1000;

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {{ client: object, store: object, now?: () => Date, tickMs?: number }} deps
 */
export function registerHandlers(gladys, { client, store, now, tickMs = TICK_MS }) {
  const service = createCalendarService({ client, store, now });
  let config = normalizeConfig();
  let timer = null;
  let ticking = null;
  // What Gladys last received, to send only changes. Reset on every
  // (re)connection: Gladys may have restarted meanwhile.
  let sent = {};

  const context = () => ({ gladys, service, client, config, onCalendarRead });

  async function publishDevices({ force = false } = {}) {
    const devices = buildDevices(gladys, service, config);
    const key = JSON.stringify(devices);
    if (force || key !== sent.devices) {
      await gladys.publishDiscoveredDevices(devices);
      sent.devices = key;
    }
  }

  async function publishTransports() {
    const entries = buildTransportEntries(gladys, service, config);
    const key = JSON.stringify(entries);
    if (entries.length > 0 && key !== sent.transports) {
      await gladys.publishTransports(entries);
      sent.transports = key;
    }
  }

  async function publishStates() {
    const states = buildStates(gladys, service, config);
    if (states.length === 0) {
      return;
    }
    const { count } = await gladys.publishChangedStates(states, {
      heartbeat: STATE_HEARTBEAT_MS,
    });
    // "Tomorrow" just became "today": the widget shows it too.
    if (count > 0) {
      refreshWidgets(gladys);
    }
  }

  async function publishConnectionStatus() {
    const { lastError, address } = service.state(config);
    let status;
    if (lastError) {
      status = [false, describeError(lastError)];
    } else if (address) {
      status = [true];
    } else if (!hasAddress(config)) {
      status = [false, describeError({ code: 'missing_address' })];
    } else {
      return; // first read still to come
    }
    const key = JSON.stringify(status);
    if (key !== sent.status) {
      await gladys.setConnectionStatus(...status);
      sent.status = key;
    }
  }

  async function publishAll() {
    await publishDevices();
    await publishTransports();
    await publishStates();
    await publishConnectionStatus();
  }

  // After a read asked by the user (action, scene, widget): show it at once.
  async function onCalendarRead() {
    await publishAll();
    refreshWidgets(gladys);
  }

  async function runTick() {
    try {
      if (await service.ensureFresh(config)) {
        refreshWidgets(gladys);
      }
      await publishAll();
      await checkSceneTriggers(gladys, service, config);
    } catch (err) {
      logger.error('Tick failed, retried in a minute', err);
    }
  }

  /** One tick; a tick already running is joined, never doubled. */
  function tick() {
    if (!ticking) {
      ticking = runTick().finally(() => {
        ticking = null;
      });
    }
    return ticking;
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  // --- Discovery: Gladys asks for the list of devices ------------------------
  gladys.onScanRequest(async () => {
    logger.info('onScanRequest -> publishing the devices');
    await publishDevices({ force: true });
  });

  // --- Manifest actions: buttons in the Configuration screen -----------------
  for (const [key, handler] of Object.entries(ACTIONS)) {
    gladys.onAction(key, (fields) => handler(context(), fields));
  }

  // --- Scene actions ----------------------------------------------------------
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler(context(), fields));
  }

  // --- Dashboard widget -------------------------------------------------------
  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => widget.get(context(), request));
    gladys.onWidgetAction(key, (actionKey, params, { settings } = {}) =>
      widget.action(context(), { actionKey, params, settings }),
    );
  }
  gladys.onWidgetGetImage((imageKey) => getWidgetImage(context(), imageKey));

  // --- Configuration updated by the user -------------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('onConfigUpdated -> new configuration received');
    config = normalizeConfig(newConfig);
    // A new address or a new setting deserves an immediate read, not the
    // 15-minute wait after a failure the previous address caused.
    service.resetError();
    await tick();
    refreshWidgets(gladys);
  });

  // --- Connection lifecycle ---------------------------------------------------
  gladys.on('connected', async () => {
    sent = {};
    try {
      config = normalizeConfig(await gladys.getConfig());
      // The calendar stored in /data is published at once, before any read.
      await publishDevices({ force: true });
      await tick();
      refreshWidgets(gladys);
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
    }
    stopTimer();
    timer = setInterval(tick, tickMs);
    // The WebSocket keeps the process alive, not this timer.
    timer.unref?.();
  });

  gladys.on('disconnected', stopTimer);

  return {
    service,
    tick,
    stop: stopTimer,
    get config() {
      return config;
    },
  };
}
