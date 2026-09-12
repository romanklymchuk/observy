const fs = require("node:fs");
const path = require("node:path");
const {
  execFile,
} = require("node:child_process");
const {
  promisify,
} = require("node:util");

const execFileAsync =
  promisify(execFile);

function parsePositiveInteger(
  value,
  fallback
) {
  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    return fallback;
  }

  return parsed;
}

function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );
}

function buildDefaultOutputPath() {
  const directory = path.resolve(
    process.cwd(),
    "data",
    "captures"
  );

  fs.mkdirSync(
    directory,
    {
      recursive: true,
    }
  );

  return path.join(
    directory,
    `capture-${Date.now()}.jpg`
  );
}

function buildBurstDirectory() {
  const directory = path.resolve(
    process.cwd(),
    "data",
    "bursts",
    `burst-${Date.now()}`
  );

  fs.mkdirSync(
    directory,
    {
      recursive: true,
    }
  );

  return directory;
}

async function commandExists(
  command
) {
  try {
    await execFileAsync(
      "which",
      [command]
    );

    return true;
  } catch {
    return false;
  }
}

function validateCapturedFile(
  outputPath
) {
  if (
    !fs.existsSync(
      outputPath
    )
  ) {
    throw new Error(
      `Camera command completed but file was not created: ${outputPath}`
    );
  }

  const stats =
    fs.statSync(
      outputPath
    );

  if (
    !stats.isFile() ||
    stats.size === 0
  ) {
    throw new Error(
      `Camera created an invalid file: ${outputPath}`
    );
  }

  return stats;
}

async function capturePhoto(
  options = {}
) {
  const outputPath =
    options.outputPath ||
    buildDefaultOutputPath();

  const width =
    parsePositiveInteger(
      options.width,
      2304
    );

  const height =
    parsePositiveInteger(
      options.height,
      1296
    );

  const timeoutMs =
    parsePositiveInteger(
      options.timeoutMs,
      1500
    );

  const quality =
    parsePositiveInteger(
      options.quality,
      90
    );

  fs.mkdirSync(
    path.dirname(
      outputPath
    ),
    {
      recursive: true,
    }
  );

  const args = [
    "--output",
    outputPath,

    "--width",
    String(width),

    "--height",
    String(height),

    "--quality",
    String(
      Math.min(
        quality,
        100
      )
    ),

    "--timeout",
    String(timeoutMs),

    "--autofocus-mode",
    "continuous",

    "--nopreview",
  ];

  try {
    await execFileAsync(
      "rpicam-still",
      args,
      {
        timeout:
          timeoutMs +
          10000,
      }
    );
  } catch (error) {
    const wrapped =
      new Error(
        `Raspberry camera capture failed: ${
          error.stderr ||
          error.message
        }`
      );

    wrapped.code =
      error.code ||
      "CAMERA_CAPTURE_FAILED";

    wrapped.cause =
      error;

    throw wrapped;
  }

  const stats =
    validateCapturedFile(
      outputPath
    );

  return {
    path:
      outputPath,

    driver:
      "raspberry",

    capturedAt:
      new Date()
        .toISOString(),

    sizeBytes:
      stats.size,

    metadata: {
      width,
      height,
      quality,

      autofocusMode:
        "continuous",
    },
  };
}

async function captureBurst(
  options = {}
) {
  const count =
    parsePositiveInteger(
      options.count,
      3
    );

  const intervalMs =
    parsePositiveInteger(
      options.intervalMs,
      300
    );

  const outputDirectory =
    options.outputDirectory ||
    buildBurstDirectory();

  const width =
    parsePositiveInteger(
      options.width,
      2304
    );

  const height =
    parsePositiveInteger(
      options.height,
      1296
    );

  const timeoutMs =
    parsePositiveInteger(
      options.timeoutMs,
      2500
    );

  const quality =
    parsePositiveInteger(
      options.quality,
      90
    );

  fs.mkdirSync(
    outputDirectory,
    {
      recursive: true,
    }
  );

  const burstStartedAt =
    new Date()
      .toISOString();

  const startedAt =
    Date.now();

  const outputPattern =
    path.join(
      outputDirectory,
      "frame-%04d.jpg"
    );

  const args = [
    "--output",
    outputPattern,
    "--width",
    String(width),
    "--height",
    String(height),
    "--quality",
    String(
      Math.min(
        quality,
        100
      )
    ),
    "--timeout",
    String(timeoutMs),
    "--timelapse",
    String(intervalMs),
    "--autofocus-mode",
    "continuous",
    "--zsl",
    "--nopreview",
  ];

  try {
    await execFileAsync(
      "rpicam-still",
      args,
      {
        timeout:
          timeoutMs +
          10000,
      }
    );
  } catch (error) {
    const wrapped =
      new Error(
        `Raspberry burst capture failed: ${
          error.stderr ||
          error.message
        }`
      );

    wrapped.code =
      error.code ||
      "CAMERA_BURST_FAILED";

    wrapped.cause =
      error;

    throw wrapped;
  }

  const files =
    fs.readdirSync(
      outputDirectory
    )
      .filter(
        (name) =>
          name.endsWith(".jpg")
      )
      .sort();

  if (
    files.length <
    count
  ) {
    throw new Error(
      `Camera burst produced ${files.length} frame(s), expected at least ${count}`
    );
  }

  const selectedFiles =
    files.slice(
      0,
      count
    );

  const durationMs =
    Date.now() -
    startedAt;

  const frames =
    selectedFiles.map(
      (
        filename,
        index
      ) => {
        const framePath =
          path.join(
            outputDirectory,
            filename
          );

        const stats =
          validateCapturedFile(
            framePath
          );

        return {
          path:
            framePath,
          driver:
            "raspberry",
          capturedAt:
            burstStartedAt,
          sizeBytes:
            stats.size,
          index:
            index + 1,
          durationMs:
            null,
        };
      }
    );

  return {
    driver:
      "raspberry",
    count:
      frames.length,
    directory:
      outputDirectory,
    capturedAt:
      burstStartedAt,
    frames,
    durationMs,
    metadata: {
      requestedCount:
        count,
      intervalMs,
      width,
      height,
      quality,
      timeoutMs,
      autofocusMode:
        "continuous",
      zsl:
        true,
      processMode:
        "single-process",
    },
  };
}

async function healthCheck() {
  const commandAvailable =
    await commandExists(
      "rpicam-still"
    );

  if (!commandAvailable) {
    return {
      ok: false,

      driver:
        "raspberry",

      checkedAt:
        new Date()
          .toISOString(),

      details: {
        commandAvailable:
          false,

        cameraDetected:
          false,

        reason:
          "rpicam-still_not_found",
      },
    };
  }

  try {
    const {
      stdout,
      stderr,
    } =
      await execFileAsync(
        "rpicam-hello",
        [
          "--list-cameras",
        ],
        {
          timeout: 5000,
        }
      );

    const output =
      `${stdout || ""}
${stderr || ""}`;

    const cameraDetected =
      !output.includes(
        "No cameras available"
      ) &&
      output.trim()
        .length > 0;

    return {
      ok:
        cameraDetected,

      driver:
        "raspberry",

      checkedAt:
        new Date()
          .toISOString(),

      details: {
        commandAvailable:
          true,

        cameraDetected,

        output:
          output.trim(),
      },
    };
  } catch (error) {
    return {
      ok: false,

      driver:
        "raspberry",

      checkedAt:
        new Date()
          .toISOString(),

      details: {
        commandAvailable:
          true,

        cameraDetected:
          false,

        error:
          error.stderr ||
          error.message,
      },
    };
  }
}

module.exports = {
  capturePhoto,
  captureBurst,
  healthCheck,
};
