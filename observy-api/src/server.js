const { classifyImage } = require("./ai/classifier");
const express = require("express");
const station = require("./config/station");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { toFeed } = require("./services/feedService");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4000;

const DB_PATH = path.join(__dirname, "../data/events.json");

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

fs.mkdirSync(path.join(__dirname, "../data"), { recursive: true });
fs.mkdirSync(path.join(__dirname, "../uploads/photos"), { recursive: true });
fs.mkdirSync(path.join(__dirname, "../uploads/audio"), { recursive: true });

function readEvents() {
  if (!fs.existsSync(DB_PATH)) return [];
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeEvents(events) {
  fs.writeFileSync(DB_PATH, JSON.stringify(events, null, 2));
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "photo") cb(null, "uploads/photos");
    else if (file.fieldname === "audio") cb(null, "uploads/audio");
    else cb(null, "uploads");
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${uuidv4()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "observy-api" });
});

app.post("/stations", (req, res) => {
  res.status(201).json({
    id: station.id,
    name: req.body.name || station.name,
    locationName: req.body.locationName || station.locationName,
  });
});

app.post(
  "/events",
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "audio", maxCount: 1 },
  ]),
  async (req, res) => {
    const photoFile = req.files?.photo?.[0];
    const audioFile = req.files?.audio?.[0];

    const ai = photoFile
      ? await classifyImage(photoFile.path)
      : {
          species: "Unknown Visitor",
          confidence: null,
        };

    const event = {
      id: uuidv4(),
      species: ai.species,
      confidence: ai.confidence,
      scientific_name: ai.scientificName,
      family: ai.family,
      station_id: req.body.station_id || station.id,
      captured_at: req.body.captured_at || new Date().toISOString(),
      temperature: req.body.temperature ? Number(req.body.temperature) : null,
      humidity: req.body.humidity ? Number(req.body.humidity) : null,
      photo_url: photoFile ? `/uploads/photos/${photoFile.filename}` : null,
      audio_url: audioFile ? `/uploads/audio/${audioFile.filename}` : null,
      created_at: new Date().toISOString(),
    };

    const events = readEvents();
    events.unshift(event);
    writeEvents(events);

    res.status(201).json(event);
  }
);
app.get("/events", (req, res) => {
  res.json(readEvents());
});
app.get("/feed", (req, res) => {
  const events = readEvents();
  res.json(toFeed(events));
});
app.listen(PORT, () => {
  console.log(`Observy API running on http://localhost:${PORT}`);
});