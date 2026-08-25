Remediation carries the complete Reviewer FAIL findings verbatim — every `F1..Fn`; do not summarize, paraphrase, renumber, or drop findings.

After remediation implementation completes, run the complete critic fan-out again under `## Review phase`, then re-dispatch `specops-reviewer` with the new reports, the remediation summary, the prior findings verbatim, and an explicit re-review instruction.
