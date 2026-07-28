const Camera = require("../hardware/camera");
const Microphone = require("../hardware/microphone");
const { uploadEvent } = require("../services/upload.service");

const {
  createObservationContext,
  getMonotonicMs,
} = require("../observability/context");

const {
  createLogger,
} = require("../observability/logger");

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function getDurationMs(startedAtMs) {
  return Number(
    (getMonotonicMs() - startedAtMs).toFixed(3)
  );
}

async function runCaptureCycle({
  config,
  apiUrl,
  stationId,
}) {
  const observationContext =
    createObservationContext({
      stationId,
      trigger: "motion",
      metadata: {
        triggerSource:
          process.env.DEVICE_MODE === "mock"
            ? "mock"
            : "hardware",
      },
    });

  const logger = createLogger({
    stationId,
  }).child({
    traceId: observationContext.traceId,
    trigger: observationContext.trigger,
  });

  const cycleStartedAtMs = getMonotonicMs();

  let currentStage = "observation.created";

  logger.info("trigger.motion.detected", {
    source:
      observationContext.metadata.triggerSource,
  });

  logger.info("observation.created", {
    observationStartedAt:
      observationContext.observationStartedAt,
  });

  try {
    /*
     * Environment sensors
     *
     * Поки що значення генеруються тут.
     * У наступному кроці винесемо їх у Sensor HAL.
     */
    currentStage = "sensors.environment.read";

    const sensorStartedAtMs =
      getMonotonicMs();

    const temperature = Number(
      randomBetween(
        config.temperatureMin,
        config.temperatureMax
      ).toFixed(1)
    );

    const humidity = Number(
      randomBetween(
        config.humidityMin,
        config.humidityMax
      ).toFixed(1)
    );

    logger.info(
      "sensors.environment.read",
      {
        temperatureC: temperature,
        humidityPercent: humidity,
        driver: "inline_mock",
        durationMs:
          getDurationMs(sensorStartedAtMs),
      }
    );

    /*
     * Photo capture
     */
    currentStage = "capture.photo";

    logger.info("capture.photo.started");

    const photoStartedAtMs =
      getMonotonicMs();

    let photoPath;

    try {
      photoPath =
        await Camera.capturePhoto();

      logger.info(
        "capture.photo.completed",
        {
          photoPath,
          durationMs:
            getDurationMs(photoStartedAtMs),
        }
      );
    } catch (error) {
      logger.error(
        "capture.photo.failed",
        {
          durationMs:
            getDurationMs(photoStartedAtMs),
          error,
        }
      );

      throw error;
    }

    /*
     * Audio capture
     */
    currentStage = "capture.audio";

    logger.info("capture.audio.started");

    const audioStartedAtMs =
      getMonotonicMs();

    let audioPath;

    try {
      audioPath =
        await Microphone.recordAudio();

      logger.info(
        "capture.audio.completed",
        {
          audioPath,
          durationMs:
            getDurationMs(audioStartedAtMs),
        }
      );
    } catch (error) {
      logger.error(
        "capture.audio.failed",
        {
          durationMs:
            getDurationMs(audioStartedAtMs),
          error,
        }
      );

      throw error;
    }

    /*
     * Upload observation
     */
    currentStage = "upload";

    logger.info("upload.started", {
      apiUrl,
    });

    const uploadStartedAtMs =
      getMonotonicMs();

    let event;

    try {
      event = await uploadEvent({
        apiUrl,
        stationId,
        photoPath,
        audioPath,
        temperature,
        humidity,
        durationSec: 8,
      });

      logger.info("upload.completed", {
        durationMs:
          getDurationMs(uploadStartedAtMs),

        eventId:
          event?.id ?? null,

        species:
          event?.species ?? null,

        confidence:
          event?.confidence ?? null,
      });
    } catch (error) {
      logger.error("upload.failed", {
        durationMs:
          getDurationMs(uploadStartedAtMs),
        error,
      });

      throw error;
    }

    /*
     * Observation successfully completed
     */
    logger.info(
      "observation.completed",
      {
        durationMs:
          getDurationMs(cycleStartedAtMs),

        eventId:
          event?.id ?? null,

        species:
          event?.species ?? null,
      }
    );

    return event;
  } catch (error) {
    /*
     * Загальна фінальна подія про невдале observation.
     *
     * Специфічна помилка вже була записана як:
     * capture.photo.failed,
     * capture.audio.failed
     * або upload.failed.
     */
    logger.error("observation.failed", {
      failedStage: currentStage,

      durationMs:
        getDurationMs(cycleStartedAtMs),

      error,
    });

    throw error;
  }
}

module.exports = {
  runCaptureCycle,
};
