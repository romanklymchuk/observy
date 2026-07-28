const path = require("path");

async function recordAudio() {
  return path.join(
    __dirname,
    "../../../assets/audio/test-bird.wav"
  );
}

module.exports = {
  recordAudio,
};