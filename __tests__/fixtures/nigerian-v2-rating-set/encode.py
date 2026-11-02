#!/usr/bin/env python3
"""Blind, description-only encoding. No evaluator, verdicts or external labels."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DOCUMENT = "attached_assets/Amodka_Look_Scenario_1793628651200.docx"
DOCUMENT_SHA256 = "ab1ca44752c0559ceee3f97955a5e2e53e5060eafda5d8674154ec1b0485cb5f"
ITEM_FIELDS = (
    "id key kind colour textileIdentity quality footwearType shoulderCoverage "
    "hem headwearHeight headwearShape coralStrands"
).split()
BRIEF_FIELDS = (
    "occasion role whoseEvent community denomination asoEbiBought asoEbiColour "
    "asoEbiTextile brideColours familyTextiles timeOfDay formalityBand titledWoman"
).split()
BLOCKS = {
    "key": ["H01", "H02a", "H02b", "H03a", "H03b", "S04", "S06", "vocabulary"],
    "kind": ["H06", "H07", "S01", "C01", "C02", "C04", "C05", "C06", "C09", "vocabulary"],
    "colour": ["H01", "H02a", "H03a", "H04"],
    "textileIdentity": ["H02b", "H03b", "S04", "S06", "C03"],
    "quality": ["S02"], "footwearType": ["H06"],
    "shoulderCoverage": ["H05"], "hem": ["H05"],
    "headwearHeight": ["C01"], "headwearShape": ["C04"], "coralStrands": ["C05"],
    "occasion": ["H01", "H02a", "H02b", "H04", "H04q", "H05", "H07", "S05", "S06", "C07", "C09"],
    "role": ["H01", "H02a", "H02b", "C05", "C07"],
    "whoseEvent": [], "community": ["S04", "C01", "C02", "C03", "C04", "C05", "C06"],
    "denomination": ["H05"], "asoEbiBought": ["H03a", "H03b"],
    "asoEbiColour": ["H03a"], "asoEbiTextile": ["H03b"],
    "brideColours": ["H02a"], "familyTextiles": ["H02b"],
    "timeOfDay": ["S06"], "formalityBand": ["S04", "C07"], "titledWoman": ["C06"],
    "traditionalWear": ["H06", "S01", "C01", "C02", "C03", "C04", "C05", "C06"],
    "printDominance": ["S03"], "v1": ["V1 set/covering handoff", "verdict"],
}


def read_source():
    raw = (ROOT / DOCUMENT).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == DOCUMENT_SHA256, "Source document changed"
    with zipfile.ZipFile(ROOT / DOCUMENT) as archive:
        xml = ET.fromstring(archive.read("word/document.xml"))
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    text = lambda node: "".join(t.text or "" for t in node.findall(".//w:t", ns)).strip()
    scenarios, looks = {}, {}
    current = None
    for node in xml.find("w:body", ns):
        if node.tag.endswith("}p"):
            value = text(node)
            match = re.match(r"^(S\d\d) · ", value)
            if match:
                current = match[1]
                scenarios[current] = {"title": value, "context": ""}
            elif value and current and not scenarios[current]["context"]:
                scenarios[current]["context"] = value
        elif node.tag.endswith("}tbl"):
            for row in node.findall("w:tr", ns):
                cells = [text(cell) for cell in row.findall("w:tc", ns)]
                if cells and re.fullmatch(r"S\d\d-[A-D]", cells[0]):
                    # Assert the upload contains descriptions only, not filled rating columns.
                    assert not any(cells[2:]), "Unexpected filled columns; stop blind encoding"
                    assert cells[0] not in looks, "Duplicate source look"
                    looks[cells[0]] = cells[1]
    expected = {f"S{n:02}-{letter}" for n in range(1, 26) for letter in "ABCD"}
    assert set(looks) == expected and len(scenarios) == 25
    return scenarios, looks


# Exact scenario phrases. No community inferred from city; no event band inferred
# from an occasion/role, and no original wedding brief reused as the current brief.
SCENARIOS = {
    "S01": dict(occasion=("owambe", "owambe"), role=("guest", "guest"),
                community=("yoruba", "Yoruba"), timeOfDay=("evening", "in the evening"),
                asoEbiBought=(False, "She has not bought the aso-ebi"),
                whoseEvent=("a friend's 40th-birthday owambe", "a friend's 40th-birthday owambe")),
    "S02": dict(occasion=("owambe", "owambe"), role=("family", "family in aso-ebi"),
                community=("yoruba", "Yoruba"), asoEbiColour=("royal blue", "royal blue"),
                asoEbiTextile=("lace-swiss-voile", "Swiss voile lace"),
                whoseEvent=("the celebrant's sister", "the celebrant's sister")),
    "S03": dict(occasion=("traditionalWedding", "traditional wedding"),
                role=("motherOfBride", "mother of the bride"), community=("igbo", "Igbo"),
                timeOfDay=("day", "in the afternoon"), titledWoman=(False, "She is not a titled woman")),
    "S04": dict(occasion=("traditionalWedding", "traditional wedding"),
                role=("guest", "guest"), community=("igbo", "Igbo"),
                asoEbiBought=(False, "She has not bought aso-ebi")),
    "S05": dict(occasion=("traditionalWedding", "traditional wedding"),
                role=("guest", "guest"), community=("hausa", "Hausa")),
    "S06": dict(occasion=("traditionalWedding", "traditional wedding"),
                role=("bride", "bride"), community=("yoruba", "Yoruba"),
                whoseEvent=("her traditional ceremony", "her traditional ceremony")),
    "S07": dict(occasion=("naming", "Naming ceremony"), role=("guest", "guest"),
                timeOfDay=("day", "daytime naming"), asoEbiBought=(False, "no aso-ebi")),
    "S08": dict(occasion=("naming", "Naming ceremony"), role=("mother", "mother"),
                timeOfDay=("day", "in the afternoon"), whoseEvent=("her baby's naming", "her baby's naming")),
    "S09": dict(occasion=("funeral", "funeral"), role=("guest", "guest"), community=("yoruba", "Yoruba"),
                asoEbiBought=(False, "She has not bought it"),
                whoseEvent=("the burial of an elder", "the burial of an elder")),
    "S10": dict(occasion=("funeral", "funeral"), role=("family", "a daughter of the family"),
                community=("igbo", "Igbo")),
    "S11": dict(occasion=("work", "Corporate bank")),
    "S12": dict(occasion=("work", "Creative office")),
    "S13": dict(occasion=("other", "Dinner at an upscale restaurant")),
    "S14": dict(occasion=("church", "Church"), denomination=("catholic", "Catholic")),
    "S15": dict(occasion=("other", "Daytime party"), timeOfDay=("day", "day party")),
    "S16": dict(occasion=("other", "Travel: London to Lagos, arriving for family dinner")),
    "S17": dict(occasion=("church", "church thanksgiving"),
                whoseEvent=("a church thanksgiving", "a church thanksgiving")),
    "S18": dict(occasion=("whiteWedding", "White wedding"), role=("guest", "guest"),
                denomination=("catholic", "Catholic church"), timeOfDay=("evening", "evening church wedding")),
    "S19": dict(occasion=("other", "Job interview")),
    "S20": dict(occasion=("casual", "Casual weekend")),
    "S21": dict(occasion=("other", "Campus presentation")),
    "S22": dict(occasion=("other", "Date night")),
    "S23": dict(occasion=("work", "Corporate office")),
    "S24": dict(occasion=("church", "Church"), denomination=("pentecostal", "Pentecostal")),
    "S25": dict(occasion=("owambe", "Owambe"), role=("guest", "guest"),
                asoEbiBought=(False, "She has not bought the aso-ebi")),
}

# Each entry selects an actual item phrase and only a lexical garment kind.
# Gowns -> dress, blouses/shells -> top, heels/etc. -> shoes are vocabulary
# normalisations, not structural, cultural, quality or formality judgements.
def I(phrase, kind, **facts):
    return (phrase, kind, facts)


ITEMS = {
    "S01-A": [I("Fitted floor-length gown in heavy French lace, wine red", "dress"),
              I("A tall, well-tied matching gele", "gele"), I("Gold earrings", "earrings"),
              I("Metallic heels", "shoes"), I("A beaded clutch", "clutch")],
    "S01-B": [I("Fitted gown in thin, shiny polyester lace, emerald", "dress",
               textileIdentity=("lace", "polyester lace")),
              I("A pre-tied auto-gele", "gele"), I("Gold clutch", "clutch"), I("Block heels", "shoes")],
    "S01-C": [I("Premium heavyweight Ankara skirt", "ankara-skirt", colour=("royal blue", "royal blue")),
              I("peplum blouse", "top", textileIdentity=("premium-ankara", "Premium heavyweight Ankara skirt and peplum blouse"),
                colour=("royal blue", "royal blue")),
              I("A small, neat gele", "gele"), I("Closed heels", "shoes"), I("A box bag", "box-bag")],
    "S01-D": [I("iro", "iro", textileIdentity=("aso-oke", "Hand-woven aso-oke iro and buba"),
               colour=("beige and gold", "beige and gold")),
              I("buba", "buba", textileIdentity=("aso-oke", "Hand-woven aso-oke iro and buba"),
                colour=("beige and gold", "beige and gold")),
              I("A gele", "gele"), I("ipele", "ipele"), I("Gold jewellery", "jewellery"),
              I("White leather trainers", "shoes")],
    "S02-A": [I("iro", "iro"), I("buba", "buba"), I("a matching gele tied tall", "gele"),
              I("heels toned to the blue", "shoes"), I("a small clutch", "clutch")],
    "S02-B": [I("The aso-ebi blouse", "top"), I("a black pencil skirt", "skirt"), I("Black heels", "shoes")],
    "S02-C": [I("iro", "iro"), I("buba", "buba"), I("a matching gele", "gele"), I("matching heels", "shoes")],
    "S02-D": [I("iro", "iro"), I("buba", "buba"), I("a matching royal blue lace jacket", "jacket"),
              I("the matching gele", "gele"), I("heels toned to the blue", "shoes")],
    "S03-A": [I("Heavy Indian George double wrapper in wine and gold", "double-wrapper"),
              I("a beaded velvet blouse", "top"), I("several strands of coral at the neck and wrists", "coral"),
              I("a wide matching ichafu", "ichafu"), I("embellished heels", "shoes"), I("a hard clutch", "clutch")],
    "S03-B": [I("ivory (odu) bangles and anklets", "ivory-odu", colour=None)],
    "S03-C": [I("A beaded French lace gown in gold", "dress"), I("simple gold jewellery", "jewellery"),
              I("embellished heels", "shoes")],
    "S03-D": [I("A thin printed wrapper that imitates George", "wrapper", textileIdentity=None),
              I("a plain cotton blouse", "top"), I("plastic coral beads", "coral"),
              I("an ichafu in a clashing colour", "ichafu")],
    "S04-A": [I("A gown in cord lace, emerald", "dress"), I("An ichafu in a matching tone", "ichafu"),
              I("Gold earrings", "earrings"), I("Embellished heels", "shoes"), I("A clutch", "clutch")],
    "S04-B": [I("A George double wrapper", "double-wrapper"), I("a lace blouse", "top"),
              I("a full set of coral beads at the neck and wrists", "coral"), I("a hand fan", "hand-fan")],
    "S04-C": [I("A gown in cord lace, gold", "dress"), I("a large casual canvas tote", "bag"),
              I("embellished heels", "shoes")],
    "S04-D": [I("A white lace gown", "dress"), I("silver heels", "shoes"), I("a small clutch", "clutch")],
    "S05-A": [I("A long, embroidered lace gown in soft mint, fully lined, long sleeves", "dress"),
              I("A matching gyale over her head", "gyale"), I("Gold jewellery", "jewellery"),
              I("Closed embellished shoes", "shoes"), I("A clutch", "clutch")],
    "S05-B": [],  # Only the same gown, not the other look's accessories.
    "S05-C": [I("A brocade abaya set in jewel teal", "abaya"),
              I("a matching kallabi", "kallabi"), I("gold jewellery", "jewellery"), I("closed heels", "shoes")],
    "S05-D": [I("A long lace gown with long sleeves", "dress"), I("A thin gyale", "gyale"),
              I("Gold jewellery", "jewellery"), I("Closed shoes", "shoes")],
    "S06-A": [I("iro", "iro", textileIdentity=("aso-oke", "Hand-woven aso-oke iro and buba"),
               colour=("gold and wine", "gold and wine")),
              I("buba", "buba", textileIdentity=("aso-oke", "Hand-woven aso-oke iro and buba"),
                colour=("gold and wine", "gold and wine")),
              I("a tall structured gele", "gele"), I("an ipele", "ipele"),
              I("coral", "coral"), I("gold jewellery", "jewellery"), I("bespoke embellished heels", "shoes")],
    "S06-B": [I("A white Western wedding gown", "dress"), I("a veil", "veil")],
    "S06-C": [I("iro", "iro", textileIdentity=("lace", "heavy lace iro and buba"),
               colour=("champagne", "champagne")),
              I("buba", "buba", textileIdentity=("lace", "heavy lace iro and buba"),
                colour=("champagne", "champagne")),
              I("a simple small gele", "gele"), I("minimal jewellery", "jewellery"), I("plain heels", "shoes")],
    "S06-D": [I("An aso-oke buba", "buba"), I("a premium Ankara wrapper in a different colour", "wrapper"),
              I("a gele", "gele"), I("gold jewellery", "jewellery")],
    "S07-A": [I("skirt", "skirt", textileIdentity=("lace-swiss-voile", "skirt and blouse in peach Swiss voile"),
               colour=("peach", "peach")),
              I("blouse", "top", textileIdentity=("lace-swiss-voile", "skirt and blouse in peach Swiss voile"),
                colour=("peach", "peach")),
              I("a small soft gele", "gele"), I("block heels", "shoes"), I("a small structured bag", "bag")],
    "S07-B": [I("A black lace gown", "dress"), I("a tall sculpted gele", "gele"), I("stiletto heels", "shoes")],
    "S07-C": [I("iro", "iro", colour=("cream", "lightweight cream iro and buba")),
              I("buba", "buba", colour=("cream", "lightweight cream iro and buba")),
              I("a soft head wrap", "headwrap"), I("wedges", "shoes"), I("a small clutch", "clutch")],
    "S07-D": [I("A navy shift dress", "dress"), I("stiletto heels", "shoes"), I("a work tote", "bag")],
    "S08-A": [I("A soft cream lace bubu", "bubu"), I("a soft turban", "turban"),
              I("embellished flat sandals", "shoes")],
    "S08-B": [I("A heavy Indian George double wrapper", "double-wrapper"),
              I("a tight corset blouse", "top"), I("a wide ichafu", "ichafu"), I("five-inch heels", "shoes")],
    "S08-C": [I("skirt", "skirt", colour=("white", "soft white lace skirt"), textileIdentity=("lace", "soft white lace skirt")),
              I("loose blouse", "top"), I("a light head tie", "head-tie"), I("block heels", "shoes")],
    "S08-D": [I("A soft gold kaftan", "kaftan"), I("a turban", "turban"), I("stiletto heels", "shoes")],
    "S09-A": [I("A black lace dress with sleeves, hem below the knee", "dress"),
              I("a simple black head tie", "head-tie"), I("closed flats", "shoes"),
              I("a small bag", "bag"), I("stud earrings", "earrings")],
    "S09-B": [I("iro", "iro", colour=("deep red", "deep red iro and buba")),
              I("buba", "buba", colour=("deep red", "deep red iro and buba")),
              I("a tall gele", "gele"), I("gold jewellery", "jewellery")],
    "S09-C": [I("A charcoal skirt suit", "skirt-suit"), I("a modest blouse", "top"),
              I("closed pumps", "shoes"), I("a plain bag", "bag")],
    "S09-D": [I("A black lace gown", "dress"), I("a tall sculpted gele", "gele"), I("block heels", "shoes")],
    "S10-A": [I("The assigned black and white George wrapper", "wrapper"), I("a black lace blouse", "top"),
              I("a matching head tie", "head-tie"), I("flat shoes", "shoes")],
    "S10-B": [I("The assigned wrapper", "wrapper"), I("a bright red lace blouse", "top"), I("a matching head tie", "head-tie")],
    "S10-C": [I("Her own black lace gown", "dress"), I("a plain head tie", "head-tie")],
    "S10-D": [I("The assigned wrapper", "wrapper"), I("a black blouse", "top"),
              I("a beaded sculpted party head tie", "head-tie"), I("stiletto heels", "shoes")],
    "S11-A": [I("A premium small-scale Ankara blazer", "blazer"), I("a white silk shell", "top"),
              I("tailored black trousers", "trousers"), I("closed pumps", "shoes"), I("a structured bag", "bag")],
    "S11-B": [I("A large bold orange wax-print fitted dress", "dress"), I("a tall gele", "gele")],
    "S11-C": [I("A tailored navy suit with a small tonal Ankara trim at the collar and cuffs", "suit",
               textileIdentity=None), I("closed pumps", "shoes"), I("a structured bag", "bag")],
    "S11-D": [I("a skirt", "skirt", textileIdentity=("premium-ankara", "mid-scale premium Ankara co-ord")),
              I("matching top", "top", textileIdentity=("premium-ankara", "mid-scale premium Ankara co-ord")),
              I("block heels", "shoes"), I("a structured bag", "bag")],
    "S12-A": [I("Adire wide-leg trousers", "trousers"), I("a plain black shell", "top"),
              I("a structured blazer", "blazer"), I("clean leather trainers", "shoes")],
    "S12-B": [I("A dashiki", "dashiki"), I("a matching hat", "hat"), I("cowrie jewellery", "jewellery")],
    "S12-C": [I("A premium Ankara jumpsuit", "jumpsuit"), I("a structured bag", "bag"), I("loafers", "shoes")],
    "S12-D": [I("A premium Ankara co-ord", "co-ord"), I("white trainers", "shoes"), I("a baseball cap", "baseball-cap")],
    "S13-A": [I("A black silk slip dress", "dress"), I("a printed Ankara blazer", "blazer"),
              I("strappy heels", "shoes"), I("a small bag", "bag")],
    "S13-B": [I("Head-to-toe bold wax print", None), I("a print bag", "bag"),
              I("print shoes", "shoes"), I("busy jewellery", "jewellery")],
    "S13-C": [I("A two-piece lace set in champagne", "two-piece-set"), I("statement earrings", "earrings"), I("heels", "shoes")],
    "S13-D": [I("A bold Ankara top", "ankara-top"), I("jeans", "jeans"), I("flat sandals", "shoes")],
    "S14-A": [I("A knee-length lace skirt suit with elbow-length sleeves", "skirt-suit"), I("a simple head tie", "head-tie")],
    "S14-B": [I("A sleeveless Ankara dress that ends above the knee", "dress")],
    "S14-C": [I("A tailored trouser jumpsuit in a solid colour", "jumpsuit"), I("a wrap scarf over her head", "scarf")],
    "S14-D": [I("wrapper", "wrapper", textileIdentity=("hollandais", "premium Hollandais wrapper and blouse")),
              I("blouse", "top", textileIdentity=("hollandais", "premium Hollandais wrapper and blouse")),
              I("an ichafu", "ichafu"), I("low heels", "shoes"), I("a structured bag", "bag")],
    "S15-A": [I("wide-leg trousers", "trousers", textileIdentity=("premium-ankara", "premium Ankara co-ord")),
              I("a print top", "top", textileIdentity=("premium-ankara", "premium Ankara co-ord")),
              I("leather sandals", "shoes"), I("a straw clutch", "clutch")],
    "S15-B": [I("A silk kaftan", "kaftan"), I("statement earrings", "earrings"), I("block heels", "shoes")],
    "S15-C": [I("A stiff, cheap polyester print bodycon dress", "dress"), I("a bag", "bag"), I("shoes", "shoes")],
    "S15-D": [I("A lace skirt", "skirt"), I("a plain white T-shirt", "top"), I("a tall sculpted gele", "gele")],
    "S16-A": [I("Soft jersey wide-leg trousers", "trousers"), I("a linen kaftan top", "top"),
              I("a light wrap", "wrap"), I("slip-on shoes", "shoes")],
    "S16-B": [I("A heavy George double wrapper", "double-wrapper"), I("a beaded blouse", "top")],
    "S16-C": [I("A silk set", "set"), I("stiletto heels", "shoes")],
    "S16-D": [I("A loud, large wax-print jumpsuit", "jumpsuit"), I("white trainers", "shoes")],
    "S17-A": [I("The wine lace blouse", "top"), I("a different George wrapper in a toning colour of equal quality", "wrapper"),
              I("a matching head tie", "head-tie"), I("heels", "shoes")],
    "S17-B": [I("a lace blouse", "top", colour=("wine", "complete wine set")),
              I("a George wrapper in wine", "wrapper"), I("the same head tie", "head-tie"), I("heels", "shoes")],
    "S17-C": [I("The wine lace blouse", "top"), I("a thin printed wrapper that does not match", "wrapper"),
              I("plain flat shoes", "shoes")],
    "S17-D": [I("The wine George wrapper", "wrapper"), I("a plain white T-shirt", "top"), I("trainers", "shoes")],
    "S18-A": [I("A satin gown in champagne that reads close to ivory", "dress", colour=("champagne", "champagne")),
              I("pearl earrings", "earrings"), I("nude heels", "shoes")],
    "S18-B": [I("An emerald lace gown with sleeves", "dress"), I("a fascinator", "fascinator"),
              I("a clutch", "clutch"), I("metallic heels", "shoes")],
    "S18-C": [I("A navy luxe-crepe jumpsuit", "jumpsuit"), I("statement earrings", "earrings"), I("strappy heels", "shoes")],
    "S18-D": [I("A strapless Ankara gown with bare shoulders", "dress"), I("a clutch", "clutch"), I("heels", "shoes")],
    "S19-A": [I("A navy skirt suit", "skirt-suit"), I("a white blouse", "top"), I("closed pumps", "shoes"), I("a structured bag", "bag")],
    "S19-B": [I("A bright fuchsia wax-print dress", "dress"), I("heels", "shoes")],
    "S19-C": [I("Charcoal trousers", "trousers"), I("a cream silk blouse", "top"),
              I("a tailored blazer", "blazer"), I("a structured bag", "bag")],
    "S19-D": [I("A black bodycon dress", "dress"), I("high heels", "shoes"), I("a statement necklace", "necklace")],
    "S20-A": [I("Linen wide-leg trousers", "trousers"), I("a cotton top", "top"), I("flat sandals", "shoes")],
    "S20-B": [I("A wool blazer", "blazer"), I("a fitted top", "top"), I("jeans", "jeans"), I("boots", "shoes")],
    "S20-C": [I("A denim jacket", "jacket"), I("jeans", "jeans"), I("trainers", "shoes")],
    "S20-D": [I("A cotton midi dress", "dress"), I("sandals", "shoes")],
    "S21-A": [I("A midi dress with sleeves", "dress"), I("flat shoes", "shoes")],
    "S21-B": [I("A sleeveless mini dress", "dress"), I("heels", "shoes")],
    "S21-C": [I("Tailored trousers", "trousers"), I("a fitted Ankara top with sleeves", "ankara-top"), I("flat shoes", "shoes")],
    "S21-D": [I("Tailored shorts", "shorts"), I("a blazer", "blazer"), I("loafers", "shoes")],
    "S22-A": [I("A little black dress", "dress"), I("strappy heels", "shoes"), I("small gold earrings", "earrings")],
    "S22-B": [I("A corset-top lace gown", "dress"), I("a tall sculpted gele", "gele")],
    "S22-C": [I("A silk jumpsuit", "jumpsuit"), I("mules", "shoes"), I("a small bag", "bag")],
    "S22-D": [I("Jeans", "jeans"), I("a white T-shirt", "top"), I("trainers", "shoes")],
    "S23-A": [I("blazer", "blazer", colour=("navy", "navy blazer and trousers set")),
              I("trousers", "trousers", colour=("navy", "navy blazer and trousers set")),
              I("a black hijab", "hijab"), I("closed flats", "shoes")],
    "S23-B": [I("a tall sculpted gele", "gele")],
    "S23-C": [I("A sleeveless sheath dress", "dress")],
    "S23-D": [I("A soft grey abaya", "abaya"), I("a tailored jacket", "jacket"), I("a plain matching scarf", "scarf")],
    "S24-A": [I("A fitted lace dress with sleeves and a hem below the knee", "dress"),
              I("a small fascinator", "fascinator"), I("block heels", "shoes")],
    "S24-B": [I("A backless sequin gown", "dress"), I("stiletto heels", "shoes")],
    "S24-C": [I("A tailored trouser suit", "trouser-suit"), I("a silk blouse", "top"),
              I("a structured bag", "bag"), I("pointed heels", "shoes")],
    "S24-D": [I("An Ankara gown with a hem above the knee and short sleeves", "dress"), I("heels", "shoes")],
    "S25-A": [I("A Western formal midi dress in jewel green", "dress"), I("a small neat gele", "gele"), I("metallic heels", "shoes")],
    "S25-B": [I("A premium Ankara gown with a structured silhouette", "dress"), I("statement heels", "shoes"), I("a clutch", "clutch")],
    "S25-C": [I("A black tuxedo-style suit", "suit"), I("a tall sculpted gele", "gele")],
    "S25-D": [I("A beaded lace gown", "dress"), I("a matching head tie", "head-tie"),
              I("gold jewellery", "jewellery"), I("heels", "shoes"), I("a clutch", "clutch")],
}

# Longest literal textile/colour expressions win. No colour-family conversion,
# cheapness inferred from shine, cultural inference or unknown-quality defaults.
TEXTILES = [
    ("Indian George", "indian-george"), ("French lace", "lace-french"),
    ("cord lace", "lace-cord"), ("Swiss voile", "lace-swiss-voile"),
    ("beaded lace", "lace-beaded"), ("aso-oke", "aso-oke"), ("Hollandais", "hollandais"),
    ("luxe-crepe", "luxe-crepe"), ("wax-print", "wax-print"), ("wax print", "wax-print"),
    ("George", "george"), ("Ankara", "ankara"), ("Adire", "adire"),
    ("brocade", "brocade"), ("velvet", "velvet"), ("polyester", "polyester"),
    ("cotton", "cotton"), ("linen", "linen"), ("jersey", "jersey"),
    ("denim", "denim"), ("satin", "satin"), ("silk", "silk"), ("lace", "lace"),
]
COLOURS = [
    "black and white", "wine and gold", "beige and gold", "gold and wine",
    "royal blue", "lighter blue", "deep red", "bright red", "coral red",
    "soft mint", "jewel teal", "jewel green", "bright fuchsia",
    "wine red", "champagne", "charcoal", "emerald", "navy", "peach", "cream",
    "black", "white", "gold", "silver", "ivory", "blue", "grey", "nude", "orange", "wine",
]


def literal_matches(phrase, choices):
    matches = []
    for literal, value in choices:
        match = re.search(r"(?<![\w-])" + re.escape(literal) + r"(?![\w-])", phrase, re.I)
        if match:
            matches.append((len(literal), value, match.group()))
    return max(matches, default=None)


def make_fixtures(scenarios, looks):
    fixtures = {}
    for look_id, specs in ITEMS.items():
        sid = look_id[:3]
        passages = {
            f"{sid}.title": scenarios[sid]["title"],
            f"{sid}.context": scenarios[sid]["context"],
            look_id: looks[look_id],
        }
        evidence = {}
        facts = dict(items=[], brief={f: None for f in BRIEF_FIELDS},
                     traditionalWear=None, printDominance=None, v1=None)

        def citation(quote, preferred=look_id):
            # Every source lookup is restricted to this description and its
            # scenario unless an explicit "same" reference is resolved below.
            order = [preferred, f"{sid}.title", f"{sid}.context"]
            for source in dict.fromkeys(order):
                if quote in passages[source]:
                    return {"source": source, "quote": quote}
            raise AssertionError(f"{look_id}: unsupported exact phrase {quote!r}")

        def assign(path, value, quote, preferred=look_id):
            evidence[path] = [citation(quote, preferred)]
            return value

        for field, (value, quote) in SCENARIOS[sid].items():
            facts["brief"][field] = assign("/brief/" + field, value, quote)

        for phrase, kind, explicit in specs:
            index = len(facts["items"])
            item = {field: None for field in ITEM_FIELDS}
            item["id"] = f"{look_id}-item-{index+1:02}"
            prefix = f"/items/{index}/"
            if kind is not None:
                item["kind"] = assign(prefix + "kind", kind, phrase)
            colour = literal_matches(phrase, [(c, c) for c in COLOURS])
            # Jewellery metal/material names alone do not establish their hue.
            if colour and kind not in ("jewellery", "earrings", "necklace", "coral", "ivory-odu"):
                _, value, quote = colour
                item["colour"] = assign(prefix + "colour", value, quote)
            textile = literal_matches(phrase, TEXTILES)
            premium = re.search(r"premium(?:[\w -]*?)Ankara", phrase, re.I)
            if premium:
                item["textileIdentity"] = assign(prefix + "textileIdentity", "premium-ankara", premium.group())
            elif textile:
                _, value, quote = textile
                item["textileIdentity"] = assign(prefix + "textileIdentity", value, quote)
            if kind == "shoes":
                match = re.search(r"\b(trainers|heels|pumps|loafers|wedges|boots|mules)\b", phrase, re.I)
                if match:
                    value = "trainer" if match.group().lower() == "trainers" else "other"
                    item["footwearType"] = assign(prefix + "footwearType", value, match.group())
            if kind in ("gele", "ichafu"):
                match = re.search(r"\btall\b", phrase)
                if match:
                    item["headwearHeight"] = assign(prefix + "headwearHeight", "tall", match.group())
            for literal, value in [("floor-length", "floor"), ("below the knee", "belowKnee"),
                                   ("above the knee", "aboveKnee"), ("knee-length", "knee"),
                                   ("midi", "belowKnee"), ("mini", "aboveKnee")]:
                match = re.search(r"\b" + literal + r"\b", phrase, re.I)
                if match:
                    item["hem"] = assign(prefix + "hem", value, match.group())
                    break
            if "bare shoulders" in phrase:
                item["shoulderCoverage"] = assign(prefix + "shoulderCoverage", "uncovered", "bare shoulders")
            if "cheap polyester" in phrase:
                item["quality"] = assign(prefix + "quality", "poorPolyester", "cheap polyester")
            for field, spec in explicit.items():
                if spec is None:
                    item[field] = None
                    evidence.pop(prefix + field, None)
                else:
                    value, quote = spec
                    item[field] = assign(prefix + field, value, quote)
            facts["items"].append(item)

        def inherit(source_id, indices, via):
            previous = fixtures[source_id]
            passages.update(previous["source"]["passages"])
            bridge = {"source": look_id, "quote": via}
            assert via in looks[look_id]
            inherited = []
            inherited_evidence = {}
            for new_index, old_index in enumerate(indices):
                item = copy.deepcopy(previous["lookFacts"]["items"][old_index])
                item["id"] = f"{look_id}-item-{new_index+1:02}"
                inherited.append(item)
                for field in ITEM_FIELDS:
                    old_path = f"/items/{old_index}/{field}"
                    if old_path in previous["evidence"]:
                        inherited_evidence[f"/items/{new_index}/{field}"] = previous["evidence"][old_path] + [bridge]
            return inherited, inherited_evidence

        if look_id in ("S03-B", "S05-B", "S23-B"):
            reference, indices, via = {
                "S03-B": ("S03-A", range(6), "The same look"),
                "S05-B": ("S05-A", [0], "The same gown"),
                "S23-B": ("S23-A", [0, 1], "The same set"),
            }[look_id]
            inherited, inherited_evidence = inherit(reference, indices, via)
            offset = len(inherited)
            old_items, old_evidence = facts["items"], evidence
            evidence = {p: e for p, e in old_evidence.items() if not p.startswith("/items/")}
            evidence.update(inherited_evidence)
            for index, item in enumerate(old_items):
                item["id"] = f"{look_id}-item-{offset+index+1:02}"
                for field in ITEM_FIELDS:
                    old_path = f"/items/{index}/{field}"
                    if old_path in old_evidence:
                        evidence[f"/items/{offset+index}/{field}"] = old_evidence[old_path]
            facts["items"] = inherited + old_items

        # Explicit same-fabric links, not fabric guessed from colour or vendor.
        if sid == "S02" and look_id != "S02-C":
            # Matching gele fabric is not explicitly the same Swiss voile textile.
            targets = {"S02-A": [0, 1], "S02-B": [0], "S02-D": [0, 1]}[look_id]
            for index in targets:
                for field, value, quote in [
                    ("textileIdentity", "lace-swiss-voile", "Swiss voile lace"),
                    ("colour", "royal blue", "royal blue"),
                ]:
                    facts["items"][index][field] = value
                    evidence[f"/items/{index}/{field}"] = [
                        citation(quote, f"{sid}.context"),
                        citation("aso-ebi"),
                    ]
        if sid == "S02" and look_id == "S02-C":
            for index in (0, 1):
                facts["items"][index]["colour"] = "lighter blue"
                evidence[f"/items/{index}/colour"] = [citation("lighter blue")]
        if sid == "S10" and look_id in ("S10-B", "S10-D"):
            for field, value, quote in [
                ("colour", "black and white", "black and white George wrapper fabric"),
                ("textileIdentity", "george", "George wrapper fabric"),
            ]:
                facts["items"][0][field] = value
                evidence[f"/items/0/{field}"] = [
                    citation(quote, f"{sid}.context"), citation("The assigned wrapper"),
                ]
        if look_id == "S17-B":
            for index in (0, 1):
                for field in ITEM_FIELDS:
                    path = f"/items/{index}/{field}"
                    if path in evidence:
                        evidence[path].append(citation("The complete wine set as it was worn"))

        fixture = dict(
            schemaVersion=1, id=look_id,
            source=dict(document=DOCUMENT, sha256=DOCUMENT_SHA256, passages=passages),
            lookFacts=facts, evidence=evidence,
        )
        fixture["gaps"] = make_gaps(facts, look_id)
        fixtures[look_id] = fixture
    return fixtures


def make_gaps(facts, look_id):
    gaps = []

    def gap(path, field, reason):
        gaps.append(dict(path=path, reason=reason, blocksRules=BLOCKS[field]))

    for field in BRIEF_FIELDS:
        if facts["brief"][field] is None:
            special = {
                ("S02", "asoEbiBought"): "The family bought the fabric; this does not explicitly state her individual purchase.",
                ("S04", "brideColours"): "Family colours are supplied, not the bride's colours.",
                ("S04", "familyTextiles"): "Family colours are supplied, not their textile identities.",
                ("S10", "asoEbiBought"): "A group fabric is assigned; purchase is not stated.",
                ("S17", "asoEbiBought"): "Purchase was for the earlier wedding, not the current church thanksgiving.",
                ("S25", "community"): "Both Igbo and Yoruba are supplied; the single-community enum cannot encode both.",
            }
            gap("/brief/" + field, field, special.get((look_id[:3], field),
                "Not explicitly supplied for the current event."))
    for field in ("traditionalWear", "printDominance", "v1"):
        gap("/" + field, field, {
            "traditionalWear": "No explicit look-level traditional-wear intent; an event or garment label is not intent.",
            "printDominance": "No explicit oneDominates/competing/noPrint fact; visual busyness is not converted into a judgement.",
            "v1": "No V1 decision, set-membership records or confirmed covering-preference evaluation supplied.",
        }[field])
    for index, item in enumerate(facts["items"]):
        for field in ITEM_FIELDS:
            if item[field] is None:
                reason = "Not explicitly stated for this item, or not expressible at the required precision."
                if field == "key":
                    reason = "The description does not explicitly supply the evaluator's key-garment boolean."
                gap(f"/items/{index}/{field}", field, reason)
    return gaps


def leaves(node, prefix=""):
    if isinstance(node, dict):
        for key, value in node.items():
            yield from leaves(value, prefix + "/" + key)
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from leaves(value, prefix + "/" + str(index))
    else:
        yield prefix, node


def validate(fixtures):
    expected = {f"S{n:02}-{letter}" for n in range(1, 26) for letter in "ABCD"}
    assert set(fixtures) == expected
    count = 0
    enums = {
        "occasion": {"work", "casual", "whiteWedding", "traditionalWedding", "funeral",
                     "church", "owambe", "naming", "traditionalEvent", "other"},
        "role": {"guest", "family", "host", "bride", "mother", "motherOfBride", "motherOfGroom", "other"},
        "community": {"yoruba", "igbo", "hausa", "other"},
        "timeOfDay": {"day", "evening"},
        "quality": {"poorPolyester", "notPoorPolyester"},
        "footwearType": {"trainer", "flipFlop", "sportsSandal", "other"},
        "shoulderCoverage": {"covered", "uncovered"},
        "hem": {"aboveKnee", "knee", "belowKnee", "ankle", "floor"},
        "headwearHeight": {"tall", "notTall"},
        "headwearShape": {"lowerWider", "other"},
        "printDominance": {"oneDominates", "competing", "noPrint"},
    }
    for id_, fixture in fixtures.items():
        facts, evidence = fixture["lookFacts"], fixture["evidence"]
        assert set(facts) == {"items", "brief", "traditionalWear", "printDominance", "v1"}
        assert set(facts["brief"]) == set(BRIEF_FIELDS)
        for item in facts["items"]:
            assert set(item) == set(ITEM_FIELDS)
        known = {path for path, value in leaves(facts) if value is not None and not path.endswith("/id")}
        for path, value in leaves(facts):
            field = path.rsplit("/", 1)[-1]
            if value is not None and field in enums:
                assert value in enums[field], (id_, path, value)
        assert known == set(evidence), f"{id_}: provenance does not cover exactly the known domain facts"
        unknown = {path for path, value in leaves(facts) if value is None}
        assert unknown == {gap["path"] for gap in fixture["gaps"]}
        for path, citations in evidence.items():
            assert citations
            for cite in citations:
                assert cite["quote"] and cite["quote"] in fixture["source"]["passages"][cite["source"]], (id_, path, cite)
            count += 1
        assert facts["v1"] is None
        assert all(item["key"] is None for item in facts["items"])
        # No field is available for author-assigned ratings/expected verdicts.
        assert set(fixture) == {"schemaVersion", "id", "source", "lookFacts", "evidence", "gaps"}
    return count


def serialise(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Validate and compare files without writing")
    args = parser.parse_args()
    scenarios, looks = read_source()
    fixtures = make_fixtures(scenarios, looks)
    evidence_count = validate(fixtures)
    outputs = {f"{id_}.json": serialise(fixture) for id_, fixture in sorted(fixtures.items())}
    assert not {p.name for p in HERE.glob("S??-?.json")} - outputs.keys()
    manifest = "".join(
        f"{hashlib.sha256(text.encode()).hexdigest()}  {name}\n" for name, text in outputs.items()
    )
    outputs["SHA256SUMS"] = manifest
    digest = hashlib.sha256(manifest.encode()).hexdigest()
    outputs["FIXTURE_SET_SHA256"] = digest + "\n"
    for name, text in outputs.items():
        path = HERE / name
        if args.check:
            assert path.read_text() == text, f"{name}: committed artifact differs from blind encoding"
        else:
            path.write_text(text)
    print(f"25 scenarios; 100 fixtures; {evidence_count} known facts with exact-phrase provenance.")
    print("No evaluator or scoring executed. Required but unstated facts remain null.")
    print(f"Fixture-set SHA-256 (SHA256SUMS bytes): {digest}")


if __name__ == "__main__":
    main()
