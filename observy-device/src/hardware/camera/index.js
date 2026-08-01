const driverName =
  process.env.CAMERA_DRIVER ||
  (
    process.env.DEVICE_MODE ===
    "raspberry"
      ? "raspberry"
      : "mock"
  );

const driverLoaders = {
  mock: () =>
    require("./mock"),

  raspberry: () =>
    require("./raspberry"),
};

const loadDriver =
  driverLoaders[driverName];

if (!loadDriver) {
  throw new Error(
    `Unsupported camera driver: ${driverName}`
  );
}

const driver = loadDriver();

function assertDriverContract(
  candidate
) {
  const requiredMethods = [
    "capturePhoto",
    "healthCheck",
  ];

  for (
    const method
    of requiredMethods
  ) {
    if (
      typeof candidate[method] !==
      "function"
    ) {
      throw new Error(
        `Camera driver "${driverName}" does not implement ${method}()`
      );
    }
  }
}

assertDriverContract(driver);

module.exports = {
  ...driver,
  driverName,
};
