function parseNumber(value, fallback) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function validateRange(name, min, max) {
  if (min > max) {
    throw new Error(
      `Invalid ${name} range: min (${min}) is greater than max (${max})`
    );
  }
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

async function readEnvironment(config = {}) {
  const temperatureMin = parseNumber(
    config.temperatureMin,
    18
  );

  const temperatureMax = parseNumber(
    config.temperatureMax,
    28
  );

  const humidityMin = parseNumber(
    config.humidityMin,
    40
  );

  const humidityMax = parseNumber(
    config.humidityMax,
    75
  );

  validateRange(
    "temperature",
    temperatureMin,
    temperatureMax
  );

  validateRange(
    "humidity",
    humidityMin,
    humidityMax
  );

  return {
    temperature: Number(
      randomBetween(
        temperatureMin,
        temperatureMax
      ).toFixed(1)
    ),

    humidity: Number(
      randomBetween(
        humidityMin,
        humidityMax
      ).toFixed(1)
    ),

    driver: "mock",
    capturedAt: new Date().toISOString(),
  };
}

async function healthCheck() {
  return {
    ok: true,
    driver: "mock",
    checkedAt: new Date().toISOString(),
  };
}

module.exports = {
  readEnvironment,
  healthCheck,
};
