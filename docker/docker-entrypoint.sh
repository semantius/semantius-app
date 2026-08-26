#!/bin/sh
# Installed into the image as /docker-entrypoint.d/40-gen-config.sh. The official
# nginx image's entrypoint runs every /docker-entrypoint.d/*.sh at container
# start (before launching nginx), so this regenerates the runtime config on each
# boot and we keep nginx's own entrypoint/CMD untouched.
set -eu
gen-config.sh /usr/share/nginx/html/config.js
