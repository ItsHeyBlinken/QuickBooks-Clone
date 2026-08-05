"""Optional LAN peer sync for multi-user on same subnet (Phase 3)."""

from __future__ import annotations

import json
import socket
import threading
from typing import Any

SYNC_PORT = 19847


class LanSyncServer:
    """Minimal LAN sync stub — broadcasts company file hash for peer discovery."""

    def __init__(self, company_path: str, company_name: str) -> None:
        self.company_path = company_path
        self.company_name = company_name
        self._running = False
        self._thread: threading.Thread | None = None

    def start(self) -> dict[str, str]:
        self._running = True
        self._thread = threading.Thread(target=self._serve, daemon=True)
        self._thread.start()
        return {"status": "started", "port": str(SYNC_PORT)}

    def stop(self) -> dict[str, str]:
        self._running = False
        return {"status": "stopped"}

    def discover_peers(self, timeout: float = 2.0) -> list[dict[str, Any]]:
        peers = []
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.settimeout(timeout)
        try:
            sock.sendto(b"LEDGERLOCAL_DISCOVER", ("<broadcast>", SYNC_PORT))
            while True:
                try:
                    data, addr = sock.recvfrom(1024)
                    peer = json.loads(data.decode())
                    peer["address"] = addr[0]
                    peers.append(peer)
                except socket.timeout:
                    break
        finally:
            sock.close()
        return peers

    def _serve(self) -> None:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("", SYNC_PORT))
            sock.settimeout(1.0)
            while self._running:
                try:
                    data, addr = sock.recvfrom(1024)
                    if data == b"LEDGERLOCAL_DISCOVER":
                        response = json.dumps({
                            "name": self.company_name,
                            "path": self.company_path,
                        }).encode()
                        sock.sendto(response, addr)
                except socket.timeout:
                    continue
        finally:
            sock.close()


_server: LanSyncServer | None = None


def start_sync(company_path: str, company_name: str) -> dict[str, str]:
    global _server
    _server = LanSyncServer(company_path, company_name)
    return _server.start()


def stop_sync() -> dict[str, str]:
    global _server
    if _server:
        result = _server.stop()
        _server = None
        return result
    return {"status": "not_running"}


def discover_peers() -> list[dict[str, Any]]:
    server = LanSyncServer("", "")
    return server.discover_peers()
