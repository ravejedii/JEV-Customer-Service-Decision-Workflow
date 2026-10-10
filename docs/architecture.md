# Architecture

The product question is who is allowed to decide. A chat model is good at a short reply and bad at being the policy. This repo keeps those jobs in different modules so a reviewer can read the policy without reading a prompt.

## Who does what

| Module | Owns | Does not own |
| --- | --- | --- |
| `jev/triage.ts` | Typed judgments: department, frustration, urgency | Prose, routing |
| `workflow/route.ts` | `person` or `auto_reply`, and the reason string | Wording of the reply |
| `reply/prompt.ts` + `reply/nvidia.ts` | A handoff note or a customer draft, inside the route it was given | Whether to escalate |
| `jev/check.ts` | Probability the draft promises money, a deadline, or an unverified fix | The decision to send. Holding the draft is still application code (`probability >= threshold`) |

Jev is called at most twice. The first call classifies the customer. The second runs only after an auto reply exists. A handoff skips it: there is no customer-facing draft to police.

Three classification questions go out in one `systemOne` call. Splitting them would triple latency and could disagree with itself across calls.

## Fail closed

`decideRoute` escalates when it cannot trust the scores:

- urgency or frustration is not finite
- urgency is outside 0–1
- frustration is outside 0–2

Urgency is evaluated before frustration. When both cuts are crossed, the reason names urgency, because that rule fired first. The tests lock this so a "small cleanup" cannot silently swap the priority.

`readDepartment` accepts only `billing`, `technical`, and `sales`. A new label from the model becomes HTTP 502. The writer is never asked to improvise a team.

## Writer contract

`draftPrompt` receives the department and both scores as facts and tells the model not to reclassify. The customer message is a separate user turn, described as untrusted data.

The two routes differ on purpose:

- `person` — internal note, not addressed to the customer, says what to verify
- `auto_reply` — short customer reply, at most one question, no refund, credit, date, or fix

`reply/prompt.test.ts` checks those constraints without calling NVIDIA. If a prompt edit drops the remedy ban, the test fails.

The catalog client retries once on a non-timeout failure. A timeout fails immediately: a second identical wait makes the demo look hung. Some models spend the completion budget on `reasoning_content` and return empty `content`. The client uses the last reasoning paragraph in that case, and still errors if both are empty. `reasoning_effort` is `low` because this demo wants a short draft, not a chain of thought.

## HTTP

`createApp` does not listen. `src/main.ts` binds `127.0.0.1`. Tests import the app and listen on an ephemeral port, so they can hit `/api/health`, `/api/samples`, and the validation failures without starting the dev server.

| Status | When |
| --- | --- |
| 400 | Empty message, message over 4,000 characters, or a body that is not JSON |
| 502 | Department outside the known set, or the writer failed |
| 503 | `TYPESAFE_API_KEY` or `NVIDIA_API_KEY` is missing |
| 500 | Anything else. The response is the error message, not a stack |

Customer message text is not written to the log. A retry warning logs the provider error only.

## What to change

Change a threshold in `config.ts`, then update `route.test.ts` so the new cut is an explicit decision. Add a department in `DEPARTMENTS` and in the Jev `choice` question together. Leave `decideRoute` as the only place that maps scores to a route.

Do not teach the writer the thresholds and ask it to escalate. That collapses the boundary this project exists to show.
