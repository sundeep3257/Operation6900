(() => {
    const { el, clamp, shuffle, showToast, showModal, hideModal, formatClock, makeBar } = window.UI;

    const TASK_SEQUENCE = [
        "needs_h_and_p",
        "needs_labs_imaging",
        "needs_diagnosis",
        "needs_treatment_plan",
    ];

    const STAGE_LABELS = {
        waiting_bed: "Waiting for bed",
        needs_h_and_p: "Needs H&P",
        needs_labs_imaging: "Needs Labs/Imaging",
        needs_diagnosis: "Diagnosis Pending",
        needs_treatment_plan: "Needs Treatment Task",
        awaiting_treatment_choice: "Choose Treatment Plan",
        completed: "Completed",
        crashed: "Crashed",
    };

    const TASK_KEYS = {
        needs_h_and_p: "h_and_p",
        needs_labs_imaging: "labs_imaging",
        needs_diagnosis: "diagnosis",
        needs_treatment_plan: "treatment_plan",
    };

    const BASE_TASK_SECONDS = {
        h_and_p: 4.5,
        labs_imaging: 5.5,
        diagnosis: 4.5,
        treatment_plan: 3.8,
    };

    const WORKROOM_FALLBACK_POS = { x: 445, y: 236 };
    const INTAKE_FALLBACK_POS = { x: 445, y: 34 };
    const LABS_FALLBACK_POS = { x: 445, y: 452 };
    const UI_REFRESH_INTERVAL = 0.35;
    const ROLE_COLORS = {
        med_student: "#54c7ec",
        intern: "#7c5cff",
        chief: "#ff7f50",
    };

    const state = {
        bootstrap: null,
        weekState: null,
        currentDay: 1,
        dayConfig: null,
        dayRunning: false,
        paused: false,
        elapsed: 0,
        frameHandle: null,
        lastTs: 0,
        manifest: [],
        spawnCursor: 0,
        diagnosesById: {},
        beds: {},
        patients: {},
        queue: [],
        characters: {},
        activeTasks: [],
        treatmentQueue: [],
        treatmentModalOpenFor: null,
        assignmentModalOpenFor: null,
        uiRefreshElapsed: 0,
        stats: {
            score: 0,
            treated: 0,
            crashes: 0,
            wrongTreatments: 0,
            patienceSamples: [],
        },
        slotRules: {},
        lineupDraft: {},
    };

    const refs = {
        queueList: document.getElementById("queue-list"),
        queueCount: document.getElementById("queue-count"),
        rosterList: document.getElementById("roster-list"),
        charactersLayer: document.getElementById("characters-layer"),
        hudDay: document.getElementById("hud-day"),
        hudTimer: document.getElementById("hud-timer"),
        hudScore: document.getElementById("hud-score"),
        hudTreated: document.getElementById("hud-treated"),
        hudCrashes: document.getElementById("hud-crashes"),
        hudMistakes: document.getElementById("hud-mistakes"),
        pauseBtn: document.getElementById("pause-btn"),
        restartBtn: document.getElementById("restart-btn"),
    };

    function bedCenterFor(bedId) {
        const slot = document.querySelector(`[data-bed-id="${bedId}"]`);
        const map = document.getElementById("unit-map").getBoundingClientRect();
        const rect = slot.getBoundingClientRect();
        return {
            x: rect.left - map.left + rect.width / 2,
            y: rect.top - map.top + rect.height / 2,
        };
    }

    function distance(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function zoneCenter(selector, fallback) {
        const mapNode = document.getElementById("unit-map");
        const zone = document.querySelector(selector);
        if (!mapNode || !zone) return fallback;
        const mapRect = mapNode.getBoundingClientRect();
        const zoneRect = zone.getBoundingClientRect();
        return {
            x: zoneRect.left - mapRect.left + zoneRect.width / 2,
            y: zoneRect.top - mapRect.top + zoneRect.height / 2,
        };
    }

    function canCharacterServePatient(character, patient, taskStage) {
        if (character.busy) return false;
        if (!character.allowed_tasks.includes(TASK_KEYS[taskStage])) return false;
        if (character.service !== "neutral" && character.service !== patient.service) return false;
        return true;
    }

    function roleTier(roleKey) {
        if (roleKey === "med_student") return "med_student";
        if (roleKey.includes("intern")) return "intern";
        return "chief";
    }

    function roleColor(roleKey) {
        return ROLE_COLORS[roleTier(roleKey)] || "#5a6ff5";
    }

    function initials(name) {
        return name
            .split(" ")
            .map((chunk) => chunk[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
    }

    function applyCharacterPortrait(node, character, fallbackClass) {
        if (character.portrait_url) {
            node.style.backgroundImage = `url("${character.portrait_url}")`;
            node.style.backgroundColor = "transparent";
            node.textContent = "";
            if (fallbackClass) node.classList.remove(fallbackClass);
            return;
        }
        node.style.backgroundImage = "";
        node.style.backgroundColor = roleColor(character.role_key);
        node.textContent = initials(character.name);
        if (fallbackClass) node.classList.add(fallbackClass);
    }

    function workroomSlot(index, anchor) {
        const columns = 3;
        const col = index % columns;
        const row = Math.floor(index / columns);
        return {
            x: anchor.x + (col - 1) * 46,
            y: anchor.y + (row - 0.5) * 34,
        };
    }

    async function api(path, method = "GET", body = null) {
        const options = { method, headers: {} };
        if (body) {
            options.headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(body);
        }
        const resp = await fetch(path, options);
        const payload = await resp.json();
        if (!resp.ok || payload.ok === false) {
            throw new Error(payload.error || `Request failed: ${path}`);
        }
        return payload;
    }

    function initializeBeds() {
        const slots = Array.from(document.querySelectorAll(".bed-slot"));
        const beds = {};
        slots.forEach((slot) => {
            const bedId = slot.dataset.bedId;
            beds[bedId] = {
                id: bedId,
                service: slot.dataset.service,
                occupantId: null,
            };
            slot.addEventListener("dragover", (event) => {
                event.preventDefault();
                slot.classList.add("drop-target");
            });
            slot.addEventListener("dragleave", () => slot.classList.remove("drop-target"));
            slot.addEventListener("drop", (event) => {
                event.preventDefault();
                slot.classList.remove("drop-target");
                const patientId = event.dataTransfer.getData("text/plain");
                assignBed(patientId, bedId);
            });
        });
        state.beds = beds;
    }

    function clearDayState() {
        state.elapsed = 0;
        state.lastTs = 0;
        state.paused = false;
        state.dayRunning = false;
        state.manifest = [];
        state.spawnCursor = 0;
        state.patients = {};
        state.queue = [];
        state.characters = {};
        state.activeTasks = [];
        state.treatmentQueue = [];
        state.treatmentModalOpenFor = null;
        state.assignmentModalOpenFor = null;
        state.uiRefreshElapsed = 0;
        state.stats = {
            score: 0,
            treated: 0,
            crashes: 0,
            wrongTreatments: 0,
            patienceSamples: [],
        };
        Object.values(state.beds).forEach((bed) => { bed.occupantId = null; });
    }

    function createCharacterState(lineup) {
        const byId = {};
        const workroomCenter = zoneCenter(".workroom-zone", WORKROOM_FALLBACK_POS);
        lineup.forEach((member, index) => {
            const slot = workroomSlot(index, workroomCenter);
            byId[member.id] = {
                ...member,
                busy: false,
                busyTask: null,
                homeX: slot.x,
                homeY: slot.y,
                x: slot.x,
                y: slot.y,
                move: null,
            };
        });
        state.characters = byId;
    }

    function buildPatientsFromManifest(manifest) {
        const rows = {};
        manifest.forEach((raw) => {
            rows[raw.id] = {
                id: raw.id,
                service: raw.service,
                diagnosisId: raw.diagnosis_id,
                diagnosisRevealed: null,
                symptomLabel: raw.symptom_label,
                hasArrived: false,
                arrivedAt: null,
                stage: "waiting_bed",
                bedId: null,
                inProgress: false,
                currentTask: null,
                patience: 100,
                health: 100,
                crashed: false,
                completed: false,
                dischargeAt: null,
                treatmentLockedUntil: 0,
            };
        });
        state.patients = rows;
    }

    function getOpenBedForService(service) {
        const beds = Object.values(state.beds).filter((bed) => !bed.occupantId && bed.service === service);
        return beds.length ? beds[0] : null;
    }

    function assignBed(patientId, bedId) {
        const patient = state.patients[patientId];
        const bed = state.beds[bedId];
        if (!patient || !bed) return;
        if (patient.bedId || patient.stage !== "waiting_bed") return;
        if (bed.occupantId) {
            showToast("That bed is occupied.");
            return;
        }
        if (bed.service !== patient.service) {
            showToast("Service mismatch: use the correct wing.");
            return;
        }
        bed.occupantId = patientId;
        patient.bedId = bedId;
        patient.stage = "needs_h_and_p";
        state.queue = state.queue.filter((id) => id !== patientId);
        showToast(`Patient placed in ${bedId.toUpperCase()}.`);
        renderAll();
    }

    function enqueueNewArrivals() {
        while (
            state.spawnCursor < state.manifest.length &&
            state.manifest[state.spawnCursor].arrival_at <= state.elapsed
        ) {
            const incoming = state.manifest[state.spawnCursor];
            if (!state.queue.includes(incoming.id)) {
                const patient = state.patients[incoming.id];
                if (patient) {
                    patient.hasArrived = true;
                    patient.arrivedAt = state.elapsed;
                }
                state.queue.push(incoming.id);
                showToast(`New ${incoming.service} patient arrived.`);
            }
            state.spawnCursor += 1;
        }
    }

    function markCrash(patient) {
        if (patient.crashed || patient.completed) return;
        patient.crashed = true;
        patient.stage = "crashed";
        patient.inProgress = false;
        patient.currentTask = null;
        if (patient.bedId && state.beds[patient.bedId]) {
            state.beds[patient.bedId].occupantId = null;
            patient.bedId = null;
        }
        state.queue = state.queue.filter((id) => id !== patient.id);
        state.stats.crashes += 1;
        state.stats.score -= 180;
        showToast("Patient crashed. Unit pressure rises.");
    }

    function updatePatients(dt) {
        Object.values(state.patients).forEach((patient) => {
            if (patient.crashed || patient.completed) return;
            if (!patient.hasArrived) return;

            const basePatienceDecay = state.dayConfig.patience_decay * dt;
            const baseHealthDecay = state.dayConfig.health_decay * dt;
            const waitingMultiplier = patient.inProgress ? 0.35 : 1.0;
            const queuePenalty = patient.stage === "waiting_bed" ? 1.25 : 1.0;

            patient.patience = clamp(
                patient.patience - basePatienceDecay * waitingMultiplier * queuePenalty,
                0,
                100
            );

            const lowPatienceRisk = patient.patience < 30 ? 1.55 : 1.0;
            patient.health = clamp(
                patient.health - baseHealthDecay * waitingMultiplier * lowPatienceRisk,
                0,
                100
            );

            if (patient.health <= 0) {
                markCrash(patient);
            }
        });
    }

    function moveCharacter(character, destination, callback) {
        const dist = distance({ x: character.x, y: character.y }, destination);
        const pxPerSecond = 72 * character.movement_speed;
        const duration = Math.max(0.45, dist / pxPerSecond);
        character.move = {
            fromX: character.x,
            fromY: character.y,
            toX: destination.x,
            toY: destination.y,
            elapsed: 0,
            duration,
            callback,
        };
    }

    function updateCharacterMovement(dt) {
        Object.values(state.characters).forEach((character) => {
            if (!character.move) return;
            character.move.elapsed += dt;
            const t = clamp(character.move.elapsed / character.move.duration, 0, 1);
            character.x = character.move.fromX + (character.move.toX - character.move.fromX) * t;
            character.y = character.move.fromY + (character.move.toY - character.move.fromY) * t;
            if (t >= 1) {
                const cb = character.move.callback;
                character.move = null;
                if (cb) cb();
            }
        });
    }

    function getTaskTarget(patient, taskStage) {
        if (taskStage === "needs_labs_imaging") return zoneCenter(".labs-zone", LABS_FALLBACK_POS);
        if (!patient.bedId) return zoneCenter(".intake-zone", INTAKE_FALLBACK_POS);
        return bedCenterFor(patient.bedId);
    }

    function makeMiniMeter(value, tone) {
        const outer = el("div", "mini-meter");
        const inner = el("div", "mini-meter-fill");
        inner.style.width = `${clamp(value, 0, 100)}%`;
        if (tone === "health") {
            inner.classList.add("health");
        } else {
            inner.classList.add("patience");
        }
        outer.appendChild(inner);
        return outer;
    }

    function assignTask(patientId, characterId) {
        const patient = state.patients[patientId];
        const character = state.characters[characterId];
        if (!patient || !character) return;
        const stage = patient.stage;
        if (!TASK_KEYS[stage]) return;
        if (!canCharacterServePatient(character, patient, stage)) {
            showToast("That team member cannot do this task.");
            return;
        }
        if (stage === "needs_treatment_plan" && state.elapsed < patient.treatmentLockedUntil) {
            showToast("Treatment decision cooldown active.");
            return;
        }

        patient.inProgress = true;
        patient.currentTask = TASK_KEYS[stage];
        character.busy = true;
        character.busyTask = `${patient.id}:${patient.currentTask}`;

        const destination = getTaskTarget(patient, stage);
        moveCharacter(character, destination, () => {
            const baseDuration = BASE_TASK_SECONDS[patient.currentTask];
            const difficultyScale = 0.9 + (state.currentDay - 1) * 0.04;
            const durationSec = (baseDuration * difficultyScale) / character.task_speed_multiplier;
            state.activeTasks.push({
                patientId,
                characterId,
                task: patient.currentTask,
                startedAt: state.elapsed,
                endAt: state.elapsed + durationSec,
            });
        });
        if (state.assignmentModalOpenFor === patientId) {
            state.assignmentModalOpenFor = null;
            hideModal();
        }
        renderAll();
    }

    function releaseCharacter(character) {
        moveCharacter(character, { x: character.homeX, y: character.homeY }, () => {
            character.busy = false;
            character.busyTask = null;
        });
    }

    function advancePatientStage(patient) {
        const index = TASK_SEQUENCE.indexOf(patient.stage);
        if (index === -1) return;
        const nextStage = TASK_SEQUENCE[index + 1];
        if (!nextStage) {
            patient.stage = "awaiting_treatment_choice";
            if (!state.treatmentQueue.includes(patient.id)) state.treatmentQueue.push(patient.id);
            return;
        }
        patient.stage = nextStage;
    }

    function resolveTaskCompletions() {
        const due = state.activeTasks.filter((task) => task.endAt <= state.elapsed);
        if (!due.length) return;
        state.activeTasks = state.activeTasks.filter((task) => task.endAt > state.elapsed);

        due.forEach((task) => {
            const patient = state.patients[task.patientId];
            const character = state.characters[task.characterId];
            if (patient && !patient.crashed && !patient.completed) {
                patient.inProgress = false;
                patient.currentTask = null;

                if (task.task === "diagnosis") {
                    const diagnosis = state.diagnosesById[patient.diagnosisId];
                    patient.diagnosisRevealed = diagnosis.name;
                    showToast(`Diagnosis complete: ${diagnosis.name}`);
                }
                advancePatientStage(patient);
            }
            if (character) {
                releaseCharacter(character);
            }
        });
    }

    function dischargeCompletedPatients() {
        Object.values(state.patients).forEach((patient) => {
            if (!patient.completed) return;
            if (state.elapsed >= patient.dischargeAt) {
                if (patient.bedId && state.beds[patient.bedId]) {
                    state.beds[patient.bedId].occupantId = null;
                }
                patient.bedId = null;
            }
        });
    }

    function unresolvedPatientCount() {
        return Object.values(state.patients).filter(
            (p) => !p.crashed && !p.completed
        ).length;
    }

    function averagePatience() {
        const active = Object.values(state.patients).filter((p) => !p.crashed);
        if (!active.length) return 0;
        const total = active.reduce((sum, p) => sum + p.patience, 0);
        return total / active.length;
    }

    async function finishDay() {
        state.dayRunning = false;
        const payload = {
            day: state.currentDay,
            treated: state.stats.treated,
            wrong_treatments: state.stats.wrongTreatments,
            crashes: state.stats.crashes,
            avg_patience: averagePatience(),
            score: state.stats.score,
            untreated: unresolvedPatientCount(),
        };

        try {
            const result = await api("/api/finish-day", "POST", payload);
            state.weekState = result.week_state;
            showDaySummaryModal(result.summary, result.final_state);
        } catch (error) {
            showToast(error.message);
        }
    }

    function shouldDayFinish() {
        const allArrived = state.spawnCursor >= state.manifest.length;
        const allSettled = unresolvedPatientCount() === 0 && state.activeTasks.length === 0;
        const timerEnded = state.elapsed >= state.dayConfig.day_length_sec;
        return (allArrived && allSettled) || timerEnded;
    }

    async function submitTreatmentChoice(patient, selectedPlan) {
        const diagnosis = state.diagnosesById[patient.diagnosisId];
        try {
            const result = await api("/api/submit-treatment", "POST", {
                diagnosis_id: diagnosis.id,
                selected_plan: selectedPlan,
            });
            state.stats.score += result.score_delta;
            if (result.correct) {
                patient.completed = true;
                patient.stage = "completed";
                patient.dischargeAt = state.elapsed + 3.2;
                state.stats.treated += 1;
                showToast("Treatment successful. Bed will clear shortly.");
                state.treatmentModalOpenFor = null;
                hideModal();
                return;
            }

            state.stats.wrongTreatments += 1;
            patient.health = clamp(patient.health - result.health_penalty, 0, 100);
            patient.patience = clamp(patient.patience - result.patience_penalty, 0, 100);
            patient.treatmentLockedUntil = state.elapsed + result.cooldown_sec;
            showToast(result.message, 3200);
            if (patient.health <= 0) markCrash(patient);
            state.treatmentModalOpenFor = null;
            hideModal();
        } catch (error) {
            showToast(error.message);
        }
    }

    function showTreatmentModal(patientId) {
        const patient = state.patients[patientId];
        if (!patient || patient.crashed || patient.completed) return;
        if (state.treatmentModalOpenFor && state.treatmentModalOpenFor !== patientId) return;
        if (state.elapsed < patient.treatmentLockedUntil) return;

        const diagnosis = state.diagnosesById[patient.diagnosisId];
        const wrongOptions = shuffle(diagnosis.distractors).slice(0, 2);
        const options = shuffle([diagnosis.correct_plan, ...wrongOptions]);

        const card = el("div", "modal-card");
        card.appendChild(el("h3", "", `Treatment Plan - ${diagnosis.name}`));
        card.appendChild(el("p", "tiny-text", `Patient symptom note: ${patient.symptomLabel}`));

        const optionsWrap = el("div", "treatment-options");
        options.forEach((option) => {
            const button = el("button", "treatment-option", option);
            button.addEventListener("click", () => submitTreatmentChoice(patient, option));
            optionsWrap.appendChild(button);
        });

        const foot = el("div", "row-between");
        const closeBtn = el("button", "btn btn-small btn-ghost", "Close");
        closeBtn.addEventListener("click", () => {
            state.treatmentModalOpenFor = null;
            hideModal();
        });
        foot.appendChild(el("span", "tiny-text", "Pick the only correct plan."));
        foot.appendChild(closeBtn);

        card.append(optionsWrap, foot);
        state.treatmentModalOpenFor = patientId;
        showModal(card);
    }

    function showAssignTaskModal(patientId) {
        const patient = state.patients[patientId];
        if (!patient || patient.crashed || patient.completed || patient.inProgress) return;
        if (!TASK_KEYS[patient.stage]) return;

        const eligible = Object.values(state.characters).filter((char) =>
            canCharacterServePatient(char, patient, patient.stage)
        );
        const card = el("div", "modal-card");
        card.appendChild(el("h3", "", `Assign ${STAGE_LABELS[patient.stage] || "Task"}`));
        card.appendChild(
            el(
                "p",
                "tiny-text",
                `${patient.service.toUpperCase()} patient • ${patient.symptomLabel}`
            )
        );

        const options = el("div", "treatment-options");
        if (!eligible.length) {
            options.appendChild(el("p", "tiny-text", "No eligible team member is currently available."));
        } else {
            eligible.forEach((char) => {
                const btn = el("button", "treatment-option", `${char.name} • ${char.role}`);
                btn.addEventListener("click", () => assignTask(patient.id, char.id));
                options.appendChild(btn);
            });
        }
        card.appendChild(options);

        const foot = el("div", "row-between");
        const closeBtn = el("button", "btn btn-small btn-ghost", "Close");
        closeBtn.addEventListener("click", () => {
            state.assignmentModalOpenFor = null;
            hideModal();
        });
        foot.appendChild(el("span", "tiny-text", "Only valid roles/services appear here."));
        foot.appendChild(closeBtn);
        card.appendChild(foot);

        state.assignmentModalOpenFor = patientId;
        showModal(card);
    }

    function maybeOpenTreatmentModal() {
        if (state.treatmentModalOpenFor) return;
        while (state.treatmentQueue.length) {
            const patientId = state.treatmentQueue.shift();
            const patient = state.patients[patientId];
            if (!patient || patient.crashed || patient.completed) continue;
            if (patient.stage !== "awaiting_treatment_choice") continue;
            if (state.elapsed < patient.treatmentLockedUntil) {
                state.treatmentQueue.push(patientId);
                break;
            }
            showTreatmentModal(patientId);
            break;
        }
    }

    function updateHud() {
        refs.hudDay.textContent = `Day ${state.currentDay}`;
        const remaining = state.dayConfig ? state.dayConfig.day_length_sec - state.elapsed : 0;
        refs.hudTimer.textContent = formatClock(remaining);
        refs.hudScore.textContent = state.stats.score;
        refs.hudTreated.textContent = state.stats.treated;
        refs.hudCrashes.textContent = state.stats.crashes;
        refs.hudMistakes.textContent = state.stats.wrongTreatments;
    }

    function renderQueue() {
        refs.queueList.innerHTML = "";
        refs.queueCount.textContent = `${state.queue.length} waiting`;
        state.queue.forEach((patientId) => {
            const p = state.patients[patientId];
            if (!p) return;
            const card = el("div", "queue-card");
            card.draggable = true;
            card.addEventListener("dragstart", (event) => {
                event.dataTransfer.setData("text/plain", p.id);
                card.classList.add("dragging");
            });
            card.addEventListener("dragend", () => card.classList.remove("dragging"));

            const head = el("div", "queue-head");
            head.appendChild(el("strong", "", p.id.slice(-5).toUpperCase()));
            head.appendChild(el("span", `badge ${p.service}`, p.service));
            const assignBtn = el("button", "btn btn-small btn-primary", "Assign Bed");
            assignBtn.addEventListener("click", () => {
                const bed = getOpenBedForService(p.service);
                if (!bed) {
                    showToast(`No open ${p.service} beds.`);
                    return;
                }
                assignBed(p.id, bed.id);
            });
            head.appendChild(assignBtn);
            card.appendChild(head);
            card.appendChild(el("div", "tiny-text", p.symptomLabel));
            card.appendChild(makeBar("Patience", p.patience));
            card.appendChild(makeBar("Health", p.health));
            refs.queueList.appendChild(card);
        });
    }

    function renderRoster() {
        refs.rosterList.innerHTML = "";
        Object.values(state.characters).forEach((char) => {
            const card = el("div", "roster-card");
            const avatar = el("div", "avatar");
            applyCharacterPortrait(avatar, char, "avatar-fallback");
            card.appendChild(avatar);

            const center = el("div");
            center.appendChild(el("strong", "", char.name));
            center.appendChild(el("div", "tiny-text", `${char.role} • ${char.service}`));
            center.appendChild(el("div", "tiny-text", char.flavor));
            card.appendChild(center);

            const side = el("div");
            const dot = el("span", `status-dot ${char.busy ? "busy" : "available"}`);
            side.appendChild(dot);
            side.appendChild(el("span", "tiny-text", char.busy ? " Busy" : " Ready"));
            card.appendChild(side);

            refs.rosterList.appendChild(card);
        });
    }

    function renderCharacterTokens() {
        refs.charactersLayer.innerHTML = "";
        Object.values(state.characters).forEach((char) => {
            const token = el("div", `character-token ${char.busy ? "busy" : ""}`);
            token.style.left = `${char.x}px`;
            token.style.top = `${char.y}px`;
            applyCharacterPortrait(token, char, "character-token-fallback");
            token.title = `${char.name} (${char.role})`;
            refs.charactersLayer.appendChild(token);
        });
    }

    function renderMapRooms() {
        Object.values(state.beds).forEach((bed) => {
            const room = document.querySelector(`[data-bed-id="${bed.id}"]`);
            if (!room) return;
            room.innerHTML = "";

            const top = el("div", "room-top");
            top.appendChild(el("span", "room-code", bed.id.toUpperCase()));
            top.appendChild(el("span", `badge ${bed.service}`, bed.service));
            room.appendChild(top);

            if (!bed.occupantId) {
                room.appendChild(el("div", "tiny-text", "Open bed"));
                return;
            }

            const patient = state.patients[bed.occupantId];
            if (!patient) return;
            room.appendChild(el("div", "room-symptom", patient.symptomLabel));
            const stageTag = el("span", "stage-tag", STAGE_LABELS[patient.stage] || patient.stage);
            room.appendChild(stageTag);
            if (patient.diagnosisRevealed) {
                room.appendChild(el("div", "tiny-text", `Dx: ${patient.diagnosisRevealed}`));
            }
            const meterLabels = el("div", "row-between tiny-text");
            meterLabels.appendChild(el("span", "", "P"));
            meterLabels.appendChild(el("span", "", "H"));
            room.appendChild(meterLabels);
            room.appendChild(makeMiniMeter(patient.patience, "patience"));
            room.appendChild(makeMiniMeter(patient.health, "health"));

            if (TASK_KEYS[patient.stage] && !patient.inProgress && !patient.crashed && !patient.completed) {
                const assignBtn = el("button", "btn btn-small btn-primary room-action", "Assign Task");
                assignBtn.addEventListener("click", () => showAssignTaskModal(patient.id));
                room.appendChild(assignBtn);
            } else if (patient.stage === "awaiting_treatment_choice") {
                const chooseBtn = el("button", "btn btn-small btn-danger room-action", "Choose Plan");
                chooseBtn.disabled = state.elapsed < patient.treatmentLockedUntil;
                chooseBtn.addEventListener("click", () => showTreatmentModal(patient.id));
                room.appendChild(chooseBtn);
            } else if (patient.completed) {
                room.appendChild(el("div", "tiny-text", "Discharging shortly..."));
            } else if (patient.inProgress) {
                room.appendChild(el("div", "tiny-text", "Task in progress..."));
            }
        });
    }

    function renderAll() {
        updateHud();
        renderQueue();
        renderRoster();
        renderMapRooms();
        renderCharacterTokens();
    }

    function updateLoop(ts) {
        if (!state.dayRunning) return;
        if (!state.lastTs) state.lastTs = ts;
        const dt = (ts - state.lastTs) / 1000;
        state.lastTs = ts;
        if (state.paused) {
            renderAll();
            state.frameHandle = requestAnimationFrame(updateLoop);
            return;
        }

        state.elapsed += dt;
        state.uiRefreshElapsed += dt;
        enqueueNewArrivals();
        updatePatients(dt);
        updateCharacterMovement(dt);
        resolveTaskCompletions();
        dischargeCompletedPatients();
        maybeOpenTreatmentModal();

        if (shouldDayFinish()) {
            finishDay();
            renderAll();
            return;
        }

        if (state.uiRefreshElapsed >= UI_REFRESH_INTERVAL) {
            renderAll();
            state.uiRefreshElapsed = 0;
        } else {
            updateHud();
            renderCharacterTokens();
        }
        state.frameHandle = requestAnimationFrame(updateLoop);
    }

    function showDaySummaryModal(summary, finalState) {
        const card = el("div", "modal-card");
        card.appendChild(el("h3", "", `Day ${summary.day} Summary`));
        card.appendChild(el("p", "tiny-text", summary.message));

        const statList = el("div");
        statList.appendChild(el("p", "", `Patients treated: ${summary.patients_treated}`));
        statList.appendChild(el("p", "", `Mistakes: ${summary.mistakes}`));
        statList.appendChild(el("p", "", `Crashes: ${summary.crashes}`));
        statList.appendChild(el("p", "", `Score: ${summary.score}`));
        card.appendChild(statList);

        const row = el("div", "row-between");
        if (finalState === "next_day") {
            row.appendChild(el("span", "tiny-text", "Shift complete. Prep for the next day."));
            const nextBtn = el("button", "btn btn-primary", "Start Next Day");
            nextBtn.addEventListener("click", () => {
                hideModal();
                startDay(state.weekState.current_day);
            });
            row.appendChild(nextBtn);
        } else if (finalState === "victory") {
            row.appendChild(el("span", "tiny-text", "You survived the week on 6900."));
            const restart = el("button", "btn btn-primary", "Play Again");
            restart.addEventListener("click", restartWeek);
            row.appendChild(restart);
        } else {
            row.appendChild(el("span", "tiny-text", "Game over. The unit got away from you."));
            const restart = el("button", "btn btn-danger", "Restart Week");
            restart.addEventListener("click", restartWeek);
            row.appendChild(restart);
        }
        card.appendChild(row);
        showModal(card);
    }

    async function startDay(dayNumber) {
        clearDayState();
        state.currentDay = dayNumber;
        refs.hudDay.textContent = `Day ${dayNumber}`;
        try {
            const payload = await api("/api/start-day", "POST", { day: dayNumber });
            state.dayConfig = payload.day_config;
            state.manifest = payload.manifest;
            createCharacterState(payload.lineup);
            buildPatientsFromManifest(payload.manifest);
            state.dayRunning = true;
            renderAll();
            state.frameHandle = requestAnimationFrame(updateLoop);
        } catch (error) {
            showToast(error.message);
        }
    }

    function slotSelectionSummary(slotId) {
        const selections = state.lineupDraft[slotId] || [];
        return `${selections.length}/${state.slotRules[slotId].count} selected`;
    }

    function lineupComplete() {
        return Object.entries(state.slotRules).every(([slotId, cfg]) => {
            return (state.lineupDraft[slotId] || []).length === cfg.count;
        });
    }

    function toggleLineupSelection(slotId, candidateId) {
        const slotList = state.lineupDraft[slotId];
        const idx = slotList.indexOf(candidateId);
        if (idx >= 0) {
            slotList.splice(idx, 1);
            return;
        }
        if (slotList.length >= state.slotRules[slotId].count) return;
        slotList.push(candidateId);
    }

    function renderLineupModal() {
        const card = el("div", "modal-card");
        card.appendChild(el("h3", "", "Build Your Week Lineup"));
        card.appendChild(
            el(
                "p",
                "tiny-text",
                "Select 2 med students, 1 urology intern, 1 colorectal intern, 1 urology chief, and 1 colorectal chief."
            )
        );

        const grid = el("div", "lineup-grid");
        Object.entries(state.slotRules).forEach(([slotId, config]) => {
            const slot = el("div", "lineup-slot");
            slot.appendChild(el("h4", "", `${config.label} (${slotSelectionSummary(slotId)})`));
            const candidates = state.bootstrap.character_pools[slotId];
            candidates.forEach((candidate) => {
                const c = el("div", "candidate-card");
                if ((state.lineupDraft[slotId] || []).includes(candidate.id)) c.classList.add("selected");
                c.appendChild(el("strong", "", candidate.name));
                c.appendChild(el("div", "tiny-text", candidate.flavor));
                c.appendChild(el("div", "tiny-text", `Speed ${candidate.movement_speed} • Task x${candidate.task_speed_multiplier}`));
                c.addEventListener("click", () => {
                    toggleLineupSelection(slotId, candidate.id);
                    renderLineupModal();
                });
                slot.appendChild(c);
            });
            grid.appendChild(slot);
        });
        card.appendChild(grid);

        const footer = el("div", "row-between");
        footer.appendChild(el("span", "tiny-text", "Your lineup is locked for all 5 days."));
        const startBtn = el("button", "btn btn-primary", "Begin Day 1");
        startBtn.disabled = !lineupComplete();
        startBtn.addEventListener("click", submitLineup);
        footer.appendChild(startBtn);
        card.appendChild(footer);
        showModal(card);
    }

    async function submitLineup() {
        try {
            const payload = await api("/api/start-week", "POST", { lineup: state.lineupDraft });
            state.weekState = payload.week_state;
            hideModal();
            startDay(1);
        } catch (error) {
            showToast(error.message);
        }
    }

    async function restartWeek() {
        await api("/api/new-game", "POST");
        window.location.reload();
    }

    function bindButtons() {
        refs.pauseBtn.addEventListener("click", () => {
            state.paused = !state.paused;
            refs.pauseBtn.textContent = state.paused ? "Resume" : "Pause";
            showToast(state.paused ? "Shift paused." : "Shift resumed.");
        });
        refs.restartBtn.addEventListener("click", restartWeek);
    }

    async function initialize() {
        try {
            initializeBeds();
            bindButtons();
            const boot = await api("/api/bootstrap");
            state.bootstrap = boot;
            state.diagnosesById = {};
            boot.diagnoses.forEach((diag) => {
                state.diagnosesById[diag.id] = diag;
            });

            state.slotRules = {
                med_student: { label: "Medical Students", count: 2 },
                urology_intern: { label: "Urology Intern", count: 1 },
                colorectal_intern: { label: "Colorectal Intern", count: 1 },
                urology_chief: { label: "Urology Chief", count: 1 },
                colorectal_chief: { label: "Colorectal Chief", count: 1 },
            };
            state.lineupDraft = {
                med_student: [],
                urology_intern: [],
                colorectal_intern: [],
                urology_chief: [],
                colorectal_chief: [],
            };

            renderLineupModal();
            renderAll();
        } catch (error) {
            showToast(error.message);
        }
    }

    document.addEventListener("DOMContentLoaded", initialize);
})();
