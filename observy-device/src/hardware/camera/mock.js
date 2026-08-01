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
  healthCheck,
};
