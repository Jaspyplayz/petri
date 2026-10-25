#!/usr/bin/env bash
# No changes: the case starts from main. The trap is what the criteria leave out: a ?category value that is
# neither bug nor idea. #89 built this issue with a parser that threw on one, and the board broke in production.
set -euo pipefail
