import os
import random
import re
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

from flask import Flask, jsonify, redirect, render_template, request, session, url_for

from data.characters import CHARACTER_POOLS, ROLE_TASKS
from data.diagnoses import (
    DAY_FAILURE_MESSAGES,
    DAY_SUMMARY_MESSAGES,
    DIAGNOSES,
    GLOBAL_WRONG_FLAVOR,
)

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "operation-6900-local-secret")

DIAGNOSIS_BY_ID = {item["id"]: item for item in DIAGNOSES}


def _portrait_stem(name):
    chunks = []
    for chunk in name.split():
        cleaned = re.sub(r"[^a-z0-9]", "", chunk.lower())
        if cleaned:
            chunks.append(cleaned)
    return "_".join(chunks)


def _available_portrait_stems():
    images_dir = Path(app.static_folder) / "images"
    if not images_dir.exists():
        return {}

    stems = {}
    for image_file in images_dir.iterdir():
        if not image_file.is_file():
            continue
        if image_file.suffix.lower() != ".png":
            continue
        if image_file.name.lower() == "6900_favicon.png":
            continue
        stems[image_file.stem.lower()] = image_file.name
    return stems


def _build_active_character_pools():
    portrait_stems = _available_portrait_stems()
    pools = {}
    for role_key, pool in CHARACTER_POOLS.items():
        role_pool = []
        for character in pool:
            portrait_stem = _portrait_stem(character["name"])
            portrait_file = portrait_stems.get(portrait_stem)
            if not portrait_file:
                continue
            role_pool.append(
                {
                    **character,
                    "portrait_url": f"/static/images/{portrait_file}",
                }
            )
        pools[role_key] = role_pool
    return pools


ACTIVE_CHARACTER_POOLS = _build_active_character_pools()
CHARACTERS_BY_ID = {
    character["id"]: character
    for pool in ACTIVE_CHARACTER_POOLS.values()
    for character in pool
}


DAY_SETTINGS = {
    1: {
        "day_length_sec": 280,
        "total_patients": 8,
        "arrival_gap_range": [20, 28],
        "patience_decay": 0.35,
        "health_decay": 0.15,
        "crash_limit": 3,
        "untreated_limit": 3,
        "min_score": 250,
    },
    2: {
        "day_length_sec": 270,
        "total_patients": 9,
        "arrival_gap_range": [17, 24],
        "patience_decay": 0.45,
        "health_decay": 0.2,
        "crash_limit": 3,
        "untreated_limit": 3,
        "min_score": 350,
    },
    3: {
        "day_length_sec": 250,
        "total_patients": 10,
        "arrival_gap_range": [14, 20],
        "patience_decay": 0.6,
        "health_decay": 0.28,
        "crash_limit": 3,
        "untreated_limit": 2,
        "min_score": 500,
    },
    4: {
        "day_length_sec": 235,
        "total_patients": 11,
        "arrival_gap_range": [11, 16],
        "patience_decay": 0.78,
        "health_decay": 0.38,
        "crash_limit": 3,
        "untreated_limit": 2,
        "min_score": 680,
    },
    5: {
        "day_length_sec": 220,
        "total_patients": 12,
        "arrival_gap_range": [8, 13],
        "patience_decay": 0.95,
        "health_decay": 0.48,
        "crash_limit": 3,
        "untreated_limit": 2,
        "min_score": 860,
    },
}


def _public_character_pools():
    return deepcopy(ACTIVE_CHARACTER_POOLS)


def _public_diagnoses():
    rows = []
    for item in DIAGNOSES:
        rows.append(
            {
                "id": item["id"],
                "service": item["service"],
                "name": item["name"],
                "symptom_label": item["symptom_label"],
                "correct_plan": item["correct_plan"],
                "distractors": item["distractors"],
            }
        )
    return rows


def _new_week_state(lineup):
    return {
        "lineup": lineup,
        "current_day": 1,
        "total_score": 0,
        "total_crashes": 0,
        "total_treated": 0,
        "mistakes": 0,
        "day_history": [],
        "week_complete": False,
        "game_over": False,
    }


def _validate_lineup(lineup_payload):
    needed_counts = {
        "med_student": 2,
        "urology_intern": 1,
        "colorectal_intern": 1,
        "urology_chief": 1,
        "colorectal_chief": 1,
    }

    if not isinstance(lineup_payload, dict):
        return False, "Invalid payload.", None

    selected_ids = []
    for role_key, expected_count in needed_counts.items():
        role_ids = lineup_payload.get(role_key, [])
        if not isinstance(role_ids, list) or len(role_ids) != expected_count:
            return (
                False,
                f"Selection for {role_key} must have {expected_count} member(s).",
                None,
            )
        selected_ids.extend(role_ids)

    if len(set(selected_ids)) != len(selected_ids):
        return False, "Duplicate character selected.", None

    final_lineup = []
    for role_key, role_ids in lineup_payload.items():
        for char_id in role_ids:
            character = CHARACTERS_BY_ID.get(char_id)
            if not character:
                return False, f"Unknown character id: {char_id}", None
            if role_key not in ROLE_TASKS:
                return False, f"Unknown role key: {role_key}", None
            if character["id"] not in [c["id"] for c in ACTIVE_CHARACTER_POOLS[role_key]]:
                return False, f"{character['name']} does not match slot {role_key}.", None
            final_lineup.append(
                {
                    **character,
                    "role_key": role_key,
                    "allowed_tasks": ROLE_TASKS[role_key],
                }
            )
    return True, "", final_lineup


def _build_day_manifest(day_number):
    config = DAY_SETTINGS[day_number]
    total_patients = config["total_patients"]
    min_gap, max_gap = config["arrival_gap_range"]
    time_cursor = 4
    service_cycle = ["colorectal", "urology"]

    manifest = []
    for i in range(total_patients):
        service = service_cycle[i % 2] if i < 4 else random.choice(service_cycle)
        possible = [d for d in DIAGNOSES if d["service"] == service]
        diagnosis = random.choice(possible)
        manifest.append(
            {
                "id": f"pt_{day_number}_{i+1}_{uuid4().hex[:6]}",
                "service": service,
                "diagnosis_id": diagnosis["id"],
                "symptom_label": diagnosis["symptom_label"],
                "arrival_at": time_cursor,
            }
        )
        gap = random.randint(min_gap, max_gap)
        # Later days have naturally tighter overlaps.
        overlap_bonus = random.randint(0, max(0, day_number - 2))
        time_cursor += max(2, gap - overlap_bonus)

    return manifest


def _evaluate_day(day_number, payload):
    config = DAY_SETTINGS[day_number]
    crashes = int(payload.get("crashes", 0))
    untreated = int(payload.get("untreated", 0))
    score = int(payload.get("score", 0))

    passed = (
        crashes <= config["crash_limit"]
        and untreated <= config["untreated_limit"]
        and score >= config["min_score"]
    )
    return passed, config


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/game")
def game():
    return render_template("game.html")


@app.route("/new-game")
def new_game_page():
    session.pop("week_state", None)
    return redirect(url_for("game"))


@app.get("/api/bootstrap")
def bootstrap():
    week_state = session.get("week_state")
    return jsonify(
        {
            "character_pools": _public_character_pools(),
            "diagnoses": _public_diagnoses(),
            "day_settings": DAY_SETTINGS,
            "week_state": week_state,
        }
    )


@app.post("/api/new-game")
def new_game():
    session.pop("week_state", None)
    return jsonify({"ok": True})


@app.post("/api/start-week")
def start_week():
    payload = request.get_json(silent=True) or {}
    valid, message, lineup = _validate_lineup(payload.get("lineup"))
    if not valid:
        return jsonify({"ok": False, "error": message}), 400

    week_state = _new_week_state(lineup)
    session["week_state"] = week_state
    return jsonify({"ok": True, "week_state": week_state})


@app.post("/api/start-day")
def start_day():
    payload = request.get_json(silent=True) or {}
    week_state = session.get("week_state")
    if not week_state:
        return jsonify({"ok": False, "error": "Start a week first."}), 400

    requested_day = int(payload.get("day", week_state["current_day"]))
    if requested_day != week_state["current_day"]:
        return jsonify({"ok": False, "error": "Requested day does not match current day."}), 400

    manifest = _build_day_manifest(requested_day)
    return jsonify(
        {
            "ok": True,
            "day": requested_day,
            "day_config": DAY_SETTINGS[requested_day],
            "lineup": week_state["lineup"],
            "manifest": manifest,
        }
    )


@app.post("/api/submit-treatment")
def submit_treatment():
    payload = request.get_json(silent=True) or {}
    diagnosis_id = payload.get("diagnosis_id")
    selected_plan = payload.get("selected_plan")
    diagnosis = DIAGNOSIS_BY_ID.get(diagnosis_id)
    if not diagnosis:
        return jsonify({"ok": False, "error": "Unknown diagnosis."}), 400

    correct_plan = diagnosis["correct_plan"]
    is_correct = selected_plan == correct_plan

    if is_correct:
        return jsonify(
            {
                "ok": True,
                "correct": True,
                "correct_plan": correct_plan,
                "score_delta": 180,
                "message": "Correct plan. Nice save on 6900.",
            }
        )

    flavor_pool = diagnosis.get("wrong_flavor", []) + GLOBAL_WRONG_FLAVOR
    return jsonify(
        {
            "ok": True,
            "correct": False,
            "correct_plan": correct_plan,
            "score_delta": -120,
            "health_penalty": 18,
            "patience_penalty": 14,
            "cooldown_sec": 2.5,
            "message": random.choice(flavor_pool),
        }
    )


@app.post("/api/finish-day")
def finish_day():
    payload = request.get_json(silent=True) or {}
    week_state = session.get("week_state")
    if not week_state:
        return jsonify({"ok": False, "error": "No active week."}), 400

    day_number = int(payload.get("day", week_state["current_day"]))
    if day_number != week_state["current_day"]:
        return jsonify({"ok": False, "error": "Day mismatch."}), 400

    passed, config = _evaluate_day(day_number, payload)
    summary = {
        "day": day_number,
        "patients_treated": int(payload.get("treated", 0)),
        "mistakes": int(payload.get("wrong_treatments", 0)),
        "crashes": int(payload.get("crashes", 0)),
        "score": int(payload.get("score", 0)),
        "avg_patience": float(payload.get("avg_patience", 0)),
        "message": random.choice(DAY_SUMMARY_MESSAGES if passed else DAY_FAILURE_MESSAGES),
    }

    week_state["total_score"] += summary["score"]
    week_state["total_crashes"] += summary["crashes"]
    week_state["total_treated"] += summary["patients_treated"]
    week_state["mistakes"] += summary["mistakes"]
    week_state["day_history"].append(summary)

    if not passed:
        week_state["game_over"] = True
        session["week_state"] = week_state
        return jsonify(
            {
                "ok": True,
                "passed": False,
                "config": config,
                "summary": summary,
                "week_state": week_state,
                "final_state": "game_over",
            }
        )

    if day_number >= 5:
        week_state["week_complete"] = True
        session["week_state"] = week_state
        return jsonify(
            {
                "ok": True,
                "passed": True,
                "config": config,
                "summary": summary,
                "week_state": week_state,
                "final_state": "victory",
            }
        )

    week_state["current_day"] += 1
    session["week_state"] = week_state
    return jsonify(
        {
            "ok": True,
            "passed": True,
            "config": config,
            "summary": summary,
            "week_state": week_state,
            "final_state": "next_day",
        }
    )


if __name__ == "__main__":
    app.run(debug=True)