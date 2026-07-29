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

const configPath = path.join(
  __dirname,
  "../config/device.json"
);

const config = JSON.parse(
  fs.readFileSync(configPath, "utf8")
);

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
  try {
    console.log(
      "🟢 Observy Device Runtime started"
    );

    console.log(
      `📍 Station config: ${STATION_NAME} — ${LOCATION_NAME}`
    );

    await ensureStation({
      apiUrl: API_URL,
      stationId: STATION_ID,
      stationName: STATION_NAME,
      locationName: LOCATION_NAME,
    });

    console.log("🟡 Waiting for trigger...");

    const trigger =
      await Trigger.waitForTrigger({
        delayMs:
          config.mockTriggerDelayMs,
      });

    console.log(
      `🟢 Trigger received: ${trigger.type} from ${trigger.source}`
    );

    const event = await runCaptureCycle({
      config,
      apiUrl: API_URL,
      stationId: STATION_ID,
      trigger,
    });

    console.log("✅ Observation complete");
    console.log(event);
  } catch (error) {
    console.error(
      "🔴 Observy device failed"
    );

    console.error({
      name: error?.name,
      message: error?.message,
      code: error?.code,
      cause: error?.cause,
      responseStatus:
        error?.response?.status,
      responseData:
        error?.response?.data,
    });

    process.exitCode = 1;
  }
}

main();
