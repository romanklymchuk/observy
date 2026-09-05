let i2c = null;

function getI2c() {
  if (i2c) {
    return i2c;
  }

  try {
    i2c = require("i2c-bus");
    return i2c;
  } catch (error) {
    const wrapped = new Error(
      `I2C backend unavailable: ${error.message}`
    );
    wrapped.code = "I2C_BACKEND_UNAVAILABLE";
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
  CTRL_HUM: 0xF2,
  CTRL_MEAS: 0xF4,
  CONFIG: 0xF5,
  DATA: 0xF7,
};

const CHIP_IDS = {
  BME280: 0x60,
  BMP280: 0x58,
};

function signed8(value) {
  return value > 127
    ? value - 256
    : value;
}

function signed16(value) {
  return value > 32767
    ? value - 65536
    : value;
}

function signed12(value) {
  return value > 2047
    ? value - 4096
    : value;
}

function u16le(buffer, offset) {
  return (
    buffer[offset] |
    (buffer[offset + 1] << 8)
  );
}

function s16le(buffer, offset) {
  return signed16(
    u16le(buffer, offset)
  );
}

async function readBlock(
  bus,
  register,
  length
) {
  const buffer =
    Buffer.alloc(length);

  await bus.readI2cBlock(
    DEFAULT_ADDRESS,
    register,
    length,
    buffer
  );

  return buffer;
}

async function withBus(callback) {
  const backend = getI2c();

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

async function readCalibration(
  bus
) {
  const main =
    await readBlock(
      bus,
      0x88,
      26
    );

  const humidity1 =
    await bus.readByte(
      DEFAULT_ADDRESS,
      0xA1
    );

  const humidity =
    await readBlock(
      bus,
      0xE1,
      7
    );

  const h4Raw =
    (humidity[3] << 4) |
    (humidity[4] & 0x0F);

  const h5Raw =
    (humidity[5] << 4) |
    (humidity[4] >> 4);

  return {
    T1: u16le(main, 0),
    T2: s16le(main, 2),
    T3: s16le(main, 4),

    P1: u16le(main, 6),
    P2: s16le(main, 8),
    P3: s16le(main, 10),
    P4: s16le(main, 12),
    P5: s16le(main, 14),
    P6: s16le(main, 16),
    P7: s16le(main, 18),
    P8: s16le(main, 20),
    P9: s16le(main, 22),

    H1: humidity1,
    H2: s16le(humidity, 0),
    H3: humidity[2],
    H4: signed12(h4Raw),
    H5: signed12(h5Raw),
    H6: signed8(humidity[6]),
  };
}

async function configureSensor(
  bus
) {
  // Humidity oversampling x1
  await bus.writeByte(
    DEFAULT_ADDRESS,
    REGISTERS.CTRL_HUM,
    0x01
  );

  // Temperature x1,
  // pressure x1,
  // normal mode.
  await bus.writeByte(
    DEFAULT_ADDRESS,
    REGISTERS.CTRL_MEAS,
    0x27
  );

  // Standby 1000 ms,
  // filter disabled.
  await bus.writeByte(
    DEFAULT_ADDRESS,
    REGISTERS.CONFIG,
    0xA0
  );
}

function compensate(
  raw,
  c
) {
  let var1;
  let var2;

  // Temperature
  var1 =
    (
      raw.temperature /
        16384.0 -
      c.T1 /
        1024.0
    ) *
    c.T2;

  var2 =
    (
      raw.temperature /
        131072.0 -
      c.T1 /
        8192.0
    );

  var2 =
    var2 *
    var2 *
    c.T3;

  const tFine =
    var1 + var2;

  const temperature =
    tFine / 5120.0;

  // Pressure
  var1 =
    tFine / 2.0 -
    64000.0;

  var2 =
    var1 *
    var1 *
    c.P6 /
    32768.0;

  var2 =
    var2 +
    var1 *
    c.P5 *
    2.0;

  var2 =
    var2 / 4.0 +
    c.P4 *
    65536.0;

  var1 =
    (
      c.P3 *
      var1 *
      var1 /
      524288.0 +
      c.P2 *
      var1
    ) /
    524288.0;

  var1 =
    (
      1.0 +
      var1 /
      32768.0
    ) *
    c.P1;

  let pressure = 0;

  if (var1 !== 0) {
    pressure =
      1048576.0 -
      raw.pressure;

    pressure =
      (
        pressure -
        var2 /
        4096.0
      ) *
      6250.0 /
      var1;

    var1 =
      c.P9 *
      pressure *
      pressure /
      2147483648.0;

    var2 =
      pressure *
      c.P8 /
      32768.0;

    pressure =
      pressure +
      (
        var1 +
        var2 +
        c.P7
      ) /
      16.0;
  }

  // Humidity
  let humidity =
    tFine -
    76800.0;

  humidity =
    (
      raw.humidity -
      (
        c.H4 *
        64.0 +
        c.H5 /
        16384.0 *
        humidity
      )
    ) *
    (
      c.H2 /
      65536.0 *
      (
        1.0 +
        c.H6 /
        67108864.0 *
        humidity *
        (
          1.0 +
          c.H3 /
          67108864.0 *
          humidity
        )
      )
    );

  humidity =
    humidity *
    (
      1.0 -
      c.H1 *
      humidity /
      524288.0
    );

  humidity =
    Math.max(
      0,
      Math.min(
        100,
        humidity
      )
    );

  return {
    temperature,
    humidity,
    pressure:
      pressure / 100.0,
  };
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
        bus: DEFAULT_BUS,
        address:
          `0x${DEFAULT_ADDRESS
            .toString(16)
            .padStart(2, "0")}`,
        chipId:
          `0x${chipId
            .toString(16)
            .padStart(2, "0")}`,
        sensor:
          chipId ===
          CHIP_IDS.BME280
            ? "BME280"
            : chipId ===
                CHIP_IDS.BMP280
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
        bus: DEFAULT_BUS,
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
  return withBus(
    async (bus) => {
      const chipId =
        await bus.readByte(
          DEFAULT_ADDRESS,
          REGISTERS.CHIP_ID
        );

      if (
        chipId !==
        CHIP_IDS.BME280
      ) {
        throw new Error(
          `Unexpected BME280 chip ID: 0x${chipId.toString(16)}`
        );
      }

      const calibration =
        await readCalibration(
          bus
        );

      await configureSensor(
        bus
      );

      // Allow first measurement
      // to settle.
      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            100
          )
      );

      const data =
        await readBlock(
          bus,
          REGISTERS.DATA,
          8
        );

      const rawPressure =
        (
          data[0] << 12
        ) |
        (
          data[1] << 4
        ) |
        (
          data[2] >> 4
        );

      const rawTemperature =
        (
          data[3] << 12
        ) |
        (
          data[4] << 4
        ) |
        (
          data[5] >> 4
        );

      const rawHumidity =
        (
          data[6] << 8
        ) |
        data[7];

      const values =
        compensate(
          {
            pressure:
              rawPressure,
            temperature:
              rawTemperature,
            humidity:
              rawHumidity,
          },
          calibration
        );

      return {
        temperature:
          Number(
            values.temperature
              .toFixed(2)
          ),
        humidity:
          Number(
            values.humidity
              .toFixed(2)
          ),
        pressure:
          Number(
            values.pressure
              .toFixed(2)
          ),
        driver: "bme280",
        capturedAt:
          new Date()
            .toISOString(),
        metadata: {
          bus:
            DEFAULT_BUS,
          address:
            `0x${DEFAULT_ADDRESS
              .toString(16)
              .padStart(2, "0")}`,
        },
      };
    }
  );
}

module.exports = {
  readEnvironment,
  healthCheck,
};
