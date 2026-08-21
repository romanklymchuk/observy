const fs = require("node:fs");
const path = require("node:path");

const Camera = require("../hardware/camera");
const Microphone = require("../hardware/microphone");
const Sensors = require("../hardware/sensors");
const { uploadEvent } = require("../services/upload.service");

const {
  processFrames,
} = require("../services/vision.service");

const {
  enqueueObservation,
} = require("../services/queue.service");

const {
  createObservationContext,
  getMonotonicMs,
} = require("../observability/context");

const {
  createLogger,
} = require("../observability/logger");

function getDurationMs(startedAtMs) {
  return Number(
    (getMonotonicMs() - startedAtMs).toFixed(3)
  );
}

async function runCaptureCycle({
  config,
  apiUrl,
  stationId,
  trigger = {
    type: "manual",
    source: "runtime",
    detectedAt: new Date().toISOString(),
    metadata: {},
  },
  stateMachine = null,
}) {
  const triggerType = String(
    trigger.type || "unknown"
  )
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");

  const observationContext =
    createObservationContext({
      stationId,
      trigger: triggerType,
      metadata: {
        triggerSource:
          trigger.source || "unknown",

        triggerDetectedAt:
          trigger.detectedAt || null,

        triggerMetadata:
          trigger.metadata || {},
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

  logger.info(
    `trigger.${triggerType}.detected`,
    {
      source:
        observationContext.metadata
          .triggerSource,

      detectedAt:
        observationContext.metadata
          .triggerDetectedAt,

      metadata:
        observationContext.metadata
          .triggerMetadata,
    }
  );

  logger.info("observation.created", {
    observationStartedAt:
      observationContext.observationStartedAt,
  });

  try {
    /*
     * Environment sensors
     */
    currentStage = "sensors.environment";

    logger.info(
      "sensors.environment.started"
    );

    const sensorStartedAtMs =
      getMonotonicMs();

    let environment;

    try {
      environment =
        await Sensors.readEnvironment(config);

      logger.info(
        "sensors.environment.read",
        {
          temperatureC:
            environment.temperature,

          humidityPercent:
            environment.humidity,

          driver:
            environment.driver,

          capturedAt:
            environment.capturedAt,

          durationMs:
            getDurationMs(sensorStartedAtMs),
        }
      );
    } catch (error) {
      logger.error(
        "sensors.environment.failed",
        {
          durationMs:
            getDurationMs(sensorStartedAtMs),

          error,
        }
      );

      throw error;
    }

    const {
      temperature,
      humidity,
    } = environment;

    stateMachine?.transition(
      "CAPTURING"
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
      const photoResult =
        await Camera.capturePhoto({
          width:
            config.camera?.width,

          height:
            config.camera?.height,

          quality:
            config.camera?.quality,

          timeoutMs:
            config.camera?.timeoutMs,
        });

      photoPath =
        photoResult.path;

      logger.info(
        "capture.photo.completed",
        {
          photoPath,

          driver:
            photoResult.driver,

          sizeBytes:
            photoResult.sizeBytes,

          capturedAt:
            photoResult.capturedAt,

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

    stateMachine?.transition(
      "PROCESSING"
    );

    /*
     * Optional Vision processing
     *
     * Current v0 integration stages the
     * captured photo as a one-frame set.
     * Burst capture will replace this
     * staging step later.
     */
    let selectedPhotoPath =
      photoPath;

    if (
      config.vision?.enabled === true
    ) {
      currentStage =
        "vision.processing";

      logger.info(
        "vision.processing.started",
        {
          sourcePhotoPath:
            photoPath,
        }
      );

      const visionStartedAtMs =
        getMonotonicMs();

      const framesDirectory =
        path.resolve(
          process.cwd(),
          "data",
          "vision",
          observationContext.traceId
        );

      try {
        fs.mkdirSync(
          framesDirectory,
          {
            recursive: true,
          }
        );

        const stagedPhotoPath =
          path.join(
            framesDirectory,
            "frame-001.jpg"
          );

        fs.copyFileSync(
          photoPath,
          stagedPhotoPath
        );

        const visionResult =
          await processFrames({
            framesDirectory,
            model:
              config.vision?.model ||
              "yolo11n.pt",
            logger,
          });

        if (
          visionResult.ok &&
          visionResult.bestFramePath
        ) {
          selectedPhotoPath =
            visionResult.bestFramePath;

          logger.info(
            "vision.frame.selected",
            {
              bestFramePath:
                selectedPhotoPath,

              reason:
                visionResult.reason ??
                null,

              score:
                visionResult.metrics
                  ?.score ??
                null,

              durationMs:
                getDurationMs(
                  visionStartedAtMs
                ),
            }
          );
        } else {
          logger.warn(
            "vision.fallback.used",
            {
              reason:
                visionResult.reason ||
                "vision_no_selection",

              fallbackPhotoPath:
                photoPath,

              durationMs:
                getDurationMs(
                  visionStartedAtMs
                ),
            }
          );
        }
      } catch (error) {
        /*
         * Vision is deliberately
         * non-critical. Capture must
         * survive ML failures.
         */
        selectedPhotoPath =
          photoPath;

        logger.warn(
          "vision.fallback.used",
          {
            reason:
              "vision_integration_failed",

            fallbackPhotoPath:
              photoPath,

            durationMs:
              getDurationMs(
                visionStartedAtMs
              ),

            error,
          }
        );
      }
    }

    stateMachine?.transition(
      "UPLOADING"
    );

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
        photoPath:
          selectedPhotoPath,
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

      const queuedItem =
        enqueueObservation({
          traceId:
            observationContext.traceId,

          stationId,

          capturedAt:
            observationContext
              .observationStartedAt,

          photoPath,
          audioPath,

          temperature,
          humidity,

          durationSec: 8,
          trigger,
          error,
        });

      stateMachine?.transition(
        "QUEUED",
        {
          queueId:
            queuedItem.queueId,

          errorCode:
            error?.code ??
            error?.cause?.code ??
            null,
        }
      );

      logger.warn(
        "observation.queued",
        {
          queueId:
            queuedItem.queueId,

          reason:
            error?.code ||
            error?.cause?.code ||
            error?.message ||
            "upload_failed",

          photoPath:
            queuedItem.observation
              .photoPath,

          audioPath:
            queuedItem.observation
              .audioPath,

          durationMs:
            getDurationMs(cycleStartedAtMs),
        }
      );

      return {
        queued: true,

        queueId:
          queuedItem.queueId,

        traceId:
          observationContext.traceId,

        station_id:
          stationId,

        captured_at:
          observationContext
            .observationStartedAt,

        species:
          "Pending upload",

        confidence:
          null,
      };
    }

    /*
     * Observation successfully completed
     */
    stateMachine?.transition(
      "COMPLETED",
      {
        eventId: event?.id ?? null,
        species: event?.species ?? null,
      }
    );

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
