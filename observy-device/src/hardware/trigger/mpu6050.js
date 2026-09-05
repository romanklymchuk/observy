const i2c =
  require("i2c-bus");

const BUS =
  Number(
    process.env.MPU6050_I2C_BUS ||
    1
  );

const ADDRESS =
  Number.parseInt(
    process.env.MPU6050_I2C_ADDRESS ||
    "0x68"
  );

const SAMPLE_INTERVAL_MS =
  Number(
    process.env.MPU6050_SAMPLE_INTERVAL_MS ||
    50
  );

const ACCEL_THRESHOLD_G =
  Number(
    process.env.MPU6050_ACCEL_THRESHOLD_G ||
    0.18
  );

const GYRO_THRESHOLD_DPS =
  Number(
    process.env.MPU6050_GYRO_THRESHOLD_DPS ||
    35
  );

const REQUIRED_SAMPLES =
  Number(
    process.env.MPU6050_REQUIRED_SAMPLES ||
    2
  );

const REG = {
  PWR_MGMT_1: 0x6B,
  ACCEL_XOUT_H: 0x3B,
  WHO_AM_I: 0x75,
};

function wait(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );
}

function signed16(msb, lsb) {
  let value =
    (msb << 8) | lsb;

  if (value & 0x8000) {
    value -= 0x10000;
  }

  return value;
}

async function openSensor() {
  const bus =
    await i2c.openPromisified(
      BUS
    );

  // Wake MPU6050.
  await bus.writeByte(
    ADDRESS,
    REG.PWR_MGMT_1,
    0x00
  );

  await wait(50);

  return bus;
}

async function readMotion(bus) {
  const buffer =
    Buffer.alloc(14);

  await bus.readI2cBlock(
    ADDRESS,
    REG.ACCEL_XOUT_H,
    14,
    buffer
  );

  const ax =
    signed16(
      buffer[0],
      buffer[1]
    ) / 16384;

  const ay =
    signed16(
      buffer[2],
      buffer[3]
    ) / 16384;

  const az =
    signed16(
      buffer[4],
      buffer[5]
    ) / 16384;

  const gx =
    signed16(
      buffer[8],
      buffer[9]
    ) / 131;

  const gy =
    signed16(
      buffer[10],
      buffer[11]
    ) / 131;

  const gz =
    signed16(
      buffer[12],
      buffer[13]
    ) / 131;

  const accelMagnitude =
    Math.sqrt(
      ax * ax +
      ay * ay +
      az * az
    );

  const accelDelta =
    Math.abs(
      accelMagnitude - 1
    );

  const gyroMagnitude =
    Math.sqrt(
      gx * gx +
      gy * gy +
      gz * gz
    );

  return {
    ax,
    ay,
    az,
    gx,
    gy,
    gz,
    accelMagnitude,
    accelDelta,
    gyroMagnitude,
  };
}

async function waitForTrigger() {
  const bus =
    await openSensor();

  let consecutiveHits = 0;

  try {
    while (true) {
      const motion =
        await readMotion(bus);

      const accelTriggered =
        motion.accelDelta >=
        ACCEL_THRESHOLD_G;

      const gyroTriggered =
        motion.gyroMagnitude >=
        GYRO_THRESHOLD_DPS;

      if (
        accelTriggered ||
        gyroTriggered
      ) {
        consecutiveHits += 1;
      } else {
        consecutiveHits = 0;
      }

      if (
        consecutiveHits >=
        REQUIRED_SAMPLES
      ) {
        return {
          type: "motion",
          source: "mpu6050",
          detectedAt:
            new Date()
              .toISOString(),

          metadata: {
            accelDeltaG:
              Number(
                motion.accelDelta
                  .toFixed(3)
              ),

            gyroMagnitudeDps:
              Number(
                motion.gyroMagnitude
                  .toFixed(1)
              ),

            accelThresholdG:
              ACCEL_THRESHOLD_G,

            gyroThresholdDps:
              GYRO_THRESHOLD_DPS,

            requiredSamples:
              REQUIRED_SAMPLES,
          },
        };
      }

      await wait(
        SAMPLE_INTERVAL_MS
      );
    }
  } finally {
    await bus.close();
  }
}

async function healthCheck() {
  const checkedAt =
    new Date().toISOString();

  let bus;

  try {
    bus =
      await i2c.openPromisified(
        BUS
      );

    const whoAmI =
      await bus.readByte(
        ADDRESS,
        REG.WHO_AM_I
      );

    return {
      ok:
        whoAmI === 0x68,

      driver: "mpu6050",
      checkedAt,

      details: {
        bus: BUS,
        address:
          `0x${ADDRESS.toString(16)}`,
        whoAmI:
          `0x${whoAmI.toString(16)}`,
      },
    };
  } catch (error) {
    return {
      ok: false,
      driver: "mpu6050",
      checkedAt,
      error: {
        message:
          error?.message ||
          String(error),
        code:
          error?.code ??
          null,
      },
    };
  } finally {
    if (bus) {
      await bus.close();
    }
  }
}

module.exports = {
  waitForTrigger,
  healthCheck,
};
