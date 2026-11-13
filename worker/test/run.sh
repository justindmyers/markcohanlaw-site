#!/usr/bin/env bash
# Starts a fake SMTP server and three local Worker instances, runs the tests, then tears everything down.
set -u
cd "$(dirname "$0")/.."
export WRANGLER_SEND_METRICS=false
PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done; wait 2>/dev/null; }
trap cleanup EXIT
rm -rf /tmp/wr1 /tmp/wr2 /tmp/wr3

node test/smtp-sink.mjs > /tmp/sink.log 2>&1 & PIDS+=($!)
npx wrangler dev --local --port 8787 --inspector-port 9230 --persist-to /tmp/wr1 > /tmp/w1.log 2>&1 & PIDS+=($!)
npx wrangler dev --local --port 8788 --inspector-port 9231 --persist-to /tmp/wr2 --var TURNSTILE_SECRET:2x0000000000000000000000000000000AA > /tmp/w2.log 2>&1 & PIDS+=($!)
npx wrangler dev --local --port 8789 --inspector-port 9232 --persist-to /tmp/wr3 --var SMTP_PASS:wrong > /tmp/w3.log 2>&1 & PIDS+=($!)

for port in 8787 8788 8789 2526; do
  for i in $(seq 1 60); do
    curl -s -o /dev/null "http://127.0.0.1:$port/" && break
    sleep 1
  done
done
node --test test/contact.test.mjs
