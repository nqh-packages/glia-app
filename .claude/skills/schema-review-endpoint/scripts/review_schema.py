#!/usr/bin/env python3

import argparse
import json
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def parse_env_file(path: Path):
    values = {}
    if not path.exists():
        return values

    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()

    return values


def default_endpoint_from_env(env_file: Path):
    env = parse_env_file(env_file)
    site_url = env.get("VITE_CONVEX_SITE_URL", "").rstrip("/")
    if site_url:
        return f"{site_url}/schema/review"
    return "http://127.0.0.1:3210/schema/review"


def parse_args():
    project_root = Path(__file__).resolve().parents[4]
    default_env_file = project_root / ".env.local"

    parser = argparse.ArgumentParser(
        description="Send a JSON schema file to the Glia schema review endpoint."
    )
    parser.add_argument("schema_path", help="Path to a JSON schema file")
    parser.add_argument(
        "--env-file",
        default=str(default_env_file),
        help="Path to a .env-style file used to discover VITE_CONVEX_SITE_URL"
    )
    parser.add_argument(
        "--endpoint",
        default=None,
        help="Schema review endpoint URL. Defaults to VITE_CONVEX_SITE_URL/schema/review when available."
    )
    return parser.parse_args()


def main():
    args = parse_args()
    schema_path = Path(args.schema_path)
    schema = json.loads(schema_path.read_text())
    endpoint = args.endpoint or default_endpoint_from_env(Path(args.env_file))

    request = Request(
        endpoint,
        data=json.dumps({"schema": schema}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
      with urlopen(request) as response:
        payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
      body = exc.read().decode("utf-8", errors="replace")
      print(body, file=sys.stderr)
      raise SystemExit(exc.code) from exc
    except URLError as exc:
      print(f"Failed to reach endpoint: {exc.reason}", file=sys.stderr)
      raise SystemExit(1) from exc

    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
