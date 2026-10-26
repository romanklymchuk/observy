const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");

async function uploadEvent({
  apiUrl,
  stationId,
  photoPath,
  audioPath,
  temperature,
  humidity,
  durationSec = 8,
}) {
  if (!photoPath && !audioPath) {
    throw new Error(
      "Cannot upload observation without photo or audio"
    );
  }

  const form = new FormData();

  form.append("station_id", stationId);
  form.append("captured_at", new Date().toISOString());
  form.append("temperature", String(temperature));
  form.append("humidity", String(humidity));
  form.append("duration_sec", String(durationSec));

  if (photoPath) {
    form.append(
      "photo",
      fs.createReadStream(photoPath)
    );
  }

  if (audioPath) {
    form.append(
      "audio",
      fs.createReadStream(audioPath)
    );
  }

  console.log("⬆ Uploading event...");

  const response = await axios.post(
    `${apiUrl}/events`,
    form,
    {
      headers: form.getHeaders(),
      timeout: 30000,
    }
  );

  console.log("✅ Event uploaded");

  return response.data;
}

module.exports = {
  uploadEvent,
};
