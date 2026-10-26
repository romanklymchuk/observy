const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const test = require("node:test");
const Module = require("node:module");

const root = path.resolve(__dirname, "..");

test("uploadEvent accepts photo without audio", async () => {
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "observy-s3d-")
  );
  const photo = path.join(temp, "frame.jpg");
  fs.writeFileSync(photo, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const axiosPath = require.resolve("axios");
  const uploadPath = path.join(
    root, "src/services/upload.service.js"
  );

  const axios = require("axios");
  const originalPost = axios.post;

  try {
    axios.post = async (_url, form) => {
      const payload = await new Promise((resolve, reject) => {
        const chunks = [];

        form.on("data", chunk => {
          chunks.push(
            Buffer.isBuffer(chunk)
              ? chunk
              : Buffer.from(chunk)
          );
        });

        form.on("error", reject);
        form.on("end", () => {
          resolve(Buffer.concat(chunks).toString("latin1"));
        });

        form.resume();
      });
      assert.match(payload, /name="photo"/);
      assert.doesNotMatch(payload, /name="audio"/);
      return { data: { id: "s3d-photo-only" } };
    };

    delete require.cache[require.resolve(uploadPath)];
    const { uploadEvent } = require(uploadPath);

    const result = await uploadEvent({
      apiUrl: "http://localhost:4000",
      stationId: "observy-test",
      photoPath: photo,
      audioPath: undefined,
      temperature: 20,
      humidity: 50,
    });

    assert.equal(result.id, "s3d-photo-only");
  } finally {
    axios.post = originalPost;
    delete require.cache[require.resolve(uploadPath)];
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("uploadEvent rejects observation without media", async () => {
  const { uploadEvent } = require(
    "../src/services/upload.service.js"
  );

  await assert.rejects(
    uploadEvent({
      apiUrl: "http://localhost:4000",
      stationId: "observy-test",
    }),
    /without photo or audio/
  );
});
