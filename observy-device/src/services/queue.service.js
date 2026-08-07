const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const QUEUE_ROOT = path.resolve(
  process.cwd(),
  "data",
  "queue"
);

function ensureQueueRoot() {
  fs.mkdirSync(QUEUE_ROOT, {
    recursive: true,
  });
}

function serializeError(error) {
  if (!error) {
    return null;
  }

  return {
    name:
      error.name ||
      "Error",

    message:
      error.message ||
      String(error),

    code:
      error.code ??
      error.cause?.code ??
      null,
  };
}

function getQueueDirectory(queueId) {
  return path.join(
    QUEUE_ROOT,
    queueId
  );
}

function getMetadataPath(queueId) {
  return path.join(
    getQueueDirectory(queueId),
    "observation.json"
  );
}

function copyMediaFile({
  sourcePath,
  destinationDirectory,
  fallbackName,
}) {
  if (!sourcePath) {
    return null;
  }

  if (!fs.existsSync(sourcePath)) {
    throw new Error(
      `Queue media source does not exist: ${sourcePath}`
    );
  }

  const extension =
    path.extname(sourcePath);

  const destinationName =
    `${fallbackName}${extension}`;

  const destinationPath =
    path.join(
      destinationDirectory,
      destinationName
    );

  fs.copyFileSync(
    sourcePath,
    destinationPath
  );

  return destinationPath;
}

function writeQueueItem(item) {
  fs.writeFileSync(
    getMetadataPath(item.queueId),
    JSON.stringify(item, null, 2),
    "utf8"
  );
}

function readQueueItem(queueId) {
  const metadataPath =
    getMetadataPath(queueId);

  if (!fs.existsSync(metadataPath)) {
    throw new Error(
      `Queue item not found: ${queueId}`
    );
  }

  return JSON.parse(
    fs.readFileSync(
      metadataPath,
      "utf8"
    )
  );
}

function enqueueObservation({
  traceId,
  stationId,
  capturedAt,
  photoPath,
  audioPath,
  temperature,
  humidity,
  durationSec = 8,
  trigger = null,
  error = null,
}) {
  ensureQueueRoot();

  const queueId =
    `queue_${randomUUID()}`;

  const queueDirectory =
    getQueueDirectory(queueId);

  fs.mkdirSync(queueDirectory, {
    recursive: false,
  });

  try {
    const queuedPhotoPath =
      copyMediaFile({
        sourcePath: photoPath,
        destinationDirectory:
          queueDirectory,
        fallbackName: "photo",
      });

    const queuedAudioPath =
      copyMediaFile({
        sourcePath: audioPath,
        destinationDirectory:
          queueDirectory,
        fallbackName: "audio",
      });

    const now =
      new Date().toISOString();

    const item = {
      schemaVersion: "1.0",

      queueId,
      status: "pending",

      traceId:
        traceId || null,

      stationId,

      createdAt: now,
      updatedAt: now,

      attempts: 0,
      lastAttemptAt: null,
      nextAttemptAt: null,

      lastError:
        serializeError(error),

      observation: {
        capturedAt:
          capturedAt || now,

        photoPath:
          queuedPhotoPath,

        audioPath:
          queuedAudioPath,

        temperature,
        humidity,
        durationSec,
        trigger,
      },
    };

    writeQueueItem(item);

    return item;
  } catch (error) {
    fs.rmSync(queueDirectory, {
      recursive: true,
      force: true,
    });

    throw error;
  }
}

function listPendingObservations() {
  ensureQueueRoot();

  return fs
    .readdirSync(
      QUEUE_ROOT,
      {
        withFileTypes: true,
      }
    )
    .filter((entry) =>
      entry.isDirectory()
    )
    .map((entry) => {
      try {
        return readQueueItem(
          entry.name
        );
      } catch (error) {
        console.error(
          `[QUEUE] Could not read ${entry.name}:`,
          error.message
        );

        return null;
      }
    })
    .filter(Boolean)
    .filter((item) =>
      item.status === "pending"
    )
    .sort((a, b) =>
      a.createdAt.localeCompare(
        b.createdAt
      )
    );
}

function markAttempt(
  queueId,
  error = null,
  {
    nextAttemptAt = null,
  } = {}
) {
  const item =
    readQueueItem(queueId);

  const now =
    new Date().toISOString();

  item.attempts += 1;
  item.lastAttemptAt = now;
  item.nextAttemptAt =
    nextAttemptAt;
  item.updatedAt = now;
  item.lastError =
    serializeError(error);

  writeQueueItem(item);

  return item;
}

function markCompleted(
  queueId,
  {
    eventId = null,
  } = {}
) {
  const item =
    readQueueItem(queueId);

  const now =
    new Date().toISOString();

  item.status = "completed";
  item.completedAt = now;
  item.updatedAt = now;
  item.eventId = eventId;

  writeQueueItem(item);

  return item;
}

function removeObservation(queueId) {
  const directory =
    getQueueDirectory(queueId);

  if (!fs.existsSync(directory)) {
    return false;
  }

  fs.rmSync(directory, {
    recursive: true,
    force: true,
  });

  return true;
}

function getQueueStats() {
  const pending =
    listPendingObservations();

  return {
    pendingCount:
      pending.length,

    totalAttempts:
      pending.reduce(
        (sum, item) =>
          sum + item.attempts,
        0
      ),

    oldestCreatedAt:
      pending[0]?.createdAt ??
      null,
  };
}

module.exports = {
  enqueueObservation,
  listPendingObservations,
  readQueueItem,
  markAttempt,
  markCompleted,
  removeObservation,
  getQueueStats,
};
