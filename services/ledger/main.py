#!/usr/bin/env python3
"""LedgerLocal ledger service entry point — JSON-RPC over stdin/stdout."""

from __future__ import annotations

import json
import sys

from ledger.rpc import RpcServer


def main() -> None:
    server = RpcServer()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            response = server.handle(request)
            print(json.dumps(response), flush=True)
        except json.JSONDecodeError as e:
            error = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32700, "message": f"Parse error: {e}"},
            }
            print(json.dumps(error), flush=True)


if __name__ == "__main__":
    main()
