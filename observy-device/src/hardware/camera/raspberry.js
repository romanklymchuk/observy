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

function buildDefaultOutputPath() {
  const directory = path.resolve(
    process.cwd(),
    "data",
    "captures"
  );

  fs.mkdirSync(directory, {
    recursive: true,
  });

  return path.join(
    directory,
    `capture-${Date.now()}.jpg`
  );
}

async function commandExists(command) {
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

async function capturePhoto(options = {}) {
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
    path.dirname(outputPath),
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
      Math.min(quality, 100)
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
          timeoutMs + 10000,
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
      error.code || "CAMERA_CAPTURE_FAILED";

    wrapped.cause = error;

    throw wrapped;
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error(
      `Camera command completed but file was not created: ${outputPath}`
    );
  }

  const stats =
    fs.statSync(outputPath);

  if (stats.size === 0) {
    throw new Error(
      `Camera created an empty file: ${outputPath}`
    );
  }

  return {
    path: outputPath,
    driver: "raspberry",
    capturedAt:
      new Date().toISOString(),
    sizeBytes: stats.size,

    metadata: {
      width,
      height,
      quality,
      autofocusMode:
        "continuous",
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
      driver: "raspberry",
      checkedAt:
        new Date().toISOString(),

      details: {
        commandAvailable: false,
        cameraDetected: false,
        reason:
          "rpicam-still_not_found",
      },
    };
  }

  try {
    const {
      stdout,
      stderr,
    } = await execFileAsync(
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
      output.trim().length > 0;

    return {
      ok: cameraDetected,
      driver: "raspberry",
      checkedAt:
        new Date().toISOString(),

      details: {
        commandAvailable: true,
        cameraDetected,
        output:
          output.trim(),
      },
    };
  } catch (error) {
    return {
      ok: false,
      driver: "raspberry",
      checkedAt:
        new Date().toISOString(),

      details: {
        commandAvailable: true,
        cameraDetected: false,
        error:
          error.stderr ||
          error.message,
      },
    };
  }
}

module.exports = {
  capturePhoto,
  healthCheck,
};
