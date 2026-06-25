#!/bin/bash

# Find the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE}")" && pwd)"

MANIFEST="$SCRIPT_DIR/src/manifest.json"
UPDATES_FILE="$SCRIPT_DIR/updates.json"

# make sure jq is available
if ! command -v jq &>/dev/null; then
  echo "Error: 'jq' utility is not installed on this machine."
  exit 1
fi

# optional syntax check if bun is available
if command -v bun &>/dev/null; then
  echo "Checking JavaScript syntax with Bun..."
  if ! bun build "$SCRIPT_DIR/src/popup.js" >/dev/null; then
    echo "Error: JavaScript syntax check failed."
    exit 1
  fi
fi

VERSION=$(jq -r '.version' "$MANIFEST")
# handles Firefox ID locations whether it is at the root level, inside applications, or browser_specific_settings
EXTENSION_ID=$(jq -r '.id // .browser_specific_settings.gecko.id // .applications.gecko.id // empty' "$MANIFEST")

# validate
if [ "$VERSION" == "null" ] || [ -z "$VERSION" ]; then
  echo "Error: Version not found in manifest.json"
  exit 1
fi
if [ -z "$EXTENSION_ID" ]; then
  echo "Error: Extension ID not found in manifest.json"
  exit 1
fi

TAG="v${VERSION}"
ZIP_NAME="WE-clipper-${TAG}.zip"

# make a versioned ZIP file
cd "$SCRIPT_DIR/src" && zip -r "../${ZIP_NAME}" * -x "*.DS_Store"
cd "$SCRIPT_DIR"

REPO_URL="WikiEducator/WE-clipper"

# GitHub Release direct download URL
UPDATE_LINK="https://github.com/${REPO_URL}/releases/download/${TAG}/WE-clipper-${TAG}.xpi"

# 4. Overwrite updates.json with the calculated asset link
cat <<EOF >"$UPDATES_FILE"
{
  "addons": {
    "${EXTENSION_ID}": {
      "updates": [
        {
          "version": "${VERSION}",
          "update_link": "${UPDATE_LINK}"
        }
      ]
    }
  }
}
EOF

echo "Build complete!"
echo "  Created: ${ZIP_NAME}"
echo "  Updated: updates.json (pointing to GitHub Release ${TAG})"
