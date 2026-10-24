Build this evolution issue.

**Greet the blob by name** (feature: `blob`, risk: low)

As a visitor, I want a friendly line under my blob's name so that it feels alive.

Acceptance criteria:

1. A line under the blob's name says "Say hi to Blobby!" for a new visitor.
   - goto /
   - expectText blob-greeting "Say hi to Blobby!"
   - screenshot greeting
2. After renaming the blob, the line uses the new name.
   - goto /
   - fill blob-name-input "Gloop"
   - click blob-name-save
   - expectText blob-greeting "Say hi to Gloop!"
   - screenshot renamed-greeting
3. Poke and feed still work.
   - goto /
   - click blob-poke-button
   - expectText blob-pokes "1"
   - click blob-feed-button
   - expectText blob-size "105%"
