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

    stateMachine.transition(
      STATES.READY
    );

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
