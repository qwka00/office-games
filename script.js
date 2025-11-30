/* ===========================================================
    OFFICE GAMES ARENA — CORE ENGINE (PART 1)
   =========================================================== */

/* ========== 1) FIREBASE CONFIGURATION ========== */
const firebaseConfig = {
  apiKey: "AIzaSyB9Xg6RDjn80Qj6H_8YePZTAut2epuCQ28",
  authDomain: "office-games-arena.firebaseapp.com",
  databaseURL: "https://office-games-arena-default-rtdb.firebaseio.com",
  projectId: "office-games-arena",
  storageBucket: "office-games-arena.appspot.com",
  messagingSenderId: "659976973202",
  appId: "1:659976973202:web:502dde78dfb48f297def4b"
};
// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();



/* ===========================================================
    2) GLOBAL STATE
   =========================================================== */
const state = {
    user: null,      // { uid, name, avatar }
    room: null,      // room code
    isHost: false,   // true/false
    players: {},     // current players in room
};


/* ===========================================================
    3) APP CONTROLLER
   =========================================================== */
const app = {

    init: () => {
        app.randomizeAvatar();
    },

    /* --------- RANDOM AVATAR --------- */
    randomizeAvatar: () => {
        const seed = Math.random().toString(36).substring(7);
        const url = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
        document.getElementById("login-avatar").src = url;
        document.getElementById("login-avatar").dataset.url = url;
    },

    /* --------- AUTHENTICATION --------- */
    auth: () => {
        const name = document.getElementById("inp-username").value.trim() || "Player" + (Math.floor(Math.random()*900)+100);
        const avatar = document.getElementById("login-avatar").dataset.url;

        auth.signInAnonymously().then(res => {
            state.user = {
                uid: res.user.uid,
                name,
                avatar
            };

            // Save/update user in DB
            db.ref(`users/${state.user.uid}`).update({
                name,
                avatar,
                lastSeen: Date.now()
            });

            db.ref(`users/${state.user.uid}/wins`).transaction(v => v || 0);

            document.getElementById("lobby-name").innerText = name;
            document.getElementById("lobby-avatar").src = avatar;

            app.switchView("view-lobby");
            app.loadLeaderboard();
        });
    },

    /* --------- SWITCH VIEW --------- */
    switchView: (id) => {
        document.querySelectorAll("section").forEach(sec => sec.classList.remove("active"));
        setTimeout(() => {
            document.querySelectorAll("section").forEach(sec => sec.classList.add("hidden"));
            document.getElementById(id).classList.remove("hidden");
            setTimeout(() => {
                document.getElementById(id).classList.add("active");
            }, 20);
        }, 150);
    },

    /* ===========================================================
        4) LOBBY
       =========================================================== */
    loadLeaderboard: () => {
        db.ref("users").orderByChild("wins").limitToLast(20).on("value", snap => {
            const list = document.getElementById("leaderboard-list");
            list.innerHTML = "";

            let arr = [];
            snap.forEach(c => arr.push(c.val()));
            arr.reverse();

            arr.forEach(u => {
                list.innerHTML += `
                    <li>
                        <img src="${u.avatar}" class="mini-avatar">
                        <span>${u.name}</span>
                        <span style="margin-left:auto">${u.wins || 0} Wins</span>
                    </li>`;
            });
        });
    },


    /* ===========================================================
        5) CREATE ROOM
       =========================================================== */
    createRoom: () => {
        const code = Math.random().toString(36).substring(2,7).toUpperCase();

        db.ref(`rooms/${code}`).set({
            host: state.user.uid,
            status: "waiting",
            gameType: null,
            gameState: null,
            players: {
                [state.user.uid]: {
                    name: state.user.name,
                    avatar: state.user.avatar,
                    score: 0
                }
            }
        }).then(() => {
            app.enterRoom(code, true);
        });
    },


    /* ===========================================================
        6) JOIN ROOM
       =========================================================== */
    joinRoom: () => {
        const code = document.getElementById("inp-room-code").value.trim().toUpperCase();
        if(!code) return alert("Enter room code!");

        db.ref(`rooms/${code}`).once("value", s => {
            if(!s.exists()) return alert("Room not found");
            if(s.val().status === "playing") return alert("Game already in progress");

            db.ref(`rooms/${code}/players/${state.user.uid}`).set({
                name: state.user.name,
                avatar: state.user.avatar,
                score: 0
            }).then(() => {
                app.enterRoom(code, false);
            });
        });
    },


    /* ===========================================================
        7) ENTER ROOM
       =========================================================== */
    enterRoom: (code, isHost) => {
        state.room = code;
        state.isHost = isHost;

        document.getElementById("room-display-code").innerText = "CODE: " + code;
        app.switchView("view-room");

        const rRef = db.ref(`rooms/${code}`);

        /* --- Listen to players list --- */
        rRef.child("players").on("value", snap => {
            const list = document.getElementById("room-players");
            list.innerHTML = "";

            state.players = snap.val() || {};

            Object.entries(state.players).forEach(([uid, p]) => {
                list.innerHTML += `
                    <li>
                        <img src="${p.avatar}" class="mini-avatar"> 
                        ${p.name} 
                    </li>`;
            });

            if(!state.players[state.user.uid]) {
                app.leaveRoom();
            }
        });

        /* --- Listen to chat --- */
        rRef.child("chat").limitToLast(20).on("child_added", snap => {
            const m = snap.val();
            const box = document.getElementById("chat-box");
            box.innerHTML += `
                <div class="chat-msg">
                    <span class="chat-name">${m.name}:</span> ${m.text}
                </div>`;
            box.scrollTop = box.scrollHeight;
        });

        /* --- Room State Listener (Game switching) --- */
        rRef.on("value", snap => {
            const data = snap.val();
            if(!data) return;

            const selector = document.getElementById("game-selector");
            const stage = document.getElementById("game-stage");
            const hostControls = document.getElementById("host-controls");

            if(data.status === "waiting") {
                stage.classList.add("hidden");
                if(state.isHost) selector.classList.remove("hidden");
                else selector.classList.add("hidden");

            } else if(data.status === "playing") {
                selector.classList.add("hidden");
                stage.classList.remove("hidden");

                document.getElementById("game-title").innerText = data.gameType.toUpperCase();

                if(state.isHost) hostControls.classList.remove("hidden");
                else hostControls.classList.add("hidden");

                /* --- Call the correct game renderer --- */
                game.render(data.gameType, data.gameState);
            }
        });
    },


    /* ===========================================================
        8) LEAVE ROOM
       =========================================================== */
    leaveRoom: () => {
        if(!state.room) return;

        db.ref(`rooms/${state.room}/players/${state.user.uid}`).remove();
        db.ref(`rooms/${state.room}`).off();

        state.room = null;
        state.isHost = false;

        app.switchView("view-lobby");
    },


    /* ===========================================================
        9) SEND CHAT MESSAGE
       =========================================================== */
    sendChat: () => {
        const txt = document.getElementById("inp-chat").value.trim();
        if(!txt || !state.room) return;

        db.ref(`rooms/${state.room}/chat`).push({
            name: state.user.name,
            text: txt,
            time: Date.now()
        });

        document.getElementById("inp-chat").value = "";
    }
};


/* ===========================================================
    10) GAME CONTROLLER ROUTER
   =========================================================== */
const game = {

    start: (type) => {
        if(!state.isHost) return;

        const init = game.getInitialState(type);

        db.ref(`rooms/${state.room}`).update({
            status: "playing",
            gameType: type,
            gameState: init
        });
    },

    reset: () => {
        db.ref(`rooms/${state.room}`).update({
            status: "waiting",
            gameState: null
        });
    },

    updateState: (data) => {
        db.ref(`rooms/${state.room}/gameState`).update(data);
    },

    announceWinner: (uid) => {
        if(uid && state.players[uid]) {
            db.ref(`users/${uid}/wins`).transaction(w => (w || 0) + 1);
            db.ref(`rooms/${state.room}/players/${uid}/score`).transaction(s => (s || 0) + 1);
        }
    },

    /* ===========================================================
        INITIAL STATE FACTORY (for each game)
       =========================================================== */
    getInitialState: (type) => {
        const uids = Object.keys(state.players);

        switch(type) {
            case "tictactoe": 
                return { board: Array(9).fill(null), turn: uids[0], winner: null };
            
            case "snake": 
                return {
                    p1: uids[0],
                    p2: uids[1] || null,
                    snake1: [5,5],
                    snake2: [15,15],
                    dir1: "R",
                    dir2: "L",
                    food: Math.floor(Math.random()*400),
                    active: true
                };

            case "rps":
                return { phase: "pick", choices: {}, result: null };

            case "speed":
                return { active: false, start: 0, winner: null };

            case "word":
                const words = ["APPLE","BANANA","ORANGE","CODE","PYTHON","MOUSE","PHONE"];
                return { word: words[Math.floor(Math.random()*words.length)], winner: null };

            case "memory":
                const icons = ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼"];
                const deck = [...icons, ...icons]
                                .sort(() => Math.random()-0.5)
                                .map((v,i)=>({id:i,val:v,flipped:false,solved:false}));
                return { cards: deck, turn: uids[0] };

            case "draw":
                return { drawer: uids[0], word:"TREE", strokes: [] };

            case "math":
                const a = Math.floor(Math.random()*20);
                const b = Math.floor(Math.random()*20);
                return { q:`${a}+${b}`, ans:a+b, winner:null };

            case "uno":
                const colors = ["R","G","B","Y"];
                const deckU = [];
                colors.forEach(c => { for(let i=0;i<10;i++) deckU.push({c,v:i}); });
                const hands = {};
                uids.forEach(u => hands[u] = deckU.splice(0,5));
                return { deck: deckU, hands, top:{c:"R",v:0}, turn:uids[0] };

            case "tap":
                return { x:50, y:50, scores:{}, end: Date.now() + 30000 };

            default:
                return {};
        }
    },

    /* ===========================================================
        MAIN RENDER ROUTER
       =========================================================== */
    render: (type, st) => {
        const area = document.getElementById("game-canvas");
        area.innerHTML = "";

        const renders = {
            "tictactoe": game.r_ttt,
            "snake": game.r_snake,
            "rps": game.r_rps,
            "speed": game.r_speed,
            "word": game.r_word,
            "memory": game.r_memory,
            "draw": game.r_draw,
            "math": game.r_math,
            "uno": game.r_uno,
            "tap": game.r_tap
        };

        if(renders[type]) {
            renders[type](st, area);
        }
    }
};


/* ===========================================================
    START APP
   =========================================================== */
app.init();

/* ===========================================================
    GAME RENDERERS — PART 2
    (Tic Tac Toe + RPS + Speed Click)
   =========================================================== */


/* ===========================================================
    1) TIC TAC TOE
   =========================================================== */
game.r_ttt = (st, el) => {
    const boardDiv = document.createElement("div");
    boardDiv.className = "ttt-board";

    st.board.forEach((cell, i) => {
        const d = document.createElement("div");
        d.className = "ttt-cell";
        d.innerText = cell || "";

        d.onclick = () => {
            if (st.winner) return;
            if (st.turn !== state.user.uid) return;
            if (cell !== null) return;

            const meIndex = Object.keys(state.players).indexOf(state.user.uid);
            const symbol = meIndex === 0 ? "X" : "O";

            const newBoard = [...st.board];
            newBoard[i] = symbol;

            const winPatterns = [
                [0,1,2],[3,4,5],[6,7,8],
                [0,3,6],[1,4,7],[2,5,8],
                [0,4,8],[2,4,6]
            ];

            let winner = null;
            winPatterns.forEach(p => {
                if (newBoard[p[0]] &&
                    newBoard[p[0]] === newBoard[p[1]] &&
                    newBoard[p[1]] === newBoard[p[2]]) {
                    winner = state.user.uid;
                }
            });

            let nextTurn = Object.keys(state.players).find(uid => uid !== state.user.uid);

            game.updateState({
                board: newBoard,
                turn: nextTurn,
                winner
            });

            if (winner) game.announceWinner(winner);
        };

        boardDiv.appendChild(d);
    });

    el.appendChild(boardDiv);

    if (st.winner) {
        const w = st.winner === state.user.uid ? "YOU WON!" : `${state.players[st.winner].name} WON`;
        el.innerHTML += `<h2 style="margin-top:15px">${w}</h2>`;
    }
};


/* ===========================================================
    2) ROCK – PAPER – SCISSORS
   =========================================================== */
game.r_rps = (st, el) => {
    if (st.phase === "pick") {

        if (st.choices && st.choices[state.user.uid]) {
            el.innerHTML = `<h3>Waiting for other players...</h3>`;
        } else {
            const choicesDiv = document.createElement("div");
            choicesDiv.className = "rps-btns";

            ["🗿","📄","✂️"].forEach(opt => {
                const b = document.createElement("button");
                b.innerText = opt;
                b.className = "btn game-btn";
                b.onclick = () => {

                    const updatedChoices = st.choices || {};
                    updatedChoices[state.user.uid] = opt;

                    const totalPlayers = Object.keys(state.players).length;
                    const picked = Object.keys(updatedChoices).length;

                    const newPhase = picked === totalPlayers ? "result" : "pick";

                    game.updateState({
                        choices: updatedChoices,
                        phase: newPhase
                    });
                };
                choicesDiv.appendChild(b);
            });

            el.appendChild(choicesDiv);
        }

    } else {

        el.innerHTML = `<h2>Results</h2>`;
        Object.entries(st.choices).forEach(([uid, pick]) => {
            el.innerHTML += `
                <p><b>${state.players[uid].name}:</b> ${pick}</p>
            `;
        });

        el.innerHTML += `<p style="margin-top:10px">No winner logic computed for this demo version.</p>`;
    }
};


/* ===========================================================
    3) SPEED CLICK — Reaction Time
   =========================================================== */
game.r_speed = (st, el) => {

    if (st.winner) {
        const w = state.players[st.winner].name;
        el.innerHTML = `<h1>${w} Won!</h1>`;
        return;
    }

    if (!st.active) {
        el.innerHTML = `<h3>Wait for it...</h3>`;

        if (state.isHost && !st.start) {
            const delay = Math.random() * 3000 + 1000;
            setTimeout(() => {
                game.updateState({
                    active: true,
                    start: Date.now()
                });
            }, delay);

            game.updateState({ start: 1 });
        }

    } else {
        const btn = document.createElement("button");
        btn.className = "speed-btn";
        btn.innerText = "CLICK!";
        btn.onclick = () => {
            const reaction = Date.now() - st.start;
            alert(`Your reaction: ${reaction}ms`);

            game.updateState({
                winner: state.user.uid
            });

            game.announceWinner(state.user.uid);
        };
        el.appendChild(btn);
    }
};

/* ===========================================================
    4) SNAKE BATTLE — MULTIPLAYER
   =========================================================== */

game.r_snake = (st, el) => {

    /* ========== CANVAS SETUP ========== */
    const canvas = document.createElement("canvas");
    canvas.id = "snake-canvas";
    canvas.width = 400;
    canvas.height = 400;
    el.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    const SIZE = 20;     // 20x20 grid → 400px canvas

    /* ========== DRAW FOOD ========== */
    const foodX = st.food % 20;
    const foodY = Math.floor(st.food / 20);
    ctx.fillStyle = "#ff3333";
    ctx.fillRect(foodX * SIZE, foodY * SIZE, SIZE, SIZE);

    /* ========== DRAW SNAKE 1 ========== */
    ctx.fillStyle = "#00ff7f";
    st.snake1.forEach(p => {
        const x = p % 20;
        const y = Math.floor(p / 20);
        ctx.fillRect(x * SIZE, y * SIZE, SIZE, SIZE);
    });

    /* ========== DRAW SNAKE 2 ========== */
    if (st.p2 && st.snake2) {
        ctx.fillStyle = "#00d9ff";
        st.snake2.forEach(p => {
            const x = p % 20;
            const y = Math.floor(p / 20);
            ctx.fillRect(x * SIZE, y * SIZE, SIZE, SIZE);
        });
    }

    /* ===========================================================
        HOST: MAIN GAME LOOP
       =========================================================== */
    if (state.isHost && st.active) {

        if (!window._snakeInterval) {

            window._snakeInterval = setInterval(() => {

                const move = (snake, dir) => {
                    const head = snake[0];
                    let x = head % 20;
                    let y = Math.floor(head / 20);

                    if (dir === "U") y--;
                    if (dir === "D") y++;
                    if (dir === "L") x--;
                    if (dir === "R") x++;

                    // Wall collision
                    if (x < 0 || x > 19 || y < 0 || y > 19) return null;

                    return y * 20 + x;
                };

                /* -------- MOVE SNAKE 1 -------- */
                let new1 = move(st.snake1, st.dir1);
                if (new1 === null || st.snake1.includes(new1)) {
                    game.updateState({ active: false, winner: st.p2 });
                    clearInterval(window._snakeInterval);
                    window._snakeInterval = null;
                    return;
                }

                st.snake1.unshift(new1);

                if (new1 === st.food) {
                    st.food = Math.floor(Math.random() * 400);
                } else {
                    st.snake1.pop();
                }

                /* -------- MOVE SNAKE 2 -------- */
                if (st.p2) {
                    let new2 = move(st.snake2, st.dir2);
                    if (new2 === null || st.snake2.includes(new2)) {
                        game.updateState({ active: false, winner: st.p1 });
                        clearInterval(window._snakeInterval);
                        window._snakeInterval = null;
                        return;
                    }

                    st.snake2.unshift(new2);
                    if (new2 !== st.food) st.snake2.pop();
                }

                /* -------- SAVE TO FIREBASE -------- */
                game.updateState({
                    snake1: st.snake1,
                    snake2: st.snake2,
                    food: st.food
                });

            }, 300);
        }
    }

    /* ===========================================================
        WINNER MESSAGE
       =========================================================== */
    if (!st.active && st.winner) {
        const w = st.winner;
        const name = state.players[w]?.name || "Player";
        el.innerHTML = `<h2>${name} Wins the Snake Battle!</h2>`;
        game.announceWinner(w);
        return;
    }

    /* ===========================================================
        CONTROLS (Player 1 = ARROWS, Player 2 = WASD)
       =========================================================== */
    window.onkeydown = (e) => {

        /* ----- PLAYER 1 CONTROLS ----- */
        if (state.user.uid === st.p1) {
            if (e.key === "ArrowUp") game.updateState({ dir1: "U" });
            if (e.key === "ArrowDown") game.updateState({ dir1: "D" });
            if (e.key === "ArrowLeft") game.updateState({ dir1: "L" });
            if (e.key === "ArrowRight") game.updateState({ dir1: "R" });
        }

        /* ----- PLAYER 2 CONTROLS ----- */
        if (state.user.uid === st.p2) {
            if (e.key === "w" || e.key === "W") game.updateState({ dir2: "U" });
            if (e.key === "s" || e.key === "S") game.updateState({ dir2: "D" });
            if (e.key === "a" || e.key === "A") game.updateState({ dir2: "L" });
            if (e.key === "d" || e.key === "D") game.updateState({ dir2: "R" });
        }
    };
};

/* ===========================================================
    5) WORD GUESS GAME — CHAT BASED
   =========================================================== */

game.r_word = (st, el) => {

    /* If someone already won */
    if (st.winner) {
        const name = state.players[st.winner].name;
        el.innerHTML = `
            <h1>${name} guessed the word!</h1>
            <h3>The word was: ${st.word}</h3>
        `;
        return;
    }

    /* Masked word for players */
    let masked = "";
    if (state.isHost) {
        masked = st.word.split("").join(" "); // Host sees full word
        el.innerHTML = `<h3>WORD: ${masked}</h3>`;
    } else {
        masked = st.word.split("").map(c => "_").join(" ");
        el.innerHTML = `<h3>${masked}</h3><p>Guess using chat!</p>`;
    }

    /* Host listens for guesses */
    if (state.isHost) {
        const chatRef = db.ref(`rooms/${state.room}/chat`);

        if (!window._wordGuessAttached) {
            window._wordGuessAttached = true;

            chatRef.limitToLast(1).on("child_added", s => {
                const msg = s.val();
                const guess = msg.text.trim().toUpperCase();

                if (guess === st.word && !st.winner) {
                    const winnerUID = Object.keys(state.players)
                        .find(uid => state.players[uid].name === msg.name);

                    if (winnerUID) {
                        game.updateState({ winner: winnerUID });
                        game.announceWinner(winnerUID);
                    }
                }
            });
        }
    }
};



/* ===========================================================
    6) MEMORY MATCH GAME
   =========================================================== */

game.r_memory = (st, el) => {

    // --- WIN CONDITION CHECK ---
    const solvedCount = st.cards.filter(c => c.solved).length;
    if (solvedCount === st.cards.length) {
        el.innerHTML = `<h1>All pairs solved!</h1>`;
        return;
    }

    // Title
    el.innerHTML = `<h3>Turn: ${state.players[st.turn].name}</h3>`;

    const grid = document.createElement("div");
    grid.className = "memory-grid";

    st.cards.forEach((card, i) => {
        const div = document.createElement("div");
        div.className = "mem-card";

        if (card.solved) div.classList.add("solved");
        if (card.flipped) div.classList.add("flipped");

        div.innerText = card.flipped || card.solved ? card.val : "?";

        div.onclick = () => {
            if (card.solved) return;
            if (card.flipped) return;
            if (st.turn !== state.user.uid) return;

            // Flip card
            st.cards[i].flipped = true;

            const flipped = st.cards.filter(c => c.flipped && !c.solved);

            if (flipped.length === 2) {
                const [a, b] = flipped;

                if (a.val === b.val) {
                    a.solved = true;
                    b.solved = true;
                    game.announceWinner(state.user.uid);
                } else {
                    setTimeout(() => {
                        st.cards.forEach(c => {
                            if (!c.solved) c.flipped = false;
                        });

                        const players = Object.keys(state.players);
                        const idx = players.indexOf(st.turn);
                        const next = players[(idx + 1) % players.length];

                        game.updateState({ cards: st.cards, turn: next });

                    }, 800);
                }
            }

            game.updateState({ cards: st.cards });
        };

        grid.appendChild(div);
    });

    el.appendChild(grid);
};



/* ===========================================================
    7) DRAWING & GUESSING GAME
   =========================================================== */

game.r_draw = (st, el) => {

    /* If round ended */
    if (st.winner) {
        const name = state.players[st.winner].name;
        el.innerHTML = `
            <h1>${name} guessed it!</h1>
            <h3>Word was: ${st.word}</h3>
        `;
        return;
    }

    /* Drawer info */
    el.innerHTML = `
        <h3>${state.user.uid === st.drawer ? "YOU ARE DRAWING" : "Guess the drawing!"}</h3>
    `;

    /* Canvas */
    const canvas = document.createElement("canvas");
    canvas.id = "draw-canvas";
    canvas.width = 350;
    canvas.height = 350;
    el.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    ctx.lineWidth = 4;
    ctx.lineCap = "round";

    /* Render all strokes */
    (st.strokes || []).forEach(stroke => {
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        stroke.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();
    });

    /* If I am the drawer — enable drawing */
    if (state.user.uid === st.drawer) {

        let drawing = false;
        let currentStroke = [];

        canvas.onmousedown = (e) => {
            drawing = true;
            currentStroke = [{ x: e.offsetX, y: e.offsetY }];
        };

        canvas.onmousemove = (e) => {
            if (!drawing) return;
            currentStroke.push({ x: e.offsetX, y: e.offsetY });

            ctx.lineTo(e.offsetX, e.offsetY);
            ctx.stroke();
        };

        canvas.onmouseup = () => {
            drawing = false;

            const newStrokes = st.strokes || [];
            newStrokes.push(currentStroke);

            game.updateState({ strokes: newStrokes });
        };
    }

    /* Host listens for guesses */
    if (state.isHost) {
        const chatRef = db.ref(`rooms/${state.room}/chat`);

        if (!window._drawGuessAttached) {
            window._drawGuessAttached = true;

            chatRef.limitToLast(1).on("child_added", s => {
                const msg = s.val();
                const guess = msg.text.trim().toUpperCase();

                if (guess === st.word && !st.winner) {
                    const winnerUID = Object.keys(state.players)
                        .find(uid => state.players[uid].name === msg.name);

                    game.updateState({ winner: winnerUID });
                    game.announceWinner(winnerUID);
                }
            });
        }
    }
};

/* ===========================================================
    8) MATH DUEL — Fastest Answer Wins
   =========================================================== */

game.r_math = (st, el) => {

    // Winner display
    if (st.winner) {
        const name = state.players[st.winner].name;
        el.innerHTML = `
            <h1>${name} won!</h1>
            <h3>Correct Answer: ${st.ans}</h3>
        `;
        return;
    }

    // Question
    el.innerHTML = `
        <h2>Solve:</h2>
        <div class="math-q">${st.q}</div>
    `;

    // Input box
    const inp = document.createElement("input");
    inp.type = "number";
    inp.className = "math-input";
    el.appendChild(inp);

    inp.oninput = () => {
        if (parseInt(inp.value) === st.ans && !st.winner) {
            game.updateState({ winner: state.user.uid });
            game.announceWinner(state.user.uid);
        }
    };
};



/* ===========================================================
    9) UNO MINI — Simplified UNO Game
   =========================================================== */

game.u_color = (c) => {
    return c === "R" ? "red" :
           c === "G" ? "green" :
           c === "B" ? "blue" :
           c === "Y" ? "orange" : "gray";
};

game.r_uno = (st, el) => {

    // Winner
    if (st.winner) {
        const name = state.players[st.winner].name;
        el.innerHTML = `<h1>${name} wins UNO!</h1>`;
        return;
    }

    const me = state.user.uid;
    const myHand = (st.hands || {})[me] || [];

    /* Top card */
    el.innerHTML = `
        <h3>Turn: ${state.players[st.turn].name}</h3>
        <div class="uno-top-card" style="background:${game.u_color(st.top.c)}">
            ${st.top.v}
        </div>
        <h4>Your Cards:</h4>
    `;

    /* Hand */
    const hand = document.createElement("div");
    hand.className = "uno-hand";

    myHand.forEach((card, i) => {
        const div = document.createElement("div");
        div.className = "uno-card";
        div.style.background = game.u_color(card.c);
        div.innerText = card.v;

        div.onclick = () => {
            if (st.turn !== me) return;

            if (card.c === st.top.c || card.v === st.top.v) {

                // Play the card
                myHand.splice(i, 1);

                const players = Object.keys(state.players);
                const idx = players.indexOf(st.turn);
                const nextTurn = players[(idx + 1) % players.length];

                st.hands[me] = myHand;

                game.updateState({
                    top: card,
                    hands: st.hands,
                    turn: nextTurn
                });

                if (myHand.length === 0) {
                    game.updateState({ winner: me });
                    game.announceWinner(me);
                }
            }
        };

        hand.appendChild(div);
    });

    el.appendChild(hand);

    /* Draw button */
    const drawBtn = document.createElement("button");
    drawBtn.className = "btn game-btn";
    drawBtn.innerText = "Draw Card";

    drawBtn.onclick = () => {
        if (st.turn !== me) return;

        const colors = ["R","G","B","Y"];
        const newCard = {
            c: colors[Math.floor(Math.random()*4)],
            v: Math.floor(Math.random()*10)
        };

        st.hands[me].push(newCard);

        game.updateState({ hands: st.hands });
    };

    el.appendChild(drawBtn);
};



/* ===========================================================
    10) TAP TARGET — Reaction Speed Game
   =========================================================== */

game.r_tap = (st, el) => {

    // End of the round
    if (Date.now() > st.end) {
        const scores = st.scores || {};
        let winner = Object.keys(scores)[0];

        Object.keys(scores).forEach(uid => {
            if (scores[uid] > scores[winner]) winner = uid;
        });

        const name = state.players[winner].name;

        el.innerHTML = `<h1>${name} wins!</h1>`;
        game.announceWinner(winner);
        return;
    }

    // My score
    el.innerHTML = `
        <h3>Your Score: ${st.scores?.[state.user.uid] || 0}</h3>
    `;

    // Target
    const target = document.createElement("div");
    target.className = "tap-target";
    target.style.left = st.x + "%";
    target.style.top = st.y + "%";

    target.onclick = () => {
        const newScore = (st.scores?.[state.user.uid] || 0) + 1;

        game.updateState({
            x: Math.random() * 90,
            y: Math.random() * 90,
            scores: {
                ...(st.scores || {}),
                [state.user.uid]: newScore
            }
        });
    };

    el.appendChild(target);
};
