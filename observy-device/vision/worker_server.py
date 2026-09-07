import tempfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, File
from ultralytics import YOLO

from vision.best_frame import (
    analyze_directory,
    build_json_result,
)

app = FastAPI()

MODEL_PATH = "yolo11n.pt"
model = YOLO(MODEL_PATH)


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "observy-vision",
        "model": MODEL_PATH,
    }


@app.post("/analyze")
async def analyze(
    frames: list[UploadFile] = File(...)
):
    with tempfile.TemporaryDirectory(
        prefix="observy-vision-"
    ) as tmp:
        directory = Path(tmp)

        for index, upload in enumerate(frames):
            suffix = (
                Path(upload.filename or "")
                .suffix.lower()
                or ".jpg"
            )

            output = directory / (
                f"frame-{index + 1:03d}{suffix}"
            )

            output.write_bytes(
                await upload.read()
            )

        analyzed = analyze_directory(
            directory,
            model,
        )

        result = build_json_result(
            analyzed
        )

        # Never return a Mac-local path to Alpha-01.
        if result.get("bestFramePath"):
            result["bestFrameFilename"] = (
                Path(
                    result["bestFramePath"]
                ).name
            )
            result["bestFramePath"] = None

        for frame in result.get(
            "frames",
            []
        ):
            if frame.get("path"):
                frame["filename"] = (
                    Path(
                        frame["path"]
                    ).name
                )
                frame["path"] = None

        return result
