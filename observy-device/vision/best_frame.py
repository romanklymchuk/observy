import argparse
import json
from pathlib import Path

import cv2
from ultralytics import YOLO


IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
}

WEIGHTS = {
    "confidence": 0.4,
    "object_size": 0.2,
    "sharpness": 0.3,
    "border_penalty": 0.1,
}


def calculate_sharpness(image):
    gray = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY,
    )

    laplacian = cv2.Laplacian(
        gray,
        cv2.CV_64F,
    )

    return float(
        laplacian.var()
    )


def calculate_object_size(
    bbox,
    image_width,
    image_height,
):
    x1, y1, x2, y2 = bbox

    bbox_width = max(
        0.0,
        x2 - x1,
    )

    bbox_height = max(
        0.0,
        y2 - y1,
    )

    bbox_area = (
        bbox_width
        * bbox_height
    )

    image_area = (
        image_width
        * image_height
    )

    if image_area <= 0:
        return 0.0

    return min(
        bbox_area / image_area,
        1.0,
    )


def calculate_border_penalty(
    bbox,
    image_width,
    image_height,
):
    x1, y1, x2, y2 = bbox

    margins = [
        x1 / image_width,
        y1 / image_height,
        (image_width - x2)
        / image_width,
        (image_height - y2)
        / image_height,
    ]

    nearest_edge = max(
        0.0,
        min(margins),
    )

    safe_margin = 0.10

    if nearest_edge >= safe_margin:
        return 0.0

    penalty = (
        safe_margin
        - nearest_edge
    ) / safe_margin

    return min(
        max(penalty, 0.0),
        1.0,
    )


def find_best_bird(result):
    best = None

    for box in result.boxes:
        class_id = int(
            box.cls[0]
        )

        name = result.names[
            class_id
        ]

        if name != "bird":
            continue

        confidence = float(
            box.conf[0]
        )

        bbox = [
            float(value)
            for value
            in box.xyxy[0].tolist()
        ]

        candidate = {
            "confidence": confidence,
            "bbox": bbox,
        }

        if (
            best is None
            or confidence
            > best["confidence"]
        ):
            best = candidate

    return best


def normalize_sharpness(frames):
    values = [
        frame["sharpness_raw"]
        for frame in frames
    ]

    minimum = min(values)
    maximum = max(values)

    spread = (
        maximum
        - minimum
    )

    for frame in frames:
        if spread <= 0:
            frame["sharpness"] = 1.0
        else:
            frame["sharpness"] = (
                frame["sharpness_raw"]
                - minimum
            ) / spread


def calculate_final_score(frame):
    score = (
        frame["confidence"]
        * WEIGHTS["confidence"]

        + frame["object_size"]
        * WEIGHTS["object_size"]

        + frame["sharpness"]
        * WEIGHTS["sharpness"]

        - frame["border_penalty"]
        * WEIGHTS["border_penalty"]
    )

    return max(
        0.0,
        min(score, 1.0),
    )


def analyze_directory(
    directory,
    model,
):
    image_paths = sorted(
        path
        for path in directory.iterdir()
        if (
            path.is_file()
            and
            path.suffix.lower()
            in IMAGE_EXTENSIONS
        )
    )

    if not image_paths:
        raise RuntimeError(
            f"No images found in {directory}"
        )

    frames = []

    for image_path in image_paths:
        image = cv2.imread(
            str(image_path)
        )

        if image is None:
            continue

        height, width = (
            image.shape[:2]
        )

        sharpness_raw = (
            calculate_sharpness(
                image
            )
        )

        results = model(
            str(image_path),
            verbose=False,
        )

        result = results[0]

        bird = find_best_bird(
            result
        )

        if bird is None:
            frames.append({
                "path": image_path,
                "bird_detected": False,
                "confidence": 0.0,
                "bbox": None,
                "object_size": 0.0,
                "sharpness_raw":
                    sharpness_raw,
                "sharpness": 0.0,
                "border_penalty": 0.0,
                "final_score": 0.0,
            })

            continue

        bbox = bird["bbox"]

        frames.append({
            "path": image_path,
            "bird_detected": True,
            "confidence":
                bird["confidence"],
            "bbox": bbox,
            "object_size":
                calculate_object_size(
                    bbox,
                    width,
                    height,
                ),
            "sharpness_raw":
                sharpness_raw,
            "sharpness": 0.0,
            "border_penalty":
                calculate_border_penalty(
                    bbox,
                    width,
                    height,
                ),
            "final_score": 0.0,
        })

    if not frames:
        raise RuntimeError(
            "No readable images"
        )

    normalize_sharpness(
        frames
    )

    for frame in frames:
        if not frame[
            "bird_detected"
        ]:
            continue

        frame["final_score"] = (
            calculate_final_score(
                frame
            )
        )

    frames.sort(
        key=lambda frame:
            frame["final_score"],
        reverse=True,
    )

    return frames


def build_json_result(frames):
    detected_frames = [
        frame
        for frame in frames
        if (
            frame["bird_detected"]
            and frame["confidence"] >= 0.60
            and frame["final_score"] >= 0.45
            and frame["border_penalty"] <= 0.80
        )
    ]

    serialized_frames = [
        {
            "path":
                str(frame["path"]),
            "birdDetected":
                frame["bird_detected"],
            "confidence":
                frame["confidence"],
            "objectSize":
                frame["object_size"],
            "sharpness":
                frame["sharpness"],
            "borderPenalty":
                frame["border_penalty"],
            "score":
                frame["final_score"],
        }
        for frame in frames
    ]

    if not detected_frames:
        return {
            "ok": True,
            "birdDetected": False,
            "bestFramePath": None,
            "reason":
                "no_bird_detected",
            "metrics": None,
            "frames":
                serialized_frames,
        }

    best = detected_frames[0]

    return {
        "ok": True,
        "birdDetected": True,
        "bestFramePath":
            str(best["path"]),
        "reason":
            "best_subject",
        "metrics": {
            "confidence":
                best["confidence"],
            "objectSize":
                best["object_size"],
            "sharpness":
                best["sharpness"],
            "borderPenalty":
                best[
                    "border_penalty"
                ],
            "score":
                best["final_score"],
        },
        "frames":
            serialized_frames,
    }


def print_results(frames):
    print()
    print(
        "OBSERVY VISION v0.2"
    )
    print(
        "Best Frame Ranking"
    )
    print("=" * 82)

    print(
        "RK  FRAME                "
        "CONF   SIZE   SHARP  "
        "BORDER  SCORE"
    )

    print("-" * 82)

    for index, frame in enumerate(
        frames,
        start=1,
    ):
        marker = (
            "  <-- BEST"
            if index == 1
            else ""
        )

        if not frame[
            "bird_detected"
        ]:
            print(
                f"{index:02d}  "
                f"{frame['path'].name:<20} "
                f"NO BIRD"
            )
            continue

        print(
            f"{index:02d}  "
            f"{frame['path'].name:<20} "
            f"{frame['confidence']:.3f}  "
            f"{frame['object_size']:.3f}  "
            f"{frame['sharpness']:.3f}  "
            f"{frame['border_penalty']:.3f}   "
            f"{frame['final_score']:.3f}"
            f"{marker}"
        )

    print("=" * 82)

    detected_frames = [
        frame
        for frame in frames
        if frame["bird_detected"]
    ]

    if not detected_frames:
        print(
            "No bird detected in any frame."
        )
        return

    best = detected_frames[0]

    print(
        f"BEST FRAME: "
        f"{best['path'].name}"
    )

    print(
        f"SCORE: "
        f"{best['final_score']:.3f}"
    )

    print(
        f"YOLO CONFIDENCE: "
        f"{best['confidence']:.3f}"
    )

    print(
        f"OBJECT SIZE: "
        f"{best['object_size']:.3f}"
    )

    print(
        f"SHARPNESS: "
        f"{best['sharpness']:.3f}"
    )

    print(
        f"BORDER PENALTY: "
        f"{best['border_penalty']:.3f}"
    )


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Observy Vision v0.2 "
            "Best Frame Scorer"
        )
    )

    parser.add_argument(
        "directory",
        type=Path,
        help=(
            "Directory containing "
            "candidate frames"
        ),
    )

    parser.add_argument(
        "--model",
        default="yolo11n.pt",
        help=(
            "Ultralytics model path "
            "or model name"
        ),
    )

    parser.add_argument(
        "--json",
        action="store_true",
        help=(
            "Output machine-readable "
            "JSON only"
        ),
    )

    args = parser.parse_args()

    directory = (
        args.directory
        .expanduser()
        .resolve()
    )

    if not args.json:
        print(
            "Loading YOLO model..."
        )

    model = YOLO(
        args.model
    )

    if not args.json:
        print(
            f"Analyzing: {directory}"
        )

    frames = analyze_directory(
        directory,
        model,
    )

    if args.json:
        result = build_json_result(
            frames
        )

        print(
            json.dumps(
                result,
                indent=2,
            )
        )

        return

    print_results(
        frames
    )


if __name__ == "__main__":
    main()
