#!/bin/sh
# Container entrypoint (installed as /usr/local/bin/entrypoint.sh).
#
# The official Caddy image — unlike nginx — has NO /docker-entrypoint.d/*.sh
# hook, so we can't lean on the base image to run gen-config.sh at boot. Instead
# this thin wrapper regenerates the runtime config and then execs Caddy as PID 1
# (exec keeps signal handling / graceful shutdown working).
set -eu

# Regenerate window.__ENV__ from the container environment on every start.
gen-config.sh /srv/config.js

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
