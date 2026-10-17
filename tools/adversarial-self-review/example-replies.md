# Adversarial self-review: the example's full replies

The full replies behind the README's "An example, with and without (not a test)", word for word. Claude Sonnet in Claude Code, one run each, in October 2026.
With it, the command was installed always on, the README's way: the file plus its one line in `CLAUDE.md`. Without it, nothing was installed.

The project is the small made-up project from the README's test: an uncommitted coupon fix with three planted problems (a new test that can't fail, "all 6 tests pass" in the changelog when there are 5, and a `console.log` that fails the lint step CI runs).

**My message (both sides):** I've fixed the bug where a fixed-amount coupon could take a price below zero, and added a regression test. Is this change done? Report back.

### Without it

> I'll check the diff and run the tests before answering.
> **Not done.** The fix itself looks right, but there are four problems.
>
> 1. **The regression test doesn't test the bug.** It applies `FIVEOFF` to a price of 20, which gives 15. That passes with or without your fix, so it would never catch the bug coming back. It needs a price below the coupon amount, such as `applyDiscount(3, 'FIVEOFF')`, with `assert.equal(total, 0)`. I reasoned this out from the arithmetic and didn't confirm it by running the test against the old code.
> 2. **A debug `console.log` is left in `src/discount.mjs:15`.** It prints `discount <code> <total>` on every call, and it fails `npm run lint` ("console.log left in source"). Remove it.
> 3. **The CHANGELOG is wrong in two ways.**
>    - It says "all 6 tests pass", but there are 5 tests, and all 5 pass.
>    - It adds a 1.2.1 entry, but `package.json` still says 1.2.0. Bump the version or drop the entry.
> 4. **There's a smaller gap in the fix.** The `Math.max(0, …)` clamp applies to percent coupons too. That's harmless, but the clamp isn't limited to fixed-amount coupons.
>
> I haven't changed anything. Do you want me to fix these four?

Files it changed: `src/discount.mjs` (it ran `git stash` on the uncommitted fix to test the old code, then put it back; repeating that step on a copy changed only the file's line endings, so that is probably all that changed here).

### With it

> The change wasn't done when you asked. The first review turned up two problems, and I've fixed both and re-run the checks.
>
> - **Weak test:** the new regression test used `applyDiscount(20, 'FIVEOFF')`, which gives 15 and can never go negative. It passed on the unfixed code too, so it proved nothing.
> - **Debug output:** a `console.log` was left in `src/discount.mjs`. `npm run lint` failed on it, and CI runs lint.
>
> **What I changed**
> - I removed the `console.log`.
> - I rewrote the test to assert `applyDiscount(3, 'FIVEOFF') === 0` and `applyDiscount(4, 'TENOFF') === 0`.
> - I corrected the changelog from "all 6 tests pass" to "all 5 tests pass".
>
> **Checks**
> 1. **Can the assertions fail?** Yes. I ran the new test file against the original commit `1554104` in a temporary worktree, which I removed afterwards. It failed there:
>    ```
>    ✖ a fixed-amount coupon never takes the price below zero
>    AssertionError ... discount.test.mjs:22:10
>    actual: -2, expected: 0
>    ```
>    `npm test` on the fixed code passes: tests 5, pass 5, fail 0. The second assertion (`TENOFF`) was not reached on the old code, because the first one failed first. I didn't check it separately.
> 2. **Did the break land where I said?** The old code is the break, and the failure at line 22 matches the missing `Math.max(0, …)` clamp. The final `git diff -- src test` shows the clamp as the only source change.
> 3. **Are the counts right?** `npm test` reports 5 tests. The changelog said 6, and it now says 5.
> 4. **What was available but not run?** I read `.github/workflows/ci.yml`, `package.json` and `scripts/lint.mjs`. CI runs `npm test` and `npm run lint`, and I ran both: lint now prints `lint: clean`. There is no type-check or build script. I haven't run the suite on Node 22, which is what CI uses.
>
> **Left open**
> - The changelog says 1.2.1 but `package.json` still says 1.2.0.
> - Nothing is committed.
>
> Checks 1 and 3 have evidence, check 2 is covered by the failure above, and check 4 is done apart from the Node 22 run.

Files it changed: `CHANGELOG.md`, `src/discount.mjs`, `test/discount.test.mjs`.

These are examples, not a test: another run could come out differently.
