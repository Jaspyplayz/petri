import { defineFeature } from "@/shared/lib/feature-manifest";

export const feedbackManifest = defineFeature({
  id: "feedback",
  title: "Feedback",
  summary: "One sentence on what Feedback does for visitors.",
  routes: ["/feedback"],
  uiLocation: "Describe where Feedback appears on screen in plain English.",
  howToReach: ["Open /feedback"],
  keyboardShortcuts: [],
  selectors: {
    panel: "feedback-panel",
    heading: "feedback-heading",
  },
  flows: {
    smoke: {
      description: "Feedback renders its panel.",
      steps: [
        { action: "goto", path: "/feedback" },
        { action: "expectVisible", target: "panel" },
        { action: "screenshot", name: "feedback-panel" },
      ],
    },
  },
  dataTables: [],
  owners: "agents",
  riskLevel: "low",
});
