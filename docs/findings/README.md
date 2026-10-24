# Findings

Defects worth explaining rather than just fixing.

A bug earns a file here when the way it was found generalises — when the
technique that caught it would catch a class of problem, not just this one. A
typo does not qualify. Two components disagreeing about who is permitted to do
what does.

Each entry states what the design was, what went wrong, why the existing tests
could not see it, what did catch it, which side was actually wrong, and what it
would have cost. The last section is the point: the general lesson, written so
it is usable on the next step rather than only readable about the last one.

| # | Finding | Step | Class |
| :-- | :-- | :-- | :-- |
| [01](01-state-machine-divergence.md) | Two components disagreeing about who may do what | 11 | Authorization correctness |

## Related, recorded elsewhere

Not every defect needs its own file. These are written up where they happened:

| Defect | Where | Why it is not here |
| :-- | :-- | :-- |
| Three seam bugs behind a green suite (CSRF cookie `path`, the nginx websocket upgrade, a stale container volume) | step 11 §6, and `scripts/smoke/smoke.mjs` | The lesson became a script, which is a better home for it than prose |
| Arabic set in a Latin monospace face | step 09 §4.3 | One wrong font variable; the fix is the explanation |
| An inverted RTL dashboard from hand-mirroring a grid | step 09 §4.1 | Same |
| A palette "accessibility" check that was itself wrong | step 09 §3.1 | Same |
