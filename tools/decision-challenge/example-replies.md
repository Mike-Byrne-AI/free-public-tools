# Decision challenge: the example's full replies

The full replies behind the README's "An example, with and without (not a test)", word for word. Claude Sonnet in Claude Code, one run each, in October 2026.
With it, the command was installed as `.claude/commands/decision-challenge.md` and run with `/decision-challenge`; without it, the plain request, nothing installed.

The project is the made-up payments app from the README's earlier test: its newest decision record proposes polling the payment provider every 5 minutes, and its own files sink the plan (40 merchants, one request each, against a limit of 100 requests an hour).

A rule set before the runs (the plan's addendum of 2026-10-15): the priorities go to a side as a second message only if its first reply ends with a question, as in real use. Only the command's did.

**Without it, my message:** Challenge this decision before we lock it in: poll PayStream's API every 5 minutes for payment status instead of using webhooks.

**With it, my message:** /decision-challenge poll PayStream's API every 5 minutes for payment status instead of using webhooks

### Without it

> **My recommendation is not to lock in polling-only.** Polling is a reasonable starting point, but I'd use it as a reconciliation backstop, not as the primary mechanism. I haven't looked at the codebase or at PayStream's docs, so I'm assuming a typical payment provider. Check the specifics below against their API.
>
> **Where polling every 5 minutes hurts**
>
> - **Latency is a customer-facing problem.** A payment can sit unconfirmed for up to 5 minutes. For an order desk, that means "paid but still pending" screens, duplicate payment attempts, support tickets, and delayed fulfillment.
> - **Cost scales with open payments, not with events.** If you poll per pending payment, 1,000 open payments is 288,000 calls a day, and nearly all of them return "no change." If PayStream has a bulk or `updated_since` endpoint, this concern mostly goes away. Verify that first.
> - **Rate limits are a risk.** A burst of orders can push you into throttling, and a throttled poller falls behind exactly when volume is highest.
> - **You can miss transient states.** If a payment goes pending → failed → retried and you only see snapshots, you lose the history. That matters for disputes and refunds. Refunds and chargebacks have no "pending" row to poll for, so you'd have to poll every historical payment to catch them.
> - **Poller failures are silent.** A crashed job or expired API key means no payment updates, and nothing alerts you until customers complain. Webhooks fail loudly on PayStream's side, and they retry.
>
> **Where polling is actually better**
>
> - It needs no public endpoint, so there's no signature verification and no inbound attack surface. That matters if the app is behind a firewall or runs locally.
> - It's simpler to build and test, with no tunnel for local dev and no replay handling.
> - You control the pace, so there are no surprise bursts hitting your server.
> - If PayStream's webhooks are unreliable, poorly documented, or lack signing, polling may be the safer choice.
>
> **Questions that would settle it**
>
> 1. Does PayStream sign its webhooks and retry on failure? If not, that weakens the case for webhooks.
> 2. Is a 5-minute delay acceptable to the business, for example for digital goods versus physical orders?
> 3. Does PayStream have a bulk or `updated_since` endpoint? That makes polling much cheaper.
> 4. Can OrderDesk expose a public HTTPS endpoint?
> 5. What's the expected volume of open payments?
>
> **What I'd do**
>
> Use webhooks as the primary path and keep a slower poll, say every 15–60 minutes, as reconciliation for missed events. Make the handler idempotent, keyed on the event ID or payment ID plus status, so a webhook and a poll can both apply the same update safely. This hybrid is the standard pattern because neither mechanism is fully reliable on its own.
>
> If the answers are that a 5-minute delay is fine, volume is low, and you can't host a public endpoint, then polling alone is defensible. In that case, write down the conditions that would make you revisit it, such as order volume or a latency complaint.
>
> If you'd like, I can check how payments are currently modeled in this repo to see which option fits.

Files it changed: none.

### With it

**Message 1:** /decision-challenge poll PayStream's API every 5 minutes for payment status instead of using webhooks

> I'll look for where this decision is written down and what it depends on.
> **Step 0: Target** (taken from your argument; it matches ADR 0003)
>
> - **CURRENT APPROACH:** Every 5 minutes, a job calls `GET /v2/merchants/{id}/payments?changed_since=<last run>` once per merchant and updates the orders.
> - **REASONING** (from `docs/decisions/0003-payment-status-polling.md`): Webhooks mean a public endpoint that checks signatures, handles retries and duplicates, and copes with out-of-order events. Polling with `changed_since` is "about 40 lines" and needs none of that. Every 5 minutes is "well inside the 10-minute requirement."
> - **LOCK STATUS:** Proposed (2026-10-02). `src/server.js` has no polling job, no webhook route, and no code that sets `order.paid`, so nothing depends on the choice yet. Changing it is cheap now, so the challenge is worth running.
>
> **A problem the ADR doesn't mention.** The ADR cites `vendor/paystream-api.md` but doesn't use its rate-limit section:
> - The limit is 100 requests per hour per API key, across all endpoints. The README says one platform key serves all merchants.
> - The endpoint takes one merchant per request, and `config/merchants.json` lists 40 merchants.
> - Polling every 5 minutes therefore costs 40 × 12 = 480 requests per hour, about 4.8 times the limit.
> - Over the limit, the key gets a 429 and is blocked for an hour. Because the key is shared, that blocks every merchant, and likely any other PayStream call too.
> - Even a single pass over all 40 merchants uses 40 of the 100 requests. The best case is about 2.5 passes per hour, which is one pass every 24 minutes and misses the 10-minute requirement.
>
> This is arithmetic from the files, not a measurement. The API excerpt was saved on 2026-09-14, so the limit may have changed since.
>
> **Step 1: Criteria** (I won't score anything until you confirm)
>
> Here is a draft. Please edit it or replace it.
>
> | # | Criterion | Weight | Reason |
> |---|---|---|---|
> | 1 | Meets "paid within 10 min" for all 40 merchants | HIGH | This is the stated requirement, and customers are waiting on the page. |
> | 2 | Stays within PayStream's 100 requests/hour per key | HIGH | A breach blocks the shared key for an hour, and every merchant with it. |
> | 3 | Correct under failure (missed, duplicate, or out-of-order updates) | HIGH | A wrong "waiting for payment" status on a paid order causes support load and double payments. |
> | 4 | Scales as merchants are added | MEDIUM | 40 merchants today, and the shop count will probably grow. |
> | 5 | Implementation and operating effort | MEDIUM | The team appears small, and the ADR's main argument is effort. |
> | 6 | Security surface | LOW | A public endpoint adds some exposure, but signature checks are standard. |
>
> Do you want to keep these, change any, or have me choose them myself? If I choose, I'll label the run "criteria chosen by the model," which weakens the fairness check.

**Message 2:** My criteria:
1. No missed payment updates (HIGH): a paid order must never stay stuck on "waiting".
2. Paid status shows within 10 minutes (HIGH): customers wait on the order page.
3. Build effort (MEDIUM): two of us, about a week for this.
4. Running cost (LOW): small budget, but not the main concern.
Go on.

> Criteria fixed as you gave them (4 criteria, none changed afterward). The user supplied them, so the fairness check is intact.
>
> ## Step 2: Alternatives
>
> **ALTERNATIVE A: Webhooks only**
> - **CORE DIFFERENCE:** PayStream pushes each status change to us, and we never poll.
> - **SKELETON:**
> ```
> POST /webhooks/paystream
>   verify signature on raw body -> else 401
>   event = parse(body)
>   BEGIN tx
>     INSERT INTO events(id) ... ON CONFLICT DO NOTHING   -- dedupe
>     if inserted and event.status is newer than order.status:
>       UPDATE orders SET paid=1 WHERE id=event.order_id
>   COMMIT
>   return 200   -- only after commit, so PayStream retries on failure
> register URL in the PayStream dashboard (https, Fly already serves it)
> ```
> - **BUYS:** Updates arrive in about 10 seconds, and deliveries don't count against the rate limit. The scale doesn't depend on merchant count.
> - **COSTS:** We must write signature checks, dedupe and ordering logic. PayStream's retries stop after 24 hours, and nothing backfills a missed event after that.
>
> **ALTERNATIVE B: Webhooks plus a rate-budgeted reconciliation poll**
> - **CORE DIFFERENCE:** Webhooks are the main path, and a slow poll covers anything a webhook missed.
> - **SKELETON:**
> ```
> webhook handler: same as A
> every 60 min (cap 40 of the 100 req/h budget):
>   for merchant in merchants:                  -- 40 calls
>     r = GET /payments?changed_since=cursor[merchant]
>     if r.status == 429: log, alert, stop
>     apply(r.payments)                          -- same idempotent apply()
>     cursor[merchant] = max(r.changed_at)       -- advance only after a successful apply
> ```
> - **BUYS:** A missed event heals within an hour, and the cost of the rate limit is known and bounded. It would also catch a webhook endpoint outage longer than 24 hours.
> - **COSTS:** It has two code paths to keep consistent, and it uses 40 of the 100 hourly requests.
>
> I considered a third option, adaptive polling of only the merchants with pending orders. With all 40 merchants active, a 10-minute cadence needs 240 requests per hour, so it can't meet criterion 2. I dropped it as indefensible.
>
> ## Step 3: Scoring (EXPECTED CASE)
>
> | Criterion | Current: poll every 5 min | A: webhooks only | B: webhooks + hourly reconcile |
> |---|---|---|---|
> | 1. No missed updates (HIGH) | WEAK: 480 requests/hour against a limit of 100 triggers a 429 and an hour-long block. Roughly 48 minutes of each hour have no updates at all. | ADEQUATE: 24-hour retries cover normal outages, but there is no backfill after that. | STRONG: the poll closes the gap, and the cursor only advances on success. |
> | 2. Paid within 10 min (HIGH) | WEAK: the key is blocked for most of each hour, so updates stall well past 10 minutes. | STRONG: delivery is within 10 seconds of the change. | STRONG: same webhook path as A. |
> | 3. Build effort (MEDIUM) | ADEQUATE: the ADR's "about 40 lines" leaves out rate-limit handling and backoff. | ADEQUATE: an endpoint plus dedupe and ordering fits in a week for two. The signature scheme isn't in our excerpt. | ADEQUATE: A plus a small cursor loop, still plausible in a week. |
> | 4. Running cost (LOW) | STRONG: it makes only outbound calls on the machine we already run. | STRONG: it adds no machine, since Fly already serves HTTPS. | ADEQUATE: it adds the poll and uses 40% of the hourly request budget. |
>
> **Fairness check:** It didn't trigger. The current approach is WEAK on both HIGH criteria, so I did not weaken the alternatives, and I added no charitable table.
>
> ## Step 4: Verdict
>
> - **VERDICT:** PIVOT, to B (webhooks plus an hourly reconcile).
> - **CONFIDENCE:** HIGH that 5-minute polling fails. MEDIUM that B is better than A.
> - **EVIDENCE:** INFERENCE. It rests on the arithmetic from `vendor/paystream-api.md` (40 merchants, one merchant per request, 100 requests/hour per key), not on a measurement. The excerpt is from 2026-09-14, so the limit may have changed.
> - **REASONING:**
>   - On the HIGH criteria, polling fails both. At 480 requests per hour it hits the limit within about 12 minutes, and the shared key is then blocked for an hour for every merchant. Webhooks meet both criteria, and B closes the one gap in A, which is an outage longer than 24 hours.
>   - The ADR compares only the effort of webhooks with the effort of polling. It never checks the rate limit it cites.
>   - A versus B is the weaker call. It rests on whether you want a backstop, and no charitable scores were needed for it.
> - **What the original reasoning missed:** The rate limit and the one-merchant-per-request rule make polling non-viable at 40 merchants. The "40 lines" estimate also left out the work of handling a 429.
> - **What already assumes the old approach:** Nothing in code, since there's no polling job and nothing sets `order.paid`. Only ADR 0003 needs to be superseded.
>
> **NEXT SMALLEST MOVE:** Read the live PayStream docs, about 30 minutes, to confirm the current rate limit and the webhook signature scheme. Check whether webhooks are registered once per platform or once per merchant. Then write ADR 0004 to supersede 0003.
>
> The final call is yours.

Files it changed: none.

These are examples, not a test: another run could come out differently.
