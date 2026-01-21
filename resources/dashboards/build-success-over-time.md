# Build success over time (Unconfirmed)
This shows the trends of build successes for github workflows over time

## Steps
- Create a widget and select "Line chart"
- Under "Chart type" select, "Aggregate Property (All Entities)
- Blueprint: "Workflow" (Github workflow)
- Y-axis:
  - Function: Average
  - Properties: Success Rate Last 30 days
- X-axis:
  - Measure time by: `createdAt`
  - Time interval: `Week`
  - Time range: In the past 30 days