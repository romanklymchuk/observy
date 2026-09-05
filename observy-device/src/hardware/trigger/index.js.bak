const driverName =
  process.env.TRIGGER_DRIVER ||
  (process.env.DEVICE_MODE === "mock"
    ? "mock"
    : "mock");

const driverLoaders = {
  mock: () => require("./mock"),
};

const loadDriver = driverLoaders[driverName];

if (!loadDriver) {
  throw new Error(
    `Unsupported trigger driver: ${driverName}`
  );
}

module.exports = loadDriver();
