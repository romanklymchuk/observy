const mode = process.env.DEVICE_MODE || "mock";

const drivers = {
  mock: require("./mock"),
};

const driver = drivers[mode];

if (!driver) {
  throw new Error(
    `Unsupported sensors driver mode: ${mode}`
  );
}

module.exports = driver;
