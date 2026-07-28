const mode = process.env.DEVICE_MODE || "mock";

let microphone;

switch (mode) {
  case "mock":
    microphone = require("./mock");
    break;

  case "raspberry":
    microphone = require("./raspberry");
    break;

  default:
    throw new Error(`Unknown microphone mode: ${mode}`);
}

module.exports = microphone;