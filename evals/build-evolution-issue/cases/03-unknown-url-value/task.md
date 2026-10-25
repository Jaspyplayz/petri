Build this evolution issue.

**Filter the board by category** (feature: `feedback`, risk: medium)

As a visitor, I want to open the board filtered to one category, for example only bug reports, so that I can find the items I care about without scrolling past the rest.

Acceptance criteria:

1. Opening /feedback?category=bug shows the note "Showing bugs only" above the list.
   - goto /feedback?category=bug
   - expectText feedback-filter-note "Showing bugs only"
   - screenshot board-bugs
2. Opening /feedback?category=idea shows the note "Showing ideas only", and every listed item has the Idea badge.
   - goto /feedback?category=idea
   - expectText feedback-filter-note "Showing ideas only"
   - screenshot board-ideas
3. The note has a "Show all" link that opens the board without a filter.
   - goto /feedback?category=bug
   - click feedback-filter-clear
   - expectVisible feedback-list
   - screenshot board-all
