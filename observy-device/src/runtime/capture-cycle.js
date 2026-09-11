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
     * Parallel multimodal capture:
     * camera burst + audio recording.
     *
     * Both operations start together. We wait for both
     * to settle before continuing or failing the cycle.
     */
    currentStage = "capture.parallel";

    let photoPath;
    let burstDirectory;
    let burstFrames = [];
    let audioPath;

    logger.info("capture.parallel.started");

    const captureStartedAtMs =
      getMonotonicMs();

    const burstPromise = (async () => {
      logger.info("capture.burst.started");

      const photoStartedAtMs =
        getMonotonicMs();

      try {
        const burstResult =
          await Camera.captureBurst({
            count:
              Number(
                process.env.CAMERA_BURST_SIZE ||
                config.vision?.burstSize ||
                5
              ),
            intervalMs:
              Number(
                process.env.CAMERA_BURST_INTERVAL_MS ||
                150
              ),
            width:
              config.camera?.width,
            height:
              config.camera?.height,
            quality:
              config.camera?.quality,
            timeoutMs:
              config.camera?.timeoutMs,
          });

        const frames =
          burstResult.frames || [];

        if (frames.length === 0) {
          throw new Error(
            "Camera burst completed without frames"
          );
        }

        logger.info(
          "capture.burst.completed",
          {
            directory:
              burstResult.directory,
            count:
              frames.length,
            fallbackPhotoPath:
              frames[0].path,
            driver:
              burstResult.driver,
            capturedAt:
              burstResult.capturedAt,
            durationMs:
              getDurationMs(
                photoStartedAtMs
              ),
          }
        );

        return {
          directory:
            burstResult.directory,
          frames,
          photoPath:
            frames[0].path,
        };
      } catch (error) {
        logger.error(
          "capture.burst.failed",
          {
            durationMs:
              getDurationMs(
                photoStartedAtMs
              ),
            error,
          }
        );

        throw error;
      }
    })();

    const audioPromise = (async () => {
      logger.info("capture.audio.started");

      const audioStartedAtMs =
        getMonotonicMs();

      try {
        const path =
          await Microphone.recordAudio();

        logger.info(
          "capture.audio.completed",
          {
            audioPath: path,
            durationMs:
              getDurationMs(
                audioStartedAtMs
              ),
          }
        );

        return path;
      } catch (error) {
        logger.error(
          "capture.audio.failed",
          {
            durationMs:
              getDurationMs(
                audioStartedAtMs
              ),
            error,
          }
        );

        throw error;
      }
    })();

    const [
      burstOutcome,
      audioOutcome,
    ] = await Promise.allSettled([
      burstPromise,
      audioPromise,
    ]);

    if (
      burstOutcome.status ===
      "rejected"
    ) {
      throw burstOutcome.reason;
    }

    if (
      audioOutcome.status ===
      "rejected"
    ) {
      throw audioOutcome.reason;
    }

    burstDirectory =
      burstOutcome.value.directory;
    burstFrames =
      burstOutcome.value.frames;
    photoPath =
      burstOutcome.value.photoPath;

    audioPath =
      audioOutcome.value;

    logger.info(
      "capture.parallel.completed",
      {
        burstFrames:
          burstFrames.length,
        photoPath,
        audioPath,
        durationMs:
          getDurationMs(
            captureStartedAtMs
          ),
      }
    );

    stateMachine?.transition(
      "PROCESSING"
    );

    /*
     * Optional Vision processing.
     *
     * The REAL camera burst directory is passed directly
     * to the Vision service. No one-frame staging.
     */
    let selectedPhotoPath =
      photoPath;

    let visionResult = null;

    if (
      config.vision?.enabled === true
    ) {
      currentStage =
        "vision.processing";

      logger.info(
        "vision.processing.started",
        {
          framesDirectory:
            burstDirectory,

          frameCount:
            burstFrames.length,
        }
      );

      const visionStartedAtMs =
        getMonotonicMs();

      try {
        visionResult =
          await processFrames({
            framesDirectory:
              burstDirectory,

            model:
              config.vision?.model ||
              "yolo11n.pt",

            logger,
          });

        if (
          visionResult.ok &&
          visionResult.birdDetected === true &&
          visionResult.bestFramePath
        ) {
          selectedPhotoPath =
            visionResult.bestFramePath;

          logger.info(
            "vision.frame.selected",
            {
              birdDetected: true,

              bestFramePath:
                selectedPhotoPath,

              confidence:
                visionResult.metrics
                  ?.confidence ??
                null,

              score:
                visionResult.metrics
                  ?.score ??
                null,

              reason:
                visionResult.reason ??
                null,

              durationMs:
                getDurationMs(
                  visionStartedAtMs
                ),
            }
          );

        } else if (
          visionResult.ok &&
          visionResult.birdDetected === false
        ) {
          logger.info(
            "vision.no_bird",
            {
              frameCount:
                burstFrames.length,

              durationMs:
                getDurationMs(
                  visionStartedAtMs
                ),
            }
          );

          /*
           * Event gating will be enabled once the
           * external Vision worker is live.
           * For now we deliberately keep frame #1
           * as a safe fallback.
           */

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
         * ML failure must not kill acquisition.
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

          photoPath:
            selectedPhotoPath,
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
