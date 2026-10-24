#!/usr/bin/env bash
# The bug: each feed grows the blob by 50% instead of 5%.
set -euo pipefail
sed -i 's/BLOB_GROWTH_PER_FEED = 0.05;/BLOB_GROWTH_PER_FEED = 0.5;/' src/features/blob/lib/blob-state.ts
grep -q 'BLOB_GROWTH_PER_FEED = 0.5;' src/features/blob/lib/blob-state.ts
