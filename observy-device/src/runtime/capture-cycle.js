const Camera = require("../hardware/camera");
const Microphone = require("../hardware/microphone");
const { uploadEvent } = require("../services/upload.service");

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

async function runCaptureCycle({
  config,
  apiUrl,
  stationId,
}) {
  console.log("🟢 Motion detected...");

  const temperature = randomBetween(
    config.temperatureMin,
    config.temperatureMax
  ).toFixed(1);

  const humidity = randomBetween(
    config.humidityMin,
    config.humidityMax
  ).toFixed(1);

  console.log("📷 Capturing photo...");

  const photoPath = await Camera.capturePhoto();

  console.log(
    `[Camera] Photo captured: ${photoPath}`
  );

  console.log("🎙 Recording audio...");

  const audioPath = await Microphone.recordAudio();

  console.log(
    `[Microphone] Audio recorded: ${audioPath}`
  );

  const event = await uploadEvent({
    apiUrl,
    stationId,
    photoPath,
    audioPath,
    temperature,
    humidity,
    durationSec: 8,
  });

  return event;
}

module.exports = {
  runCaptureCycle,
};