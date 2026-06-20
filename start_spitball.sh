#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_PID=""
DESKTOP_PID=""

stop_processes() {
  if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
    kill "$APP_PID"
  fi

  if [ -n "$DESKTOP_PID" ] && kill -0 "$DESKTOP_PID" 2>/dev/null; then
    kill "$DESKTOP_PID"
  fi
}

cleanup() {
  status=$?
  trap - INT TERM EXIT
  stop_processes
  wait "$APP_PID" 2>/dev/null || true
  wait "$DESKTOP_PID" 2>/dev/null || true
  exit "$status"
}

trap cleanup INT TERM EXIT

printf '%s\n' "Starting Spitball web app..."
(cd "$ROOT_DIR" && npm run dev) &
APP_PID=$!

printf '%s\n' "Starting Spitball desktop app..."
(cd "$ROOT_DIR/desktop" && npm run dev) &
DESKTOP_PID=$!

printf '%s\n' "Spitball dev processes started. Press Ctrl-C to stop both."

while :; do
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    wait "$APP_PID"
    exit $?
  fi

  if ! kill -0 "$DESKTOP_PID" 2>/dev/null; then
    wait "$DESKTOP_PID"
    exit $?
  fi

  sleep 1
done
