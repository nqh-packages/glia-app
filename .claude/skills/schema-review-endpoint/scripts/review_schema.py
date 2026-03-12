#!/usr/bin/env python3

import argparse
import json
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def parse_args():
    parser = argparse.ArgumentParser(
        description="Send a JSON schema file to the local Glia schema review endpoint."
    )
    parser.add_argument("schema_path", help="Path to a JSON schema file")
    parser.add_argument(
        "--endpoint",
        default="http://127.0.0.1:3210/schema/review",
        help="Schema review endpoint URL"
    )
    return parser.parse_args()


def main():
    args = parse_args()
    schema_path = Path(args.schema_path)
    schema = json.loads(schema_path.read_text())

    request = Request(
        args.endpoint,
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
