const driverName =
  process.env.TRIGGER_DRIVER ||
  (
    process.env.DEVICE_MODE === "raspberry"
      ? "mpu6050"
      : "mock"
  );

const driverLoaders = {
  mock: () =>
    require("./mock"),

  mpu6050: () =>
    require("./mpu6050"),
};

const loadDriver =
  driverLoaders[driverName];

if (!loadDriver) {
  throw new Error(
    `Unsupported trigger driver: ${driverName}`
  );
}

const driver =
  loadDriver();

module.exports = {
  ...driver,
  driverName,
};
