const species = [
  { commonName: "Great Tit", latinName: "Parus major", confidence: 0.94 },
  { commonName: "Robin", latinName: "Erithacus rubecula", confidence: 0.89 },
  { commonName: "House Sparrow", latinName: "Passer domesticus", confidence: 0.91 },
];

function recognizeMoment(event) {
  const result = species[Math.floor(Math.random() * species.length)];

  return {
    provider: "mock",
    common_name: result.commonName,
    latin_name: result.latinName,
    confidence: result.confidence,
    analyzed_at: new Date().toISOString(),
  };
}

module.exports = {
  recognizeMoment,
};