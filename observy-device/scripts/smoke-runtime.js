const http = require("node:http");

const {
  getDeviceHealth,
} = require("../src/services/health.service");

const {
  STATES,
  createStateMachine,
} = require("../src/runtime/state-machine");

const {
  runCaptureCycle,
} = require("../src/runtime/capture-cycle");

const {
  processQueue,
} = require("../src/services/queue-worker.service");

const {
  getQueueStats,
} = require("../src/services/queue.service");

const config =
  require("../config/device.json");

const STATION_ID =
  "observy-smoke-test";

function assert(condition, message) {
  if (!condition) {
    throw new Error(
      `SMOKE ASSERTION FAILED: ${message}`
    );
  }
}

function printStep(name) {
  console.log(
    `\n🧪 ${name}`
  );
}

function createSilentLogger() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

function createTriggeredStateMachine() {
  const machine =
    createStateMachine({
      logger:
        createSilentLogger(),
    });

  machine.transition(
    STATES.INITIALIZING
  );

  machine.transition(
    STATES.READY
  );

  machine.transition(
    STATES.WAITING_TRIGGER
  );

  machine.transition(
    STATES.TRIGGERED
  );

  return machine;
}

function createMockApiServer() {
  const server =
    http.createServer(
      (req, res) => {
        if (
          req.method === "POST" &&
          req.url === "/events"
        ) {
          req.on(
            "data",
            () => {}
          );

          req.on(
            "end",
            () => {
              res.writeHead(
                200,
                {
                  "Content-Type":
                    "application/json",
                }
              );

              res.end(
                JSON.stringify({
                  id:
                    `smoke-${Date.now()}`,

                  species:
                    "Smoke Test Visitor",

                  confidence:
                    0.99,

                  station_id:
                    STATION_ID,

                  captured_at:
                    new Date()
                      .toISOString(),
                })
              );
            }
          );

          return;
        }

        res.writeHead(404);

        res.end();
      }
    );

  return server;
}

async function listen(server) {
  return new Promise(
    (resolve, reject) => {
      server.once(
        "error",
        reject
      );

      server.listen(
        0,
        "127.0.0.1",
        () => {
          const address =
            server.address();

          resolve(
            `http://127.0.0.1:${address.port}`
          );
        }
      );
    }
  );
}

async function close(server) {
  return new Promise(
    (resolve) =>
      server.close(resolve)
  );
}

async function main() {
  console.log(
    "🚦 Observy Runtime Smoke Test"
  );

  /*
   * 1. HEALTH
   */
  printStep(
    "Health Manager"
  );

  const health =
    await getDeviceHealth({
      stationId:
        STATION_ID,
    });

  assert(
    health.ok === true,
    `device health is ${health.status}`
  );

  console.log(
    "✅ Health: healthy"
  );

  /*
   * 2. STATE MACHINE
   */
  printStep(
    "State Machine"
  );

  const stateMachine =
    createTriggeredStateMachine();

  assert(
    stateMachine.getState() ===
      STATES.TRIGGERED,
    "state machine did not reach TRIGGERED"
  );

  console.log(
    "✅ State Machine: valid"
  );

  /*
   * 3. ONLINE PIPELINE
   */
  printStep(
    "Online capture/upload"
  );

  const server =
    createMockApiServer();

  const apiUrl =
    await listen(server);

  const onlineMachine =
    createTriggeredStateMachine();

  const onlineEvent =
    await runCaptureCycle({
      config,
      apiUrl,
      stationId:
        STATION_ID,

      trigger: {
        type: "motion",
        source: "smoke",
        detectedAt:
          new Date()
            .toISOString(),

        metadata: {
          smoke: true,
        },
      },

      stateMachine:
        onlineMachine,
    });

  assert(
    onlineMachine.getState() ===
      STATES.COMPLETED,
    `online state ended at ${onlineMachine.getState()}`
  );

  assert(
    onlineEvent?.id,
    "online upload returned no event id"
  );

  console.log(
    "✅ Online pipeline: completed"
  );

  /*
   * 4. OFFLINE PIPELINE
   */
  printStep(
    "Offline queue fallback"
  );

  await close(server);

  const queueBefore =
    getQueueStats()
      .pendingCount;

  const offlineMachine =
    createTriggeredStateMachine();

  const offlineEvent =
    await runCaptureCycle({
      config,

      /*
       * Server has been closed,
       * so this URL must fail.
       */
      apiUrl,

      stationId:
        STATION_ID,

      trigger: {
        type: "motion",
        source: "smoke",
        detectedAt:
          new Date()
            .toISOString(),

        metadata: {
          smoke: true,
          offline: true,
        },
      },

      stateMachine:
        offlineMachine,
    });

  const queueAfterOffline =
    getQueueStats()
      .pendingCount;

  assert(
    offlineMachine.getState() ===
      STATES.QUEUED,
    `offline state ended at ${offlineMachine.getState()}`
  );

  assert(
    offlineEvent?.queued === true,
    "offline observation was not marked queued"
  );

  assert(
    queueAfterOffline ===
      queueBefore + 1,
    "queue count did not increase by one"
  );

  console.log(
    "✅ Offline pipeline: queued"
  );

  /*
   * 5. RECOVERY
   */
  printStep(
    "Queue recovery"
  );

  const recoveryServer =
    createMockApiServer();

  const recoveryApiUrl =
    await listen(
      recoveryServer
    );

  const recoveryResult =
    await processQueue({
      apiUrl:
        recoveryApiUrl,

      logger:
        createSilentLogger(),

      maxItems:
        queueAfterOffline + 20,
    });

  await close(
    recoveryServer
  );

  const queueAfterRecovery =
    getQueueStats()
      .pendingCount;

  assert(
    recoveryResult.uploaded >= 1,
    "queue worker uploaded nothing"
  );

  assert(
    queueAfterRecovery <
      queueAfterOffline,
    "queue did not shrink after recovery"
  );

  console.log(
    `✅ Recovery: ${recoveryResult.uploaded} delivered`
  );

  /*
   * RESULT
   */
  console.log(
    "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  );

  console.log(
    "✅ OBSERVY RUNTIME SMOKE: PASS"
  );

  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  );

  console.log({
    health:
      health.status,

    online:
      "completed",

    offline:
      "queued",

    recovered:
      recoveryResult.uploaded,

    remainingQueue:
      queueAfterRecovery,
  });
}

main().catch(
  (error) => {
    console.error(
      "\n❌ OBSERVY RUNTIME SMOKE: FAIL"
    );

    console.error(
      error
    );

    process.exitCode = 1;
  }
);
