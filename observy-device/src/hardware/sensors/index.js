const driverName =
  process.env.SENSOR_DRIVER ||
  (
    process.env.DEVICE_MODE ===
    "raspberry"
      ? "bme280"
      : "mock"
  );

const drivers = {
  mock: () =>
    require("./mock"),

  bme280: () =>
    require("./bme280"),
};

const loadDriver =
  drivers[driverName];

if (!loadDriver) {
  throw new Error(
    `Unsupported sensors driver: ${driverName}`
  );
}

const driver =
  loadDriver();

const requiredMethods = [
  "readEnvironment",
  "healthCheck",
];

for (
  const method
  of requiredMethods
) {
  if (
    typeof driver[method] !==
    "function"
  ) {
    throw new Error(
      `Sensors driver "${driverName}" does not implement ${method}()`
    );
  }
}

module.exports = {
  ...driver,
  driverName,
};
