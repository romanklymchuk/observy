const fs = require("node:fs");
const path = require("node:path");

const {
    getBootContext,
    getMonotonicMs,
} = require("./context");

const JOURNAL_DIRECTORY = path.resolve(
    process.cwd(),
    "data",
    "journal",
);

const VALID_LEVELS = new Set([
    "DEBUG",
    "INFO",
    "WARN",
    "ERROR",
]);

function ensureJournalDirectory() {
    fs.mkdirSync(JOURNAL_DIRECTORY, {
        recursive: true,
    });
}

function getJournalFilePath() {
    const date = new Date()
        .toISOString()
        .slice(0, 10);

    return path.join(
        JOURNAL_DIRECTORY,
        `${date}.jsonl`,
    );
}

function sanitizeError(error) {
    if (!(error instanceof Error)) {
        return error;
    }

    return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
    };
}

function sanitizeData(data = {}) {
    const sanitized = {};

    for (const [key, value] of Object.entries(data)) {
        sanitized[key] = sanitizeError(value);
    }

    return sanitized;
}

function createLogger({
    stationId = "unknown-station",
    context = {},
} = {}) {
    const bootContext = getBootContext({
        stationId,
    });

    function writeLog(
        severity,
        eventName,
        data = {},
    ) {
        const normalizedSeverity =
            String(severity).toUpperCase();

        if (!VALID_LEVELS.has(normalizedSeverity)) {
            throw new Error(
                `Unsupported log severity: ${severity}`,
            );
        }

        if (
            typeof eventName !== "string" ||
            eventName.trim() === ""
        ) {
            throw new Error(
                "eventName must be a non-empty string",
            );
        }

        const timestamp = new Date().toISOString();

        const entry = {
            schemaVersion: "1.0",

            timestamp,
            monotonicMs: Number(
                getMonotonicMs().toFixed(3),
            ),

            severity: normalizedSeverity,
            eventName,

            stationId: bootContext.stationId,
            bootId: bootContext.bootId,
            deviceMode: bootContext.deviceMode,
            runtimeVersion:
                bootContext.runtimeVersion,

            hostname: bootContext.hostname,
            processId: bootContext.processId,

            ...context,

            data: sanitizeData(data),
        };

        const traceLabel = entry.traceId
            ? `[${entry.traceId}]`
            : "[system]";

        const consoleLine =
            `[${normalizedSeverity}] ` +
            `${traceLabel} ${eventName}`;

        if (normalizedSeverity === "ERROR") {
            console.error(consoleLine, data);
        } else if (normalizedSeverity === "WARN") {
            console.warn(consoleLine, data);
        } else {
            console.log(consoleLine, data);
        }

        try {
            ensureJournalDirectory();

            fs.appendFileSync(
                getJournalFilePath(),
                `${JSON.stringify(entry)}\n`,
                "utf8",
            );
        } catch (error) {
            console.error(
                "[LOGGER_FAILURE] Could not write JSONL log",
                error,
            );
        }

        return entry;
    }

    return {
        debug(eventName, data) {
            return writeLog(
                "DEBUG",
                eventName,
                data,
            );
        },

        info(eventName, data) {
            return writeLog(
                "INFO",
                eventName,
                data,
            );
        },

        warn(eventName, data) {
            return writeLog(
                "WARN",
                eventName,
                data,
            );
        },

        error(eventName, data) {
            return writeLog(
                "ERROR",
                eventName,
                data,
            );
        },

        child(additionalContext = {}) {
            return createLogger({
                stationId,
                context: {
                    ...context,
                    ...additionalContext,
                },
            });
        },
    };
}

module.exports = {
    createLogger,
};