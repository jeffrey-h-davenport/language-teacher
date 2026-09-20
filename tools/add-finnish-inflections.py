#!/usr/bin/env python3
"""Add Finnish inflection entries to finnish-vocabulary.json."""

import json
import uuid

# (finnish_value, english_description, cefr_level)
INFLECTIONS = [

    # ── NOMINAL CASES ─────────────────────────────────────────────────────────

    # A1
    ("∅ (no suffix)",
     "nominative case (singular): subject of the sentence; base / dictionary form of noun or adjective",
     "A1"),
    ("-t",
     "nominative case (plural): plural subject of the sentence",
     "A1"),
    ("-n",
     "genitive case (singular): possession; total direct object; required by most postpositions",
     "A1"),
    ("-lla/-llä",
     "adessive case: on, at; near; possession (I have a…); transportation (by bus, on foot, etc.)",
     "A1"),

    # A2
    ("-a/-ä / -ta/-tä",
     "partitive case (singular): partial or uncountable object; after negation; after numbers greater than one; ongoing action",
     "A2"),
    ("-ssa/-ssä",
     "inessive case: inside, within (in, inside of)",
     "A2"),
    ("-sta/-stä",
     "elative case: from inside, out of; about, concerning",
     "A2"),
    ("-(V)Vn / -seen / -han/-hän/-hin/-hun/-hyn/-hon",
     "illative case: into, to the inside of; motion towards the interior",
     "A2"),
    ("-lta/-ltä",
     "ablative case: from off a surface or person; used with verbs of taking and receiving",
     "A2"),
    ("-lle",
     "allative case: onto, to a surface or person; towards",
     "A2"),

    # B1
    ("-en / -jen / -den / -tten",
     "genitive case (plural): plural possession; required by postpositions with plural nouns",
     "B1"),
    ("-a/-ä / -ta/-tä / -ita/-itä",
     "partitive case (plural): plural partial or uncountable object; after negation with plural nouns",
     "B1"),
    ("-na/-nä",
     "essive case: as, in the role of; in a temporary state or condition",
     "B1"),
    ("-ksi",
     "translative case: becoming, turning into; for a purpose or time period",
     "B1"),
    ("-tta/-ttä",
     "abessive case: without (lacking the referent)",
     "B1"),

    # C1
    ("-n (plural stem only)",
     "instructive case: by means of, using; in a certain manner; occurs mostly in fixed expressions and adverbs",
     "C1"),
    ("-ne- + possessive suffix",
     "comitative case: together with; accompanied by (always requires a possessive suffix)",
     "C1"),

    # ── VERB: PRESENT TENSE (active indicative) ───────────────────────────────

    ("-n",
     "present tense, 1st person singular (minä): I do / I am doing",
     "A1"),
    ("-t",
     "present tense, 2nd person singular (sinä): you do / you are doing",
     "A1"),
    ("-V (final vowel of stem doubled)",
     "present tense, 3rd person singular (hän / se): he / she / it does / is doing",
     "A1"),
    ("-mme",
     "present tense, 1st person plural (me): we do / we are doing",
     "A1"),
    ("-tte",
     "present tense, 2nd person plural (te): you all do / you all are doing",
     "A1"),
    ("-vat/-vät",
     "present tense, 3rd person plural (he / ne): they do / they are doing",
     "A1"),

    # ── VERB: PAST TENSE (active indicative) ──────────────────────────────────

    ("-in / -sin",
     "past tense, 1st person singular (minä): I did",
     "A2"),
    ("-it / -sit",
     "past tense, 2nd person singular (sinä): you did",
     "A2"),
    ("-i / -si",
     "past tense, 3rd person singular (hän / se): he / she / it did",
     "A2"),
    ("-imme / -simme",
     "past tense, 1st person plural (me): we did",
     "A2"),
    ("-itte / -sitte",
     "past tense, 2nd person plural (te): you all did",
     "A2"),
    ("-ivat/-ivät / -sivat/-sivät",
     "past tense, 3rd person plural (he / ne): they did",
     "A2"),

    # ── VERB: CONDITIONAL ─────────────────────────────────────────────────────

    ("-isin",
     "conditional mood, 1st person singular: I would do",
     "B1"),
    ("-isit",
     "conditional mood, 2nd person singular: you would do",
     "B1"),
    ("-isi",
     "conditional mood, 3rd person singular: he / she / it would do",
     "B1"),
    ("-isimme",
     "conditional mood, 1st person plural: we would do",
     "B1"),
    ("-isitte",
     "conditional mood, 2nd person plural: you all would do",
     "B1"),
    ("-isivat/-isivät",
     "conditional mood, 3rd person plural: they would do",
     "B1"),

    # ── VERB: IMPERATIVE ──────────────────────────────────────────────────────

    ("∅ (bare verb stem, drop -a/-ä)",
     "imperative, 2nd person singular: do! (e.g., puhu! = speak!)",
     "A2"),
    ("-kaa/-kää",
     "imperative, 2nd person plural / formal: do! (command to multiple people or formal address)",
     "A2"),
    ("-koon/-köön",
     "imperative, 3rd person singular: let him / her / it do!",
     "B1"),
    ("-kaamme/-käämme",
     "imperative, 1st person plural: let us do! / let's do!",
     "B1"),
    ("-koot/-kööt",
     "imperative, 3rd person plural: let them do!",
     "B2"),

    # ── VERB: POTENTIAL MOOD ──────────────────────────────────────────────────

    ("-nee",
     "potential mood, 3rd person singular: he / she / it may / might do (expressing probability or uncertainty)",
     "C1"),

    # ── INFINITIVES ───────────────────────────────────────────────────────────

    ("-a/-ä / -ta/-tä / -da/-dä",
     "1st infinitive: dictionary / base form of the verb (to do); used after modal verbs and motion verbs",
     "A1"),
    ("-essa/-essä",
     "2nd infinitive inessive: while doing, in the process of doing (simultaneous action)",
     "B2"),
    ("-en",
     "2nd infinitive instructive: by doing, upon doing (manner or means of action)",
     "B2"),
    ("-massa/-mässä",
     "3rd infinitive inessive: in the middle of doing, currently doing (olla -massa/-mässä = to be doing)",
     "B1"),
    ("-masta/-mästä",
     "3rd infinitive elative: stopping doing; from doing (lakata -masta/-mästä = to stop doing)",
     "B2"),
    ("-maan/-mään",
     "3rd infinitive illative: to go to do; to start doing (mennä -maan/-mään = to go to do)",
     "B1"),
    ("-malla/-mällä",
     "3rd infinitive adessive: by doing, by means of doing",
     "B1"),
    ("-malta/-mältä",
     "3rd infinitive ablative: to refrain from doing; to prevent from doing",
     "C1"),
    ("-maksi",
     "3rd infinitive translative: in order to do; so as to become",
     "B2"),
    ("-matta/-mättä",
     "3rd infinitive abessive: without doing; failing to do",
     "B2"),
    ("-minen",
     "4th infinitive / verbal noun (nominative): the act of doing; declines as a regular noun",
     "B1"),

    # ── PARTICIPLES ───────────────────────────────────────────────────────────

    ("-va/-vä",
     "present active participle: one who does / is doing; the doing one (e.g., laulava = singing)",
     "B1"),
    ("-ttava/-ttävä / -tava/-tävä",
     "present passive participle: that which is being done / ought to be done",
     "B2"),
    ("-nut/-nyt",
     "past active participle (singular): one who has done (e.g., laulanut = having sung)",
     "B1"),
    ("-neet",
     "past active participle (plural): those who have done (plural of -nut/-nyt)",
     "B2"),
    ("-ttu/-tty",
     "past passive participle (singular): that which has been done (e.g., laulettu = having been sung)",
     "B1"),
    ("-tut/-tyt",
     "past passive participle (plural): those which have been done (plural of -ttu/-tty)",
     "B2"),
    ("-ma/-mä",
     "agent participle: done by a specific agent (e.g., kirjoittama = written by; requires possessive suffix)",
     "C1"),
    ("-maton/-mätön",
     "negative participle (singular): one who has not done; that which has not happened (e.g., tuntematon = unknown)",
     "C1"),

    # ── PASSIVE VOICE ─────────────────────────────────────────────────────────

    ("-taan/-tään / -aan/-ään",
     "passive voice (present): it is done / one does (impersonal; no explicit subject)",
     "B1"),
    ("-ttiin / -iin",
     "passive voice (past): it was done / one did (impersonal past tense)",
     "B1"),

    # ── COMPARATIVE AND SUPERLATIVE ───────────────────────────────────────────

    ("-mpi / -empi / -ampi",
     "comparative degree of adjective or adverb: more (e.g., suurempi = larger, nopeampi = faster)",
     "B1"),
    ("-in / -imman (genitive)",
     "superlative degree of adjective or adverb: most (e.g., suurin = largest, nopein = fastest)",
     "B1"),

    # ── POSSESSIVE SUFFIXES ───────────────────────────────────────────────────

    ("-ni",
     "1st person singular possessive suffix: my (e.g., taloni = my house)",
     "A2"),
    ("-si",
     "2nd person singular possessive suffix: your (e.g., talosi = your house)",
     "A2"),
    ("-nsa/-nsä / -an/-ään",
     "3rd person possessive suffix: his / her / its / their (e.g., talonsa = his or her house)",
     "A2"),
    ("-mme",
     "1st person plural possessive suffix: our (e.g., talomme = our house)",
     "B1"),
    ("-nne",
     "2nd person plural possessive suffix: your (plural; e.g., talonne = your house)",
     "B1"),

    # ── CLITICS AND PARTICLES ─────────────────────────────────────────────────

    ("-ko/-kö",
     "yes/no question particle: attached to the focused word to turn a statement into a question (e.g., tuletko? = are you coming?)",
     "A1"),
    ("-kin",
     "additive clitic: also, too, even; confirms or adds to known information (e.g., minäkin = I too)",
     "B1"),
    ("-kaan/-kään",
     "negative additive clitic: either, nor; used in negative sentences (e.g., minäkään = nor I / I either)",
     "B1"),
    ("-pa/-pä",
     "emphatic clitic: adds surprise, assertion, or mild emphasis (e.g., onpa! = well, it is!)",
     "B2"),
    ("-han/-hän",
     "softening / reminder clitic: you know, after all; softens requests or recalls shared knowledge",
     "B2"),
]


def main():
    path = 'language-data/finnish-vocabulary.json'
    with open(path, encoding='utf-8') as f:
        data = json.load(f)

    new_entries = []
    for (finnish, english, cefr) in INFLECTIONS:
        entry = {
            'id':             str(uuid.uuid4()),
            'part-of-speech': 'inflection',
            'english':        english,
            'finnish':        finnish,
            'cefr':           cefr,
            'score':          0,
            'learned':        False,
        }
        new_entries.append(entry)

    data['words'] = new_entries + data['words']

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    by_cefr = {}
    for _, _, cefr in INFLECTIONS:
        by_cefr[cefr] = by_cefr.get(cefr, 0) + 1

    print(f'Added {len(new_entries)} inflection entries to {path}')
    print(f'Total words now: {len(data["words"]):,}')
    print(f'CEFR breakdown: {dict(sorted(by_cefr.items()))}')


if __name__ == '__main__':
    main()
