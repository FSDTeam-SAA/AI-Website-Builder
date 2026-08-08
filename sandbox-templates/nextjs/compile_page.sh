#!/bin/bash
# Sandbox entrypoint. Starts the Next dev server and warms the "/" route so the
# first preview isn't a cold compile.
#
# To fall back from Turbopack to webpack (the escape hatch if the source-location
# loader misbehaves under Turbopack), set VIBE_TURBOPACK=0.

function ping_server() {
  local counter=0
  local response
  response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000")
  while [[ ${response} -ne 200 ]]; do
    counter=$((counter + 1))
    # The original slept only every 20th iteration, which made this a
    # near-continuous curl loop competing with the compile it was waiting for.
    sleep 0.25
    if ((counter % 40 == 0)); then
      echo "Waiting for server to start..."
    fi
    if ((counter > 1200)); then
      echo "Server did not start within 5 minutes."
      return 1
    fi
    response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000")
  done
  echo "Server is up."
}

ping_server &

cd /home/user || exit 1

# The app overrides this for static projects; the manager restarts the correct
# process on boot either way.
if [[ -n "${VIBE_START_COMMAND}" ]]; then
  exec ${VIBE_START_COMMAND}
elif [[ "${VIBE_TURBOPACK}" == "0" ]]; then
  exec npx next dev
else
  exec npx next dev --turbopack
fi
