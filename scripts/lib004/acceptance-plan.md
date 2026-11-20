# LIB-004 independent acceptance plan

Pinned before conversion implementation, against `58cea367`: see F08 in the requirements baseline, `LIB-004-T01/T02` in `config/work_units.json`, and A08 in the acceptance matrix. These are expected outcomes, not candidate evidence. All three live cases start **NOT_RUN**. This plan does not certify A05.

## Test inputs

Use Node 22.2+ for generation. The fixture test also needs Python 3 (standard library only; set `PYTHON` if it is not on PATH) and the repository's bundled PDF reader. No converter or model is involved in these offline checks.

From the isolated checkout, run `node --test scripts/lib004/acceptance-samples.test.mjs`, then `node scripts/lib004/acceptance-samples.mjs <new-output-directory>` outside Git. The generator prints each file's SHA-256; retain these before upload and independently hash each subsequent download. The companion PDF is a separate original and visual reference, **never** a substitute for converter output. No byte-for-byte match between converter output and reference PDF is expected.

| Original | Ground truth in reading order |
| --- | --- |
| `a08-v1.docx` | Title `A08 sample V1`; two-column table `Item / Count`, `Quartz / 17`; embedded square with a gold upper-right quadrant and three blue quadrants; two monospace lines `if count < 20:` and `    mark(count)` (four leading spaces). |
| `a08-reference.pdf` | Same V1 title, ruled cells, color layout and code on one page. Inspect image and layout, not just extracted text. |
| `a08-v2.docx` | Same structure, but title `A08 sample V2` and count `29`. Import as a **new version of the same material**, not as a sibling material. |

## T01: end the originating Session

1. In an isolated real DSH Host and browser, sign in as the authorized owner. In Session S1, import the private V1 DOCX, run the real Office conversion and wait for publication. Capture the material, source version, job, derived object and their relationships. Open both the downloaded original and the independent preview; compare them to the table above. A receipt, filename or nonempty response is not proof of conversion.
2. On the derived version, record a located quality observation (e.g. code indentation, with expected and observed text). Reopen it. The finding must stay attached to that source/result pair, not modify the source, and not claim perfect fidelity. If no discrepancy is visible, label the submitted note as a test observation rather than inventing a conversion defect.
3. **Dispose S1 through the Host lifecycle while keeping the same Host process running.** Verify disposal (event/status and unavailable former Session workspace/attachment). Closing a tab, starting another Session, logging out or restarting the Host does not establish this condition. From a fresh S2 as the same owner, use the library, not the S1 URL/cache: download original and result, reopen preview and finding. Original bytes must match input; published result bytes must match their pre-disposal hash. Neither read may depend on S1 temporary artifacts.
4. Separately stop and restart the Host on the same durable profile. Record distinct process instances; repeat the S2 checks from a fresh client. Report disposal and restart observations separately. A restart-only run leaves the disposal obligation unproven.

## T02: do not publish failed, cancelled or stale work

Start each branch from a fresh copy of the **verified** V1 baseline. Record the good result ID/hash, current pointer, source hash and finding. Use a controlled job barrier before publication for the two races; capture ordering and release/await the worker before final reads. A timing guess or cancellation after successful publication does not exercise these cases.

| Branch | Action | Required observations after worker settles and after reopen |
| --- | --- | --- |
| Failure | Make the real conversion attempt fail on a disposable source (e.g. truncated copy) or exercise a documented converter failure at the job boundary. | Visible failure and cause, not empty/blank success. Old source, preview and finding still open; no new published result/current pointer for the failed attempt. An upload rejected before conversion is a separate ingress check. |
| Cancellation | Start reconversion, observe it in flight, request cancellation and receive acknowledgement before letting the late completion return. | Cancelled job cannot publish, even on late callback. No transient successful blank preview. Previous good bytes, result ID and findings remain unchanged. |
| Stale source | Hold a V1 job; advance the same material to V2 and verify `29`. Complete the V1 job late, then explicitly convert V2. | Late V1 cannot become current, overwrite V1 history or attach to V2. Until V2 conversion succeeds it has no new successful preview. V2 result shows `29`, not `17`; V1 original, previous result and finding are still bound to V1. |

## A08: live preview, feedback and authorization

Use both V1 originals. Import the reference PDF separately and exercise its real supported preview path; convert the Word source in the actual Host and inspect its independently stored result beside the originals. Check row/column associations, image orientation/colors and both code lines/indentation. Record each as preserved, changed or missing and show the feedback submission and persisted readback for a specific location. A lossy but reviewable rendering is different from silent loss or a blank success. Compare **both original download hashes** before/after conversion and after feedback. Verify feedback does not mutate the derived bytes either.

Use a second authenticated principal with no object grant and an unauthenticated client. With known object IDs, attempt original/result downloads, preview, finding read/write and conversion/cancel operations through supported interfaces, not just hidden buttons. Require denial, no private payload and no state change. Repeat with a previously authorized reader after revocation, including a previously acquired result locator; possession of a Session ID, material ID or client-supplied owner ID grants nothing. Confirm the owner's positive read still works. For a read-only grant, allow only the authorized reads, not owner-only mutation.

For each run record candidate SHA/tree, Host and converter versions, fixture hashes, identities by role only, job/version/result IDs, event ordering, sanitized HTTP outcomes, read-only durable-store observations, browser screenshots and feedback readback. A separate independent reviewer reruns on the frozen candidate in a clean profile. Record PASS/FAIL per observed assertion, BLOCKED for a required unavailable facility, NOT_RUN for unexecuted cases; keep failures and retests separate. Fixture checks and offline renders cannot establish a live PASS.
