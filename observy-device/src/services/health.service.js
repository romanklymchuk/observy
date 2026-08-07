const fs = require("node:fs");
const path = require("node:path");

const Camera =
  require("../hardware/camera");

const Microphone =
  require("../hardware/microphone");

const Sensors =
  require("../hardware/sensors");

const Trigger =
  require("../hardware/trigger");

const {
  getQueueStats,
} = require("./queue.service");

async function safeHealthCheck(
  name,
  component
) {
  const startedAt =
    process.hrtime.bigint();

  try {
    if (
      !component ||
      typeof component.healthCheck !==
        "function"
    ) {
      return {
        ok: false,
        component: name,
        status: "unsupported",
        error:
          "healthCheck() not implemented",
      };
    }

    const result =
      await component.healthCheck();

    const durationMs =
      Number(
        process.hrtime.bigint() -
        startedAt
      ) / 1e6;

    return {
      component: name,
      ...result,
      durationMs:
        Number(durationMs.toFixed(3)),
    };
  } catch (error) {
    const durationMs =
      Number(
        process.hrtime.bigint() -
        startedAt
      ) / 1e6;

    return {
      ok: false,
      component: name,
      status: "error",

      durationMs:
        Number(durationMs.toFixed(3)),

      error: {
        name:
          error?.name ||
          "Error",

        message:
          error?.message ||
          String(error),

        code:
          error?.code ??
          null,
      },
    };
  }
}

function getStorageHealth() {
  const dataPath =
    path.resolve(
      process.cwd(),
      "data"
    );

  try {
    fs.mkdirSync(
      dataPath,
      {
        recursive: true,
      }
    );

    fs.accessSync(
      dataPath,
      fs.constants.R_OK |
      fs.constants.W_OK
    );

    return {
      ok: true,
      component: "storage",
      status: "healthy",
      dataPath,
      readable: true,
      writable: true,
    };
  } catch (error) {
    return {
      ok: false,
      component: "storage",
      status: "error",
      dataPath,
      readable: false,
      writable: false,

      error: {
        name:
          error?.name ||
          "Error",

        message:
          error?.message ||
          String(error),

        code:
          error?.code ??
          null,
      },
    };
  }
}

function getQueueHealth() {
  try {
    const stats =
      getQueueStats();

    return {
      ok: true,
      component: "queue",
      status:
        stats.pendingCount > 0
          ? "pending"
          : "healthy",

      ...stats,
    };
  } catch (error) {
    return {
      ok: false,
      component: "queue",
      status: "error",

      error: {
        name:
          error?.name ||
          "Error",

        message:
          error?.message ||
          String(error),

        code:
          error?.code ??
          null,
      },
    };
  }
}

function deriveDeviceStatus(
  components
) {
  const criticalComponents = [
    components.camera,
    components.storage,
  ];

  const criticalFailure =
    criticalComponents.some(
      (component) =>
        component.ok === false
    );

  if (criticalFailure) {
    return "unhealthy";
  }

  const anyFailure =
    Object.values(
      components
    ).some(
      (component) =>
        component.ok === false
    );

  if (anyFailure) {
    return "degraded";
  }

  return "healthy";
}

async function getDeviceHealth({
  stationId = null,
  logger = null,
} = {}) {
  const checkedAt =
    new Date().toISOString();

  logger?.info(
    "health.check.started",
    {
      stationId,
    }
  );

  const [
    camera,
    microphone,
    sensors,
    trigger,
  ] = await Promise.all([
    safeHealthCheck(
      "camera",
      Camera
    ),

    safeHealthCheck(
      "microphone",
      Microphone
    ),

    safeHealthCheck(
      "sensors",
      Sensors
    ),

    safeHealthCheck(
      "trigger",
      Trigger
    ),
  ]);

  const queue =
    getQueueHealth();

  const storage =
    getStorageHealth();

  const components = {
    camera,
    microphone,
    sensors,
    trigger,
    queue,
    storage,
  };

  const status =
    deriveDeviceStatus(
      components
    );

  const result = {
    schemaVersion: "1.0",
    stationId,
    checkedAt,

    ok:
      status === "healthy",

    status,
    components,
  };

  logger?.info(
    "health.check.completed",
    {
      status,
      ok: result.ok,

      unhealthyComponents:
        Object.entries(
          components
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

  return result;
}

module.exports = {
  getDeviceHealth,
  safeHealthCheck,
  deriveDeviceStatus,
};
