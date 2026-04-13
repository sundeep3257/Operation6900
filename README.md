# Operation 6900

Operation 6900 is a single-player browser game built with Flask and plain HTML/CSS/JavaScript.  
You manage a hospital floor for one in-game week (5 days), assign staff, process patient workflows, and survive escalating unit chaos.

## Features

- Full 5-day progression with increasing difficulty.
- Lineup selection at the start of the week:
  - 2 medical students
  - 1 urology intern
  - 1 colorectal intern
  - 1 urology chief
  - 1 colorectal chief
- Role and service restrictions enforced:
  - Med students: H&P only (neutral service)
  - Interns: H&P, labs/imaging, diagnosis
  - Chiefs: all tasks including treatment implementation
  - Urology/colorectal members only care for their own service
- Patient workflow:
  1. Bed assignment
  2. History & Physical
  3. Labs/Imaging
  4. Diagnosis (auto-revealed after timer)
  5. Treatment plan choice (3 options, shuffled)
- Wrong treatment handling with penalties and randomized flavor text.
- Day summary, fail conditions, game over, and final victory screen.
- Modern hospital-themed top-down unit layout with moving staff tokens.

## Project Structure

```text
Operation_6900/
├── app.py
├── requirements.txt
├── README.md
├── data/
│   ├── characters.py
│   └── diagnoses.py
├── templates/
│   ├── base.html
│   ├── index.html
│   └── game.html
└── static/
    ├── css/
    │   └── style.css
    ├── js/
    │   ├── ui.js
    │   └── game.js
    └── images/
```

## Setup

1. Create and activate a virtual environment (recommended).
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Run the app:

```bash
python app.py
```

4. Open the local URL shown in your terminal (usually [http://127.0.0.1:5000](http://127.0.0.1:5000)).

## Customizing Game Data

- Edit staff pools in `data/characters.py`:
  - names
  - blurbs
  - role/service
  - speed multipliers
- Edit diagnoses and treatment options in `data/diagnoses.py`:
  - diagnosis names
  - symptom labels
  - correct plans
  - distractor pools
  - flavor text
- Edit per-day pacing and difficulty in `DAY_SETTINGS` inside `app.py`.

## Notes

- This game is parody-inspired and not a clinical decision tool.
- The app is intentionally file-based and session-backed for easy local editing.
