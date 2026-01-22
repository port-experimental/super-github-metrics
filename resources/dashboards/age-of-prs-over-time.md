# Age of PRs over time (Unconfirmed)
Actual age of the pull request from when it was created to when it was merged/closed

## Steps
- Create a widget and select "Line chart"
- Chart type: Aggregate Property (All Entities)
- Blueprint: Pull Request
- Y Axis
  - Title: Size
  - Function: median
  - Properties: PR Lifetime (or Age)
- X Axis
  - Title: Time
  - Measure time by: updatedAt
  - Time interval: Month
  - Time range: In the past 180 days