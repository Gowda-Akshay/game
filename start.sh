#!/bin/zsh

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$ROOT_DIR/server"
CLIENT_DIR="$ROOT_DIR/client"

if [ ! -f "$SERVER_DIR/package.json" ] || [ ! -f "$CLIENT_DIR/package.json" ]; then
  echo "Missing client or server package.json"
  exit 1
fi

for PORT in 5173 5001; do
  lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
done

cd "$SERVER_DIR"
npm run dev &
SERVER_PID=$!

cd "$CLIENT_DIR"
npm run dev &
CLIENT_PID=$!

cleanup() {
  kill $SERVER_PID $CLIENT_PID 2>/dev/null || true
}

trap cleanup EXIT INT TERM

wait $SERVER_PID $CLIENT_PID
