#!/usr/bin/env bash
# The break: the Feed button's data-testid was renamed in the component, but not in the manifest or the map.
set -euo pipefail
sed -i 's/data-testid="blob-feed-button"/data-testid="blob-snack-button"/' src/features/blob/components/blob-creature.tsx
grep -q 'data-testid="blob-snack-button"' src/features/blob/components/blob-creature.tsx
