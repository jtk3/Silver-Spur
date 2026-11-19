# Silver Spur Poker Academy

A strategy trainer derived from [Silver Spur Poker](https://github.com/jtk3/Silver-Spur/tree/main).

This development branch preserves the original casino-style interface while adding exact expected-value analysis, economic-accuracy scoring, guided/practice/certification modes, cumulative and per-variant performance reports, CSV export, and targeted mistake replay.

**Play locally:** serve the `dist` directory over HTTP, for example:

```sh
python3 -m http.server 8000 --directory dist
```

Then visit http://localhost:8000/.

**Read [ACADEMY.md](ACADEMY.md)** for scoring definitions, testing, provenance, limitations, and future milestones. This branch is under active development and has not undergone full browser acceptance testing.

**Original game:** the `main` branch remains unchanged at commit `ee540604ed54dec4d73ad704f7aa183d5106afe2`.

MIT license (see `LICENSE`).
