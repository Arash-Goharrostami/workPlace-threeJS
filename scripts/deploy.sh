#!/usr/bin/env bash
# Builds the room and syncs `dist/` to the ArvanCloud bucket that serves the site.
#
# Needs the AWS CLI (`brew install awscli`) and the bucket's keys under the `arvan`
# profile in ~/.aws/credentials:
#
#     [arvan]
#     aws_access_key_id = ...
#     aws_secret_access_key = ...
#
# Everything under `assets/` is written by Vite with a content hash in its name, so
# it is cached for a year; the models, textures, audio and fonts are not hashed but
# change rarely, so they get a week; `index.html` and the rest are always revalidated.
# `--delete` removes from the bucket whatever the build no longer produces.
set -euo pipefail
cd "$(dirname "$0")/.."

BUCKET="${ARVAN_BUCKET:-arash-goharrostami-workplace}"
ENDPOINT="${ARVAN_ENDPOINT:-https://s3.ir-thr-at1.arvanstorage.ir}"
PROFILE="${ARVAN_PROFILE:-arvan}"

npm run build

sync() {
  aws s3 sync dist/ "s3://$BUCKET" \
    --profile "$PROFILE" --endpoint-url "$ENDPOINT" \
    --acl public-read --delete --exclude '*.DS_Store' "$@"
}

# Long-lived first, then the rest with the short header — each pass excludes what the
# others own, so a file is only ever uploaded once, with its own header.
sync --exclude '*' --include 'assets/*' \
  --cache-control 'public, max-age=31536000, immutable'
sync --exclude '*' --include 'models/*' --include 'textures/*' --include 'audio/*' \
  --include 'fonts/*' --include 'draco/*' --include 'skillsIcon/*' --include 'icons/*' \
  --cache-control 'public, max-age=604800'
sync --exclude 'assets/*' --exclude 'models/*' --exclude 'textures/*' --exclude 'audio/*' \
  --exclude 'fonts/*' --exclude 'draco/*' --exclude 'skillsIcon/*' --exclude 'icons/*' \
  --cache-control 'public, max-age=0, must-revalidate'

echo "deployed to $BUCKET"
