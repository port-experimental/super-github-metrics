# Blueprint: githubUser

Purpose
- Stores onboarding metrics per GitHub user (join date, first/tenth commit/PR, timing stats).

Port blueprint identifier
- `githubUser`

Entity identifier example
- GitHub login or existing Port GitHub user identifier (example: `octocat`).

Relations
- `user` -> `_user` (single relation to the Port user).

Populated by
- `onboarding-metrics`

Blueprint definition
```json
{
  "identifier": "githubUser",
  "title": "Github User",
  "icon": "Github",
  "schema": {
    "properties": {
      "email": {
        "title": "Email",
        "type": "string"
      },
      "join_date": {
        "type": "string",
        "title": "Join Date",
        "description": "The date that the user joined our Github Enterprise",
        "format": "date-time"
      },
      "first_commit": {
        "type": "string",
        "title": "First Commit",
        "description": "The date of the user's first commit",
        "format": "date-time"
      },
      "first_pr": {
        "type": "string",
        "title": "First PR",
        "description": "The date of the user's first PR",
        "format": "date-time"
      },
      "tenth_commit": {
        "type": "string",
        "title": "Tenth Commit",
        "description": "The date of the user's tenth commit",
        "format": "date-time"
      },
      "tenth_pr": {
        "type": "string",
        "title": "Tenth PR",
        "description": "The date of the user's tenth PR",
        "format": "date-time"
      }
    },
    "required": []
  },
  "mirrorProperties": {},
  "calculationProperties": {},
  "aggregationProperties": {},
  "relations": {
    "user": {
      "title": "User",
      "target": "_user",
      "required": false,
      "many": false
    }
  }
}
```
