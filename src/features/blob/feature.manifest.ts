import { defineFeature } from "@/shared/lib/feature-manifest";

export const blobManifest = defineFeature({
  id: "blob",
  title: "Blob",
  summary: "One sentence on what Blob does for visitors.",
  routes: ["/"],
  uiLocation: "Describe where Blob appears on screen in plain English.",
  howToReach: ["Open /"],
  keyboardShortcuts: [],
  selectors: {
    panel: "blob-panel",
    heading: "blob-heading",
  },
  flows: {
    smoke: {
      description: "Blob renders its panel.",
      steps: [
        { action: "goto", path: "/" },
        { action: "expectVisible", target: "panel" },
        { action: "screenshot", name: "blob-panel" },
      ],
    },
  },
  dataTables: [],
  owners: "agents",
  riskLevel: "low",
});
