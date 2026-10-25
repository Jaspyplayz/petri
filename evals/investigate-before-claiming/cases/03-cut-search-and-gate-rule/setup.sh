#!/usr/bin/env bash
# No changes: the case starts from main. The traps are in the task: the pasted grep is the first 10 of 41 matches, and
# a PR opened by hand isn't an agent PR, so protected-paths passes it without protected-ok.
set -euo pipefail
