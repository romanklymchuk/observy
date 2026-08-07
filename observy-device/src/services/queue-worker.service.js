const {
  listPendingObservations,
  markAttempt,
  removeObservation,
} = require("./queue.service");

const {
  uploadEvent,
} = require("./upload.service");

function calculateBackoffMs(attempts) {
  const baseMs = 2000;
  const maxMs = 60000;

  return Math.min(
    baseMs * (2 ** attempts),
    maxMs
  );
}

function isRetryDue(item) {
  if (!item.nextAttemptAt) {
    return true;
  }

  return (
    Date.now() >=
    new Date(item.nextAttemptAt).getTime()
  );
}

async function processQueue({
  apiUrl,
  logger = null,
  maxItems = 5,
} = {}) {
  const pending =
    listPendingObservations()
      .filter(isRetryDue)
      .slice(0, maxItems);

  const result = {
    found: pending.length,
    uploaded: 0,
    failed: 0,
  };

  for (const item of pending) {
    const {
      queueId,
      stationId,
      traceId,
      observation,
    } = item;

    logger?.info(
      "queue.retry.started",
      {
        queueId,
        traceId,
        attempts: item.attempts,
      }
    );

    try {
      const event =
        await uploadEvent({
          apiUrl,
          stationId,

          photoPath:
            observation.photoPath,

          audioPath:
            observation.audioPath,

          temperature:
            observation.temperature,

          humidity:
            observation.humidity,

          durationSec:
            observation.durationSec,

          capturedAt:
            observation.capturedAt,

          traceId,
        });

      removeObservation(queueId);

      result.uploaded += 1;

      logger?.info(
        "queue.retry.completed",
        {
          queueId,
          traceId,
          eventId:
            event?.id ?? null,
        }
      );
    } catch (error) {
      const delayMs =
        calculateBackoffMs(
          item.attempts
        );

      const nextAttemptAt =
        new Date(
          Date.now() + delayMs
        ).toISOString();

      markAttempt(
        queueId,
        error,
        {
          nextAttemptAt,
        }
      );

      result.failed += 1;

      logger?.warn(
        "queue.retry.failed",
        {
          queueId,
          traceId,

          attempts:
            item.attempts + 1,

          delayMs,
          nextAttemptAt,

          errorCode:
            error?.code ??
            error?.cause?.code ??
            null,
        }
      );
    }
  }

  return result;
}

module.exports = {
  processQueue,
  calculateBackoffMs,
  isRetryDue,
};
