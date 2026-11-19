# Silver Spur return calculation

Every game deals five cards from a uniformly shuffled 52-card deck. Discarded cards remain out of play. Replacements come uniformly from the 47 cards outside the original deal.

Each variant follows its reference paytable for nonroyal hands. All awards scale with the wager, from one to five credits. A natural royal pays a base multiple of the bet, plus one additional bet on a separate random draw.

| Game | Reference paytable | Base royal multiplier | Probability of the extra bet | Optimal return with the reference 800× royal |
| --- | --- | ---: | ---: | ---: |
| Jacks or Better | 9/6 | 1,315× | 10,668,065 / 16,717,427 | 99.543904% |
| Deuces Wild | Full pay | 906× | 7,287,604 / 18,883,695 | 100.761961% |
| Double Double Bonus | 10/6 | 1,140× | 13,079,134 / 47,462,223 | 100.066956% |

The calibrated paytables each return exactly **101/100** under optimal play. The bonus sampler draws a uniform integer below the relevant denominator and rejects unused 32-bit values to avoid modulo bias.

## Reproduce

From the project root, build the calculator with GCC or Clang and run the verifier with Node 18 or later.

```sh
c++ -O3 -std=c++17 math/solve.cpp -o /tmp/silver-spur-solve
/tmp/silver-spur-solve
node math/verify.mjs
```

For each variant, the solver enumerates all 2,598,960 final hands and accumulates nonroyal awards and royal counts for every subset they contain. For each initial hand, inclusion–exclusion removes finals that contain any discarded card. This gives the totals for all 32 hold choices. The common denominator 7,669,695 is the least common multiple of the six possible draw counts. Integer arithmetic compares the conditional expected awards and selects a maximizing mask for every deal. Ties select the first optimal mask after sorting the cards and ordering the masks by their integer values.

A fixed hold policy produces an overall expectation of the form `(base + royalCount × meanRoyalPrize) / denominator`. The solver computes the exact mean royal prize that gives a return of 101/100 for the current policy, reoptimizes every deal at the new award, and repeats until the prize is unchanged. It verifies the final result by integer cross-multiplication. Each `verification.json` file reports the exact inputs to that check.

The browser stores one optimal hold per unordered initial deal in each `dist/math/*holds.bin` file. The data is indexed by combinatorial rank, packed with run-length encoding, and downloaded on first use of Best hold in each game. The browser maps the resulting mask back to the displayed card order.

The Node verifier independently assigns every possible final hand to its exact hold mask for 48 example deals per variant. It checks all 32 options in each case, right through the browser's hint and scoring APIs. It also compares all hand frequencies, cross-checks the new variants' per-hand classifications against the solver, enumerates wild-card substitutions on selected deals, and checks all four-of-a-kind kicker ranks. Both royal prizes, uniform sampling boundaries, and payout scaling are checked at all five wagers.

## Reference paytables

- [9/6 Jacks or Better](https://wizardofodds.com/games/video-poker/strategy/jacks-or-better/9-6/optimal/)
- [Full-pay Deuces Wild](https://wizardofodds.com/games/video-poker/tables/deuces-wild/)
- [10/6 Double Double Bonus](https://wizardofodds.com/games/video-poker/tables/double-double-bonus/)
