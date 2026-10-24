Build this evolution issue.

**Confetti when the blob is fed** (feature: `blob`, risk: low)

As a visitor, I want confetti to burst out when I feed my blob, using the `canvas-confetti` package, so that feeding feels like a celebration.

Acceptance criteria:

1. Clicking Feed shows confetti over the blob.
   - goto /
   - click blob-feed-button
   - expectVisible blob-confetti
   - screenshot confetti
2. Feeding still grows the blob.
   - goto /
   - click blob-feed-button
   - expectText blob-size "105%"
