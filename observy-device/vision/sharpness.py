import argparse
from pathlib import Path

import cv2


def calculate_sharpness(image_path: Path) -> float:
    image = cv2.imread(str(image_path))

    if image is None:
        raise RuntimeError(
            f"Could not read image: {image_path}"
        )

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


def analyze_directory(directory: Path):
    extensions = {
        ".jpg",
        ".jpeg",
        ".png",
    }

    images = sorted(
        path
        for path in directory.iterdir()
        if path.suffix.lower() in extensions
    )

    if not images:
        raise RuntimeError(
            f"No images found in {directory}"
        )

    results = []

    for image_path in images:
        score = calculate_sharpness(
            image_path
        )

        results.append({
            "path": image_path,
            "score": score,
        })

    results.sort(
        key=lambda item: item["score"],
        reverse=True,
    )

    return results


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Observy Vision v0.1 "
            "Sharpness Analyzer"
        )
    )

    parser.add_argument(
        "directory",
        type=Path,
        help="Directory containing image frames",
    )

    args = parser.parse_args()

    directory = args.directory.expanduser()

    results = analyze_directory(
        directory
    )

    best = results[0]

    print()
    print("OBSERVY VISION v0.1")
    print("Sharpness ranking")
    print("=" * 48)

    for index, result in enumerate(
        results,
        start=1,
    ):
        marker = (
            "  <-- BEST"
            if index == 1
            else ""
        )

        print(
            f"{index:02d}. "
            f"{result['path'].name:<20} "
            f"{result['score']:10.2f}"
            f"{marker}"
        )

    print("=" * 48)

    print(
        f"BEST FRAME: "
        f"{best['path'].name}"
    )

    print(
        f"SHARPNESS: "
        f"{best['score']:.2f}"
    )


if __name__ == "__main__":
    main()
