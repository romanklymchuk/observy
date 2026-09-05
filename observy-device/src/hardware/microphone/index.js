const driverName =
  process.env.MICROPHONE_DRIVER ||
  (
    process.env.DEVICE_MODE === "raspberry"
      ? "raspberry"
      : "mock"
  );

const drivers = {
  mock: () =>
    require("./mock"),

  raspberry: () =>
    require("./raspberry"),
};

const loadDriver =
  drivers[driverName];

if (!loadDriver) {
  throw new Error(
    `Unsupported microphone driver: ${driverName}`
  );
}

const driver =
  loadDriver();

module.exports = {
  ...driver,
  driverName,
};
