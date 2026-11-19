# Silver Spur Poker Academy — development branch

This branch is derived directly from the original Silver Spur Poker commit `ee540604ed54dec4d73ad704f7aa183d5106afe2`. The `main` branch remains the original game. The Poker Academy is under development.

## Run

Serve the `dist/` directory from any static HTTP server (for example `python3 -m http.server 8000 --directory dist`) and visit `http://localhost:8000/`.

No compilation is required for the browser app. The mathematical verification source in `math/` can be built and run using the commands in `math/README.md`.

## First milestone: economic accuracy

After each completed draw, a web worker computes the exact conditional expected payout of **all 32 holds** for the original five-card deal. Replacements are uniformly enumerated among the 47 cards not in the original deal. The calculation uses the active game's actual paytable, including the mean value of the independent fractional natural-royal bonus.

For each decision:

- Chosen EV = expected credits returned by the player's selected hold.
- Optimal EV = largest EV over all 32 holds.
- EV loss = optimal EV − chosen EV (nonnegative).
- **Economic accuracy** = cumulative chosen EV / cumulative optimal EV, expressed as a percentage.

All aggregate expected values account for the actual wager. This metric weights errors by their economic consequences. A tiny EV mistake matters far less than a large EV mistake. Multiple equally optimal holds receive full credit.

The original game's Best Hold button counts as assistance. Certification mode hides that button and conceals decision feedback. To review performance, switch to practice or guided mode.

Training data is stored in browser localStorage under `silver-spur-academy-v1`; no account or server is required. The game state is separate from the original Silver Spur storage key. A reset control clears Academy results without touching game credits.

## Limitations and planned milestones

This is an initial development build. It is **not yet** a full trainer with adaptive drills, permanent certification records, strategy explanations, custom paytables, additional poker variants, variance calculations, or exported analytics. These belong in subsequent development milestones.

The EV computation uses exhaustive enumeration in a dedicated worker and may take several seconds on slow mobile devices. It is exact up to normal JavaScript floating-point rounding. The browser must load the app over HTTP(S), not from a bare `file://` URL, for worker support.

## Original release provenance

Original GitHub repository: https://github.com/jtk3/Silver-Spur

Original source snapshot: https://github.com/jtk3/Silver-Spur/tree/ee540604ed54dec4d73ad704f7aa183d5106afe2

## License

MIT. See `LICENSE`.
