let i2c = null;

function getI2c() {
  if (i2c) {
    return i2c;
  }

  try {
    i2c =
      require("i2c-bus");

    return i2c;
  } catch (error) {
    const wrapped =
      new Error(
        `I2C backend unavailable: ${error.message}`
      );

    wrapped.code =
      "I2C_BACKEND_UNAVAILABLE";

    wrapped.cause = error;

    throw wrapped;
  }
}

const DEFAULT_BUS =
  Number(
    process.env.BME280_I2C_BUS ||
    1
  );

const DEFAULT_ADDRESS =
  Number.parseInt(
    process.env.BME280_I2C_ADDRESS ||
    "0x76"
  );

const REGISTERS = {
  CHIP_ID: 0xD0,
};

const CHIP_IDS = {
  BME280: 0x60,
  BMP280: 0x58,
};

async function withBus(callback) {
  const backend =
    getI2c();

  const bus =
    await backend.openPromisified(
      DEFAULT_BUS
    );

  try {
    return await callback(bus);
  } finally {
    await bus.close();
  }
}

async function readChipId() {
  return withBus(
    async (bus) =>
      bus.readByte(
        DEFAULT_ADDRESS,
        REGISTERS.CHIP_ID
      )
  );
}

async function healthCheck() {
  const checkedAt =
    new Date().toISOString();

  try {
    const chipId =
      await readChipId();

    const isBme280 =
      chipId ===
      CHIP_IDS.BME280;

    return {
      ok: isBme280,
      driver: "bme280",
      checkedAt,

      details: {
        bus:
          DEFAULT_BUS,

        address:
          `0x${DEFAULT_ADDRESS
            .toString(16)
            .padStart(2, "0")}`,

        chipId:
          `0x${chipId
            .toString(16)
            .padStart(2, "0")}`,

        sensor:
          chipId === CHIP_IDS.BME280
            ? "BME280"
            : chipId === CHIP_IDS.BMP280
              ? "BMP280"
              : "unknown",
      },
    };
  } catch (error) {
    return {
      ok: false,
      driver: "bme280",
      checkedAt,

      details: {
        bus:
          DEFAULT_BUS,

        address:
          `0x${DEFAULT_ADDRESS
            .toString(16)
            .padStart(2, "0")}`,
      },

      error: {
        name:
          error?.name ||
          "Error",

        message:
          error?.message ||
          String(error),

        code:
          error?.code ??
          null,
      },
    };
  }
}

async function readEnvironment() {
  throw new Error(
    "BME280 measurement read not implemented yet"
  );
}

module.exports = {
  readEnvironment,
  healthCheck,
};
