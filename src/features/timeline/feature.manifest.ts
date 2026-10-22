import { defineFeature } from "@/shared/lib/feature-manifest";

export const timelineManifest = defineFeature({
  id: "timeline",
  title: "Timeline",
  summary: "One sentence on what Timeline does for visitors.",
  routes: ["/timeline"],
  uiLocation: "Describe where Timeline appears on screen in plain English.",
  howToReach: ["Open /timeline"],
  keyboardShortcuts: [],
  selectors: {
    panel: "timeline-panel",
    heading: "timeline-heading",
  },
  flows: {
    smoke: {
      description: "Timeline renders its panel.",
      steps: [
        { action: "goto", path: "/timeline" },
        { action: "expectVisible", target: "panel" },
        { action: "screenshot", name: "timeline-panel" },
      ],
    },
  },
  dataTables: [],
  owners: "agents",
  riskLevel: "low",
});
