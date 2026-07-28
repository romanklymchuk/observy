const fs = require("fs");
const path = require("path");

require("dotenv").config();

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
      "🟢 Observy Virtual Device started"
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

    const event = await runCaptureCycle({
      config,
      apiUrl: API_URL,
      stationId: STATION_ID,
    });

    console.log(event);
  } catch (error) {
    const details =
      error.response?.data ||
      error.message;

    console.error(
      "🔴 Observy device failed:",
      details
    );

    process.exitCode = 1;
  }
}

main();