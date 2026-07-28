const mode = process.env.DEVICE_MODE || "mock";

let camera;

switch (mode) {
  case "mock":
    camera = require("./mock");
    break;

  case "raspberry":
    camera = require("./raspberry");
    break;

  default:
    throw new Error(`Unknown camera mode: ${mode}`);
}

module.exports = camera;