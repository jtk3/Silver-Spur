# Silver Spur Poker Academy

The Academy is developed on the `academy-development` branch of [Silver Spur](https://github.com/jtk3/Silver-Spur). It was forked in-place from the unchanged original commit `ee540604ed54dec4d73ad704f7aa183d5106afe2`. The original `main` branch remains untouched.

## Run the browser game

```sh
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000/. This is a static web application; it does not need compilation. It does need an HTTP(S) origin for worker scripts.

## What the Academy does

- **Economic accuracy**: player expected credits returned / mathematically optimal expected credits returned, weighted across each actual wager. This deliberately grades by the *cost of mistakes*, not the percentage of decisions that coincidentally match one canonical hold mask. Equivalent optimal hold masks are accepted.
- **Precise hold scoring**: the scoring Web Worker evaluates all 32 hold masks using the exact distribution of replacement cards from the remaining 47 cards. It reports payout EV, win probability and per-hold payout variance. The original fractional royal bonus is integrated into the mean and second moment.
- **Analysis and explanation**: a ranked 32-hold list reveals the EV difference between the choice made and the best choice, along with probabilities and outcome standard deviation.
- **Guided mode**: allows the built-in Best Hold action.
- **Practice mode**: hides Best Hold and grades decisions after they are played.
- **Certification mode**: hides Best Hold and scoring feedback. A formal 100-hand assessment locks the variant, prohibits drills, records the outcome and has a >=99.9% economic accuracy and no assistance passing rule. Ended-early attempts are marked incomplete. An in-progress assessment persists across reloads.
- **Drills**: replay previously misplayed hands, prioritizing costly errors, or select from prearranged strategy scenarios. Replacement cards remain randomized even on replayed initial deals.
- **Tracking**: local per-variant totals, individual decision history (recent 500 decisions), economic losses, assisted decisions, up to 100 remembered mistakes, recent assessments and CSV export.
- **Custom paytables**: edit each winning category's *integer payout per credit wagered* for each built-in poker variant. The actual game payout and the optimal hold calculations change to match. Restore Original to recover the exact calibrated 101% game.

The custom-paytable editor accepts nonnegative whole-number values from 0 to 100,000. Unlike the default Silver Spur paytables, custom royal payouts are fixed amounts without an independent fractional bonus. The 101% badge is replaced by a Custom paytable label when any custom payout schedule is active.

All game state and training statistics are held in browser localStorage; they are not synchronized across devices, so export them before clearing the browser. The Academy uses its own storage keys and does not overwrite the original Silver Spur game's credits.

## Exact theoretical RTP and variance of a custom paytable

To compute the *game-wide* optimal return and single-hand variance, run the offline C++ calculator (it evaluates all 2,598,960 starting hands and their 32 possible holds):

```sh
c++ -O3 -std=c++17 math/custom-return.cpp -o custom-return
./custom-return jacks royal=800 fullHouse=9 flush=6
./custom-return deuces royal=800 fourDeuces=200
./custom-return doubleDouble royal=800 fourAcesKicker=400
```

Unspecified categories use the named variant's reference paytable. The calculator starts with a fixed 800× royal award, and uses the user-supplied royal value if specified. Its variance is the variance of *one hand's payout per unit wagered* under the optimal policy. It is not the variance of the net change in a multi-hand bankroll simulation. Subtracting one unit of wager leaves variance unchanged.

**Important:** The browser currently calculates exact conditional variance for a *single dealt hand*; it does not automatically run the offline 2.6-million-hand RTP/variance solver whenever the user edits a custom paytable. The original 101% calibration remains exact only for unmodified paytables.

## Original mathematical verification

```sh
c++ -O3 -std=c++17 math/solve.cpp -o /tmp/silver-spur-solve
node math/verify.mjs
node --test math/academy-smoke.test.mjs
```

The normal `math/solve.cpp` generator rewrites generated calibration and strategy binary files if executed; run it on a clean working tree or compare generated outputs before committing. The Academy's default release source is never modified by browsing or grading.

## Known limitations

This development branch still requires full interactive browser acceptance testing, including iPhone and television browsers. Certification records are local and not cryptographically verified, and the pass standard is an Academy-defined target rather than an external credential. Guided and Practice mode do not yet implement a progressive written curriculum. A custom paytable can change optimal choices; the Academy's EV worker recomputes them rather than relying on the original precomputed hold tables. Full new poker variants would require additional rules and mathematical verification, not merely editing a paytable.

## Provenance and license

Original game snapshot: https://github.com/jtk3/Silver-Spur/tree/ee540604ed54dec4d73ad704f7aa183d5106afe2

MIT license: [LICENSE](LICENSE).
