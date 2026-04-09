#!/usr/bin/env python3
import argparse
import json
import sys
import urllib.parse
import urllib.request


def main():
    parser = argparse.ArgumentParser(description="Query a local SoSearch server")
    parser.add_argument("query", help="search query")
    parser.add_argument("--port", type=int, default=18080, help="SoSearch port (default: 18080)")
    parser.add_argument("--num", type=int, default=10, help="max results to print")
    args = parser.parse_args()

    url = f"http://localhost:{args.port}/search?q={urllib.parse.quote(args.query)}"
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            data = json.loads(resp.read().decode())
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e), "url": url}, ensure_ascii=False, indent=2))
        sys.exit(1)

    data["results"] = data.get("results", [])[: args.num]
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
