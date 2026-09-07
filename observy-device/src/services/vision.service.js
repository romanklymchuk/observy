const fs =
  require("node:fs");

const path =
  require("node:path");

const axios =
  require("axios");

const FormData =
  require("form-data");

const {
  execFile,
} = require(
  "node:child_process"
);

const {
  promisify,
} = require(
  "node:util"
);

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

const DEFAULT_HTTP_URL =
  process.env.VISION_HTTP_URL ||
  "http://127.0.0.1:8765";

function getImagePaths(
  framesDirectory
) {
  return fs
    .readdirSync(
      framesDirectory
    )
    .filter((name) =>
      /\.(jpg|jpeg|png)$/i.test(
        name
      )
    )
    .sort()
    .map((name) =>
      path.join(
        framesDirectory,
        name
      )
    );
}

async function processFramesHttp({
  framesDirectory,
  timeoutMs,
  logger,
}) {
  const imagePaths =
    getImagePaths(
      framesDirectory
    );

  if (
    imagePaths.length === 0
  ) {
    return {
      ok: false,
      fallback: true,
      reason:
        "vision_frames_missing",
      birdDetected: false,
      bestFramePath: null,
      metrics: null,
    };
  }

  const form =
    new FormData();

  for (
    const imagePath
    of imagePaths
  ) {
    form.append(
      "frames",
      fs.createReadStream(
        imagePath
      ),
      {
        filename:
          path.basename(
            imagePath
          ),
      }
    );
  }

  logger?.info(
    "vision.http.started",
    {
      url:
        `${DEFAULT_HTTP_URL}/analyze`,
      frameCount:
        imagePaths.length,
    }
  );

  const response =
    await axios.post(
      `${DEFAULT_HTTP_URL}/analyze`,
      form,
      {
        headers:
          form.getHeaders(),

        timeout:
          timeoutMs,

        maxBodyLength:
          Infinity,

        maxContentLength:
          Infinity,
      }
    );

  const result =
    response.data;

  let bestFramePath =
    null;

  if (
    result.bestFrameFilename
  ) {
    const safeFilename =
      path.basename(
        result.bestFrameFilename
      );

    const candidate =
      path.join(
        framesDirectory,
        safeFilename
      );

    if (
      fs.existsSync(
        candidate
      )
    ) {
      bestFramePath =
        candidate;
    }
  }

  logger?.info(
    "vision.http.completed",
    {
      birdDetected:
        result.birdDetected ??
        false,

      bestFrameFilename:
        result.bestFrameFilename ??
        null,

      bestFramePath,

      score:
        result.metrics?.score ??
        null,
    }
  );

  return {
    ...result,

    bestFramePath,

    fallback: false,
  };
}

async function processFramesLocal({
  framesDirectory,
  model,
  pythonPath,
  scriptPath,
  timeoutMs,
  logger,
}) {
  const args = [
    scriptPath,
    framesDirectory,
    "--json",
    "--model",
    model,
  ];

  const {
    stdout,
    stderr,
  } =
    await execFileAsync(
      pythonPath,
      args,
      {
        timeout:
          timeoutMs,

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

  return JSON.parse(
    stdout.trim()
  );
}

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
  if (
    !framesDirectory
  ) {
    return {
      ok: false,
      fallback: true,
      reason:
        "frames_directory_missing",
      bestFramePath: null,
      metrics: null,
    };
  }

  const driver =
    process.env.VISION_DRIVER ||
    "local";

  try {
    let result;

    if (
      driver === "http"
    ) {
      return await processFramesHttp({
        framesDirectory,
        timeoutMs,
        logger,
      });
    }

    if (
      driver !== "local"
    ) {
      throw new Error(
        `Unsupported vision driver: ${driver}`
      );
    }

    result =
      await processFramesLocal({
        framesDirectory,
        model,
        pythonPath,
        scriptPath,
        timeoutMs,
        logger,
      });

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
        driver,

        errorName:
          error?.name ??
          null,

        errorMessage:
          error?.message ??
          null,

        errorCode:
          error?.code ??
          null,
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
