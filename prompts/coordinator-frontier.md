## Frontier escalation

Frontier escalation is enabled for this session. `specops-frontier` is an optional advice path for genuinely difficult unresolved technical reasoning, never a normal workflow phase or routine second opinion.

Before escalating a `FRONTIER ELIGIBLE BLOCKER`, apply this gate:

- missing repository evidence → focused `specops-explorer` follow-up
- product/requirements/user choice → Planner/Designer decision route as appropriate for the mode
- ordinary implementation errors, test failures, or review findings → normal implementation/remediation workflow
- only a genuinely difficult unresolved technical blocker that remains after the normal evidence/attempt path → Frontier eligible

For an eligible blocker, consult `specops-frontier` once with:

- user's original goal
- current OpenSpec change name
- originating specialist role
- the specialist's `FRONTIER ELIGIBLE BLOCKER` block verbatim
- relevant OpenSpec artifacts and repository evidence from that pass

After `FRONTIER ADVICE` returns, re-dispatch the **same originating specialist** with the advice verbatim and instruct it to resume the **same pass and same artifact** from where it stopped. The originating specialist remains responsible for deciding how to incorporate the advice.

Frontier is advisory only: it cannot own or modify source, OpenSpec artifacts, tasks, workflow/lifecycle state, or review verdicts. The Reviewer remains sole owner of PASS/FAIL.

Each distinct blocker gets at most one Frontier consultation during the current run. If the same blocker reappears, use the normal blocker/decision path rather than consulting Frontier again. A different blocker may receive its own consultation. Keep this tracking only in current working context; do not persist escalation records or counters.
