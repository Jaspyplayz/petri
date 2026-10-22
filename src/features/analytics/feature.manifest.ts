import { defineFeature } from "@/shared/lib/feature-manifest";

export const analyticsManifest = defineFeature({
  id: "analytics",
  title: "Analytics",
  summary: "One sentence on what Analytics does for visitors.",
  routes: ["/analytics"],
  uiLocation: "Describe where Analytics appears on screen in plain English.",
  howToReach: ["Open /analytics"],
  keyboardShortcuts: [],
  selectors: {
    panel: "analytics-panel",
    heading: "analytics-heading",
  },
  flows: {
    smoke: {
      description: "Analytics renders its panel.",
      steps: [
        { action: "goto", path: "/analytics" },
        { action: "expectVisible", target: "panel" },
        { action: "screenshot", name: "analytics-panel" },
      ],
    },
  },
  dataTables: [],
  owners: "agents",
  riskLevel: "low",
});
