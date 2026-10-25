import { defineFeature } from "@/shared/lib/feature-manifest";

export const timelineManifest = defineFeature({
  id: "timeline",
  title: "Timeline",
  summary: "Blobby's diary: every shipped change and revert, newest first, with a before/after picture for each. The home page shows the newest three beside the creature. The pull request, commit and trust level sit under More about this change.",
  routes: ["/timeline"],
  uiLocation: "On the home page, the right-hand card (under the creature on a narrow screen) is titled 'Blobby's changes' and shows the newest rows with before/after art. The /timeline page repeats that diary in full: the same heading, an 'Evolved N times from visitor ideas' counter, then one card per change (title, before/after pictures, the visitor quote, then a collapsed 'More about this change'). When a change has no screenshot, the picture is a drawn Blobby. Reverts have a red 'Reverted' badge and the line 'This undid a change that hurt Blobby.'",
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
    home: "timeline-home",
    homeHeading: "timeline-home-heading",
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
    home: {
      description: "The home page shows recent changes as diary art beside the creature.",
      steps: [
        { action: "goto", path: "/" },
        { action: "expectVisible", target: "home" },
        { action: "expectText", target: "homeHeading", text: "Blobby's changes" },
        { action: "expectVisible", target: "art" },
        { action: "screenshot", name: "home-diary" },
      ],
    },
  },
  dataTables: ["changelog", "feedback"],
  owners: "agents",
  riskLevel: "medium",
});
