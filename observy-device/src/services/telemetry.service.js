const axios =
  require("axios");

const {
  getDeviceHealth,
} = require("./health.service");

const {
  getQueueStats,
} = require("./queue.service");

function simplifyComponents(
  components
) {
  return Object.fromEntries(
    Object.entries(
      components
    ).map(
      ([name, component]) => [
        name,
        {
          ok:
            component.ok === true,
        },
      ]
    )
  );
}

async function buildHeartbeat({
  stationId,
  runtimeState,
}) {
  const health =
    await getDeviceHealth({
      stationId,
    });

  const queue =
    getQueueStats();

  return {
    schemaVersion: "1.0",

    sentAt:
      new Date().toISOString(),

    status:
      health.status,

    runtimeState:
      runtimeState || null,

    queue: {
      pendingCount:
        queue.pendingCount,
    },

    components:
      simplifyComponents(
        health.components
      ),
  };
}

async function sendHeartbeat({
  apiUrl,
  stationId,
  runtimeState,
  logger = null,
}) {
  const payload =
    await buildHeartbeat({
      stationId,
      runtimeState,
    });

  try {
    const response =
      await axios.post(
        `${apiUrl}/stations/${stationId}/heartbeat`,
        payload,
        {
          timeout: 5000,
        }
      );

    logger?.info(
      "telemetry.heartbeat.sent",
      {
        stationId,
        status:
          payload.status,

        runtimeState:
          payload.runtimeState,

        pendingQueue:
          payload.queue
            .pendingCount,

        lastSeenAt:
          response.data
            ?.lastSeenAt ??
          null,
      }
    );

    return {
      ok: true,

      payload,

      response:
        response.data,
    };
  } catch (error) {
    /*
     * Telemetry is non-critical.
     * Never throw into runtime.
     */
    logger?.warn(
      "telemetry.heartbeat.failed",
      {
        stationId,

        errorName:
          error?.name,

        errorMessage:
          error?.message,

        errorCode:
          error?.code ??
          error?.cause?.code ??
          null,
      }
    );

    return {
      ok: false,

      payload,

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

module.exports = {
  buildHeartbeat,
  sendHeartbeat,
};
