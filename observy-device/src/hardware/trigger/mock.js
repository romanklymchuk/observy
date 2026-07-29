function parseDelay(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function wait(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function waitForTrigger(options = {}) {
  const delayMs = parseDelay(
    options.delayMs ??
      process.env.MOCK_TRIGGER_DELAY_MS,
    500
  );

  await wait(delayMs);

  return {
    type: "motion",
    source: "mock",
    detectedAt: new Date().toISOString(),

    metadata: {
      delayMs,
      simulated: true,
    },
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
  waitForTrigger,
  healthCheck,
};
