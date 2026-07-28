const axios = require("axios");

async function ensureStation({
  apiUrl,
  stationId,
  stationName,
  locationName,
}) {
  console.log("📡 Creating station...");

  const response = await axios.post(`${apiUrl}/stations`, {
    id: stationId,
    name: stationName,
    location: locationName,
  });

  console.log(
    `✅ Station ready: ${stationName} (${stationId})`
  );

  return response.data;
}

module.exports = {
  ensureStation,
};