// ===============================
//   VARIABLES GLOBALES
// ===============================

// Initialisation Supabase
const supabase = supabase.createClient(
  "https://gjzqghhqpycbcwykxvgw.supabase.co",
  SUPABASE_ANON_KEY
);

// Fonctions Auth
async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

function updateAuthUI() {
  getCurrentUser().then(user => {
    const btn = document.getElementById("authBtn");
    if (!btn) return;
    btn.textContent = user ? "Se déconnecter" : "Se connecter";
  });
}

supabase.auth.onAuthStateChange(() => {
  updateAuthUI();
});

// Listeners Auth
document.getElementById("authBtn").addEventListener("click", async () => {
  const user = await getCurrentUser();

  if (user) {
    await supabase.auth.signOut();
    updateAuthUI();
    return;
  }

  document.getElementById("authOverlay").style.display = "flex";
});

document.getElementById("closeAuthBtn").addEventListener("click", () => {
  document.getElementById("authOverlay").style.display = "none";
});

document.getElementById("signupBtn").addEventListener("click", async () => {
  const email = document.getElementById("authEmail").value;
  const password = document.getElementById("authPassword").value;

  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    alert("Erreur : " + error.message);
    return;
  }

  alert("Compte créé ! Vérifie ton email.");
});

document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("authEmail").value;
  const password = document.getElementById("authPassword").value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    alert("Erreur : " + error.message);
    return;
  }

  document.getElementById("authOverlay").style.display = "none";
  updateAuthUI();
});

// ===============================
//   VARIABLES DE JEU
// ===============================

let historyStack = [];
let soundEnabled = true;
let audioUnlocked = false;

const size = 34;
let offset;
let spacing;

let selectedStart = null;
let score = 0;
let paused = false;
let gameOver = false;

let canvas = null;
let ctx = null;
let tutorialBtn = null;

let activePoints = new Set();
let permanentPoints = new Set();
let usedEdges = new Set();
let validatedSegments = [];

let jokersAvailable = 0;
let jokersTotal = 0;

let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;

let undoCount = 0;

let currentTutorialStep = 0;
let tutorialRunning = false;

const SECRET_SALT = atob("eDlGITEyQGE=");

async function computeScoreHash(playerId, score, duration, undoCount, jokersUsed) {
  const raw = playerId + score + duration + undoCount + jokersUsed + SECRET_SALT;
  return await sha256(raw);
}

async function sendScoreToSupabase(userId, pseudo, score, duration, undoCount, jokersUsed){
  const hash = await computeScoreHash(playerId, score, duration, undoCount, jokersUsed);

  const payload = {
    player_id: playerId,
    pseudo: pseudo,
    score: score,
    duration_ms: duration,
    undo_count: undoCount,
    jokers_used: jokersUsed,
    hash: hash
  };

  const response = await fetch("https://gjzqghhqpycbcwykxvgw.supabase.co/rest/v1/scores", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify(payload)
  });

  return response.ok;
}

async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

function updateAuthUI() {
  getCurrentUser().then(user => {
    const btn = document.getElementById("authBtn");
    if (!btn) return;

    btn.textContent = user ? "Se déconnecter" : "Se connecter";
  });
}

supabase.auth.onAuthStateChange(() => {
  updateAuthUI();
});

const tutorialSteps = [
  { message: "Exemple 1 : une ligne horizontale.", start: { x: 15, y: 12 }, end: { x: 19, y: 12 } },
  { message: "Exemple 2 : une ligne verticale.",   start: { x: 15, y: 12 }, end: { x: 15, y: 16 } },
  { message: "Exemple 3 : une ligne diagonale.",   start: { x: 12, y: 16 }, end: { x: 16, y: 12 } }
];

// ===============================
//   MEILLEUR SCORE
// ===============================


async function fetchLeaderboard() {
  const response = await fetch(
    "https://gjzqghhqpycbcwykxvgw.supabase.co/rest/v1/scores?select=pseudo,score,duration_ms,undo_count,jokers_used&order=score.desc,duration_ms.asc,undo_count.asc,jokers_used.asc&limit=100",
    {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  );

  return await response.json();
}

async function fetchPlayerScores(playerId) {
  const response = await fetch(
    `https://gjzqghhqpycbcwykxvgw.supabase.co/rest/v1/scores?player_id=eq.${playerId}&select=*`,
    {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  );

  return await response.json();
}

function renderLeaderboard(list) {
  const container = document.getElementById("leaderboardContainer");
  if (!container) return; // sécurité au cas où

  container.innerHTML = "";

  list.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "leaderboard-row";
    row.innerHTML = `
      <span class="rank">${index + 1}</span>
      <span class="pseudo">${entry.pseudo}</span>
      <span class="score">${entry.score}</span>
      <span class="duration">${(entry.duration_ms / 1000).toFixed(1)}s</span>
      <span class="undo">${entry.undo_count}</span>
      <span class="jokers">${entry.jokers_used}</span>
    `;
    container.appendChild(row);
  });
}

fetchLeaderboard().then(renderLeaderboard);

function getPlayerId() {
  let id = localStorage.getItem("player_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("player_id", id);
  }
  return id;
}

function getPlayerPseudo() {
  let pseudo = localStorage.getItem("playerPseudo");
  if (!pseudo) {
    pseudo = "Joueur";
    localStorage.setItem("playerPseudo", pseudo);
  }
  return pseudo;
}

function saveBestScore(data) {
  try {
    localStorage.setItem("bestScoreData", JSON.stringify(data));
  } catch(e) {
    console.error("Erreur sauvegarde meilleur score :", e);
  }
}

function loadBestScore() {
  try {
    const raw = localStorage.getItem("bestScoreData");
    return raw ? JSON.parse(raw) : null;
  } catch(e) {
    console.error("Erreur chargement meilleur score :", e);
    return null;
  }
}

function updateBestScoreTop() {
  const el = document.getElementById("bestScoreTop");
  if (!el) return;

  const best = loadBestScore();
  if (!best || isNaN(Number(best.score))) {
    el.textContent = "";
    return;
  }

  const score = Number(best.score);
  const minutes = Math.floor(best.duration / 60);
  const seconds = best.duration % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  el.innerHTML =
    `<span class="emoji">🏆</span> ${score} lignes ` +
    `<span class="emoji">↩️</span>${best.returnsUsed} ` +
    `<span class="emoji">🃏</span>${best.jokersUsed} ` +
    `<span class="emoji">⏱️</span>${timeStr}`;
}

function showBestScorePanel() {
  const panel = document.getElementById("bestScoreContent");
  if (!panel) return;

  const best = loadBestScore();
  if (!best) {
    panel.innerHTML = "<p>Aucun record enregistré pour le moment.</p>";
  } else {
    const score = Number(best.score);
    const minutes = Math.floor(best.duration / 60);
    const seconds = best.duration % 60;
    const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

    panel.innerHTML = `
  <div class="record-line">
    🏆 ${score} lignes — ${best.returnsUsed} retour${best.returnsUsed > 1 ? "s" : ""} — ${best.jokersUsed} joker${best.jokersUsed > 1 ? "s" : ""} — ${timeStr}
  </div>
`;

  }

  document.getElementById("bestScoreOverlay").classList.remove("hidden");
}


document.getElementById("closeBestScore").addEventListener("click", () => {
  document.getElementById("bestScoreOverlay").classList.add("hidden");
});

function updateSoundButton() {
  const btn = document.getElementById("soundBtn");
  btn.textContent = soundEnabled ? "Son : on" : "Son : off";
}

// ===============================
//   SAUVEGARDE PARTIE EN COURS
// ===============================

function saveGameState() {
  if (tutorialRunning) return; // jamais pendant le tutoriel

  const data = {
    activePoints: Array.from(activePoints),
    permanentPoints: Array.from(permanentPoints),
    usedEdges: Array.from(usedEdges),
    validatedSegments, // tableau simple → OK
    historyStack: JSON.parse(JSON.stringify(validatedSegments)),
    //historyStack: JSON.parse(JSON.stringify(historyStack)),
    score,
    jokersAvailable,
    jokersTotal,
    undoCount,
    timerSeconds,
    gameOver,
    soundEnabled,
    paused
    
  };
  
  try {
    localStorage.setItem("currentGameState", JSON.stringify(data));
  } catch (e) {
    console.error("Erreur sauvegarde partie :", e);
  }
}

function loadGameState() {
  try {
    const raw = localStorage.getItem("currentGameState");
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error("Erreur chargement partie :", e);
    return null;
  }
}

function restoreGameState() {

  const data = loadGameState();
  if (!data) return false;
  
  // Vérification stricte
  if (!Array.isArray(data.activePoints) ||
      !Array.isArray(data.permanentPoints) ||
      !Array.isArray(data.validatedSegments) ||
      data.activePoints.length === 0 ||
      data.permanentPoints.length === 0) {
    return false;
  }

  // Restaurer les Sets
  activePoints = new Set(data.activePoints);
  permanentPoints = new Set(data.permanentPoints);
  usedEdges = new Set(data.usedEdges || []);

  // Restaurer les tableaux simples
  validatedSegments = [...data.validatedSegments];

  // Restaurer les variables simples
  score = data.score ?? 0;
  jokersAvailable = data.jokersAvailable ?? 0;
  jokersTotal = data.jokersTotal ?? 0;
  undoCount = data.undoCount ?? 0;
  timerSeconds = data.timerSeconds ?? 0;

  gameOver = data.gameOver ?? false;
  paused = data.paused ?? false;

  // Restaurer l'historique interne
  historyStack = data.historyStack ? [...data.historyStack] : [];

  // Restaurer l'historique visuel
  const historyList = document.getElementById("historyList");
  historyList.innerHTML = "";
  historyStack.forEach(entry => {
    appendHistoryEntry(entry.points, entry.activeCount);
  });

  // Restaurer l'état du son
  soundEnabled = data.soundEnabled ?? true;
  updateSoundButton();
  
  return true;
}

// Sauvegarde automatique à chaque coup
function autoSave() {
  saveGameState();
}

// Sauvegarde à la fermeture
window.addEventListener("beforeunload", saveGameState);


// ===============================
//   FONCTIONS AUDIO
// ===============================

function playClickSound() { if (!soundEnabled) return; const a=document.getElementById("clickSound"); a.currentTime=0; a.play(); }
function playErrorSound() { if (!soundEnabled) return; const a=document.getElementById("errorSound"); a.currentTime=0; a.play(); }
function playSuccessSound() { if (!soundEnabled) return; const a=document.getElementById("successSound"); a.currentTime=0; a.play(); }
function playTutorialSound() { if (!soundEnabled) return; const a=document.getElementById("tutorialSound"); a.currentTime=0; a.play(); }
function playJokerGainSound() { if (!soundEnabled) return; const a=document.getElementById("jokerSound"); a.currentTime=0; a.play(); }
function playJokerLossSound() { if (!soundEnabled) return; const a=document.getElementById("jokerLossSound"); a.currentTime=0; a.play(); }
function playEndGameSound() { if (!soundEnabled) return; const a=document.getElementById("endGameSound"); a.currentTime=0; a.play(); }
function playStartGameSound() { if (!soundEnabled) return; const a=document.getElementById("startGameSound"); a.currentTime=0; a.play(); }
function playNewRecordSound() {
    if (!soundEnabled) return;
    const a = document.getElementById("newRecordSound");
    if (a) a.play();
}


function unlockAudio() {
  const ids = ["clickSound"];
  ids.forEach(id => {
    const a = document.getElementById(id);
    a.volume = 0.001;
    a.play().then(() => {
      setTimeout(() => { a.pause(); a.currentTime = 0; a.volume = 1; }, 30);
    }).catch(()=>{});
  });
}


// ===============================
//   UTILITAIRES UI
// ===============================


async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function flash(message, type = "") {
  const div = document.createElement("div");
  div.className = "flashMessage " + type;
  div.textContent = message;
  document.getElementById("flashContainer").appendChild(div);
  requestAnimationFrame(() => div.classList.add("show"));
  setTimeout(() => { 
    div.classList.remove("show"); 
    setTimeout(() => div.remove(), 300); 
  }, 1500);
}

function showTutorialBubble(text, icon = "") {
  const bubble = document.getElementById("tutorialBubble");
  bubble.innerHTML = icon ? `<span style="margin-right:6px;">${icon}</span>${text}` : text;
  bubble.style.display = "block";
  requestAnimationFrame(() => bubble.style.opacity = "1");
}

function hideTutorialBubble() {
  const bubble = document.getElementById("tutorialBubble");
  bubble.style.opacity = "0";
  setTimeout(() => bubble.style.display = "none", 300);
}

function updateCounters() {
  document.getElementById("scoreValue").textContent = score;
  document.getElementById("jokersCombinedValue").textContent = `${jokersAvailable} / ${jokersTotal}`;
}

function setButtonsEnabled(enabled) {
  document.querySelectorAll("#buttonsArea button").forEach(btn => {
    btn.disabled = !enabled;
    btn.classList.toggle("disabled", !enabled);
  });
}

function formatTime(sec) {
  const m = Math.round(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  timerInterval = setInterval(() => {
    timerSeconds++;
    autoSave();
    document.getElementById("timerValue").textContent = formatTime(timerSeconds);
  }, 1000);
}

function stopTimer() {
  timerRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
}

function resetTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerSeconds = 0;
  timerRunning = false;
  document.getElementById("timerValue").textContent = "00:00";
}

function updateTutorialButtonState() {
  if (validatedSegments.length > 0) {
    tutorialBtn.disabled = true;
    tutorialBtn.classList.add("disabled");
  } else {
    tutorialBtn.disabled = false;
    tutorialBtn.classList.remove("disabled");
  }
}


// ===============================
//   DESSIN DE LA GRILLE
// ===============================

const visualOrigin = offset - spacing;

function drawGrid() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#ddd";
  ctx.lineWidth = 1;

  for (let y = 0; y < size; y++) {
    ctx.beginPath();
    ctx.moveTo(offset, offset + y * spacing);
    ctx.lineTo(offset + (size - 1) * spacing, offset + y * spacing);
    ctx.stroke();
  }

  for (let x = 0; x < size; x++) {
    ctx.beginPath();
    ctx.moveTo(offset + x * spacing, offset);
    ctx.lineTo(offset + x * spacing, offset + (size - 1) * spacing);
    ctx.stroke();
  }
}

function drawPoint(x, y, color = "#000") {
  ctx.beginPath();
  ctx.arc(offset + x * spacing, offset + y * spacing, 3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}


function drawSegment(segmentPoints) {
  const [sx, sy] = segmentPoints[0].split(",").map(Number);
  const [ex, ey] = segmentPoints[4].split(",").map(Number);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(offset + sx * spacing, offset + sy * spacing);
  ctx.lineTo(offset + ex * spacing, offset + ey * spacing);
  ctx.stroke();
}

// ===============================
//   TROUVER LE POINT LE PLUS PROCHE
// ===============================

function getNearestPoint(mx, my) {
  let best = null;
  let bestDist = Infinity;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = offset + x * spacing;
      const py = offset + y * spacing;

      const dx = mx - px;
      const dy = my - py;
      const dist = Math.sqrt(dx*dx + dy*dy);

      if (dist < bestDist) {
        bestDist = dist;
        best = { x, y };
      }
    }
  }

  if (bestDist <= 15) return best;

  return null;
}

function snapToAlignedPoint(first, clicked) {
  const { x: x1, y: y1 } = first;
  const { x: x2, y: y2 } = clicked;

  // 1. Déjà aligné ?
  if (x1 === x2 || y1 === y2 || Math.abs(x1 - x2) === Math.abs(y1 - y2)) {
    return clicked;
  }

  // 2. Chercher le point aligné le plus proche
  const candidates = [];

  // même colonne
  candidates.push({ x: x1, y: y2 });

  // même ligne
  candidates.push({ x: x2, y: y1 });

  // diagonales
  const dx = x2 - x1;
  const dy = y2 - y1;
  const signX = dx > 0 ? 1 : -1;
  const signY = dy > 0 ? 1 : -1;
  candidates.push({ x: x1 + Math.abs(dy) * signX, y: y1 + Math.abs(dy) * signY });
  candidates.push({ x: x1 + Math.abs(dx) * signY, y: y1 + Math.abs(dx) * signX });

  // 3. Choisir le plus proche
  let best = clicked;
  let bestDist = Infinity;

  for (const c of candidates) {
    const px = offset + c.x * spacing;
    const py = offset + c.y * spacing;
    const dist = Math.hypot(mx - px, my - py);

    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }

  // 4. Tolérance
  if (bestDist <= 15) return best;

  return clicked; // pas de snap possible
}


// ===============================
//   CROIX DE MALTE
// ===============================

function drawMaltaCross() {
  permanentPoints.forEach(key => {
    const [x, y] = key.split(",").map(Number);
    drawPoint(x, y);
  });
}

function initMaltaCross() {

  permanentPoints.clear();
  activePoints.clear();

  // Construction brute de la croix
  let x = 0, y = 0;
  const pts = [];
  const add = (px, py) => pts.push({ x: px, y: py });
  add(x, y);

  const steps = [
    [1,0,3],[0,1,3],[1,0,3],[0,1,3],
    [-1,0,3],[0,1,3],[-1,0,3],[0,-1,3],
    [-1,0,3],[0,-1,3],[1,0,3],[0,-1,3]
  ];

  for (const [dx, dy, n] of steps) {
    for (let i = 0; i < n; i++) {
      x += dx;
      y += dy;
      add(x, y);
    }
  }

  // Point de référence dans la croix brute
  const refX = -3;
  const refY = 3;

  // Point logique où placer ce point
  const targetLeftX = 12;
  const targetLeftY = 15;

  const offsetX = targetLeftX - refX; // 15
  const offsetY = targetLeftY - refY; // 12

  // Application de l’offset
  pts.forEach(p => {
    const key = `${p.x + offsetX},${p.y + offsetY}`;
    permanentPoints.add(key);
    activePoints.add(key);
  });
}

function redrawEverything() {

  // Le canvas s’adapte visuellement
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawGrid();

  validatedSegments.forEach(seg => drawSegment(seg.points));

  activePoints.forEach(key => {
    const [x, y] = key.split(",").map(Number);
    drawPoint(x, y);
  });
}


// ===============================
//   ARÊTES
// ===============================

function edgeKey(a, b) {
  return (a < b) ? `${a}|${b}` : `${b}|${a}`;
}

function edgesOfSegment(segmentKeys) {
  const edges = [];
  for (let i = 0; i < 4; i++) edges.push(edgeKey(segmentKeys[i], segmentKeys[i+1]));
  return edges;
}


// ===============================
//   JOKERS
// ===============================

function gainJoker() {
  jokersAvailable++;
  autoSave();
  jokersTotal++;
  autoSave();
  updateCounters();

  const container = document.getElementById("jokerEffectContainer");
  const float = document.createElement("div");
  float.className = "joker-float";
  float.textContent = "+1";
  float.style.left = (canvas.width / 2 - 10) + "px";
  float.style.top  = (canvas.height / 2 - 20) + "px";
  container.appendChild(float);
  setTimeout(() => container.removeChild(float), 1000);

  playJokerGainSound();
}

function loseJoker(amount) {
  jokersAvailable -= amount;
  updateCounters();

  const container = document.getElementById("jokerEffectContainer");
  const float = document.createElement("div");
  float.className = "joker-loss";
  float.textContent = `-${amount}`;
  float.style.left = (canvas.width / 2 - 12) + "px";
  float.style.top  = (canvas.height / 2 - 20) + "px";
  container.appendChild(float);
  setTimeout(() => container.removeChild(float), 1000);

  playJokerLossSound();
}

// ===============================
//   VALIDATION D’UN SEGMENT
// ===============================

function getSegmentBetween(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  const aligned =
    (dx === 0 && Math.abs(dy) === 4) ||
    (dy === 0 && Math.abs(dx) === 4) ||
    (Math.abs(dx) === 4 && Math.abs(dy) === 4);

  if (!aligned) { 
    flash("Impossible : Points non alignés", "error"); 
    playErrorSound(); 
    return null; 
  }

  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);

  const segment = [];
  for (let i = 0; i < 5; i++) {
    segment.push(`${start.x + i * stepX},${start.y + i * stepY}`);
  }

  const edges = edgesOfSegment(segment);
  if (edges.some(e => usedEdges.has(e))) {
    flash("Impossible : segment déjà utilisé", "error");
    playErrorSound();
    return null;
  }

  const activeCount = segment.filter(p => activePoints.has(p)).length;

  if (activeCount < 2) {
    flash("Impossible : au moins 2 points actifs nécessaires", "error");
    playErrorSound();
    return null;
  }

  if (activeCount === 5) { 
    gainJoker(); 
    flash("+ 1 joker", "success"); 
    playSuccessSound(); 
  }
  else if (activeCount === 3) {
    if (jokersAvailable >= 1) { 
      loseJoker(1); 
      flash("- 1 joker", "info"); 
    }
    else { 
      flash("Impossible : pas de joker", "error"); 
      playErrorSound(); 
      return null; 
    }
  }
  else if (activeCount === 2) {
    if (jokersAvailable >= 2) { 
      loseJoker(2); 
      flash("- 2 jokers", "info"); 
    }
    else { 
      flash("Impossible : 2 jokers nécessaires", "error"); 
      return null; 
    }
  }

  segment.forEach(key => {
    if (!activePoints.has(key)) {
      activePoints.add(key);
      const [px, py] = key.split(",").map(Number);
      drawPoint(px, py);
    }
  });

  edges.forEach(e => usedEdges.add(e));

  return { points: segment, edges, activeCount };
}


// ===============================
//   HISTORIQUE
// ===============================

function appendHistoryEntry(points, activeCount) {
  const historyList = document.getElementById("historyList");
  const li = document.createElement("li");

  const displayed = points.map(p => {
    const [x, y] = p.split(",").map(Number);
    return `${x + 1},${y + 1}`;
  });

  li.textContent = displayed.join(" → ");

  if (activeCount === 5) li.className = "gain";
  else if (activeCount === 3 || activeCount === 2) li.className = "loss";
  else li.className = "neutral";

  historyList.appendChild(li);
  historyList.scrollTop = historyList.scrollHeight;
}


// ===============================
//   ANNULATION
// ===============================

function undoLastMove() {
  if (validatedSegments.length === 0) return;

  const last = validatedSegments.pop();

  undoCount++;
  autoSave();
  document.getElementById("undoCount").textContent = undoCount;

  score = Math.max(0, score - 1);

  last.edges.forEach(e => usedEdges.delete(e));

  if (last.activeCount === 5) {
    jokersAvailable = Math.max(0, jokersAvailable - 1);
    jokersTotal     = Math.max(0, jokersTotal - 1);
  } 
  else if (last.activeCount === 3) {
    jokersAvailable += 1;
  } 
  else if (last.activeCount === 2) {
    jokersAvailable += 2;
  }

  last.points.forEach(key => {
    const [kx, ky] = key.split(",").map(Number);

    const stillUsed = validatedSegments.some(s =>
      s.points.some(p => {
        const [px, py] = p.split(",").map(Number);
        return px === kx && py === ky;
      })
    );

    if (!stillUsed && !permanentPoints.has(key)) {
      activePoints.delete(key);
      autoSave();
    }
  });

  const historyList = document.getElementById("historyList");
  if (historyList.lastChild) historyList.removeChild(historyList.lastChild);

    updateCounters();
    redrawEverything();
    updateTutorialButtonState();
  }


// ===============================
//   FIN DE PARTIE
// ===============================

function finalizeGameState() {
  gameOver = true;
  autoSave();
  stopTimer();
  localStorage.removeItem("currentGameState");

  const pauseBtn = document.getElementById("pauseBtn");
  const undoBtn  = document.getElementById("undoBtn");

  if (pauseBtn) {
    pauseBtn.disabled = true;
    pauseBtn.classList.add("disabled");
  }

  if (undoBtn) {
    undoBtn.disabled = true;
    undoBtn.classList.add("disabled");
  }
}

function showEndGamePanel() {
  
  const finalScoreEl = document.getElementById("finalScore");
  if (finalScoreEl) {
    finalScoreEl.textContent = "Score final : " + score;
  }

  playEndGameSound();

  gameOver = true;
  autoSave();

  const pauseBtn = document.getElementById("pauseBtn");
  const undoBtn = document.getElementById("undoBtn");

  if (pauseBtn) {
    pauseBtn.disabled = true;
    pauseBtn.classList.add("disabled");
  }

  if (undoBtn) {
    undoBtn.disabled = true;
    undoBtn.classList.add("disabled");
  }

  const overlay = document.getElementById("endGameOverlay");
  if (overlay) overlay.classList.remove("hidden");
}

function isBetterThan(a, b) {
    if (!b) return true; // Aucun record existant

    // 1. Score le plus élevé
    if (a.score !== b.score)
        return a.score > b.score;

    // 2. À score égal → durée la plus courte
    if (a.duration !== b.duration)
        return a.duration < b.duration;

    // 3. À durée égale → moins de retours
    if (a.returnsUsed !== b.returnsUsed)
        return a.returnsUsed < b.returnsUsed;

    // 4. À retours égal → moins de jokers
    return a.jokersUsed < b.jokersUsed;
}

function checkGameOver() {   
  const moves = getPossibleMoves();
  if (moves.length === 0) {

    gameOver = true;
    autoSave();
    stopTimer();
    localStorage.removeItem("currentGameState");

    const current = {
      score,
      returnsUsed: undoCount,
      jokersUsed: jokersTotal - jokersAvailable,
      duration: timerSeconds,
      screenshot: canvas.toDataURL("image/png"),
      date: Date.now()
    };

    const best = loadBestScore();
    const isNewRecord = isBetterThan(current, best);

    // ENVOI DU SCORE GLOBAL
    const user = await getCurrentUser();
if (!user) {
  document.getElementById("authOverlay").style.display = "flex";
  return;
}

await sendScoreToSupabase(
  user.id,
  playerPseudo,
  current.score,
  current.duration * 1000,
  current.returnsUsed,
  current.jokersUsed
);


    if (isNewRecord) {

      const pauseBtn = document.getElementById("pauseBtn");
      const undoBtn  = document.getElementById("undoBtn");

      if (pauseBtn) {
        pauseBtn.disabled = true;
        pauseBtn.classList.add("disabled");
      }

      if (undoBtn) {
        undoBtn.disabled = true;
        undoBtn.classList.add("disabled");
      }

      saveBestScore(current);
      updateBestScoreTop();
      playNewRecordSound();
      showBestScorePanel();
      return;
    }

    showEndGamePanel();
  }
}


function getPossibleMoves() {
  const moves = [];
  const directions = [
    {dx: 1, dy: 0},
    {dx: 0, dy: 1},
    {dx: 1, dy: 1},
    {dx: 1, dy: -1}
  ];

  for (let key of activePoints) {
    const [x, y] = key.split(",").map(Number);

    for (let dir of directions) {
      const segment = [];

      for (let i = 0; i < 5; i++) {
        const px = x + i * dir.dx;
        const py = y + i * dir.dy;

        if (px < 0 || px >= size || py < 0 || py >= size) {
          segment.length = 0;
          break;
        }

        segment.push(`${px},${py}`);
      }

      if (segment.length !== 5) continue;

      const edges = edgesOfSegment(segment);
      const overlaps = edges.some(e => usedEdges.has(e));
      if (overlaps) continue;

      const activeCount = segment.filter(p => activePoints.has(p)).length;

      if (activeCount < 2) continue;
      if (activeCount === 3 && jokersAvailable < 1) continue;
      if (activeCount === 2 && jokersAvailable < 2) continue;

      moves.push(segment);
    }
  }

  return moves;
}

// ===============================
//   PAUSE
// ===============================

function pauseGame() {
  paused = true;
  clearInterval(timerInterval);
  timerRunning = false;
  document.getElementById("pauseBtn").textContent = "Reprendre";
  flash("Jeu en pause");
}

function resumeGame() {
  paused = false;
  startTimer();
  document.getElementById("pauseBtn").textContent = "Pause";
  flash("Reprise");
}

function togglePause() {
  if (paused) resumeGame();
  else pauseGame();
}


// ===============================
//   RÉINITIALISATION DU JEU
// ===============================

function startNewGame() {

  // Tentative de restauration
  const restored = restoreGameState();

  if (restored) {
    redrawEverything();
    return;
  }

  resetGameState();
  initMaltaCross();
  redrawEverything();
  startTimer();
}



function resetGameState() {

  selectedStart = null;
  score = 0;
  paused = false;
  gameOver = false;

  activePoints = new Set();
  permanentPoints = new Set();
  usedEdges = new Set();
  validatedSegments = [];

  jokersAvailable = 0;
  jokersTotal = 0;

  undoCount = 0;
  document.getElementById("undoCount").textContent = "0";

  resetTimer();

  const historyList = document.getElementById("historyList");
  historyList.innerHTML = "";

  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ===============================
//   TUTORIEL : CLIGNOTEMENT
// ===============================

function blinkPoint(x, y, duration = 1200) {
  return new Promise(resolve => {
    let visible = true;

    const interval = setInterval(() => {
      redrawEverything();

      if (visible) {
        const cx = offset + x * spacing;
        const cy = offset + y * spacing;

        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 215, 0, 0.35)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#ff0000";
        ctx.fill();
      }

      visible = !visible;
    }, 250);

    setTimeout(() => {
      clearInterval(interval);
      redrawEverything();
      resolve();
    }, duration);
  });
}


// ===============================
//   TUTORIEL : ANIMATION D’UNE LIGNE
// ===============================

function animateLine(points) {
  return new Promise(resolve => {
    let i = 0;

    const interval = setInterval(() => {
      if (i >= points.length - 1) {
        clearInterval(interval);
        resolve();
        return;
      }

      const p1 = points[i].split(",").map(Number);
      const p2 = points[i + 1].split(",").map(Number);

      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(offset + p1[0] * spacing, offset + p1[1] * spacing);
      ctx.lineTo(offset + p2[0] * spacing, offset + p2[1] * spacing);
      ctx.stroke();

      i++;
    }, 200);
  });
}


// ===============================
//   TUTORIEL AUTOMATIQUE
// ===============================

function runTutorial() {
  if (tutorialRunning) return;

  tutorialRunning = true;
  currentTutorialStep = 0;

  setButtonsEnabled(false);
  tutorialBtn.disabled = true;
  tutorialBtn.classList.add("disabled");

  playTutorialStep();
}


// --------------------------------------
// Fonction indépendante
// --------------------------------------
function drawSegmentProgressively(start, end, onComplete, isTutorial = false) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);

  const segment = [];

  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 0; i <= steps; i++) {
    segment.push(`${start.x + i * stepX},${start.y + i * stepY}`);
  }
    animateLine(segment).then(() => {
    segment.forEach(key => {
      const [px, py] = key.split(",").map(Number);
      drawPoint(px, py);
    });

    if (!isTutorial) {
      segment.forEach(key => activePoints.add(key));

      const edges = edgesOfSegment(segment);
      edges.forEach(e => usedEdges.add(e));

      validatedSegments.push({
        points: segment,
        edges: edges,
        activeCount: steps
      });

      score++;
      autoSave();
      updateCounters();
      appendHistoryEntry(segment, steps);
      updateTutorialButtonState();
    }

    if (onComplete) onComplete();
  });
}


function playTutorialStep() {

  // 1) Récupération de l’étape
  const step = tutorialSteps[currentTutorialStep];

  // 2) Fin du tutoriel
  if (!step) {
    tutorialRunning = false;
    showTutorialBubble("Tutoriel terminé !");
    setTimeout(() => hideTutorialBubble(), 2000);
    setButtonsEnabled(true);
    updateTutorialButtonState();
    redrawEverything();
    flash("A vous de jouer", "info");
    return;
  }

  // 3) Mise à jour visuelle
  if (typeof positionLabels === "function") {
    positionLabels();
  }

  redrawEverything();

  // 4) Affichage du message
  showTutorialBubble(step.message, step.icon);
  const bubble = document.getElementById("tutorialBubble");
  bubble.className = "step" + (currentTutorialStep + 1);

  // 5) Animation : start → end → segment
  blinkPoint(step.start.x, step.start.y)
    .then(() => blinkPoint(step.end.x, step.end.y))
    .then(() => {
      drawSegmentProgressively(step.start, step.end, () => {

        // 6) Passage à l’étape suivante
        setTimeout(() => {
          currentTutorialStep++;
          playTutorialStep();
        }, 600);

      }, true);
    });
}

// ===============================
//   INITIALISATION DU JEU (GLOBAL !)
// ===============================

function initGame() {

  const undoBtn = document.getElementById("undoBtn");
  if (undoBtn) {
    undoBtn.disabled = false;
    undoBtn.classList.remove("disabled");
  }

  //const restored = false;
  const restored = restoreGameState();

  if (!restored || gameOver) {
    resetGameState();
    initMaltaCross();
  }

  redrawEverything();

  updateCounters();
  document.getElementById("undoCount").textContent = undoCount;
  updateSoundButton();
  document.getElementById("timerValue").textContent = formatTime(timerSeconds);

  gameOver = false;
  paused = false;
  
  updateTutorialButtonState();
  updateBestScoreTop();

  //if (!paused && !gameOver) {
  //  startTimer();
 // }
  
}

// ===============================
//   DOMContentLoaded
// ===============================

document.addEventListener("DOMContentLoaded", () => {

  // Références DOM essentielles (globales)
  canvas = document.getElementById("gameCanvas");
  ctx = canvas.getContext("2d");
  tutorialBtn = document.getElementById("stepBtn");

  // ===============================
  //   CALCUL RÉEL DU CANVAS + GRILLE
  // ===============================

  // 1) Fixer la taille réelle du canvas (CSS → JS)
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  // 2) Recalculer spacing et offset en fonction de la taille réelle
  spacing = canvas.width / (size + 1);
  offset = spacing;

  // ===============================
  //   POSITIONNEMENT DES REPÈRES
  // ===============================

  const topLabels = document.querySelectorAll('#topLabels span');
  const leftLabels = document.querySelectorAll('#leftLabels span');

  if (topLabels.length && leftLabels.length) {

    topLabels.forEach(span => {
      const pos = Number(span.textContent);
      if (!Number.isFinite(pos)) return;
      const x = offset + (pos - 1) * spacing;
      span.style.left = `${x - 6}px`;
    });

    leftLabels.forEach(span => {
      const pos = Number(span.textContent);
      if (!Number.isFinite(pos)) return;
      const y = offset + (pos - 1) * spacing;
      span.style.top = `${y - 6}px`;
    });
  }

  // === Bouton OK fin de partie ===
  document.getElementById("closeEndGame").addEventListener("click", () => {
    document.getElementById("endGameOverlay").classList.add("hidden");
  });

  // === Bouton PAS À PAS ===
  tutorialBtn.addEventListener("click", () => {
    playClickSound();
    if (tutorialRunning) return;

    localStorage.removeItem("currentGameState");

    const modal = document.getElementById("readyModal");
    if (modal) modal.style.display = "none";

    resetGameState();
    initMaltaCross();
    redrawEverything();
    initGame();
    runTutorial();
  });

  // ===============================
  //   LISTENER : CLIC SUR LA GRILLE
  // ===============================

  canvas.addEventListener("click", (e) => {

    if (gameOver) return;
    if (!tutorialRunning && !gameOver && !timerRunning) {
    startTimer();
    }

    if (tutorialRunning) return;

    if (paused) resumeGame();

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const nearest = getNearestPoint(mx, my);

    if (!nearest) {
      flash("Hors grille", "error");
      playErrorSound();
      selectedStart = null;
      return;
    }

    const { x, y } = nearest;

    if (!selectedStart) {
      selectedStart = { x, y };
      return;
    }

    const snapped = snapToAlignedPoint(selectedStart, { x, y });
    
    const result = getSegmentBetween(selectedStart, { x, y });
    selectedStart = null;

    if (result) {
      playSuccessSound();
      validatedSegments.push(result);
      drawSegment(result.points);
      score++;
      updateCounters();
      appendHistoryEntry(result.points, result.activeCount);
      updateTutorialButtonState();
      checkGameOver();
    }
  });

  // ===============================
  //   BOUTONS
  // ===============================

  document.getElementById("resetBtn").addEventListener("click", () => {
    playClickSound();
    localStorage.removeItem("currentGameState");
    startNewGame();
    initGame();
  });

  document.getElementById("undoBtn").addEventListener("click", () => {
    playClickSound();
    if (!tutorialRunning) undoLastMove();
  });

  document.getElementById("pauseBtn").addEventListener("click", () => {
    playClickSound();
    if (!tutorialRunning) togglePause();
  });

  document.getElementById("helpBtn").addEventListener("click", () => {
  playClickSound();

 document.getElementById("authBtn").addEventListener("click", async () => {
  const user = await getCurrentUser();

  if (user) {
    await supabase.auth.signOut();
    updateAuthUI();
    return;
  }

  document.getElementById("authOverlay").style.display = "flex";
});

document.getElementById("closeAuthBtn").addEventListener("click", () => {
  document.getElementById("authOverlay").style.display = "none";
});

  const overlay = document.getElementById("helpOverlay");
  if (!overlay) {
    console.error("helpOverlay introuvable dans le DOM");
    return;
  }

  //  Ajustement dynamique pour éviter que la fenêtre passe sous le bandeau
  const topBar = document.getElementById("topBar");
  if (topBar) {
    const barHeight = topBar.offsetHeight;
    overlay.style.paddingTop = `${barHeight + 20}px`; // marge de sécurité
  }

  overlay.classList.remove("hidden");
  overlay.style.display = "flex";
});

  document.getElementById("signupBtn").addEventListener("click", async () => {
  const email = document.getElementById("authEmail").value;
  const password = document.getElementById("authPassword").value;

  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    alert("Erreur : " + error.message);
    return;
  }

  alert("Compte créé ! Vérifie ton email.");
});

document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("authEmail").value;
  const password = document.getElementById("authPassword").value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    alert("Erreur : " + error.message);
    return;
  }

  document.getElementById("authOverlay").style.display = "none";
  updateAuthUI();
});


  document.getElementById("closeHelpBtn").addEventListener("click", () => {
    playClickSound();
    const overlay = document.getElementById("helpOverlay");
    if (!overlay) {
      console.error("helpOverlay introuvable dans le DOM");
      return;
    }
    overlay.style.display = "none";
    overlay.classList.add("hidden");
  });

  document.getElementById("soundBtn").addEventListener("click", () => {
    playClickSound();
    soundEnabled = !soundEnabled;
    updateSoundButton();
  });

  // ===============================
  //   READY BUTTON
  // ===============================

  document.getElementById("readyBtn").addEventListener("click", () => {
    
    unlockAudio();
    audioUnlocked = true;

    setTimeout(() => playClickSound(), 80);

    document.getElementById("readyModal").style.display = "none";

    initGame();

    const board = document.getElementById("canvasContainer");
    board.classList.remove("show");
    board.classList.add("slide-in-premium");
    void board.offsetWidth;
    board.classList.add("show");

    setTimeout(() => playStartGameSound(), 1800);
  });

  // ===============================
  //   PRÉCHARGEMENT AUDIO
  // ===============================

  window.addEventListener("load", () => {
    const a = document.getElementById("clickSound");
    a.load();
  });

});
document.addEventListener("DOMContentLoaded", startNewGame);











































