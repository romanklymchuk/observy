const { randomUUID } = require("node:crypto");
const os = require("node:os");
const packageJson = require("../../package.json");

/**
 * Дані, що створюються один раз під час запуску процесу.
 *
 * bootId залишається однаковим для всіх observation,
 * доки Observy Device не буде перезапущений.
 */
const processStartedAt = new Date().toISOString();
const processStartedMonotonicNs = process.hrtime.bigint();

const bootId = `boot_${randomUUID()}`;

/**
 * Повертає кількість мілісекунд від моменту запуску runtime.
 *
 * Monotonic clock не залежить від зміни системного часу,
 * NTP-синхронізації або зміни часового поясу.
 */
function getMonotonicMs() {
    const elapsedNs =
        process.hrtime.bigint() - processStartedMonotonicNs;

    return Number(elapsedNs) / 1_000_000;
}

/**
 * Повертає спільний контекст поточного запуску пристрою.
 */
function getBootContext({ stationId = "unknown-station" } = {}) {
    return {
        schemaVersion: "1.0",

        stationId,
        bootId,

        deviceMode:
            process.env.DEVICE_MODE || "mock",

        runtimeVersion:
            packageJson.version || "0.0.0",

        hostname: os.hostname(),
        platform: process.platform,
        architecture: process.arch,
        processId: process.pid,

        processStartedAt,
        monotonicMs: Number(getMonotonicMs().toFixed(3)),
    };
}

/**
 * Створює новий контекст для одного фізичного спостереження.
 *
 * Новий traceId створюється для кожного capture cycle.
 */
function createObservationContext({
    stationId = "unknown-station",
    trigger = "manual",
    metadata = {},
} = {}) {
    return {
        ...getBootContext({ stationId }),

        traceId: `obs_${randomUUID()}`,

        trigger,

        observationStartedAt:
            new Date().toISOString(),

        monotonicMs:
            Number(getMonotonicMs().toFixed(3)),

        metadata,
    };
}

module.exports = {
    getBootContext,
    createObservationContext,
    getMonotonicMs,
};