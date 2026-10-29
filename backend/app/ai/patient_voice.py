"""
Scenario-specific patient answers (offline, deterministic).

Used when no AI key is configured, or when the AI call fails. Every one of the 30
scenarios has its own script, so a spoken consultation is different for each case:
the DKA patient talks about missing insulin, the asthma patient about her cat, etc.

Answers are written in plain first-person speech (they are read aloud by the browser):
no stage directions, no asterisks, no clinical jargon the patient would not use.
"""
import re
import hashlib

# ── lay-language conversion for fields taken from the structured history ─────────────
LAY = [
    (r"\bhypertension\b", "high blood pressure"),
    (r"\bhypercholesterolaemia\b", "high cholesterol"),
    (r"\bischaemic heart disease\b", "heart disease"),
    (r"\bccf\b", "heart failure"),
    (r"\bmenorrhagia\b", "heavy periods"),
    (r"\brecurrent utis\b", "water infections that keep coming back"),
    (r"\bckd stage 2\b", "early kidney disease"),
    (r"\bretinopathy\b", "diabetic eye disease"),
    (r"\bcor pulmonale\b", "strain on my heart from my lungs"),
    (r"\bex-angina\b", "angina in the past"),
    (r"\bnkda\b", "no known drug allergies"),
]


def _lowfirst(s: str) -> str:
    s = s.strip()
    return s if s[:2].isupper() else s[:1].lower() + s[1:]


def _lay(text: str) -> str:
    t = text.strip().rstrip(".")
    for pat, rep in LAY:
        t = re.sub(pat, rep, t, flags=re.I)
    return t


def _join(items: list[str]) -> str:
    items = [i.strip() for i in items if i.strip()]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + " and " + items[-1]


def _is_none(text: str) -> bool:
    t = (text or "").strip().lower()
    return t in ("", "none", "not relevant") or t.startswith(("none", "no significant", "no relevant", "no history", "no family", "no cancer", "not relevant"))


# ── scenario scripts ───────────────────────────────────────────────────────────────
# keys: complaint onset character severity radiation modifiers assoc previous concern
#       has (symptoms present)  detail (symptom -> sentence)  extra [(regex, answer)]
#       social {smoke, alcohol, work, home, other}  family  pmh  meds  allergies
SCRIPTS: dict[str, dict] = {
    "Normal Adult General Examination": dict(
        complaint="I'm just here for my yearly check-up. I feel fine really, I'd just like to make sure everything's okay.",
        onset="There's nothing new going on. This is just a routine visit.",
        character="I don't have any pain or discomfort anywhere.",
        severity="No pain at all, honestly. Zero out of ten.",
        radiation="No, nothing hurts.",
        modifiers="I don't have any symptoms, so nothing really changes anything.",
        assoc="No, nothing at all. I feel well in myself, sleeping and eating normally.",
        previous="No, I've always been healthy.",
        concern="Not really worried. My dad has slightly high blood pressure, so I thought I'd get checked.",
        has=[], detail={},
        social=dict(smoke="No, I don't smoke.", alcohol="Just the odd drink at the weekend.",
                    work="I work in an office, so I'm sitting at a desk most of the day.",
                    exercise="I exercise about three times a week and try to eat sensibly."),
        family="My father has slightly high blood pressure, but it's well controlled.",
    ),
    "Iron Deficiency Anaemia": dict(
        complaint="I've just been so tired and weak for about three months now, and it's really getting me down.",
        onset="About three months. It's been slowly getting worse.",
        character="It's a constant heavy tiredness, like I've got no energy. And I get out of breath and my heart races when I climb stairs.",
        severity="It's bad enough that I struggle to get through my working day. Maybe seven out of ten.",
        radiation="I don't really have pain. It's more the tiredness.",
        modifiers="Resting helps a little, but any exertion, even stairs, makes my heart pound and I get breathless.",
        assoc="My heart pounds when I climb stairs, I get breathless, my hair's been falling out, and my periods are very heavy.",
        previous="I've never felt like this before. My periods have always been on the heavy side, though.",
        concern="I'm worried something serious is wrong. Could it be my blood?",
        has=["fatigue", "breathless", "palpitations", "bleeding", "weakness"],
        detail=dict(fatigue="Yes, I'm exhausted all the time.", breathless="Yes, when I climb the stairs.",
                    palpitations="Yes, my heart pounds when I go upstairs.", weakness="Yes, I feel weak.",
                    bleeding="Yes, my periods are very heavy and last seven or eight days."),
        extra=[
            (r"period|menstr|heavy bleed", "My periods are very heavy and last seven or eight days."),
            (r"diet|vegetar|meat|iron|what do you eat|food", "I'm vegetarian. I don't eat meat or fish, and I don't take any iron supplements."),
            (r"\bhair\b", "Yes, my hair has been falling out a lot more than usual."),
        ],
        social=dict(smoke="No, I don't smoke.", alcohol="Hardly ever.", work="I work in an office.", other="I'm vegetarian."),
        family="My mother has anaemia.",
    ),
    "Acute Coronary Syndrome": dict(
        complaint="Doctor, I've got this terrible crushing pain in the middle of my chest. It started about two hours ago and it won't go away.",
        onset="About two hours ago. It came on suddenly while I was resting and it hasn't eased at all.",
        character="It's a heavy, crushing pressure right in the middle of my chest, like a weight sitting on it.",
        severity="It's the worst pain I've ever had. Ten out of ten.",
        radiation="Yes, it goes down my left arm and up into my jaw.",
        modifiers="Nothing helps. I tried my GTN spray and it did nothing, and resting doesn't ease it either.",
        assoc="I've been sweating a lot, I feel sick, and I'm a bit short of breath.",
        previous="No, I've never had pain like this before.",
        concern="I'm scared it's a heart attack. My father died of one when he was fifty-five.",
        has=["sweating", "nausea", "breathless", "chestpain"],
        detail=dict(sweating="Yes, I'm drenched in sweat. It came on with the pain.",
                    nausea="Yes, I feel sick, though I haven't actually vomited.",
                    breathless="A bit, yes. It's hard to catch my breath.",
                    chestpain="Yes, that's what I came in for. It's crushing."),
        social=dict(smoke="I used to smoke, about twenty pack-years, but I gave up five years ago.", work="I'm retired now."),
        family="My father died of a heart attack at fifty-five, and my brother has angina.",
        allergies="Yes, aspirin. It gives me a rash.",
        extra=[(r"risk factor", "I've got high blood pressure, diabetes and high cholesterol, and I used to smoke.")],
    ),
    "Aortic Stenosis": dict(
        complaint="I've fainted twice recently when I was out walking, and I thought I ought to get it checked.",
        onset="The breathlessness has been creeping up over about a year. I've fainted twice now, both times when I was walking.",
        character="Both times I was walking briskly, felt dizzy, and then I blacked out for a moment. I also get a tightness in my chest going up stairs.",
        severity="The chest tightness is about a five out of ten, and I have to stop and rest.",
        radiation="No, it stays in the middle of my chest.",
        modifiers="It comes on when I exert myself, climbing stairs or walking fast, and it settles when I stop and rest.",
        assoc="I've been getting more breathless over the last year, and I get chest tightness on stairs.",
        previous="The chest tightness and breathlessness have been building up for a year, but the fainting is new.",
        concern="I'm a bit worried it's my heart. I've never fainted before.",
        has=["breathless", "chestpain", "dizzy"],
        detail=dict(dizzy="Yes, I feel dizzy and then I black out, but only when I'm walking about.",
                    chestpain="Yes, a tightness when I climb stairs.", breathless="Yes, it's been getting worse over the last year."),
        extra=[
            (r"rheumat|as a child|childhood|when you were young|heart valve|murmur", "I had rheumatic fever when I was twelve."),
            (r"faint|blackout|black out|collaps|pass(ed)? out|syncope", "Yes, twice. Both times when I was walking, and I came round after a few seconds."),
        ],
        social=dict(smoke="No, I've never smoked.", alcohol="Very little.", work="I'm retired."),
        family="No, there's no heart disease in my family.",
        pmh="I have high blood pressure, and I had rheumatic fever when I was twelve.",
    ),
    "Community-Acquired Pneumonia": dict(
        complaint="I've had a bad cough with yellow phlegm, and a fever, for four days now.",
        onset="About four days. It's got worse each day.",
        character="I cough up thick yellow-green phlegm. And on the right side my chest hurts when I breathe in or cough.",
        severity="The chest pain is about a six out of ten when I take a deep breath.",
        radiation="No, it stays on the right side of my chest.",
        modifiers="Taking a deep breath or coughing makes it worse. Nothing really helps.",
        assoc="I've had a high fever, and I'm short of breath, especially when I move around.",
        previous="No, I've never had a chest infection like this. I do have mild asthma, though.",
        concern="I'm worried it's pneumonia. I feel so weak.",
        has=["fever", "cough", "breathless", "chestpain", "fatigue"],
        detail=dict(fever="Yes, I measured thirty-eight point nine yesterday, with shivers.",
                    chestpain="Yes, on the right side, sharp when I breathe in.", fatigue="Yes, I feel very weak."),
        extra=[
            (r"sputum|phlegm|spit|colou?r of|what colou?r", "It's thick and yellow-green."),
            (r"coughing (up )?blood|blood in|haemoptysis", "No, there's no blood in it."),
        ],
        social=dict(smoke="No, I don't smoke.", work="I'm a teacher."),
        family="Nothing relevant, no.",
        allergies="Yes, penicillin. I had a severe reaction to it, anaphylaxis.",
    ),
    "Pleural Effusion": dict(
        pmh='I have COPD.',
        complaint="I've been getting more and more short of breath over the last three weeks.",
        onset="About three weeks. It's been getting steadily worse.",
        character="I just can't get a full breath in, especially when I'm walking.",
        severity="Right now it's about a six out of ten. Even a short walk wears me out.",
        radiation="I don't really have pain. It's the breathlessness that's the problem.",
        modifiers="Resting helps a bit, but anything active makes it worse.",
        assoc="I've lost about eight kilos without trying, and I've been having night sweats.",
        previous="I've got COPD, so I'm used to some breathlessness, but this is much worse than my usual.",
        concern="I'm worried it might be cancer, with the weight loss and everything.",
        has=["breathless", "weight", "sweating", "cough"],
        detail=dict(weight="Yes, I've lost about eight kilos without trying.", sweating="Yes, I get drenching night sweats.",
                    cough="Just my usual smoker's cough, nothing new."),
        extra=[
            (r"asbestos|exposure|builder|construction|dust|lag(ging)?|insulation", "I worked as a builder for about twenty years, and we were around asbestos a lot."),
            (r"coughing (up )?blood|haemoptysis", "No, I haven't coughed up any blood."),
        ],
        social=dict(smoke="I used to smoke, about forty pack-years, but I've given up.",
                    work="I'm a retired builder. I was around asbestos for about twenty years."),
        family="No cancer in the family that I know of.",
    ),
    "Chronic Liver Disease with Ascites": dict(
        complaint="My belly's been swelling up for about six weeks, and my ankles too.",
        onset="Around six weeks. My trousers don't fit me any more.",
        character="It's a tight, bloated feeling, and my tummy is really swollen. My ankles are puffy as well.",
        severity="It's more uncomfortable than painful. Maybe a four out of ten.",
        radiation="No, it's just my whole belly.",
        modifiers="Nothing really helps. It just keeps getting bigger.",
        assoc="My skin and eyes have turned yellow over the last two weeks, and at night I get confused.",
        previous="I've been in hospital before, because I bled from veins in my gullet. That was because of my liver.",
        concern="I know it's my liver. I'm frightened because I've drunk heavily for years.",
        has=["swelling", "jaundice", "confusion"],
        detail=dict(swelling="Yes, my belly and my ankles are swollen.", jaundice="Yes, my skin and eyes have gone yellow over the last two weeks.",
                    confusion="Yes, at night I get muddled and my memory's bad."),
        extra=[
            (r"alcohol|drink|units|beer|spirits|how much do you", "I've drunk heavily for about twenty years. If I'm honest, it's been a lot, every day."),
            (r"bleed|vomit(ed|ing)? blood|haemat|variceal|black stool", "Yes, I vomited a lot of blood once before, and they treated the veins in my gullet."),
        ],
        social=dict(smoke="Not now.", alcohol="I've drunk heavily for twenty years.", work="I'm unemployed at the moment.", home="I live alone."),
        family="My father was an alcoholic.",
        pmh="I've got cirrhosis of the liver from the drinking, and I bled from veins in my gullet before.",
    ),
    "Acute Ischaemic Stroke": dict(
        complaint="Oh doctor... my left arm, it won't work. And my words, they won't come out right.",
        onset="It happened at breakfast, about an hour ago. All of a sudden.",
        character="My left arm is weak and heavy, my face feels droopy, and I can't find my words properly.",
        severity="I'm frightened. It doesn't hurt, it just won't work.",
        radiation="No pain, no. It's weakness.",
        modifiers="Nothing makes it better or worse. It just came on suddenly.",
        assoc="My face is drooping on one side, my speech is slurred, and my left arm is weak.",
        previous="I had a mini-stroke, a TIA, two years ago.",
        concern="I'm so frightened it's another stroke.",
        has=["weakness"],
        detail=dict(weakness="Yes, my left arm and the left side of my face."),
        extra=[
            (r"warfarin|blood thinner|anticoag|inr", "Yes, I take warfarin for my irregular heartbeat."),
            (r"face|droop|smile", "Yes, my face is drooping on the left."),
            (r"speech|speak|words|slur", "My speech is slurred and I'm struggling to find the right words."),
            (r"\bhead(ache)?\b", "No, I haven't got a headache."),
        ],
        social=dict(smoke="No, I don't smoke.", work="I'm a retired teacher."),
        family="My mother had a stroke.",
        pmh="I have an irregular heartbeat, atrial fibrillation, high blood pressure, and I had a mini-stroke two years ago.",
    ),
    "Acute Asthma Exacerbation": dict(
        pmh="I've had asthma since I was a child, and I was admitted to hospital once.",
        meds='I use a salbutamol inhaler, a steroid inhaler called beclomethasone, and montelukast tablets.',
        complaint="I can't... breathe properly. My chest is so tight... and wheezy.",
        onset="It started... about two hours ago. It's getting worse.",
        character="It's like a tight band around my chest. I'm wheezing... and I can't get a full sentence out.",
        severity="It's really bad... nine out of ten. I'm scared.",
        radiation="No pain... it's just tight.",
        modifiers="My blue inhaler... isn't working. It keeps getting worse.",
        assoc="I'm wheezy, I can't finish sentences, and I've got a bit of a cough.",
        previous="I've had asthma since I was a kid. I was admitted to hospital once before.",
        concern="I'm scared I'm going to stop breathing.",
        has=["breathless", "cough", "chestpain"],
        detail=dict(chestpain="My chest feels tight... but it's not really a pain.", cough="Yes, a bit of a dry cough."),
        extra=[
            (r"trigger|\bcats?\b|\bpets?\b|animal|dust|pollen|exercise|what set|what brought|set (it|this|them) off|sets? (it )?off|bring(s)? (it|this) on|brought it on|caused it", "I've got a cat at home... that usually sets me off."),
            (r"admit|hospital|intensive|\bicu\b|ventilat", "Yes, I was admitted once before."),
            (r"nsaid|aspirin|ibuprofen", "Aspirin makes my asthma worse."),
        ],
        social=dict(smoke="No, I don't smoke.", work="I'm a university student.", other="I have a cat at home."),
        family="My mother has asthma.",
        allergies="Yes, aspirin. It sets off my asthma.",
    ),
    "COPD Exacerbation": dict(
        pmh='I have COPD, which has strained my heart, and high blood pressure.',
        complaint="I'm more breathless than usual, and I'm coughing up green stuff. It's been three days.",
        onset="Three days. Getting worse each day.",
        character="I can't get my breath, my chest is tight, and the phlegm's gone green.",
        severity="Bad. Worse than my normal. I can barely walk across the room.",
        radiation="No pain really. Just the breathing.",
        modifiers="My inhalers aren't helping like they normally do. Moving about makes it worse.",
        assoc="My ankles have swollen up as well, and I'm coughing up green phlegm.",
        previous="I get flare-ups a couple of times a year, but this one's worse.",
        concern="I just want to be able to breathe.",
        has=["breathless", "cough", "swelling"],
        detail=dict(swelling="Yes, my ankles are swollen.", cough="Yes, and the phlegm is green."),
        extra=[
            (r"oxygen|home oxygen", "No, I'm not on home oxygen."),
            (r"sputum|phlegm|colou?r|spit", "It's green, and there's more of it than usual."),
            (r"flare|exacerbat|how (often|many)|chest infection", "I get a couple of flare-ups a year."),
            (r"copd|how severe|how bad is your", "I've had COPD for years. It's quite severe."),
        ],
        social=dict(smoke="I've smoked about fifty pack-years.", work="I'm a retired miner."),
        family="Nothing that I know of.",
    ),
    "Acute Appendicitis": dict(
        complaint="I've got really bad pain in my tummy, on the right side, for about eighteen hours now.",
        onset="About eighteen hours. It started around my belly button, then moved down to the right side.",
        character="It's a constant, sharp pain low on the right. It hurts more when I move or cough.",
        severity="About eight out of ten. I'm trying not to move.",
        radiation="It started around my belly button, then moved to the lower right and stayed there.",
        modifiers="Moving, coughing, even bumps in the road make it worse. Lying still helps a little.",
        assoc="I've felt sick and vomited, I don't want to eat anything, and I think I've got a fever.",
        previous="No, I've never had anything like this.",
        concern="I'm worried it's something serious, like my appendix.",
        has=["nausea", "vomiting", "appetite", "fever"],
        detail=dict(appetite="I've completely lost my appetite. I can't face food.", vomiting="Yes, I've been sick a couple of times.",
                    fever="I think so, I've felt hot and shivery."),
        social=dict(smoke="No, I don't smoke.", work="I'm a university student."),
        family="Nothing that I know of.",
    ),
    "Diabetic Ketoacidosis": dict(
        complaint="I... don't feel good. I've been throwing up and my tummy hurts. I'm really sleepy.",
        onset="Since... yesterday, I think. About twelve hours.",
        character="My tummy aches all over, and I'm so tired. I'm breathing fast, I can't help it.",
        severity="Maybe five out of ten for the tummy ache. I just feel awful.",
        radiation="No, it's just my tummy.",
        modifiers="Nothing helps. I can't keep anything down.",
        assoc="I've been so thirsty, and passing loads of urine, and I've been sick a lot.",
        previous="I've had diabetes for years, but I've never felt this bad.",
        concern="I'm scared. I think it's my diabetes.",
        has=["vomiting", "nausea", "thirst", "urine", "fatigue", "confusion", "breathless"],
        detail=dict(vomiting="Yes, loads. I can't keep anything down.", thirst="Yes, I'm so thirsty, I keep drinking.",
                    urine="Yes, I keep needing the toilet, loads.", breathless="I'm breathing really fast and deep, I can't help it.",
                    confusion="Yes, I feel muddled and really sleepy."),
        extra=[
            (r"insulin|inject|your dose|missed|skipped|forgot", "I stopped taking my insulin two days ago. I don't know why, I just... didn't."),
            (r"diabet|sugar levels", "I've had type 1 diabetes for years."),
        ],
        social=dict(smoke="No, I don't smoke.", work="I'm a university student."),
        family="No, nothing in the family.",
    ),
    "Acute Heart Failure / Pulmonary Oedema": dict(
        complaint="Can't... breathe... doctor. Can't lie... flat.",
        onset="It got... suddenly worse... in the night.",
        character="I feel like I'm drowning... and I'm coughing up pink, frothy stuff.",
        severity="Ten out of ten... I can hardly speak.",
        radiation="No pain... just can't breathe.",
        modifiers="Sitting up... helps a little. Lying down... is impossible.",
        assoc="I'm coughing up pink frothy phlegm... and I woke up in the night gasping.",
        previous="I've got heart failure... but never this bad.",
        concern="I think... I'm going to die.",
        has=["breathless", "cough"],
        detail=dict(cough="Yes... pink and frothy."),
        extra=[
            (r"\blie\b|\bflat\b|pillow|orthopn|sleep", "I can't lie flat at all... I have to sit up."),
            (r"night|wake|gasp|paroxysmal", "Yes... I woke up gasping for air in the night."),
            (r"fluid|salt|water intake|how much (do you|have you been) drink", "I've been drinking more than I should, I think."),
            (r"tablet|missed|stopped|furosemide|water tablet|forgot", "I've been taking them... but maybe missed a few of the water tablets."),
        ],
        social=dict(smoke="I don't smoke.", home="I live with my wife.", work="I'm retired."),
        family="A lot of my family have had heart disease.",
        pmh="I've got heart disease, heart failure, high blood pressure and an irregular heartbeat.",
    ),
    "Bacterial Meningitis": dict(
        complaint="My head... it's killing me. The worst headache of my life. And I've got a fever, and my neck's stiff.",
        onset="It came on suddenly... it's the worst headache I've ever had.",
        character="It's a pounding, splitting pain all over my head.",
        severity="Ten out of ten. I can't stand it.",
        radiation="It goes down into my neck. It's so stiff.",
        modifiers="Light makes it so much worse. Please, can you turn the lights down? Nothing helps.",
        assoc="I've been vomiting, I've got a high fever, my neck is stiff, and there's a rash coming up.",
        previous="No, I've never had a headache like this.",
        concern="I'm really scared, doctor. Is it meningitis?",
        has=["headache", "fever", "vomiting", "rash", "vision"],
        detail=dict(vision="Yes, bright light hurts my eyes badly.", vomiting="Yes, a few times.", fever="Yes, I feel burning hot."),
        extra=[
            (r"rash|spots|petechia|purple", "Yes, I've got small purple spots on my skin that came up today. They don't fade when I press them."),
            (r"neck|stiff", "Yes, my neck is very stiff. I can't bend it forward."),
            (r"light|photophob|bright", "Yes, bright light hurts my eyes badly."),
        ],
        social=dict(smoke="No, I don't smoke.", work="I'm a university student.", home="I live in shared accommodation with lots of other students."),
        family="Nothing that I know of.",
    ),
    "Sepsis": dict(
        complaint="I'm not sure why I'm here. I've been feeling very unwell, and hot.",
        onset="I don't remember exactly. I think the last day or two. I've been told I was confused at home.",
        character="I feel hot and shivery, weak, and so muddled.",
        severity="I feel really poorly. Very weak.",
        radiation="I don't have any pain, really.",
        modifiers="Nothing seems to help. I just feel worse.",
        assoc="I've had burning when I pass water for a few days, and I've been passing very little.",
        previous="I've had water infections before, quite a few.",
        concern="I just feel very unwell, and a bit frightened.",
        has=["fever", "urine", "confusion", "weakness", "fatigue"],
        detail=dict(urine="It's been burning when I pass water for a few days, and now I'm passing hardly anything.",
                    fever="Yes, I feel burning hot, then shivery."),
        extra=[
            (r"diabet|sugar", "Yes, I have type 2 diabetes."),
            (r"burn|dysuria|pass(ing)? (water|urine)", "It's been burning when I pass water for a few days, and now I'm passing hardly anything."),
        ],
        social=dict(smoke="No, I don't smoke.", home="I'm a widow, and I live alone."),
        family="Nothing that I know of.",
        allergies="Yes, penicillin. It gives me a rash.",
    ),
    "Pneumothorax": dict(
        complaint="I've got a sudden sharp pain on the right side of my chest, and I'm really short of breath.",
        onset="It just came on suddenly, out of nowhere.",
        character="It's a sharp, stabbing pain on the right side of my chest.",
        severity="About seven out of ten. And I'm struggling to breathe even sitting here.",
        radiation="No, it stays in my right chest.",
        modifiers="Deep breaths make it worse. Nothing helps.",
        assoc="I'm short of breath, even sitting still.",
        previous="No, this is the first time.",
        concern="I'm really worried something's wrong with my lung.",
        has=["breathless", "chestpain"],
        detail=dict(breathless="Yes, even at rest.", chestpain="Yes, sharp, on the right."),
        extra=[
            (r"trauma|injur|accident|\bhit\b|\bfall|fell|sport|punch|knock", "No, I haven't hurt myself. I didn't fall or get hit."),
            (r"smok|vap", "No, I don't smoke."),
        ],
        social=dict(smoke="No, I don't smoke.", work="I'm a student."),
        family="Nothing that I know of.",
    ),
    "Acute Kidney Injury": dict(
        complaint="I've hardly passed any water for three days, and my legs have swollen up.",
        onset="About three days.",
        character="I feel tired and sick, and there's very little urine coming out.",
        severity="It's not pain exactly. I just feel awful, very washed out.",
        radiation="No pain, no.",
        modifiers="Nothing seems to help.",
        assoc="I've been vomiting, I haven't been eating or drinking much, and my ankles are swollen.",
        previous="No, I've never had this before.",
        concern="I'm worried my kidneys have packed up.",
        has=["vomiting", "nausea", "urine", "swelling", "appetite", "fatigue"],
        detail=dict(urine="Hardly anything for three days.", swelling="Yes, my ankles are swollen.",
                    vomiting="Yes, quite a lot, which is why I've hardly been drinking."),
        extra=[
            (r"ibuprofen|nsaid|painkill|anti-?inflam|back pain", "Yes, I've been taking ibuprofen from the chemist for my back."),
            (r"fluid|intake|eating or drinking|drinking enough|how much (do you|have you been) (drink|eat)", "I haven't been eating or drinking much, because I've been sick."),
            (r"kidney|renal|ckd", "I've been told I have early kidney problems, from my diabetes and blood pressure."),
        ],
        social=dict(smoke="I used to smoke, but I gave up.", work="I'm retired."),
        family="Nothing that I know of.",
        meds="I take ramipril and amlodipine, and recently I've been buying ibuprofen from the chemist for my back.",
    ),
    "Hypoglycaemia": dict(
        complaint="I feel shaky and sweaty. I'm confused, I can't think straight.",
        onset="It came on this morning, in just the last hour or so.",
        character="I'm shaking, sweaty, and my head feels fuzzy.",
        severity="I feel awful. Very weak and muddled.",
        radiation="No pain.",
        modifiers="I think food would help. I haven't eaten.",
        assoc="I'm sweating a lot, I'm shaky, and my mind's muddled.",
        previous="I've felt a bit like this before when my sugar's low, but never this bad.",
        concern="It's my sugar, isn't it? I took my insulin and skipped my meal.",
        has=["sweating", "confusion", "tremor", "weakness", "dizzy"],
        detail=dict(sweating="Yes, I'm drenched.", tremor="Yes, my hands are shaking.", dizzy="A bit light-headed, yes."),
        extra=[
            (r"insulin|dose|inject", "I took my usual insulin this morning."),
            (r"\bmeals?\b|\beat\b|\beaten\b|\beating\b|breakfast|lunch|skipped|missed", "I missed my meal today. I got busy and didn't eat."),
            (r"diabet|sugar", "I have type 2 diabetes and I'm on insulin."),
        ],
        social=dict(smoke="No, I don't smoke.", work="I'm a teacher."),
        family="Nothing that I know of.",
    ),
    "Deep Vein Thrombosis": dict(
        meds='I take the combined contraceptive pill.',
        complaint="My left calf is really sore and swollen. It started after a long flight.",
        onset="I flew back three days ago, fourteen hours, and it's got worse since.",
        character="It's a tight, heavy, aching pain in my left calf, and it's swollen and tender.",
        severity="About five out of ten. It hurts to walk on it.",
        radiation="No, it stays in my calf.",
        modifiers="Walking makes it worse, and it throbs when I stand.",
        assoc="No other symptoms, but my left leg is definitely bigger than the right.",
        previous="No, I've never had anything like this.",
        concern="I'm worried it's a blood clot. My mother had one.",
        has=["swelling"],
        detail=dict(swelling="Yes, my left calf is swollen, much bigger than the other."),
        extra=[
            (r"flight|\bfly|flew|travel|plane|journey|trip|abroad", "I took a fourteen-hour flight three days ago, and I was sitting for most of it."),
            (r"pill|contracept|ocp|hormone", "I take the combined contraceptive pill."),
            (r"\bsit\b|sitting|immobil|\bmoved\b|mobile|walk about", "I was sitting nearly the whole flight. I hardly got up."),
            (r"clot|dvt|thrombo", "Yes, my mother had a clot in her leg."),
        ],
        social=dict(smoke="No, I don't smoke.", work="I'm a marketing manager, and I travel a lot for work."),
        family="My mother had a DVT, a clot in her leg.",
    ),
    "Upper GI Bleeding": dict(
        complaint="I've been vomiting blood, doctor, and my stools have gone black.",
        onset="It started today. I've vomited it twice, and my stools have been black.",
        character="The vomit looks like coffee grounds, and my stools are black and sticky like tar. I've got a burning pain in my upper stomach.",
        severity="The stomach pain is about six out of ten. I feel very weak.",
        radiation="No, it's in the top of my tummy, in the middle.",
        modifiers="Nothing really helps.",
        assoc="I feel faint and weak, and I've got that burning pain in my upper tummy.",
        previous="No, I've never vomited blood before.",
        concern="I'm frightened I'm bleeding inside.",
        has=["vomiting", "bleeding", "bowels", "dizzy", "weakness"],
        detail=dict(vomiting="Yes, twice. It looked like coffee grounds.", bowels="Yes, they've been black and tarry.",
                    dizzy="Yes, I feel faint when I stand."),
        extra=[
            (r"vomit.*blood|blood.*vomit|haemat|coffee|\bbleed", "Yes, twice. It looked like coffee grounds."),
            (r"black|stool|motion|poo|melaena|tarry", "Yes, they've been black and tarry."),
            (r"nsaid|naproxen|painkill|anti-?inflam|arthritis", "I take naproxen for my arthritis, most days."),
            (r"alcohol|drink|units|beer", "I drink about twenty-eight units a week. I know it's too much."),
        ],
        social=dict(smoke="Yes, I smoke.", alcohol="About twenty-eight units a week."),
        family="Nothing that I know of.",
    ),
    "Acute Cholecystitis": dict(
        pmh="I'm overweight, and I've been told I have gallstones from a scan.",
        complaint="I've got severe pain in the top right of my tummy. It started after I ate a fatty meal.",
        onset="It began a few hours after a fatty meal, and it's got worse and worse.",
        character="It's a gripping pain under my right ribs. It came in waves, and now it's constant.",
        severity="Eight out of ten.",
        radiation="Yes, it goes through to my right shoulder.",
        modifiers="Fatty food sets it off. Taking a deep breath makes it worse. Nothing helps.",
        assoc="I've had a fever, and I feel sick.",
        previous="I've had milder episodes like this before, and a scan showed gallstones.",
        concern="I'm worried it's my gallbladder again.",
        has=["fever", "nausea"],
        detail=dict(fever="Yes, I've been hot and shivery.", nausea="Yes, I feel sick with it."),
        extra=[
            (r"fatty|\bfood\b|\bmeal\b|\beat\b|\bate\b", "It started after a fatty meal. Fatty food always sets it off."),
            (r"gallstone|gallbladder|scan|ultrasound", "Yes, they found gallstones on a scan before."),
        ],
        social=dict(smoke="No, I don't smoke.", work="I work in an office."),
        family="My sister had her gallbladder taken out.",
    ),
    "Urinary Tract Infection / Pyelonephritis": dict(
        meds='I take the contraceptive pill.',
        complaint="I've had burning when I pass water, and going all the time, for two days. And now my right side is sore.",
        onset="Two days for the urine symptoms. The pain in my right side and the fever started today.",
        character="It stings and burns when I pass water, I'm going very often, and there's an ache in my right loin.",
        severity="The loin pain is about six out of ten.",
        radiation="It's in my right side, around my back.",
        modifiers="Nothing helps much. Drinking water doesn't take it away.",
        assoc="I've got a fever, and I feel generally unwell and shivery.",
        previous="Yes, I get water infections quite often.",
        concern="I'm worried the infection has gone to my kidneys.",
        has=["fever", "urine"],
        detail=dict(urine="Yes, it burns when I pass water, and I'm going all the time.", fever="Yes, hot and shivery."),
        extra=[
            (r"pregnan|period|\blmp\b|contracept|pill|ocp", "I take the contraceptive pill, and I'm not pregnant as far as I know."),
            (r"discharge|sex|sexual|partner", "I'm sexually active, yes, but I haven't had any discharge."),
            (r"blood in|bloody", "No, I haven't seen any blood."),
        ],
        social=dict(smoke="No, I don't smoke.", work="I'm a nurse.", other="I'm sexually active."),
        family="Nothing that I know of.",
    ),
    "Peripheral Arterial Disease": dict(
        complaint="It's my right calf. It gets a cramping pain when I walk about a hundred metres.",
        onset="It's been getting worse over about a year.",
        character="A cramping, aching pain in my right calf when I walk.",
        severity="About five or six. I have to stop.",
        radiation="No, it's just the calf.",
        modifiers="I have to stop and rest for a few minutes, and then it goes away and I can walk again.",
        assoc="No other problems. It goes away when I rest.",
        previous="No, it's been slowly building up over the last year.",
        concern="Not really. I'm just fed up of having to stop.",
        has=[], detail={},
        extra=[
            (r"rest pain|at night|in bed|at rest|toes|foot|sitting", "No, it doesn't hurt when I'm resting or in bed."),
            (r"how far|distance|metres|yards|can you walk", "About a hundred metres, then I have to stop."),
            (r"heart|angina|cardiac|heart attack", "I had angina in the past."),
        ],
        social=dict(smoke="I've smoked about forty pack-years. I still do.", work="I'm retired."),
        family="My brother had bypass surgery.",
    ),
    "Acute Gastroenteritis": dict(
        complaint="I've been vomiting and had awful diarrhoea for a day.",
        onset="About twenty-four hours. It started the night after we ate out.",
        character="Crampy tummy pains, constant vomiting, and watery diarrhoea.",
        severity="About five out of ten for the cramps. I feel drained.",
        radiation="No, it's just crampy all over my tummy.",
        modifiers="Nothing stays down. Resting helps a little.",
        assoc="I've vomited about eight times and had ten watery stools. I'm dizzy and very thirsty.",
        previous="No, I've never had this before.",
        concern="I'm worried about getting dehydrated. I can't keep fluids down.",
        has=["vomiting", "nausea", "bowels", "thirst", "dizzy", "fatigue"],
        detail=dict(vomiting="About eight times so far.", bowels="About ten watery stools.", thirst="Yes, very thirsty and my mouth is dry.",
                    dizzy="Yes, I feel dizzy when I stand up."),
        extra=[
            (r"blood|mucus", "No, there's no blood in it."),
            (r"food|\beat|\bate\b|restaurant|meal|takeaway", "We ate at a restaurant yesterday."),
            (r"others|friends|contact|anyone else|everyone|group|ill too", "Yes, everyone I was with is ill too."),
            (r"urine|wee\b|\bpee\b|dry mouth|dehydrat", "I'm very thirsty, my mouth is dry, and I've hardly passed any urine today."),
        ],
        social=dict(smoke="No, I don't smoke.", other="I was out with a group at a restaurant, and they're all unwell too."),
        family="Nothing that I know of.",
    ),
    "Bell's Palsy": dict(
        complaint="I woke up this morning and the right side of my face won't move properly.",
        onset="I noticed it when I woke up this morning. It wasn't there when I went to bed.",
        character="My right face feels droopy and heavy. I can't smile properly on that side.",
        severity="It doesn't really hurt. It's more that it looks awful.",
        radiation="No, there's no real pain.",
        modifiers="Nothing changes it.",
        assoc="I can't close my right eye, and food tastes different.",
        previous="No, I've never had this before.",
        concern="I'm worried I've had a stroke. And I'm worried about how I look.",
        has=["weakness", "vision"],
        detail=dict(weakness="Yes, the right side of my face.", vision="I can't close my right eye properly. It feels dry and watery."),
        extra=[
            (r"eye|close|blink|tear", "I can't close my right eye fully. It feels dry and watery."),
            (r"taste|food", "Yes, my taste seems off on the right side."),
            (r"hear|\bear\b|noise|sound", "Sounds seem a bit louder than normal in my right ear."),
            (r"\barm\b|\bleg\b|speech|stroke|slur", "No, it's just my face. My arm and leg are fine, and my speech is normal."),
        ],
        social=dict(smoke="No, I don't smoke."),
        family="Nothing that I know of.",
    ),
    "Migraine": dict(
        pmh="I've had migraines since I was sixteen.",
        meds='I take the contraceptive pill, and sumatriptan when I get a migraine.',
        complaint="I've got a terrible headache on the left side, with sickness. And before it started, I saw zigzag lines.",
        onset="The zigzag lines started about half an hour before the headache.",
        character="A throbbing pain on the left side of my head.",
        severity="Eight out of ten.",
        radiation="It stays on the left side of my head.",
        modifiers="Moving makes it worse. I need to lie in the dark. Bright light is awful.",
        assoc="I feel sick, bright lights bother me, and before it started I saw zigzag lines.",
        previous="I've had migraines since I was sixteen, and this feels like my usual ones.",
        concern="I think it's my usual migraine. I just want it to stop.",
        has=["headache", "nausea", "vision"],
        detail=dict(vision="Yes, zigzag lines for about half an hour before the headache, and bright light hurts now.",
                    nausea="Yes, I feel quite sick."),
        extra=[
            (r"worst headache|first time|thunderclap|different (from|to)|usual (migraine|headache)", "No, it's like my usual migraines. It's not the worst headache of my life."),
            (r"trigger|stress|sleep|cheese|chocolate|wine|period", "Stress seems to set them off, and I've been under a lot recently."),
            (r"aura|zigzag|flash|visual", "Yes, zigzag lines in my vision for about half an hour before the headache."),
        ],
        social=dict(smoke="No, I don't smoke.", work="I'm a software engineer, and it's been very stressful lately."),
        family="My mother has migraines.",
    ),
    "Hyperthyroidism": dict(
        complaint="I've lost a lot of weight without trying, and my heart keeps racing. I'm shaky all the time.",
        onset="Over about six months.",
        character="My heart pounds, my hands tremble, and I feel hot and jittery.",
        severity="It's quite bothersome. It's affecting my work.",
        radiation="I don't have any pain.",
        modifiers="Nothing really settles it.",
        assoc="I've lost about eight kilos, I'm always hot, I'm irritable, and my stools are loose.",
        previous="No, I've never had anything like this.",
        concern="I'm worried it's something serious, like cancer, because I'm losing weight.",
        has=["weight", "palpitations", "tremor", "heat", "bowels", "sweating"],
        detail=dict(weight="Yes, I've lost about eight kilos in six months, even though I'm eating more.",
                    palpitations="Yes, my heart races and pounds.", heat="Yes, I can't stand the heat. I'm hot all the time.",
                    bowels="Yes, my stools have been loose.", tremor="Yes, my hands shake."),
        extra=[(r"eye|bulg|stare|gritty|double", "My eyes feel a bit gritty, and people say I look like I'm staring.")],
        social=dict(smoke="No, I don't smoke.", work="I'm a solicitor. It's a very stressful job."),
        family="My sister has an autoimmune thyroid problem.",
    ),
    "Hypothyroidism": dict(
        complaint="I'm just so tired all the time... and I've put on weight, and I always feel cold.",
        onset="About six months. It's crept up slowly.",
        character="I feel sluggish, heavy, and cold, even when other people are warm.",
        severity="It's not painful. It's just exhausting.",
        radiation="No pain.",
        modifiers="Nothing helps. Sleep doesn't make me feel any better.",
        assoc="I'm constipated, my skin is dry, my hair is falling out, and my voice has gone deeper.",
        previous="No, I've never been like this before.",
        concern="I'm worried something's wrong. I just don't feel like myself.",
        has=["fatigue", "weight", "cold", "bowels"],
        detail=dict(weight="Yes, I've put weight on, and I'm not eating any more than usual.", cold="Yes, I'm always cold.",
                    bowels="Yes, I'm constipated.", fatigue="Yes, I'm exhausted all the time."),
        extra=[(r"hair|skin|voice", "My hair is falling out, my skin is very dry, and my voice has gone deeper.")],
        social=dict(smoke="No, I don't smoke.", work="I'm a teacher."),
        family="My mother has an underactive thyroid.",
    ),
    "Parkinson's Disease Examination": dict(
        complaint="My right hand has a tremor, and I've become slow. Everything takes longer.",
        onset="It's been coming on gradually.",
        character="My right hand shakes when it's resting, and it stops when I use it. My writing's got tiny, and I feel stiff.",
        severity="It's annoying more than anything. It's not painful.",
        radiation="No pain.",
        modifiers="The shaking stops when I use the hand, and it's worse when I'm resting or tense.",
        assoc="My handwriting has become small, I feel stiff, and I shuffle when I walk.",
        previous="No, nothing like this before.",
        concern="My father had Parkinson's, so I'm worried it's the same.",
        has=["tremor"],
        detail=dict(tremor="Yes, in my right hand, mostly when it's resting."),
        extra=[
            (r"hallucin|see things|hear things|psych|confus", "No, nothing like that. My mind is fine."),
            (r"walk|gait|shuffl|balance|\bfall|steps", "I take small shuffling steps now, and I feel a bit unsteady."),
            (r"handwriting|writing|\bwrite", "My handwriting has become very small and cramped."),
        ],
        social=dict(smoke="No, I don't smoke.", work="I'm a retired engineer."),
        family="My father had Parkinson's disease.",
        pmh="Nothing relevant. I've been quite healthy.",
        meds="I'm not on any medicines.",
    ),
    "Chronic Kidney Disease": dict(
        pmh="I've had type 2 diabetes for fifteen years. I have high blood pressure, and diabetic eye disease.",
        complaint="I've been getting more and more tired, my ankles are swollen, and I feel sick.",
        onset="It's been creeping up for months. My kidneys have been getting worse for about five years.",
        character="I feel exhausted and nauseated, and my ankles are puffy.",
        severity="It's not painful, but I'm worn out all the time.",
        radiation="No pain.",
        modifiers="Nothing really helps. Rest doesn't help the tiredness much.",
        assoc="My ankles are swollen, I feel sick, and I've got no appetite.",
        previous="My kidney function has been going down slowly over the last five years.",
        concern="I'm worried about dialysis. My brother is on it.",
        has=["fatigue", "nausea", "swelling", "appetite", "urine"],
        detail=dict(urine="I pass a bit less urine than I used to.", swelling="Yes, my ankles are puffy.",
                    appetite="I've lost my appetite.", fatigue="Yes, I'm exhausted all the time."),
        extra=[
            (r"diabet|sugar levels", "I've had type 2 diabetes for fifteen years."),
            (r"blood pressure|hyperten", "Yes, I have high blood pressure too."),
            (r"eye|retina|vision", "I've had diabetic eye changes, retinopathy."),
        ],
        social=dict(smoke="No, I don't smoke.", work="I'm retired.", home="I live with my wife."),
        family="My brother is on dialysis.",
        meds="I take amlodipine, doxazosin, and an injection for my blood count, erythropoietin. I stopped metformin recently because of my kidneys.",
    ),
}

# ── how spoken questions map to symptoms ──────────────────────────────────────────
SYMPTOMS: dict[str, str] = {
    "fever": r"fever|temperature|chills|rigors|shiver|feel(ing)? hot",
    "nausea": r"nause|feel(ing)? sick|sick to",
    "vomiting": r"vomit|throw(ing|n)? up|been sick|retch",
    "sweating": r"sweat|clammy",
    "cough": r"cough|sputum|phlegm",
    "breathless": r"breath|wheez|gasp|puff",
    "palpitations": r"palpitat|racing|pounding|fluttering|skipping",
    "dizzy": r"dizz|faint|light-?headed|blackout|black out|collaps|pass(ed)? out|spinning",
    "chestpain": r"chest (pain|tight|discomfort|pressure)|pain in (your|the) chest|tightness",
    "weight": r"weight",
    "appetite": r"appetite|going off (your )?food|eating (less|more)",
    "bowels": r"bowel|stool|motion|diarrh|constipat|\bpoo|loose",
    "urine": r"urin|\bpee\b|water ?works|passing water|dysuria|toilet",
    "rash": r"rash|spots|petechia|skin",
    "headache": r"headache|head ache|head pain",
    "vision": r"vision|eyesight|double|blurr|bright light|photophob|\beyes?\b",
    "weakness": r"weak|numb|tingl|slurr|droop|paraly|pins and needles|speech",
    "swelling": r"swell|swollen|puffy|oedema|edema|ankles",
    "confusion": r"confus|drows|memory|muddled|disorient",
    "thirst": r"thirst|drinking (more|a lot)",
    "tremor": r"tremor|shak|trembl",
    "heat": r"heat intoler|too hot|hot weather|always hot",
    "cold": r"cold intoler|feel(ing)? the cold|always cold|feel(ing)? cold",
    "jaundice": r"jaundice|yellow",
    "bleeding": r"bleed|blood in|coffee",
    "fatigue": r"tired|fatigue|energy|exhaust|lethargic|sleepy",
}

NEG = {
    "fever": "No, I haven't had a temperature.", "nausea": "No, I don't feel sick.", "vomiting": "No, I haven't been sick.",
    "sweating": "No, I haven't been sweating.", "cough": "No, I haven't got a cough.", "breathless": "No, my breathing's fine.",
    "palpitations": "No, my heart feels normal.", "dizzy": "No, I haven't felt dizzy or faint.",
    "chestpain": "No, I haven't had any chest pain.", "weight": "No, my weight's been about the same.",
    "appetite": "No, my appetite's normal.", "bowels": "No, my bowels are normal.", "urine": "No, nothing different with my water.",
    "rash": "No, I haven't noticed any rash.", "headache": "No, I haven't got a headache.", "vision": "No, my vision's fine.",
    "weakness": "No, no weakness or numbness.", "swelling": "No, nothing's swollen.", "confusion": "No, my head feels clear.",
    "thirst": "No, I'm not especially thirsty.", "tremor": "No, I haven't noticed any shaking.", "heat": "No, I cope with the heat fine.",
    "cold": "No, I don't feel the cold more than usual.", "jaundice": "No, my skin and eyes look normal.",
    "bleeding": "No, I haven't noticed any bleeding.", "fatigue": "No, my energy's normal.",
}

CONDITIONS = {
    r"diabet|sugar": r"diabet", r"blood pressure|hyperten": r"hypertens|blood pressure",
    r"cholesterol": r"cholesterol", r"asthma": r"asthma", r"copd|lung|bronch": r"copd|lung|asthma",
    r"heart|angina|cardiac": r"heart|angina|ccf|ihd|rheumatic|fibrillation|cor pulmonale",
    r"stroke|\btia\b|mini-?stroke": r"stroke|\btia\b", r"kidney|renal": r"kidney|ckd|renal",
    r"liver|jaundice|hepat|cirrhosis": r"liver|cirrhosis", r"thyroid": r"thyroid", r"cancer|tumou?r": r"cancer",
    r"clot|dvt|thrombo|embol": r"clot|dvt|thromb", r"epilep|seizure|\bfits?\b": r"epilep|seizure",
    r"arthritis": r"arthritis", r"gallstone|gallbladder": r"gallstone", r"water infection|urine infection|\buti": r"uti|water infection|urine infection",
}


BODY = {
    "back": (r"\bback\b|spine", r"\bback\b|spine|loin"),
    "neck": (r"\bneck\b", r"\bneck\b"),
    "head": (r"\bhead\b", r"\bhead\b"),
    "chest": (r"\bchest\b", r"\bchest\b"),
    "stomach": (r"stomach|tummy|abdom|belly", r"stomach|tummy|abdom|belly|ribs|lower right|upper right|\bloin\b"),
    "arm": (r"\barms?\b|shoulder|elbow|wrist|\bhands?\b", r"\barms?\b|shoulder|elbow|wrist|\bhands?\b"),
    "leg": (r"\blegs?\b|calf|calves|thigh|knee|ankle|\bfeet\b|\bfoot\b", r"\blegs?\b|calf|calves|thigh|knee|ankle|\bfeet\b|\bfoot\b"),
    "throat": (r"throat", r"throat"),
    "jaw": (r"\bjaw\b", r"\bjaw\b"),
    "joints": (r"joints?|\bhips?\b", r"joints?|\bhips?\b"),
}
BODY_NO = {
    "back": "No, my back's been fine.", "neck": "No, my neck's fine.", "head": "No, I haven't had any pain in my head.",
    "chest": "No, I haven't had any chest pain.", "stomach": "No, my stomach's been fine.", "arm": "No, my arms are fine.",
    "leg": "No, my legs are fine.", "throat": "No, my throat's fine.", "jaw": "No, my jaw's fine.", "joints": "No, my joints are fine.",
}
PAINISH = r"pain|hurt|ache|sore|discomfort|problem|trouble|issue|stiff|tender|bother|wrong with|symptom"


def _body_part(sc: dict, msg: str) -> str | None:
    if not re.search(PAINISH, msg):
        return None
    for part, (ask, have) in BODY.items():
        if re.search(ask, msg):
            for key in ("radiation", "character"):
                if re.search(have, sc.get(key, ""), re.I) and not sc.get(key, "").lower().startswith("no"):
                    return sc[key]
            if re.search(r"pain|ache|sore|hurt|cramp|tight", sc["complaint"], re.I) and re.search(have, sc["complaint"], re.I):
                return sc["character"]
            return BODY_NO[part]
    return None


def _style(personality: str) -> str:
    p = (personality or "").lower()
    if "breathless" in p:
        return "breathless"
    if any(w in p for w in ("drowsy", "confused", "lethargic", "slow", "flat", "quiet")):
        return "slow"
    if "pain" in p:
        return "pain"
    if any(w in p for w in ("anxious", "frightened", "distressed", "scared")):
        return "anxious"
    return "calm"


def _pick(options: list[str], seed: str) -> str:
    return options[int(hashlib.md5(seed.encode()).hexdigest(), 16) % len(options)]


def _script(scenario: dict) -> dict | None:
    return SCRIPTS.get(scenario.get("scenario_title") or scenario.get("title") or "")


def _hd(scenario: dict) -> dict:
    return scenario.get("history_data") or {}


def _pmh(scenario: dict, sc: dict) -> str:
    if sc.get("pmh"):
        return sc["pmh"]
    raw = _hd(scenario).get("past_medical_history", "")
    if _is_none(raw):
        return "No, I've been healthy. I don't have any medical problems."
    parts = [_lowfirst(p) for p in re.split(r",| and ", _lay(raw)) if p.strip()]
    return f"I have {_join(parts)}."


def _meds(scenario: dict, sc: dict) -> str:
    if sc.get("meds"):
        return sc["meds"]
    raw = _hd(scenario).get("medications", "")
    if _is_none(raw):
        return "I don't take any regular medicines."
    raw = re.sub(r"\([^)]*\)", "", raw)
    raw = re.sub(r"\bPRN\b", "when I need it", raw)
    raw = re.sub(r"\bOCP\b", "the contraceptive pill", raw)
    parts = [_lowfirst(p) for p in raw.split(",") if p.strip()]
    return f"I take {_join(parts)}."


def _allergies(scenario: dict, sc: dict) -> str:
    if sc.get("allergies"):
        return sc["allergies"]
    return "No, I don't have any allergies that I know of."


def _family(scenario: dict, sc: dict) -> str:
    return sc.get("family") or "No, nothing that I know of in the family."


def _social(sc: dict, msg: str) -> str:
    s = sc.get("social", {})
    parts = []
    if re.search(r"smok|cigarette|tobacco|vap", msg):
        parts.append(s.get("smoke", "No, I don't smoke."))
    if re.search(r"alcohol|drink|units|beer|wine|spirits", msg):
        parts.append(s.get("alcohol", "Only the odd drink, nothing much."))
    if re.search(r"work|job|occupation|do for a living|employ", msg):
        parts.append(s.get("work", "I'm in work, nothing unusual."))
    if re.search(r"live|home|married|partner|children|kids|accommodation|alone|who do you", msg):
        parts.append(s.get("home", "Nothing unusual at home."))
    if re.search(r"recreational|street drugs|drug use|use any drugs|illicit", msg):
        parts.append("No, I don't use any drugs.")
    if re.search(r"exercise|\bactive\b|\bgym\b|sport|\bdiet\b|lifestyle", msg):
        parts.append(s.get("exercise", "I keep reasonably active, nothing too strenuous."))
    if not parts:
        parts = [s[k] for k in ("work", "smoke", "alcohol", "home", "exercise", "other") if k in s] or ["Nothing out of the ordinary."]
    return " ".join(parts)


def _symptom(sc: dict, msg: str, seed: str) -> str | None:
    found: list[tuple[str, bool, str]] = []
    for key, pat in SYMPTOMS.items():
        if re.search(pat, msg):
            if key in sc.get("has", []):
                text = sc.get("detail", {}).get(key) or _pick(["Yes, I have.", "Yes, I've noticed that.", "Yes, I have, actually."], seed + key)
                found.append((key, True, text))
            else:
                found.append((key, False, NEG[key]))
    if not found:
        return None
    if len(found) == 1:
        text = found[0][2]
        if found[0][1] and re.match(r"how (much|many|long|often)", msg) and text.startswith("Yes, "):
            text = text[5:6].upper() + text[6:]
        return text
    if not any(pos for _, pos, _ in found):
        return "No, I haven't had any of those."
    return " ".join(text for _, _, text in found[:3])


def _fallback(style: str, seed: str) -> str:
    opts = {
        "breathless": ["Sorry, doctor... could you ask that again?", "I didn't... quite catch that, doctor."],
        "slow": ["Sorry... I didn't catch that.", "Could you say that again, please? I'm a bit muddled."],
        "pain": ["Sorry doctor, the pain's making it hard to think. Could you ask again?"],
        "anxious": ["Sorry, doctor, I'm not sure what you mean. Could you ask me another way?"],
        "calm": ["Sorry doctor, I'm not sure what you mean. Could you ask me another way?",
                 "I'm afraid I don't follow, doctor. Could you put that differently?"],
    }
    return _pick(opts[style], seed)


def answer(scenario: dict, message: str) -> str | None:
    """Return the patient's spoken reply for this scenario, or None if the scenario has no script."""
    sc = _script(scenario)
    if not sc:
        return None
    msg = " ".join((message or "").lower().split())
    style = _style(scenario.get("patient_personality", ""))
    seed = (scenario.get("scenario_title") or "") + msg

    if re.search(r"allerg|reaction to|react to", msg):
        return _allergies(scenario, sc)

    if re.search(r"\b(can|could|may|shall) i (now |just )?(examine|check|take your|listen|feel|look|measure|have a look|do an|test)\b"
                 r"|\blet me (examine|check|listen|take your|feel|look|measure|have a look)\b"
                 r"|\bi('| wi)ll (now |just )?(examine|check|listen|take your|feel|look|measure)\b"
                 r"|\bi('| a)m going to (examine|check|listen|take your|feel|look|measure)\b"
                 r"|\bis it (okay|ok|alright|fine) (if|to) i (examine|check|take your|listen|feel|look|measure)\b"
                 r"|\bdo you mind if i\b", msg):
        return {"pain": "Okay... please be gentle, it really hurts.", "breathless": "Okay... go ahead.",
                "anxious": "Yes, of course, doctor. Is it going to hurt?", "slow": "Yes... all right.",
                "calm": "Yes, of course, go ahead."}[style]

    # 1) scenario-specific questions first (insulin, flights, asbestos, trauma...)
    for pat, reply in sc.get("extra", []):
        if re.search(pat, msg):
            return reply

    # 2) history sections
    if re.search(r"allerg|reaction to|react to", msg):
        return _allergies(scenario, sc)
    if re.search(r"medic|tablet|\bpills?\b|\bdrugs?\b(?! use)|prescri|inhaler|insulin|treatment|over the counter|painkiller|supplement|herbal", msg):
        return _meds(scenario, sc)
    if re.search(r"family|runs in|parents|mother|father|brother|sister|relatives|hereditary|genetic", msg):
        return _family(scenario, sc)
    if re.search(r"smok|cigarette|tobacco|alcohol|\bdrink|units|recreational|occupation|\bwork|\bjob\b|for a living|live (with|alone)|\blive\b|married|partner|children|kids|accommodation|lifestyle|exercise|diet\b|social", msg):
        return _social(sc, msg)
    bp = _body_part(sc, msg)
    if bp:
        return bp
    if re.search(r"medical (problems|conditions|history)|past (medical|history)|illness|conditions|diagnos|hospital|surger|operation|admitted|any (other )?(health )?problems|health problems", msg) \
            or any(re.search(p, msg) for p in CONDITIONS):
        for ask, have in CONDITIONS.items():
            if re.search(ask, msg):
                blob = " ".join([_hd(scenario).get("past_medical_history", ""), _hd(scenario).get("hpi", ""),
                                 _hd(scenario).get("medications", ""), sc.get("pmh", "")]).lower()
                if not re.search(have, blob):
                    return "No, nothing like that."
                break
        return _pmh(scenario, sc)

    # 3) identity
    if re.search(r"your name|who are you|full name|confirm.*name|date of birth|how old|your age", msg):
        if re.search(r"how old|age|birth", msg):
            return f"I'm {scenario.get('patient_age')} years old."
        return f"My name is {scenario.get('patient_name')}."

    # 4) the pain / illness story
    if re.search(r"radiat|spread|travel|go (down|into|anywhere|to)|anywhere else|jaw|shoulder", msg):
        return sc["radiation"]
    if re.search(r"better|worse|reliev|ease|aggravat|trigger|make it|helps?|exertion|lying|position|movement", msg):
        return sc["modifiers"]
    if re.search(r"scale|how (bad|severe|strong|painful)|out of 10|rate|severity|score", msg):
        return sc["severity"]
    if re.search(r"how long|when (did|was|does|do)|since when|\bstart|began|onset|first notice|how many (days|weeks|hours)|sudden|gradual", msg):
        return sc["onset"]
    if re.search(r"describe|what (does|is) (it|the pain) (feel )?like|sharp|dull|crushing|burning|stabbing|throbbing|colicky|type of pain|nature|where (is|does)|location|point to|which (side|part)|\bwhat kind", msg):
        return sc["character"]
    if re.search(r"had (this|it|anything like this) before|before\?|previous|happened before|ever had|similar", msg):
        return sc["previous"]
    if re.search(r"worr|concern|afraid|fear|what do you think|your idea|expect|scared", msg):
        return sc["concern"]

    # 5) specific symptoms: yes (with detail) or a clear no
    sym = _symptom(sc, msg, seed)
    if sym:
        return sym

    if re.search(r"\bpain\b|\bhurt|\baches?\b|\bsore\b|discomfort", msg):
        return sc["character"]

    if re.search(r"associated|other symptoms|anything else (you|that)|any other (symptoms|problems|complaints)|anything (else )?(wrong|bothering)", msg):
        return sc["assoc"]
    if re.search(r"what (brings|brought)|what('s| is) (the|your) (problem|matter|trouble|issue|main)|how can i help|what can i do|tell me (what|about|more)|presenting|main (problem|complaint)|why (are you|have you come)|how are you( feeling| doing)?|how('s| is) it going|what seems|what happened|what('s| is) wrong|feeling", msg):
        return sc["complaint"]

    # 5b) everyday topics every patient can answer
    sex_male = (scenario.get("patient_sex") or "male") == "male"
    if re.search(r"are you (okay|ok|alright|comfortable)|feel (okay|ok|alright|fine|well|better)|how (do|are) you feel", msg):
        return sc["complaint"]
    if re.search(r"injur|accident|\bfall\b|\bfell\b|hurt yourself|trauma|bang(ed)?\b|hit your", msg):
        return "No, I haven't injured myself or had any accidents."
    if re.search(r"\bsleep|insomnia|wake up at night", msg):
        return "I'm sleeping, but I never feel rested." if "fatigue" in sc.get("has", []) else "My sleep's been normal."
    if re.search(r"\bmood\b|depress|stress|anxi|low spirits|coping|mental", msg):
        return "I've been feeling frightened and low with all this." if style != "calm" else "My mood's been okay."
    if re.search(r"swallow|heartburn|reflux|indigestion", msg):
        return "No, I haven't had any trouble swallowing, or heartburn."
    if re.search(r"pregnan|\bperiods?\b|menstrua|contracept", msg):
        return "No, I'm a man, doctor." if sex_male else "I'm not pregnant, as far as I know."
    if re.search(r"vaccin|immunis|\bjab\b", msg):
        return "I think my vaccinations are up to date."
    if re.search(r"protein|nutrition|nutrient", msg):
        return "I don't keep track of the exact amount of protein, doctor. I try to eat a balanced diet, but I couldn't tell you the grams."
    if re.search(r"\b(blood|urine|stool|lab|laboratory)\s+tests?\b|\btests?\b|investigations?", msg):
        if style == "anxious":
            return "If you think it's needed, doctor. Could you explain what the test involves?"
        return "Yes, that's fine, doctor. Is there anything I need to do beforehand?"
    if re.search(r"travel|abroad|holiday|overseas", msg):
        return "No, I haven't been anywhere recently."
    if re.search(r"sick (people|contacts?)|anyone (else )?(ill|unwell|sick)|in contact with", msg):
        return "No, I haven't been around anyone who's ill."
    if re.search(r"hearing|\bears?\b|tinnitus", msg):
        return "My hearing's fine."

    # 6) conversation management
    if re.search(r"examin|let me (check|listen|take|have a look|feel)|i('| wi)ll (check|listen|take|examine)|lie (down|back)|sit (up|forward)|take a (deep )?breath|open your mouth|can i (check|examine|listen|feel|take)|going to (check|examine|listen)", msg):
        return {"pain": "Okay... please be gentle, it really hurts.", "breathless": "Okay... go ahead.",
                "anxious": "Yes, of course, doctor. Is it going to hurt?", "slow": "Yes... all right.",
                "calm": "Yes, of course, go ahead."}[style]
    if re.search(r"sorry to hear|must be (hard|difficult|scary|frightening|worrying)|don'?t worry|i understand|we('| wi)ll (look after|help|sort)|reassur", msg):
        return "Thank you, doctor. That helps." if style != "anxious" else "Thank you, doctor. I'm really frightened."
    if re.search(r"any questions|anything you('d| would) like (to )?(ask|add)|thank", msg):
        return "No, I think that's everything. Thank you, doctor."
    if re.match(r"^(hi|hello|hey|good (morning|afternoon|evening)|nice to meet|i'?m (dr|doctor)|my name is)", msg):
        return "Hello, doctor." if style in ("breathless", "slow") else "Hello, doctor. Thank you for seeing me."

    # Keep the role-play conversational when the offline script has no exact
    # fact for an unusual question. Never loop on a canned “I don't understand”.
    if re.search(r"\b(how much|how many|exactly|amount|quantity|intake)\b", msg):
        return "I don't know the exact amount, doctor. I can give you a rough idea if that would help."
    if style == "anxious":
        return f"I'm not sure of that detail, doctor. {sc['complaint']}"
    if style == "pain":
        return f"I can't remember the exact detail, doctor. {sc['complaint']}"
    return f"I'm not sure of that exact detail, doctor. {sc['complaint']}"


def opening_line(scenario: dict) -> str | None:
    """What the patient says when the doctor walks in."""
    sc = _script(scenario)
    if not sc:
        return None
    style = _style(scenario.get("patient_personality", ""))
    prefix = "" if style in ("breathless", "slow") else "Hello, doctor. "
    return prefix + sc["complaint"]
