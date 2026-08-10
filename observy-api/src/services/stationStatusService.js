const fs = require("fs");
const path = require("path");

const STATUS_PATH = path.join(
  __dirname,
  "../../data/station-status.json"
);

function ensureStatusFile() {
  const dir =
    path.dirname(STATUS_PATH);

  fs.mkdirSync(
    dir,
    {
      recursive: true,
    }
  );

  if (!fs.existsSync(STATUS_PATH)) {
    fs.writeFileSync(
      STATUS_PATH,
      JSON.stringify({}, null, 2)
    );
  }
}

function readStatuses() {
  ensureStatusFile();

  return JSON.parse(
    fs.readFileSync(
      STATUS_PATH,
      "utf8"
    )
  );
}

function writeStatuses(statuses) {
  ensureStatusFile();

  fs.writeFileSync(
    STATUS_PATH,
    JSON.stringify(
      statuses,
      null,
      2
    )
  );
}

function saveHeartbeat(
  stationId,
  payload
) {
  const statuses =
    readStatuses();

  const now =
    new Date().toISOString();

  const status = {
    stationId,

    lastSeenAt:
      now,

    sentAt:
      payload.sentAt ||
      null,

    schemaVersion:
      payload.schemaVersion ||
      "1.0",

    status:
      payload.status ||
      "unknown",

    runtimeState:
      payload.runtimeState ||
      null,

    queue: {
      pendingCount:
        Number(
          payload.queue
            ?.pendingCount ??
          0
        ),
    },

    components:
      payload.components ||
      {},

    receivedAt:
      now,
  };

  statuses[stationId] =
    status;

  writeStatuses(
    statuses
  );

  return status;
}

function getStationStatus(
  stationId
) {
  const statuses =
    readStatuses();

  return (
    statuses[stationId] ||
    null
  );
}

module.exports = {
  saveHeartbeat,
  getStationStatus,
};
