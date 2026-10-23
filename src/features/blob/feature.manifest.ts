import { defineFeature } from "@/shared/lib/feature-manifest";

export const blobManifest = defineFeature({
  id: "blob",
  title: "Blob",
  summary: "A squishy SVG creature you can poke, feed and name. State lives in the visitor's browser only.",
  routes: ["/"],
  uiLocation: "The home page, centred under the top navigation: the blob's name, the creature, its stats, Poke and Feed buttons, and a rename form.",
  howToReach: ["Open / (from another page, click 'Blob' in the top navigation)"],
  keyboardShortcuts: [],
  selectors: {
    panel: "blob-panel",
    name: "blob-name",
    creature: "blob-creature",
    body: "blob-body",
    eyelid: "blob-eyelid",
    size: "blob-size",
    pokes: "blob-pokes",
    feeds: "blob-feeds",
    pokeButton: "blob-poke-button",
    feedButton: "blob-feed-button",
    nameInput: "blob-name-input",
    nameSave: "blob-name-save",
    nameError: "blob-name-error",
  },
  flows: {
    poke: {
      description: "Poking the blob makes it wobble and counts the poke.",
      steps: [
        { action: "goto", path: "/" },
        { action: "expectVisible", target: "creature" },
        { action: "screenshot", name: "before-poke" },
        { action: "click", target: "pokeButton" },
        { action: "expectText", target: "pokes", text: "1" },
        { action: "screenshot", name: "after-poke" },
      ],
    },
    blink: {
      description: "The blob blinks (eyelids close briefly) every few seconds.",
      steps: [
        { action: "goto", path: "/" },
        { action: "expectVisible", target: "creature" },
        { action: "expectVisible", target: "eyelid" },
        { action: "wait", ms: 4700 },
        { action: "screenshot", name: "during-blink" },
      ],
    },
    feed: {
      description: "Feeding the blob grows it by 5%.",
      steps: [
        { action: "goto", path: "/" },
        { action: "expectText", target: "size", text: "100%" },
        { action: "click", target: "feedButton" },
        { action: "expectText", target: "size", text: "105%" },
        { action: "screenshot", name: "after-feed" },
      ],
    },
    rename: {
      description: "Renaming the blob updates its heading.",
      steps: [
        { action: "goto", path: "/" },
        { action: "fill", target: "nameInput", value: "Gloop" },
        { action: "click", target: "nameSave" },
        { action: "expectText", target: "name", text: "Gloop" },
        { action: "screenshot", name: "after-rename" },
      ],
    },
  },
  dataTables: [],
  owners: "agents",
  riskLevel: "low",
});
