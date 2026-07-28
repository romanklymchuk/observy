const path = require("path");

async function capturePhoto() {
  return path.join(
    __dirname,
    "../../../assets/photos/test-bird.jpg"
  );
}

module.exports = {
  capturePhoto,
};