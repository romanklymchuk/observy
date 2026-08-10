const fs = require("node:fs");
const path = require("node:path");

require("dotenv").config();

const Trigger = require("./hardware/trigger");

const {
  ensureStation,
} = require("./services/station.service");

const {
  runCaptureCycle,
} = require("./runtime/capture-cycle");

const {
  STATES,
  createStateMachine,
} = require("./runtime/state-machine");


const {
  getDeviceHealth,
} = require("./services/health.service");

const {
  processQueue,
} = require("./services/queue-worker.service");

const {
  sendHeartbeat,
} = require("./services/telemetry.service");

const configPath = path.join(
  __dirname,
  "../config/device.json"
);

const config = JSON.parse(
  fs.readFileSync(configPath, "utf8")
);
const {
  createLogger,
} = require("./observability/logger");

const API_URL =
  process.env.OBSERVY_API_URL ||
  config.apiUrl;

const STATION_ID =
  process.env.STATION_ID ||
  config.stationId;

const STATION_NAME =
  process.env.STATION_NAME ||
  config.stationName;

const LOCATION_NAME =
  process.env.LOCATION_NAME ||
  config.locationName;

async function main() {
  const systemLogger = createLogger({
    stationId: STATION_ID,
  });

  const stateMachine =
    createStateMachine({
      logger: systemLogger,
    });

  const maxCyclesRaw =
    process.env.MAX_CAPTURE_CYCLES;

  const maxCycles =
    maxCyclesRaw === undefined
      ? 3
      : Number(maxCyclesRaw);

  const runForever =
    maxCycles === 0;

  let completedCycles = 0;

  try {
    stateMachine.transition(
      STATES.INITIALIZING
    );

    console.log(
      "🟢 Observy Device Runtime started"
    );

    console.log(
      `📍 Station config: ${STATION_NAME} — ${LOCATION_NAME}`
    );

    try {
      await ensureStation({
        apiUrl: API_URL,
        stationId: STATION_ID,
        stationName: STATION_NAME,
        locationName: LOCATION_NAME,
      });
    } catch (error) {
      const networkUnavailable =
        error?.code === "ECONNREFUSED" ||
        error?.cause?.code === "ECONNREFUSED" ||
        error?.code === "ENOTFOUND" ||
        error?.code === "ETIMEDOUT";

      if (!networkUnavailable) {
        throw error;
      }

      systemLogger.warn(
        "station.registration.deferred",
        {
          stationId: STATION_ID,
          apiUrl: API_URL,
          errorCode:
            error?.code ??
            error?.cause?.code ??
            null,
        }
      );

      console.warn(
        `🟠 API unavailable — using local station config: ${STATION_ID}`
      );
    }

    console.log(
      "🩺 Running device health check..."
    );

    const health =
      await getDeviceHealth({
        stationId: STATION_ID,
        logger: systemLogger,
      });

    systemLogger.info(
      "runtime.health.result",
      {
        status: health.status,
        ok: health.ok,
      }
    );

    if (
      health.status === "unhealthy"
    ) {
      const failedComponents =
        Object.entries(
          health.components
        )
          .filter(
            ([, component]) =>
              component.ok === false
          )
          .map(
            ([name]) => name
          );

      const error =
        new Error(
          `Critical device health failure: ${
            failedComponents.join(", ")
          }`
        );

      error.code =
        "DEVICE_UNHEALTHY";

      throw error;
    }

    if (
      health.status === "degraded"
    ) {
      systemLogger.warn(
        "runtime.health.degraded",
        {
          degradedComponents:
            Object.entries(
              health.components
            )
              .filter(
                ([, component]) =>
                  component.ok === false
              )
              .map(
                ([name]) => name
              ),
        }
      );

      console.warn(
        "🟠 Device health degraded — runtime will continue"
      );
    } else {
      console.log(
        "✅ Device health: healthy"
      );
    }

    console.log(
      "🔄 Checking pending queue..."
    );

    try {
      const queueResult =
        await processQueue({
          apiUrl: API_URL,
          logger: systemLogger,
          maxItems: 20,
        });

      systemLogger.info(
        "runtime.queue.recovery.completed",
        {
          found:
            queueResult.found,

          uploaded:
            queueResult.uploaded,

          failed:
            queueResult.failed,
        }
      );

      if (
        queueResult.found > 0
      ) {
        console.log(
          `📦 Queue recovery: ` +
          `${queueResult.uploaded}/${queueResult.found} delivered`
        );
      } else {
        console.log(
          "✅ Queue recovery: nothing pending"
        );
      }
    } catch (error) {
      systemLogger.warn(
        "runtime.queue.recovery.failed",
        {
          errorName:
            error?.name,

          errorMessage:
            error?.message,

          errorCode:
            error?.code ??
            error?.cause?.code ??
            null,
        }
      );

      console.warn(
        "🟠 Queue recovery failed — runtime will continue"
      );
    }

    stateMachine.transition(
      STATES.READY
    );

    await sendHeartbeat({
      apiUrl: API_URL,
      stationId: STATION_ID,
      runtimeState:
        stateMachine.getState(),
      logger: systemLogger,
    });

    while (
      runForever ||
      completedCycles < maxCycles
    ) {
      stateMachine.transition(
        STATES.WAITING_TRIGGER,
        {
          completedCycles,
        }
      );

      console.log(
        `🟡 Waiting for trigger... ` +
        `(cycle ${completedCycles + 1})`
      );

      const trigger =
        await Trigger.waitForTrigger({
          delayMs:
            config.mockTriggerDelayMs,
        });

      console.log(
        `🟢 Trigger received: ` +
        `${trigger.type} from ${trigger.source}`
      );

      stateMachine.transition(
        STATES.TRIGGERED,
        {
          triggerType: trigger.type,
          triggerSource: trigger.source,
          detectedAt: trigger.detectedAt,
        }
      );

      const event = await runCaptureCycle({
        config,
        apiUrl: API_URL,
        stationId: STATION_ID,
        trigger,
        stateMachine,
      });

      completedCycles += 1;

      console.log(
        `✅ Observation ${completedCycles} complete`
      );

      console.log({
        eventId: event?.id ?? null,
        species: event?.species ?? null,
        confidence:
          event?.confidence ?? null,
      });

      await sendHeartbeat({
        apiUrl: API_URL,
        stationId: STATION_ID,
        runtimeState:
          stateMachine.getState(),
        logger: systemLogger,
      });
    }

    stateMachine.transition(
      STATES.STOPPED,
      {
        reason: "max_cycles_reached",
        completedCycles,
      }
    );

    console.log(
      `🛑 Runtime stopped after ` +
      `${completedCycles} observations`
    );
  } catch (error) {
    try {
      if (
        stateMachine.getState() !==
        STATES.ERROR
      ) {
        stateMachine.transition(
          STATES.ERROR,
          {
            errorName: error?.name,
            errorMessage: error?.message,
          }
        );
      }
    } catch (stateError) {
      console.error(
        "State transition failed:",
        stateError.message
      );
    }

    console.error(
      "🔴 Observy device failed"
    );

    console.error({
      name: error?.name,
      message: error?.message,
      code: error?.code,
      responseStatus:
        error?.response?.status,
      responseData:
        error?.response?.data,
    });

    process.exitCode = 1;
  }
}

main();
