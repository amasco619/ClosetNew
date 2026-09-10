# Ankara / Wax-Print Analysis

## Summary

- GU-01–GU-11: 10/11 production calls succeeded; garment-type semantic agreement was 5/11 and mean supported-dimension agreement was 71.5%.
- OR-13–OR-20: top-1 62.5%, top-3 100.0%, mean regret 3.0.
- Strong cases: OR-14, OR-15, OR-16, OR-19, and OR-20 ranked the reviewer-preferred candidate first.
- Misses: OR-13 (B over A, regret 5), OR-17 (plain white blouse/trousers over matching Ankara co-ord, regret 14), and OR-18 (single Ankara + solid over matching co-ord, regret 5).

### Matching Ankara co-ords are not consistently valued

- **Evidence:** The focused Ankara pairing slice performs well overall, but OR-17 ranks the plain Western office-like combination first and the matching co-ord last.
- **Affected cases:** OR-17; secondary signal in OR-18
- **Likely mechanism:** The scorer rewards conventional solid-piece cohesion but has no explicit representation of culturally meaningful matching-fabric identity.
- **Confidence:** High for the observed cases; not generalisable beyond this benchmark.
- **Potential hypothesis:** Test an explicit coordination-identity feature in a controlled post-v3.7 experiment while guarding the existing golden set.


### Ankara visual attributes are often recognized even when subtype language is generic

- **Evidence:** The Ankara GU slice reached 71.5% mean dimension agreement, while type agreement was only 5/11. Pattern/fabric fields often retained wax-print information.
- **Affected cases:** GU-02, GU-04, GU-05, GU-08, GU-09
- **Likely mechanism:** The classifier can describe visual material attributes but production subtype enums remain generic.
- **Confidence:** High.
- **Potential hypothesis:** Evaluate richer culturally specific subtype display labels separately from the scoring engine.


No engine or taxonomy change was made.
