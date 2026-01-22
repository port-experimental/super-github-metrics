# PR size over time (Unconfirmed)
Shows trends of the sizes of PRs over time

## Prerequisites
- Scripts: [PR metrics](../workflows/pr-metrics.md)

## Steps
- Create a widget, "Line chart"
- Chart type: Aggregate Property (All Entities)
- Blueprint: Pull request
- Y axis:
  - Title: Size
  - Function: Sum
  - Properties: PR Size
- X axis:
  - Title: Time
  - Measure time by: updatedAt
  - Time interval: Month
  - Time range: In the past 180 days