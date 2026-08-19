# Reviewer Instructions — African/Nigerian Fashion Benchmark v1

**Phase:** 5C.3 Track B  
**Audience:** Independent Nigerian/African fashion reviewer  
**Version:** 1.0  
**Date:** 2026-08-19  

> **This document contains no engine outputs, no engine scores, and no developer opinions
> on what the correct answer is. Your task is to supply independent professional judgement
> before any system output exists.**

---

## 1. Your role

You are an independent Nigerian/African fashion reviewer. Your job is to answer:

> *"What would a competent Nigerian/African fashion stylist consider the correct or
> strongest recommendation in this scenario?"*

You do not need to understand how Amodka works. You do not need to see its output.
Your labels will be locked before the system is run — this independence is what makes
the benchmark valid.

---

## 2. What you will be given

For each case you will receive:

- **A scenario** — occasion, location, weather, and brief profile description
- **A set of candidate outfits** — described in text (and images where available)
- **A label form** — where you record your answers

You will **not** be given:

- Amodka's recommendations or scores
- Any developer opinions on the correct answer
- Rankings from any other source

---

## 3. The two types of cases

### Type A — Garment classification (40 cases, GU-01 to GU-40)

You are shown a garment (described in text; image provided where available).

Your job is to classify it as you would professionally:

- What type of garment is this?
- What fabric is it made of?
- What is its pattern and visual weight?
- What occasions is it appropriate for?
- What formality level is it?
- Is it part of a coordinated set?
- What is its cultural context?

**Key instruction:** Answer based on what the garment *actually is*. Do not try to guess
how a clothing app would categorise it. We want your professional answer, not a guess
at our system.

If you do not know the precise garment term (e.g. you are unsure whether a fabric is
technically "aso-oke" vs another woven fabric), please say so in your rationale.
Your uncertainty is valuable data.

### Type B — Outfit ranking (60 cases, OR / OC / WX)

You are given a scenario and a set of candidate outfits.

Your job is to:

1. Mark each candidate acceptable or not acceptable for this occasion
2. Score each candidate across seven dimensions (0–5 each) — see `scoring-rubric.md`
3. Rank all candidates from best to worst
4. Name your single preferred / gold outfit
5. Write a brief rationale in your own words

---

## 4. Step-by-step for outfit-ranking cases

### Step 1 — Read the scenario carefully

Note:
- The occasion (what kind of event is this?)
- The cultural context (Nigerian traditional? Western? Diaspora?)
- The weather (is it hot? Raining?)
- Any specific notes about the person (their location, the dress code, etc.)

### Step 2 — Review each candidate outfit

Each candidate is described with:
- A factual description of the outfit (e.g. "orange-teal Ankara kaftan with gold heels and gold clutch")
- Its components (garment, shoes, bag, jewellery), with full item details in the fixture catalog (`fixtures.md`)

Take each candidate on its own merits first — pretend you are seeing it in isolation,
before comparing it to the others.

### Step 3 — Score each dimension (0–5) for each candidate

Use the rubric in `scoring-rubric.md`:

1. Context suitability
2. Cultural appropriateness
3. Visual harmony
4. Proportion and silhouette
5. Pattern and visual-weight balance
6. Weather suitability
7. Overall styling quality

Score honestly. If a candidate fails one dimension entirely (score 0), that is fine to record.

### Step 4 — Mark acceptable / not acceptable

An outfit is **not acceptable** if you would advise a client against wearing it to this
occasion under any circumstances.

An outfit is **acceptable** if you would consider it a viable option, even if it is not
your top choice.

### Step 5 — Rank and name your gold outfit

Rank all candidates from your most preferred to least preferred.

Name your single **gold outfit** — the one you would recommend without hesitation.

### Step 6 — Write your rationale

Please write a few sentences explaining:
- Why your gold outfit is the strongest choice
- Why candidates you ranked lower were less suitable
- Any cultural reasoning that influenced your decision
- Any genuine uncertainty or cases where two options were very close

This rationale is the most important part of the gold label. The numerical scores help
us understand your reasoning — the rationale captures the cultural knowledge that no
number can fully express.

---

## 5. Practical guidance

### On Nigerian fashion and cultural context

- There is no single "correct" Nigerian fashion answer for many scenarios.
  When you have genuine uncertainty or when two candidates are very close, say so.
  Flagging disagreement is more valuable than forcing false certainty.
- Nigerian fashion includes strong regional variation (Yoruba, Igbo, Hausa/Fulani, Ijaw,
  diaspora etc.). Where you are drawing on a specific regional tradition, please note it.
- Contemporary Nigerian fashion, African-Western fusion, and global fashion are all
  legitimate parts of a Nigerian wardrobe. Do not penalise Western garments simply because
  they are Western, or traditional garments simply because they are traditional — judge
  them on fit for the specific occasion described.

### On patterns and coordinated pieces

Where a case includes patterned garments or pieces made from the same fabric, please
state in your rationale how you weighed pattern, visual weight, and coordination in
your ranking — in your own terms. There is no expected answer on these dimensions;
your independent judgement is exactly what is being collected.

### On formality

Nigerian formality levels do not map one-to-one onto Western formality. Please use your
own scale:

- 1 = very casual (home, errands)
- 2 = relaxed social (market, friends, café)
- 3 = smart-casual (office, brunch, informal event)
- 4 = semi-formal (business meeting, daytime event)
- 5 = formal (traditional ceremony, wedding, church thanksgiving)
- 6 = high ceremony (chieftaincy, royal engagement, burial in full traditional dress)

### On weather

Weather inputs are provided where relevant. Please score weather suitability based on:
- Is the fabric weight appropriate for the temperature?
- Are the shoes practical for rain conditions?
- Would a Nigerian woman typically wear this in this weather?

---

## 6. Image access

Where images are referenced in the cases, you will receive them via [**Product Owner to specify: secure link / email attachment / physical package**]. Do not download or share these images beyond the scope of this review.

Where an image is not yet available, a detailed text description is provided. Please review
based on the description. Note in your rationale if you feel the absence of an image
limits your confidence.

---

## 7. What to return

For each case, complete the label form from `gold-label-schema.md`. You may use:

- The **electronic form** (JSON or spreadsheet provided separately)
- The **paper form** (printed version of the human-readable form)

Return completed labels to the Product Owner via the agreed secure channel.

**Do not share your completed labels publicly or with any automated system before
signing off.**

---

## 8. Sign-off

After completing all labels in a session:

1. Review your answers once — check for any cases where you want to revise.
2. Sign the label set with your reviewer identifier and the date.
3. Indicate which cases you are confident about and which you flagged as uncertain.

Once signed, your labels are locked. Corrections require a new version with a new sign-off.

---

## 9. Inter-rater process

If you are the second reviewer for a subset of cases, please complete your labels
**independently** — do not look at any other reviewer's answers before you finish.

After both sets are locked, the benchmark team will compare them. Disagreements are
treated as findings about the case's complexity — they do not mean either reviewer was wrong.

---

## 10. Questions

If you are unsure about what a case is asking, please note your confusion in the rationale
field rather than guessing. If you have a substantive question about the process, contact
the Product Owner via the agreed channel.

Thank you for your contribution. Your independent expertise is what makes this benchmark
defensible.
