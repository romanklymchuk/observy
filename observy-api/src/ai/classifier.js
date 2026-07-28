const species = [
  {
    species: "Great Tit",
    scientificName: "Parus major",
    family: "Tit",
    confidence: 0.96,
  },
  {
    species: "Blue Tit",
    scientificName: "Cyanistes caeruleus",
    family: "Tit",
    confidence: 0.94,
  },
  {
    species: "Robin",
    scientificName: "Erithacus rubecula",
    family: "Flycatcher",
    confidence: 0.91,
  },
  {
    species: "House Sparrow",
    scientificName: "Passer domesticus",
    family: "Sparrow",
    confidence: 0.89,
  },
  {
    species: "Unknown Visitor",
    scientificName: null,
    family: null,
    confidence: null,
  },
];

async function classifyImage(photoPath) {
  const randomIndex = Math.floor(Math.random() * species.length);
  return species[randomIndex];
}

module.exports = {
  classifyImage,
};