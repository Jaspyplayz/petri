import { defineFeature } from "@/shared/lib/feature-manifest";

export const feedbackManifest = defineFeature({
  id: "feedback",
  title: "Feedback board",
  summary: "Anonymous visitors see ideas and bug reports with their status and votes, sorted by top votes or newest.",
  routes: ["/feedback"],
  uiLocation: "The /feedback page: heading at the top, then the board with Top / Newest sort tabs on the right and one card per item (votes on the left, text, category, status badge and issue/PR links).",
  howToReach: ["Open /", "Click 'Feedback' in the top navigation (middle)"],
  keyboardShortcuts: [],
  selectors: {
    panel: "feedback-panel",
    heading: "feedback-heading",
    list: "feedback-list",
    empty: "feedback-empty",
    item: "feedback-item",
    itemBody: "feedback-item-body",
    itemStatus: "feedback-item-status",
    itemIssueLink: "feedback-item-issue-link",
    itemPrLink: "feedback-item-pr-link",
    voteCount: "feedback-vote-count",
    sortTop: "feedback-sort-top",
    sortNew: "feedback-sort-new",
  },
  flows: {
    browse: {
      description: "The board lists feedback and switches between Top and Newest.",
      steps: [
        { action: "goto", path: "/feedback" },
        { action: "expectVisible", target: "item" },
        { action: "screenshot", name: "board-top" },
        { action: "click", target: "sortNew" },
        { action: "expectVisible", target: "item" },
        { action: "screenshot", name: "board-newest" },
      ],
    },
  },
  dataTables: ["feedback"],
  owners: "agents",
  riskLevel: "medium",
});
