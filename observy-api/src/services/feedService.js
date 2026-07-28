function toFeed(events) {
  return events.map((event) => ({
    id: event.id,
    species: event.species || "Unknown Visitor",
    scientificName: event.scientific_name,
    family: event.family,
    confidence: event.confidence ?? null,
    capturedAt: event.captured_at,
    temperature: event.temperature,
    humidity: event.humidity,
    photo: event.photo_url,
    audio: event.audio_url,
  }));
}

module.exports = {
  toFeed,
};