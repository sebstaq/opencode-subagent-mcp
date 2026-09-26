---
type: llm
---

PASS if the response recommends delegating the test writing to the opencode subagent (the
opencode `agent` tool), because the result is cheap to verify by running the tests.
FAIL if it recommends a native Claude subagent or doing it without delegation.
