"""Diagnosis and treatment data for Operation 6900."""

DIAGNOSES = [
    {
        "id": "cr_bowel_perforation",
        "service": "colorectal",
        "name": "Bowel perforation",
        "correct_plan": "Emergent Surgery (Ex-Lap)",
        "symptom_label": "rigid abdomen + severe pain",
        "distractors": ["Eye Drops", "Incentive Spirometry", "Ice Pack Only", "Discharge Home"],
        "wrong_flavor": [
            "You placed eye drops for a bowel perforation. The chief has gone silent.",
            "Incentive spirometry for free air under the diaphragm is certainly a choice.",
        ],
    },
    {
        "id": "cr_sbo",
        "service": "colorectal",
        "name": "Small bowel obstruction",
        "correct_plan": "NG Tube Decompression",
        "symptom_label": "distention + vomiting",
        "distractors": ["Eye Drops", "Foley Catheter Placement", "Physical Therapy", "Ice Pack Only"],
        "wrong_flavor": [
            "NG tube was the answer. Physical therapy was not.",
            "You considered eye drops for an SBO. Bold and deeply incorrect.",
        ],
    },
    {
        "id": "cr_appendicitis",
        "service": "colorectal",
        "name": "Acute appendicitis",
        "correct_plan": "Appendectomy",
        "symptom_label": "RLQ tenderness + fever",
        "distractors": ["Dialysis", "Chest Tube", "Eye Drops", "Incentive Spirometry"],
        "wrong_flavor": [
            "Chest tube for appendicitis? Wrong tube, wrong quadrant.",
            "The appendix remains unimpressed by dialysis.",
        ],
    },
    {
        "id": "cr_diverticulitis",
        "service": "colorectal",
        "name": "Diverticulitis (uncomplicated)",
        "correct_plan": "Antibiotics",
        "symptom_label": "LLQ pain + mild fever",
        "distractors": ["Eye Drops", "Chest Tube", "Detorsion Surgery", "Dialysis"],
        "wrong_flavor": [
            "You selected chest tube for diverticulitis. The colon objects.",
            "Detorsion surgery is dramatic, but not for this diagnosis.",
        ],
    },
    {
        "id": "cr_constipation",
        "service": "colorectal",
        "name": "Constipation / fecal impaction",
        "correct_plan": "Laxatives / Disimpaction",
        "symptom_label": "no BM + abdominal discomfort",
        "distractors": ["Cystoscopy", "Eye Drops", "Chest Tube", "Detorsion Surgery"],
        "wrong_flavor": [
            "Cystoscopy for fecal impaction confused both services.",
            "Eye drops do not improve bowel motility, unfortunately.",
        ],
    },
    {
        "id": "cr_perianal_abscess",
        "service": "colorectal",
        "name": "Perianal abscess",
        "correct_plan": "Incision & Drainage",
        "symptom_label": "focal perianal pain + swelling",
        "distractors": ["Dialysis", "Eye Drops", "Incentive Spirometry", "Discharge Home"],
        "wrong_flavor": [
            "You tried incentive spirometry for a perianal abscess. Creative but no.",
            "This abscess needed drainage, not a discharge order.",
        ],
    },
    {
        "id": "ur_kidney_stone",
        "service": "urology",
        "name": "Kidney stone",
        "correct_plan": "Pain Control ± Fluids",
        "symptom_label": "flank pain radiating to groin",
        "distractors": ["NG Tube Decompression", "Eye Drops", "Chest Tube", "Physical Therapy"],
        "wrong_flavor": [
            "NG tube for kidney stones? The stone did not migrate to the stomach.",
            "Chest tube selected. The kidney remains unconvinced.",
        ],
    },
    {
        "id": "ur_retention",
        "service": "urology",
        "name": "Urinary retention",
        "correct_plan": "Foley Catheter Placement",
        "symptom_label": "suprapubic pain + inability to void",
        "distractors": ["Appendectomy", "Eye Drops", "Incentive Spirometry", "Chest Tube"],
        "wrong_flavor": [
            "Appendectomy for urinary retention drew audible sighs from the workroom.",
            "Eye drops still not fixing the bladder.",
        ],
    },
    {
        "id": "ur_torsion",
        "service": "urology",
        "name": "Testicular torsion",
        "correct_plan": "Emergent Surgery (Detorsion)",
        "symptom_label": "acute unilateral testicular pain",
        "distractors": ["Oral Laxatives", "Discharge Home", "Physical Therapy", "Dialysis"],
        "wrong_flavor": [
            "Oral laxatives for torsion prompted immediate chief intervention.",
            "Discharge home for torsion was denied at lightspeed.",
        ],
    },
    {
        "id": "ur_uti",
        "service": "urology",
        "name": "UTI",
        "correct_plan": "Antibiotics",
        "symptom_label": "dysuria + urgency",
        "distractors": ["Chest Tube", "Eye Drops", "NG Tube Decompression", "Appendectomy"],
        "wrong_flavor": [
            "Chest tube selected for UTI. Different organ system entirely.",
            "Appendectomy does not sterilize urine.",
        ],
    },
    {
        "id": "ur_hematuria",
        "service": "urology",
        "name": "Gross hematuria",
        "correct_plan": "Cystoscopy",
        "symptom_label": "visible blood in urine",
        "distractors": ["Oral Laxatives", "Eye Drops", "Incentive Spirometry", "Physical Therapy"],
        "wrong_flavor": [
            "Oral laxatives for hematuria caused immediate attending eyebrow raise.",
            "Incentive spirometry is many things, but not cystoscopy.",
        ],
    },
    {
        "id": "ur_hydronephrosis",
        "service": "urology",
        "name": "Hydronephrosis",
        "correct_plan": "Ureteral Stent / Decompression",
        "symptom_label": "flank fullness + rising creatinine",
        "distractors": ["Chest Tube", "Eye Drops", "Physical Therapy", "Oral Laxatives"],
        "wrong_flavor": [
            "You chose chest tube for hydronephrosis. The ureter remains blocked.",
            "Physical therapy cannot decompress a collecting system.",
        ],
    },
]

GLOBAL_WRONG_FLAVOR = [
    "The patient is unimpressed, and so is the service.",
    "The chief stares into the distance, reconsidering your call schedule.",
    "That plan did not spark joy in the workroom.",
    "A collective 'hmm' echoes down the hallway.",
    "The intern quietly opens UpToDate and avoids eye contact.",
]

DAY_SUMMARY_MESSAGES = [
    "The unit survives another shift. Coffee supplies are critically low.",
    "Your sign-out was coherent. Nobody can explain how.",
    "Census chaos contained. Pager still screaming.",
    "You held the line on 6900. Barely, but it counts.",
    "The chiefs nod once. That is basically a standing ovation.",
]

DAY_FAILURE_MESSAGES = [
    "The floor spiraled into consult anarchy.",
    "Too many crashes. The workroom whiteboard now only says 'why'.",
    "The pager won this round.",
    "The chiefs called an emergency debrief and hid your badge.",
]
