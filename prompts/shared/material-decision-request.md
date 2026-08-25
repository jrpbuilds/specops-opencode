When escalation is required, stop before baking an assumption into the dispatched artifact and preserve completed work. Return exactly one decision request and nothing else:

```
USER DECISION REQUIRED

Decision: <one clear question>

Why it matters: <why work cannot safely continue without resolving this>

Options:
A. <option>
   <trade-off>
B. <option>
   <trade-off>
[C. <option>
   <trade-off>]
[D. <option>
   <trade-off>]

Recommendation: <option label + one-line reason, or omit if no recommendation is appropriate>

Affected artifact: <dispatched artifact outputPath>
```

Provide 2–4 materially distinct options and one trade-off for each. When you include a Recommendation, put the recommended option first in `Options`; otherwise keep ordering neutral. Do not ask the coordinator to generate, merge, remove, or rank options. Do not guess and continue.

When the selected answer returns, resume the **same pass** and same artifact from where you stopped, preserving completed work. Record only the resolved consequence in the artifact. Do not persist the question or answer elsewhere. If another blocking decision appears, return a new USER DECISION REQUIRED request containing exactly one decision; never batch decisions.
