# Weather / Culture Trade-Off Analysis

## Results

- WX top-1: 30.0%; top-3: 90.0%; mean regret: 12.7.
- Exact production-pool candidate matching was sparse: only 4/10 WX cases had any exact candidate fingerprint.
- Correct top-1 cases: WX-02, WX-08, WX-10.

## Case findings

- **WX-01:** selected a navy wool coat for Lagos heat (P1, regret 25), indicating fixed-candidate scores do not encode weather.
- **WX-03:** selected grey wool trousers in 38°C Abuja heat (P1, regret 24), while the full production pool’s mapped candidate was the reviewer-preferred linen option.
- **WX-04:** selected an unnecessary camel blazer in warm rain (P1, regret 24).
- **WX-09:** selected jeans for a cold Nigerian community event rather than warm Ankara with a coat (P1, regret 19), missing both cultural and weather priorities.
- **WX-10:** correctly selected the rain-safe Ankara kaftan, showing the full system can combine both constraints in some traditional-event cases.

## Interpretation

The direct fixed-candidate ranking diagnostic combines unchanged profile-item and outfit-combination scores; those functions do not receive weather. Weather is applied only in the separately captured full generator. Therefore WX fixed-ranking failures are real limitations of applying those scores to benchmark candidates, while sparse exact generation means the production-pool metric is under-supported. Both facts are reported separately.
