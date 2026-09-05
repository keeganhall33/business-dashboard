# Business Value Execution Contract

## Purpose

Jeeves exists to improve Keegan's decisions and business outcomes, not to maximize agent activity, issue throughput, code volume, or dashboard surface area.

Every newly authored Orchestration V4 task uses `BUSINESS_VALUE_V2`. Existing admitted and queued V1 tasks remain valid so a governance upgrade cannot strand live work.

## Required task fields

Every V2 task declares:

- **Business outcome:** the observable state the task must create or improve.
- **Business reason:** the decision, revenue, time, risk, relationship, or customer experience it supports.
- **Success metric:** a measurable threshold or binary outcome.
- **Proof required:** evidence produced or inspected in the current run.
- **Verification owner:** `INDEPENDENT`; the implementer cannot certify its own work.

Technical acceptance criteria remain mandatory. These fields connect those criteria to the reason the work deserves capacity.

## Execution rules

1. Prefer the smallest complete change that advances the business outcome.
2. Do not substitute a plausible explanation, code volume, or passing unrelated tests for the specified proof.
3. Routine implementation may proceed autonomously within declared ownership and safety constraints.
4. Consequential or irreversible actions still require their existing approval gate.
5. Independent verification inspects the actual diff, current evidence, and exact head. A worker summary is an untrusted claim.
6. Missing or inconclusive evidence is `NOT_PROVEN`, never `PASS`.

## Prioritization

Capacity should favor work with the strongest combination of:

- expected revenue or strategic upside;
- urgency or opportunity decay;
- confidence supported by evidence;
- reduction of material risk or recurring manual effort;
- leverage across multiple future decisions;
- reasonable effort and reversibility.

Priority labels alone never override dependencies, ownership conflicts, safety gates, or evidence quality.

## Completion

A V2 task is ready for final approval only when:

- its technical acceptance criteria pass;
- its declared proof exists and is current;
- the success metric is satisfied or explicitly reported as not proven;
- changed files remain inside ownership;
- exact-head CI is green where required;
- an independent verifier approves the exact head; and
- unresolved review threads are zero.

Real-world results should flow into outcome memory so future prioritization can learn from measured impact rather than predicted value alone.
