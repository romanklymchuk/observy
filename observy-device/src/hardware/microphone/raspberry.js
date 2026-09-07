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

const AUDIO_DEVICE =
  process.env.MICROPHONE_ALSA_DEVICE ||
  "hw:1,0";

const SAMPLE_RATE =
  Number(
    process.env.MICROPHONE_SAMPLE_RATE ||
    48000
  );

const CHANNELS =
  Number(
    process.env.MICROPHONE_CHANNELS ||
    2
  );

const FORMAT =
  process.env.MICROPHONE_FORMAT ||
  "S32_LE";

const DURATION_SEC =
  Number(
    process.env.MICROPHONE_DURATION_SEC ||
    8
  );

const AUDIO_DIRECTORY =
  path.resolve(
    process.cwd(),
    "data",
    "audio"
  );

function buildOutputPath() {
  return path.join(
    AUDIO_DIRECTORY,
    `audio-${Date.now()}.wav`
  );
}

async function recordAudio(
  options = {}
) {
  fs.mkdirSync(
    AUDIO_DIRECTORY,
    {
      recursive: true,
    }
  );

  const outputPath =
    options.outputPath ||
    buildOutputPath();

  const durationSec =
    Number(
      options.durationSec ||
      DURATION_SEC
    );

  const args = [
    "-D",
    AUDIO_DEVICE,

    "-c",
    String(CHANNELS),

    "-r",
    String(SAMPLE_RATE),

    "-f",
    FORMAT,

    "-t",
    "wav",

    "-d",
    String(durationSec),

    outputPath,
  ];

  try {
    await execFileAsync(
      "arecord",
      args,
      {
        timeout:
          (durationSec + 5) *
          1000,

        maxBuffer:
          1024 * 1024,
      }
    );
  } catch (error) {
    const wrapped =
      new Error(
        `Microphone recording failed: ${
          error?.message ||
          String(error)
        }`
      );

    wrapped.code =
      error?.code ||
      "MICROPHONE_RECORD_FAILED";

    wrapped.cause =
      error;

    throw wrapped;
  }

  if (
    !fs.existsSync(
      outputPath
    )
  ) {
    throw new Error(
      "Microphone recording completed without WAV file"
    );
  }

  const stats =
    fs.statSync(
      outputPath
    );

  if (
    stats.size <= 44
  ) {
    throw new Error(
      "Microphone WAV contains no audio data"
    );
  }

  return outputPath;
}

async function healthCheck() {
  const checkedAt =
    new Date()
      .toISOString();

  try {
    const {
      stdout,
      stderr,
    } =
      await execFileAsync(
        "arecord",
        [
          "-l",
        ],
        {
          timeout: 5000,
        }
      );

    const output =
      `${stdout || ""}\n${stderr || ""}`;

    const cardDetected =
      output.includes(
        "adau7002"
      );

    return {
      ok:
        cardDetected,

      driver:
        "raspberry",

      checkedAt,

      details: {
        alsaDevice:
          AUDIO_DEVICE,

        card:
          "adau7002",

        detected:
          cardDetected,

        sampleRate:
          SAMPLE_RATE,

        channels:
          CHANNELS,

        format:
          FORMAT,
      },
    };

  } catch (error) {
    return {
      ok: false,

      driver:
        "raspberry",

      checkedAt,

      details: {
        alsaDevice:
          AUDIO_DEVICE,
      },

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
  recordAudio,
  healthCheck,
};
