(() => {
    const refs = {
        playerSelect: document.getElementById("arcade-player-select"),
        gameSelect: document.getElementById("arcade-game-select"),
        startBtn: document.getElementById("arcade-start-btn"),
        status: document.getElementById("arcade-status"),
        hint: document.getElementById("arcade-hint"),
        canvas: document.getElementById("arcade-canvas"),
    };
    const ctx = refs.canvas.getContext("2d");

    const state = {
        characters: [],
        images: {},
        selectedId: null,
        currentGameType: "pacman",
        game: null,
        keys: new Set(),
        loopHandle: null,
        lastTs: 0,
    };

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function randomBetween(min, max) {
        return min + Math.random() * (max - min);
    }

    function distance(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function getPlayerCharacter() {
        return state.characters.find((char) => char.id === state.selectedId);
    }

    function getOtherCharacters() {
        return state.characters.filter((char) => char.id !== state.selectedId);
    }

    function drawPortraitCircle(x, y, radius, character, borderColor = "#ffffff") {
        const img = state.images[character.id];
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.clip();
        if (img) {
            ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
        } else {
            ctx.fillStyle = "#6b7fff";
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
        ctx.restore();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = borderColor;
        ctx.stroke();
    }

    function drawArcadeBackground(title) {
        const w = refs.canvas.width;
        const h = refs.canvas.height;
        ctx.fillStyle = "#06071a";
        ctx.fillRect(0, 0, w, h);

        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, "rgba(98, 0, 255, 0.2)");
        grad.addColorStop(1, "rgba(0, 217, 255, 0.17)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
        for (let x = 0; x <= w; x += 36) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 0; y <= h; y += 36) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        ctx.fillStyle = "#7ffcff";
        ctx.font = "700 20px Inter";
        ctx.fillText(title, 16, 30);
    }

    function setStatus(message) {
        refs.status.textContent = message;
    }

    function createPacmanGame(player, others) {
        const w = refs.canvas.width;
        const h = refs.canvas.height;
        const enemyPool = others.slice(0, Math.min(6, others.length));
        const makePellets = () =>
            Array.from({ length: 46 }, () => ({
                x: randomBetween(26, w - 26),
                y: randomBetween(44, h - 24),
            }));
        return {
            label: "PACMAN",
            score: 0,
            level: 1,
            levelElapsed: 0,
            levelBonusPool: 5000,
            over: false,
            player: { x: w / 2, y: h / 2, r: 18, speed: 240 },
            pellets: makePellets(),
            enemies: enemyPool.map((char) => ({
                char,
                x: randomBetween(60, w - 60),
                y: randomBetween(72, h - 34),
                r: 16,
                vx: randomBetween(-120, 120),
                vy: randomBetween(-120, 120),
            })),
            update(dt) {
                if (this.over) return;
                this.levelElapsed += dt;
                this.levelBonusPool = Math.max(80, 5000 - this.levelElapsed * 48);
                const p = this.player;
                let dx = 0;
                let dy = 0;
                if (state.keys.has("arrowleft")) dx -= 1;
                if (state.keys.has("arrowright")) dx += 1;
                if (state.keys.has("arrowup")) dy -= 1;
                if (state.keys.has("arrowdown")) dy += 1;
                const norm = Math.hypot(dx, dy) || 1;
                p.x += (dx / norm) * p.speed * dt;
                p.y += (dy / norm) * p.speed * dt;
                p.x = clamp(p.x, p.r, w - p.r);
                p.y = clamp(p.y, p.r + 32, h - p.r);

                this.pellets = this.pellets.filter((dot) => {
                    if (distance(dot, p) < p.r + 6) {
                        this.score += 10;
                        return false;
                    }
                    return true;
                });
                if (this.pellets.length === 0) {
                    this.score += Math.floor(this.levelBonusPool);
                    this.level += 1;
                    this.levelElapsed = 0;
                    this.levelBonusPool = 5000;
                    this.pellets = makePellets();
                    this.enemies.forEach((enemy) => {
                        enemy.vx *= 1.05;
                        enemy.vy *= 1.05;
                    });
                }

                this.enemies.forEach((enemy) => {
                    enemy.x += enemy.vx * dt;
                    enemy.y += enemy.vy * dt;
                    if (enemy.x < enemy.r || enemy.x > w - enemy.r) enemy.vx *= -1;
                    if (enemy.y < enemy.r + 32 || enemy.y > h - enemy.r) enemy.vy *= -1;
                    if (distance(enemy, p) < enemy.r + p.r - 2) this.over = true;
                });
            },
            draw() {
                drawArcadeBackground("PACMAN");
                ctx.fillStyle = "#ffe56e";
                this.pellets.forEach((dot) => {
                    ctx.beginPath();
                    ctx.arc(dot.x, dot.y, 4, 0, Math.PI * 2);
                    ctx.fill();
                });
                this.enemies.forEach((enemy) => drawPortraitCircle(enemy.x, enemy.y, enemy.r, enemy.char, "#ff5cb8"));
                drawPortraitCircle(this.player.x, this.player.y, this.player.r, player, "#8dff76");
                setStatus(
                    `Pacman score: ${this.score} • Level ${this.level} • Speed bonus: ${Math.floor(this.levelBonusPool)}${this.over ? "  •  Game over (caught)" : ""}`
                );
            },
        };
    }

    function createSnakeGame(player, others) {
        const tile = 36;
        const offsetX = 14;
        const offsetY = 48;
        const cols = 24;
        const rows = 12;
        const enemyPool = others.length ? others : [player];

        function keyFor(pos) {
            return `${pos.x}:${pos.y}`;
        }

        function randomFoodCell(snake) {
            const occupied = new Set(snake.map(keyFor));
            while (true) {
                const candidate = {
                    x: Math.floor(Math.random() * cols),
                    y: Math.floor(Math.random() * rows),
                };
                if (!occupied.has(keyFor(candidate))) return candidate;
            }
        }

        const game = {
            label: "SNAKE",
            score: 0,
            over: false,
            dir: { x: 1, y: 0 },
            nextDir: { x: 1, y: 0 },
            tick: 0,
            speed: 8,
            snake: [
                { x: 5, y: 6 },
                { x: 4, y: 6 },
                { x: 3, y: 6 },
            ],
            food: null,
            foodChar: enemyPool[0],
            updateDirection() {
                if (state.keys.has("arrowleft") && this.dir.x !== 1) this.nextDir = { x: -1, y: 0 };
                if (state.keys.has("arrowright") && this.dir.x !== -1) this.nextDir = { x: 1, y: 0 };
                if (state.keys.has("arrowup") && this.dir.y !== 1) this.nextDir = { x: 0, y: -1 };
                if (state.keys.has("arrowdown") && this.dir.y !== -1) this.nextDir = { x: 0, y: 1 };
            },
            step() {
                this.dir = { ...this.nextDir };
                const head = this.snake[0];
                const next = {
                    x: head.x + this.dir.x,
                    y: head.y + this.dir.y,
                };
                if (next.x < 0) next.x = cols - 1;
                else if (next.x >= cols) next.x = 0;
                if (next.y < 0) next.y = rows - 1;
                else if (next.y >= rows) next.y = 0;
                if (this.snake.some((segment) => segment.x === next.x && segment.y === next.y)) {
                    this.over = true;
                    return;
                }
                this.snake.unshift(next);
                if (this.food && next.x === this.food.x && next.y === this.food.y) {
                    this.score += 25;
                    this.food = randomFoodCell(this.snake);
                    this.foodChar = enemyPool[Math.floor(Math.random() * enemyPool.length)];
                } else {
                    this.snake.pop();
                }
            },
            update(dt) {
                if (this.over) return;
                this.updateDirection();
                this.tick += dt;
                const stepTime = 1 / this.speed;
                while (this.tick >= stepTime && !this.over) {
                    this.tick -= stepTime;
                    this.step();
                }
            },
            draw() {
                drawArcadeBackground("SNAKE");
                ctx.fillStyle = "rgba(10, 15, 40, 0.8)";
                ctx.fillRect(offsetX, offsetY, cols * tile, rows * tile);

                ctx.strokeStyle = "rgba(95, 227, 255, 0.16)";
                for (let x = 0; x <= cols; x += 1) {
                    ctx.beginPath();
                    ctx.moveTo(offsetX + x * tile, offsetY);
                    ctx.lineTo(offsetX + x * tile, offsetY + rows * tile);
                    ctx.stroke();
                }
                for (let y = 0; y <= rows; y += 1) {
                    ctx.beginPath();
                    ctx.moveTo(offsetX, offsetY + y * tile);
                    ctx.lineTo(offsetX + cols * tile, offsetY + y * tile);
                    ctx.stroke();
                }

                this.snake.forEach((segment, idx) => {
                    const cx = offsetX + segment.x * tile + tile / 2;
                    const cy = offsetY + segment.y * tile + tile / 2;
                    if (idx === 0) {
                        drawPortraitCircle(cx, cy, tile * 0.42, player, "#8eff7c");
                    } else {
                        ctx.fillStyle = idx % 2 === 0 ? "#33f1bd" : "#2fc8f2";
                        ctx.fillRect(
                            offsetX + segment.x * tile + 6,
                            offsetY + segment.y * tile + 6,
                            tile - 12,
                            tile - 12
                        );
                    }
                });

                if (this.food) {
                    const fx = offsetX + this.food.x * tile + tile / 2;
                    const fy = offsetY + this.food.y * tile + tile / 2;
                    drawPortraitCircle(fx, fy, tile * 0.34, this.foodChar, "#ffd95d");
                }

                setStatus(`Snake score: ${this.score}${this.over ? "  •  Game over (crashed)" : ""}`);
            },
        };
        game.food = randomFoodCell(game.snake);
        game.foodChar = enemyPool[Math.floor(Math.random() * enemyPool.length)];
        return game;
    }

    function createAsteroidsGame(player, others) {
        const w = refs.canvas.width;
        const h = refs.canvas.height;
        const enemyPool = others.length ? others : [player];

        function wrap(obj) {
            if (obj.x < 0) obj.x += w;
            if (obj.x > w) obj.x -= w;
            if (obj.y < 0) obj.y += h;
            if (obj.y > h) obj.y -= h;
        }

        function makeAsteroid(size, char, x = null, y = null) {
            const radius = size === 3 ? 42 : size === 2 ? 30 : 20;
            return {
                x: x ?? randomBetween(0, w),
                y: y ?? randomBetween(0, h),
                vx: randomBetween(-95, 95),
                vy: randomBetween(-95, 95),
                size,
                radius,
                char,
            };
        }

        const game = {
            label: "ASTEROIDS",
            score: 0,
            over: false,
            wave: 1,
            ship: { x: w / 2, y: h / 2, vx: 0, vy: 0, angle: -Math.PI / 2, cooldown: 0, radius: 21 },
            bullets: [],
            asteroids: [],
            spawnWave() {
                this.asteroids = [];
                const count = 5 + this.wave;
                for (let i = 0; i < count; i += 1) {
                    const char = enemyPool[i % enemyPool.length];
                    this.asteroids.push(makeAsteroid(3, char));
                }
            },
            update(dt) {
                if (this.over) return;
                const ship = this.ship;
                if (state.keys.has("arrowleft")) ship.angle -= 3.5 * dt;
                if (state.keys.has("arrowright")) ship.angle += 3.5 * dt;
                if (state.keys.has("arrowup")) {
                    ship.vx += Math.cos(ship.angle) * 280 * dt;
                    ship.vy += Math.sin(ship.angle) * 280 * dt;
                }
                ship.vx *= 0.992;
                ship.vy *= 0.992;
                ship.x += ship.vx * dt;
                ship.y += ship.vy * dt;
                wrap(ship);

                ship.cooldown = Math.max(0, ship.cooldown - dt);
                if (state.keys.has(" ") && ship.cooldown <= 0) {
                    this.bullets.push({
                        x: ship.x,
                        y: ship.y,
                        vx: Math.cos(ship.angle) * 390,
                        vy: Math.sin(ship.angle) * 390,
                        ttl: 1.2,
                    });
                    ship.cooldown = 0.2;
                }

                this.bullets.forEach((b) => {
                    b.x += b.vx * dt;
                    b.y += b.vy * dt;
                    b.ttl -= dt;
                    wrap(b);
                });
                this.bullets = this.bullets.filter((b) => b.ttl > 0);

                this.asteroids.forEach((a) => {
                    a.x += a.vx * dt;
                    a.y += a.vy * dt;
                    wrap(a);
                });

                const survivors = [];
                this.asteroids.forEach((asteroid) => {
                    let hitByBullet = false;
                    this.bullets = this.bullets.filter((bullet) => {
                        if (!hitByBullet && distance(asteroid, bullet) < asteroid.radius + 3) {
                            hitByBullet = true;
                            return false;
                        }
                        return true;
                    });
                    if (hitByBullet) {
                        this.score += asteroid.size * 30;
                        if (asteroid.size > 1) {
                            survivors.push(makeAsteroid(asteroid.size - 1, asteroid.char, asteroid.x, asteroid.y));
                            survivors.push(makeAsteroid(asteroid.size - 1, asteroid.char, asteroid.x, asteroid.y));
                        }
                    } else {
                        survivors.push(asteroid);
                    }
                });
                this.asteroids = survivors;

                if (this.asteroids.some((a) => distance(a, ship) < a.radius + ship.radius - 2)) {
                    this.over = true;
                }
                if (!this.asteroids.length) {
                    this.wave += 1;
                    this.spawnWave();
                }
            },
            draw() {
                drawArcadeBackground("ASTEROIDS");
                this.asteroids.forEach((asteroid) => {
                    drawPortraitCircle(asteroid.x, asteroid.y, asteroid.radius, asteroid.char, "#ffd0f9");
                });

                ctx.fillStyle = "#f9ff9d";
                this.bullets.forEach((b) => {
                    ctx.beginPath();
                    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
                    ctx.fill();
                });

                const ship = this.ship;
                drawPortraitCircle(ship.x, ship.y, 18, player, "#8cff7e");
                ctx.save();
                ctx.translate(ship.x, ship.y);
                ctx.rotate(ship.angle + Math.PI / 2);
                ctx.beginPath();
                ctx.moveTo(0, -22);
                ctx.lineTo(-14, 16);
                ctx.lineTo(14, 16);
                ctx.closePath();
                ctx.strokeStyle = "#8cff7e";
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.restore();

                setStatus(
                    `Asteroids score: ${this.score} • Wave ${this.wave}${this.over ? "  •  Game over (ship destroyed)" : ""}`
                );
            },
        };
        game.spawnWave();
        return game;
    }

    function createGame(gameType) {
        const player = getPlayerCharacter();
        if (!player) return null;
        const others = getOtherCharacters();
        if (gameType === "snake") return createSnakeGame(player, others);
        if (gameType === "asteroids") return createAsteroidsGame(player, others);
        return createPacmanGame(player, others);
    }

    function loop(ts) {
        if (!state.lastTs) state.lastTs = ts;
        const dt = clamp((ts - state.lastTs) / 1000, 0, 0.05);
        state.lastTs = ts;

        if (state.game) {
            state.game.update(dt);
            state.game.draw();
        } else {
            drawArcadeBackground("ARCADE BREAK");
        }
        state.loopHandle = requestAnimationFrame(loop);
    }

    function populatePlayerOptions() {
        refs.playerSelect.innerHTML = "";
        state.characters.forEach((char) => {
            const option = document.createElement("option");
            option.value = char.id;
            option.textContent = `${char.name} • ${char.role}`;
            refs.playerSelect.appendChild(option);
        });
        if (state.characters.length) {
            state.selectedId = state.characters[0].id;
            refs.playerSelect.value = state.selectedId;
        }
    }

    function preloadPortraits() {
        const promises = state.characters.map((char) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    state.images[char.id] = img;
                    resolve();
                };
                img.onerror = () => resolve();
                img.src = char.portrait_url;
            });
        });
        return Promise.all(promises);
    }

    async function loadCharacters() {
        const response = await fetch("/api/bootstrap");
        const payload = await response.json();
        const pool = payload.character_pools || {};
        state.characters = Object.values(pool).flat().filter((char) => Boolean(char.portrait_url));
        if (!state.characters.length) {
            setStatus("No portrait-backed characters available for arcade mode.");
            refs.startBtn.disabled = true;
            return;
        }
        populatePlayerOptions();
        await preloadPortraits();
        setStatus("Select a player and start a game.");
    }

    function bindControls() {
        refs.playerSelect.addEventListener("change", () => {
            state.selectedId = refs.playerSelect.value;
        });
        refs.gameSelect.addEventListener("change", () => {
            state.currentGameType = refs.gameSelect.value;
        });
        refs.startBtn.addEventListener("click", () => {
            state.selectedId = refs.playerSelect.value;
            state.currentGameType = refs.gameSelect.value;
            state.game = createGame(state.currentGameType);
            if (state.currentGameType === "pacman") refs.hint.textContent = "Use arrow keys. Eat pellets and avoid portraits.";
            if (state.currentGameType === "snake") refs.hint.textContent = "Use arrow keys. Don't hit walls or yourself.";
            if (state.currentGameType === "asteroids") refs.hint.textContent = "Arrow keys move/rotate. Space fires.";
        });
    }

    function bindInput() {
        window.addEventListener("keydown", (event) => {
            const key = event.key.toLowerCase();
            if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(key)) {
                event.preventDefault();
            }
            state.keys.add(key);
        });
        window.addEventListener("keyup", (event) => {
            state.keys.delete(event.key.toLowerCase());
        });
    }

    async function initialize() {
        bindControls();
        bindInput();
        drawArcadeBackground("ARCADE BREAK");
        await loadCharacters();
        state.loopHandle = requestAnimationFrame(loop);
    }

    initialize().catch(() => {
        setStatus("Arcade failed to load.");
    });
})();
