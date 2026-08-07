const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_AUDIO_PATH =
  path.resolve(
    process.cwd(),
    "assets",
    "audio",
    "test-bird.wav"
  );

async function recordAudio() {
  return DEFAULT_AUDIO_PATH;
}

async function healthCheck() {
  const exists =
    fs.existsSync(
      DEFAULT_AUDIO_PATH
    );

  return {
    ok: exists,
    driver: "mock",
    checkedAt:
      new Date().toISOString(),

    details: {
      defaultAudioPath:
        DEFAULT_AUDIO_PATH,

      audioExists: exists,
    },
  };
}

module.exports = {
  recordAudio,
  healthCheck,
};
