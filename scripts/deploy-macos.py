#!/usr/bin/env python3
"""Install the prepared local app as a per-user macOS launchd service."""
import argparse
import os
from pathlib import Path
import plistlib
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
LABEL = "local.gestspeak.api"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["install", "status", "restart", "uninstall"])
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("Этот скрипт предназначен для macOS; для Linux используйте compose.yaml.")
    domain = f"gui/{os.getuid()}"
    service = f"{domain}/{LABEL}"
    destination = Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"

    def launch(*arguments, required=True):
        result = subprocess.run(["/bin/launchctl", *arguments], capture_output=True, text=True)
        if required and result.returncode:
            raise RuntimeError(result.stderr.strip() or "Не удалось управлять службой launchd")
        return result

    def listening():
        with socket.socket() as probe:
            probe.settimeout(.3)
            return probe.connect_ex(("127.0.0.1", 8000)) == 0

    if args.action == "status":
        result = launch("print", service, required=False)
        if result.returncode:
            print("Служба не установлена. Выполните install после scripts/setup.sh.")
            return 1
        for line in result.stdout.splitlines():
            if line.strip().startswith(("state =", "pid =", "last exit code =")):
                print(line.strip())
        print("Адрес: http://127.0.0.1:8000")
        return 0

    if args.action == "uninstall":
        launch("bootout", service, required=False)
        destination.unlink(missing_ok=True)
        print("Автозапуск удалён. Протоколы, записи и модели сохранены.")
        return 0

    if args.action == "install":
        if not (ROOT / ".venv/bin/python").is_file():
            raise RuntimeError("Сначала выполните bash scripts/setup.sh.")
        if not any((ROOT / p).is_file() for p in ["frontend/out/index.html", "frontend/dist/client/index.html"]):
            raise RuntimeError("Сначала соберите интерфейс: bash scripts/setup.sh.")
        if not launch("print", service, required=False).returncode:
            launch("bootout", service)
            for _ in range(30):
                if not listening():
                    break
                time.sleep(.2)
        if listening():
            raise RuntimeError("Порт 8000 уже занят. Остановите текущий ручной запуск и повторите install.")
        logs = ROOT / "data/logs"
        logs.mkdir(parents=True, exist_ok=True, mode=0o700)
        destination.parent.mkdir(parents=True, exist_ok=True)
        config = {
            "Label": LABEL,
            "ProgramArguments": ["/bin/bash", str(ROOT / "scripts/start-local.sh")],
            "WorkingDirectory": str(ROOT),
            "RunAtLoad": True,
            "KeepAlive": True,
            "ThrottleInterval": 10,
            "EnvironmentVariables": {"PYTHONUNBUFFERED": "1", "PATH": "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"},
            "StandardOutPath": str(logs / "server.stdout.log"),
            "StandardErrorPath": str(logs / "server.stderr.log"),
        }
        temporary = destination.with_suffix(".tmp")
        with temporary.open("wb") as out:
            plistlib.dump(config, out)
        temporary.chmod(0o600)
        temporary.replace(destination)
        launch("enable", service)
        launch("bootstrap", domain, str(destination))
    else:
        launch("kickstart", "-k", service)

    for _ in range(40):
        try:
            with urllib.request.urlopen("http://127.0.0.1:8000/", timeout=2) as response:
                if response.status == 200:
                    print("GestSpeak работает: http://127.0.0.1:8000")
                    print("Автозапуск при входе в macOS; логи: data/logs/.")
                    return 0
        except OSError:
            time.sleep(.5)
    raise RuntimeError("Служба установлена, но ещё не отвечает. Проверьте data/logs/server.stderr.log.")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
