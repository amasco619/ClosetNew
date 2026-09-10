# Existing v3.7 Regression Comparison

## Separate baselines

The existing v3.7 golden regression suite remained unchanged and passed in the full project test run. It is a deterministic regression guard for established recommendation behavior; it is not the same population or labelling protocol as Track C.

Track C independently measured Nigerian/African performance:

- 60 context cases: 50.0% top-1, 95.0% top-3.
- 40 garment cases: 37.5% semantic garment-type agreement and 49.8% mean supported-dimension agreement.
- Weather was the weakest context family at 30.0% top-1.

## Interpretation

The unchanged regression suite passing alongside material Track C gaps establishes the intended baseline: future Nigeria-specific experiments must improve Track C without breaking existing v3.7 expectations. No direct accuracy delta is claimed because the two sets measure different things.
