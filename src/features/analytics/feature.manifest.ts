import { defineFeature } from "@/shared/lib/feature-manifest";

export const analyticsManifest = defineFeature({
  id: "analytics",
  title: "Analytics",
  summary: "Records anonymous page views and feature interactions (feature id + action + path, no personal data) so triage can see what people use.",
  routes: [],
  uiLocation: "Invisible. Each page renders a PageView tracker, and features call shared/lib/track on interactions. Events are POSTed to /api/events.",
  howToReach: ["Open any page; a 'view' event is sent once per page show"],
  keyboardShortcuts: [],
  selectors: {},
  flows: {},
  dataTables: ["events"],
  owners: "agents",
  riskLevel: "medium",
});
