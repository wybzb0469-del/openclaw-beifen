# Skill: nodeseek-checkin

**Description:** Automates daily check-in on NodeSeek (nodeseek.com) to claim "Chicken Legs" (points) and report status.
**Trigger Phrases:**
- "NodeSeek 签到"
- "去鸡腿网签到"
- "nodeseek checkin"
- "run checkin script"

**Usage:**
The agent will automatically execute the check-in logic when triggered. No additional arguments required.

**Dependencies:**
- OpenClaw Browser Tool (`browser` tool must be enabled)
- Network access to `www.nodeseek.com`

**Notes:**
- Requires the user to be logged in to NodeSeek in the browser session managed by OpenClaw.
- Handles "Try Luck" (试试手气) feature automatically.
- Reports: Reward claimed, total points, rank, and any blockers (login/captcha).
