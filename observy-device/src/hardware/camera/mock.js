const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_PHOTO_PATH = path.resolve(
  process.cwd(),
  "assets",
  "photos",
  "test-bird.jpg"
);

async function capturePhoto(options = {}) {
  const photoPath =
    options.outputPath ||
    DEFAULT_PHOTO_PATH;

  if (!fs.existsSync(photoPath)) {
    throw new Error(
      `Mock camera photo not found: ${photoPath}`
    );
  }

  const stats =
    fs.statSync(photoPath);

  return {
    path: photoPath,
    driver: "mock",
    capturedAt:
      new Date().toISOString(),
    sizeBytes: stats.size,
  };
}

async function captureBurst(
  options = {}
) {
  const count = Number.isInteger(
    Number(options.count)
  )
    ? Math.max(
        1,
        Number(options.count)
      )
    : 5;

  const directory =
    options.outputDirectory ||
    path.resolve(
      process.cwd(),
      "data",
      "mock-burst",
      `burst-${Date.now()}`
    );

  fs.mkdirSync(
    directory,
    {
      recursive: true,
    }
  );

  if (
    !fs.existsSync(
      DEFAULT_PHOTO_PATH
    )
  ) {
    throw new Error(
      `Mock camera photo not found: ${DEFAULT_PHOTO_PATH}`
    );
  }

  const frames = [];

  for (
    let index = 0;
    index < count;
    index += 1
  ) {
    const frameNumber =
      String(index + 1)
        .padStart(
          3,
          "0"
        );

    const outputPath =
      path.join(
        directory,
        `frame-${frameNumber}.jpg`
      );

    fs.copyFileSync(
      DEFAULT_PHOTO_PATH,
      outputPath
    );

    const stats =
      fs.statSync(
        outputPath
      );

    frames.push({
      path:
        outputPath,

      index:
        index + 1,

      driver:
        "mock",

      capturedAt:
        new Date()
          .toISOString(),

      sizeBytes:
        stats.size,
    });
  }

  return {
    driver:
      "mock",

    count:
      frames.length,

    directory,

    frames,

    capturedAt:
      new Date()
        .toISOString(),
  };
}


async function healthCheck() {
  const exists =
    fs.existsSync(
      DEFAULT_PHOTO_PATH
    );

  return {
    ok: exists,
    driver: "mock",
    checkedAt:
      new Date().toISOString(),

    details: {
      defaultPhotoPath:
        DEFAULT_PHOTO_PATH,

      photoExists: exists,
    },
  };
}

module.exports = {
  capturePhoto,
  captureBurst,
  healthCheck,
};
