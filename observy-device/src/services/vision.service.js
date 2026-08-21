const path = require("node:path");
const {
  execFile,
} = require("node:child_process");
const {
  promisify,
} = require("node:util");

const execFileAsync =
  promisify(execFile);

const DEFAULT_PYTHON_PATH =
  path.resolve(
    process.cwd(),
    ".venv-vision",
    "bin",
    "python"
  );

const DEFAULT_SCRIPT_PATH =
  path.resolve(
    process.cwd(),
    "vision",
    "best_frame.py"
  );

async function processFrames({
  framesDirectory,
  model = "yolo11n.pt",
  pythonPath =
    DEFAULT_PYTHON_PATH,
  scriptPath =
    DEFAULT_SCRIPT_PATH,
  timeoutMs = 120000,
  logger = null,
}) {
  if (!framesDirectory) {
    return {
      ok: false,
      fallback: true,
      reason: "frames_directory_missing",
      bestFramePath: null,
      metrics: null,
    };
  }

  const args = [
    scriptPath,
    framesDirectory,
    "--json",
    "--model",
    model,
  ];

  try {
    const {
      stdout,
      stderr,
    } = await execFileAsync(
      pythonPath,
      args,
      {
        timeout: timeoutMs,
        maxBuffer:
          10 * 1024 * 1024,
      }
    );

    if (
      stderr &&
      stderr.trim().length > 0
    ) {
      logger?.warn(
        "vision.worker.stderr",
        {
          stderr:
            stderr.trim(),
        }
      );
    }

    let result;

    try {
      result =
        JSON.parse(
          stdout.trim()
        );
    } catch {
      logger?.warn(
        "vision.worker.invalid_json",
        {
          stdout:
            stdout.slice(
              0,
              2000
            ),
        }
      );

      return {
        ok: false,
        fallback: true,
        reason:
          "vision_invalid_json",
        bestFramePath: null,
        metrics: null,
      };
    }

    logger?.info(
      "vision.processing.completed",
      {
        birdDetected:
          result.birdDetected ??
          false,

        bestFramePath:
          result.bestFramePath ??
          null,

        score:
          result.metrics?.score ??
          null,
      }
    );

    return {
      ...result,
      fallback: false,
    };
  } catch (error) {
    logger?.warn(
      "vision.processing.failed",
      {
        errorName:
          error?.name ?? null,

        errorMessage:
          error?.message ?? null,

        errorCode:
          error?.code ?? null,
      }
    );

    return {
      ok: false,
      fallback: true,
      reason:
        "vision_worker_failed",
      bestFramePath: null,
      metrics: null,

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
  processFrames,
};
