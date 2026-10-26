const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

test("camera succeeds when microphone fails", async () => {
  const camera = require("../src/hardware/camera");
  const microphone = require("../src/hardware/microphone");
  const sensors = require("../src/hardware/sensors");
  const vision = require("../src/services/vision.service");
  const upload = require("../src/services/upload.service");

  const originals = {
    camera: camera.captureBurst,
    microphone: microphone.recordAudio,
    sensors: sensors.readEnvironment,
    vision: vision.processFrames,
    upload: upload.uploadEvent,
  };

  const cyclePath = require.resolve("../src/runtime/capture-cycle");

  try {
    camera.captureBurst = async () => ({
      directory: "/tmp/observy-test",
      frames: [
        { path: "/tmp/observy-test/frame-001.jpg" },
      ],
    });

    microphone.recordAudio = async () => {
      throw new Error("SIMULATED_MICROPHONE_FAILURE");
    };

    sensors.readEnvironment = async () => ({
      temperature: 22,
      humidity: 55,
      driver: "mock",
      capturedAt: new Date().toISOString(),
    });

    vision.processFrames = async () => ({
      ok: true,
      birdDetected: false,
    });

    upload.uploadEvent = async ({ photoPath, audioPath }) => {
      assert.equal(photoPath, "/tmp/observy-test/frame-001.jpg");
      assert.equal(audioPath, undefined);
      return { id: "s3d-degraded-test" };
    };

    delete require.cache[cyclePath];

    const { runCaptureCycle } = require(cyclePath);

    const result = await runCaptureCycle({
      config: {
        vision: { enabled: false },
        camera: {},
      },
      apiUrl: "http://localhost:4000",
      stationId: "observy-test",
    });

    assert.equal(result.id, "s3d-degraded-test");
  } finally {
    camera.captureBurst = originals.camera;
    microphone.recordAudio = originals.microphone;
    sensors.readEnvironment = originals.sensors;
    vision.processFrames = originals.vision;
    upload.uploadEvent = originals.upload;
    delete require.cache[cyclePath];
  }
});
