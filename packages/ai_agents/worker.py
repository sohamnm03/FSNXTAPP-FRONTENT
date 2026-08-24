"""Local desktop subprocess entrypoint for one isolated AI Agents run."""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

from security import ensure_within, redact_text, safe_error, sanitize_data, secret_values


def _redact_artifacts(output_dir: Path, secrets: set[str]) -> None:
    text_suffixes = {".json", ".html", ".txt", ".log", ".md", ".csv"}
    for path in output_dir.rglob("*"):
        if path.is_file() and not path.is_symlink() and path.suffix.lower() in text_suffixes:
            safe = ensure_within(output_dir, path)
            safe.write_text(
                redact_text(safe.read_text(encoding="utf-8", errors="replace"), secrets),
                encoding="utf-8",
            )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--runtime-root", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    package_root = Path(__file__).resolve().parent
    runtime_root = Path(args.runtime_root).resolve()
    output_dir = ensure_within(runtime_root, args.output_dir)
    if output_dir.parent != runtime_root:
        raise ValueError("output_dir must be a direct child of runtime-root")
    output_dir.mkdir(parents=True, exist_ok=True)

    inputs = json.load(sys.stdin)
    secrets = secret_values(inputs)
    try:
        runner_path = ensure_within(package_root, package_root / "runner.py")
        spec = importlib.util.spec_from_file_location("desktop_ai_agents_runner", runner_path)
        if spec is None or spec.loader is None:
            raise RuntimeError("AI Agents runner could not be loaded")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        result = sanitize_data(module.run_package(args.run_id, inputs, str(output_dir)), secrets)
        _redact_artifacts(output_dir, secrets)
        (output_dir / "result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
        return 0
    except BaseException as error:
        message = safe_error(error, secrets)
        _redact_artifacts(output_dir, secrets)
        print(f"AI Agents execution failed: {message}", file=sys.stderr, flush=True)
        (output_dir / "error.json").write_text(
            json.dumps({"status": "failed", "error": message}, indent=2),
            encoding="utf-8",
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
