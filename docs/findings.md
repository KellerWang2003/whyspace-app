# Findings: decisions from Claude desktop

Fill in after each test: worked, partly, or no, and why. See plan.md for the steps.

| # | Test | Result | Notes |
|---|---|---|---|
| 1 | Plumbing: Claude records a decision when asked, it shows up in the app | Worked | Oct 24, round 1 |
| 2 | Read back: a new chat answers "what did we decide about the home page?" from the app | Worked | Oct 24, round 1 |
| 3 (round 1) | Noticing on its own, in a brand-new chat | No | Claude picked up nothing. A new chat has no project context and the server instructions carried little weight. Led to round 2 |
| 3a | Noticing on its own, tool descriptions only (round 2): loaded context first? recorded ___ of 4, decoy logged? | | |
| 3b | Same, inside a Claude Project with the copied instruction: loaded context first? recorded ___ of 4, decoy logged? | | |
| 4 | Confirm: the app button confirms, Claude then says "confirmed by Keller", and Claude can't confirm on its own | | |
