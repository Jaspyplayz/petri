import { defineFeature } from "@/shared/lib/feature-manifest";

export const timelineManifest = defineFeature({
  id: "timeline",
  title: "Timeline",
  summary: "The public changelog: every shipped change and revert, newest first, with the feedback behind it, PR link, commit, trust level and screenshots.",
  routes: ["/timeline"],
  uiLocation: "The /timeline page: a heading, a 'N changes shipped, 0 written by humans' counter, then a vertical list of change cards. Reverts have a red 'Reverted' badge.",
  howToReach: ["Open /", "Click 'Timeline' in the top navigation (the last of the three links on the right)"],
  keyboardShortcuts: [],
  selectors: {
    panel: "timeline-panel",
    heading: "timeline-heading",
    counter: "timeline-counter",
    list: "timeline-list",
    empty: "timeline-empty",
    entry: "timeline-entry",
    entryTitle: "timeline-entry-title",
    revertBadge: "timeline-revert-badge",
    prLink: "timeline-pr-link",
  },
  flows: {
    browse: {
      description: "The timeline shows the counter and the newest entries.",
      steps: [
        { action: "goto", path: "/timeline" },
        { action: "expectVisible", target: "heading" },
        { action: "expectVisible", target: "counter" },
        { action: "expectVisible", target: "entry" },
        { action: "screenshot", name: "timeline" },
      ],
    },
  },
  dataTables: ["changelog", "feedback"],
  owners: "agents",
  riskLevel: "medium",
});
