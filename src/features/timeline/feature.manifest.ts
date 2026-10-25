import { defineFeature } from "@/shared/lib/feature-manifest";

export const timelineManifest = defineFeature({
  id: "timeline",
  title: "Timeline",
  summary: "Blobby's diary: every shipped change and revert, newest first. The title, before/after pictures and the visitor's words come first. The pull request, commit and trust level sit under More about this change.",
  routes: ["/timeline"],
  uiLocation: "The /timeline page: a heading 'Blobby's changes', an 'Evolved N times from visitor ideas' counter, then a vertical list of diary cards (plain-English title, before/after pictures, the visitor quote, then a collapsed 'More about this change' with the longer note, PR, commit and trust level). Reverts have a red 'Reverted' badge and the line 'This undid a change that hurt Blobby.'",
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
    revertNote: "timeline-revert-note",
    art: "timeline-art",
    prLink: "timeline-pr-link",
  },
  flows: {
    browse: {
      description: "The timeline shows the counter and the newest entries.",
      steps: [
        { action: "goto", path: "/timeline" },
        { action: "expectText", target: "heading", text: "Blobby's changes" },
        { action: "expectText", target: "counter", text: "from visitor ideas" },
        { action: "expectVisible", target: "entry" },
        { action: "expectVisible", target: "art" },
        { action: "screenshot", name: "timeline" },
      ],
    },
  },
  dataTables: ["changelog", "feedback"],
  owners: "agents",
  riskLevel: "medium",
});
