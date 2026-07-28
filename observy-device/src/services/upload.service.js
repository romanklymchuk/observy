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
  const form = new FormData();

  form.append("station_id", stationId);
  form.append("captured_at", new Date().toISOString());
  form.append("temperature", String(temperature));
  form.append("humidity", String(humidity));
  form.append("duration_sec", String(durationSec));

  form.append(
    "photo",
    fs.createReadStream(photoPath)
  );

  form.append(
    "audio",
    fs.createReadStream(audioPath)
  );

  console.log("⬆ Uploading event...");

  const response = await axios.post(
    `${apiUrl}/events`,
    form,
    {
      headers: form.getHeaders(),
    }
  );

  console.log("✅ Event uploaded");

  return response.data;
}

module.exports = {
  uploadEvent,
};