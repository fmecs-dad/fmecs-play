/* ============================================================
   BLOC A — VARIABLES GLOBALES + SUPABASE + AUTH + PROFIL
   ============================================================ */

/* --- SUPABASE --- */
const supa = supabase.createClient(
  "https://fmecs.supabase.co",
  "public-anon-key"
);

/* --- VARIABLES GLOBALES DU JEU --- */

let size = 31;              // Taille de la grille
let spacing = 0;            // Calculé après init
let offset = 0;             // Décalage du canvas

let canvas = null;
let ctx = null;

let activePoints = new Set();
let permanentPoints = new Set();
let usedEdges = new Set();
let validatedSegments = [];

let selectedStart = null;

let score = 0;
let jokersAvailable = 0;
let jokersTotal = 0;
let undoCount = 0;

let timerSeconds = 0;
let timerInterval = null;
let timerRunning = false;

let paused = false;
let gameOver = false;

let tutorialRunning = false;
let currentTutorialStep = 0;

let historyStack = [];
let soundEnabled = true;
let audioUnlocked = false;

/* ============================================================
   PROFIL — UI
   ============================================================ */

function openProfileBlock() {
  const block = document.getElementById("profileBlock");
  block.classList.remove("closed");
  block.classList.add("open");
}

function closeProfileBlock() {
  const block = document.getElementById("profileBlock");
  block.classList.remove("open");
  block.classList.add("closed");
}

function showProfileView1() {
  document.getElementById("profileView1").classList.add("active");
  document.getElementById("profileView2").classList.remove("active");
}

function showProfileView2() {
  document.getElementById("profileView1").classList.remove("active");
  document.getElementById("profileView2").classList.add("active");
}

/* ============================================================
   PROFIL — MISE À JOUR UI
   ============================================================ */

function updateUserButton(pseudo, avatarUrl) {
  const btn = document.getElementById("btnUser");

  if (!pseudo) {
    btn.classList.add("logged-out");
    btn.innerHTML = "Se connecter";
    return;
  }

  btn.classList.remove("logged-out");
  btn.innerHTML = `
    <img src="${avatarUrl}" class="avatar-mini">
    <span>${pseudo}</span>
  `;
}

function updateProfilePanel(user, pseudo, email, avatarUrl) {
  document.getElementById("profilePseudo").textContent = pseudo || "";
  document.getElementById("profileEmail").textContent = email || "";

  document.getElementById("profileAvatarLarge").style.backgroundImage =
    avatarUrl ? `url('${avatarUrl}')` : "none";

  document.getElementById("editAvatarLarge").style.backgroundImage =
    avatarUrl ? `url('${avatarUrl}')` : "none";

  document.getElementById("inputPseudo").value = pseudo || "";
  document.getElementById("inputEmail").value = email || "";
}

/* ============================================================
   PROFIL — RÉCUPÉRATION DES DONNÉES
   ============================================================ */

async function fetchPlayerPseudo(userId) {
  const { data, error } = await supa
    .from("players")
    .select("pseudo")
    .eq("id", userId)
    .maybeSingle();

  if (error) return null;
  return data?.pseudo || null;
}

async function fetchPlayerAvatar(userId) {
  const { data, error } = await supa
    .from("players")
    .select("avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (error) return null;
  return data?.avatar_url || null;
}

/* ============================================================
   PROFIL — MISE À JOUR SUPABASE
   ============================================================ */

async function updatePlayerProfile(userId, newPseudo, newEmail, newPassword, avatarFile) {
  let avatarUrl = null;

  if (avatarFile) {
    const fileName = `${userId}_${Date.now()}`;
    const { data: uploadData, error: uploadError } = await supa.storage
      .from("avatars")
      .upload(fileName, avatarFile);

    if (!uploadError) {
      avatarUrl = supa.storage.from("avatars").getPublicUrl(fileName).publicURL;
    }
  }

  if (newPseudo) {
    await supa.from("players").update({ pseudo: newPseudo }).eq("id", userId);
  }

  if (avatarUrl) {
    await supa.from("players").update({ avatar_url: avatarUrl }).eq("id", userId);
  }

  if (newEmail || newPassword) {
    await supa.auth.update({
      email: newEmail || undefined,
      password: newPassword || undefined
    });
  }

  return avatarUrl;
}

/* ============================================================
   AUTH — MISE À JOUR UI
   ============================================================ */

async function updateAuthUI(user) {
  if (!user) {
    updateUserButton(null);
    closeProfileBlock();
    return;
  }

  const pseudo = await fetchPlayerPseudo(user.id);
  const avatarUrl = await fetchPlayerAvatar(user.id);

  updateUserButton(pseudo, avatarUrl);
  updateProfilePanel(user, pseudo, user.email, avatarUrl);
}

/* ============================================================
   BLOC B — LEADERBOARD + BEST SCORE
   ============================================================ */

/* ------------------------------------------------------------
   Récupération du leaderboard depuis Supabase
------------------------------------------------------------ */

async function fetchLeaderboard() {
  const { data, error } = await supa
    .from("scores")
    .select("player_id, score, duration, undo, jokers, created_at")
    .order("score", { ascending: false })
    .limit(200);

  if (error) {
    console.error("Erreur leaderboard :", error);
    return [];
  }

  // Récupération des pseudos et avatars
  const playerIds = [...new Set(data.map(r => r.player_id))];

  const { data: players } = await supa
    .from("players")
    .select("id, pseudo, avatar_url")
    .in("id", playerIds);

  const map = new Map();
  players?.forEach(p => map.set(p.id, p));

  return data.map(row => ({
    ...row,
    pseudo: map.get(row.player_id)?.pseudo || "???",
    avatar: map.get(row.player_id)?.avatar_url || null
  }));
}

/* ------------------------------------------------------------
   Affichage du leaderboard dans le panel
------------------------------------------------------------ */

function renderLeaderboard(rows) {
  const container = document.getElementById("leaderboardContainer");
  container.innerHTML = "";

  if (!rows || rows.length === 0) {
    container.innerHTML = "<p>Aucun score pour le moment.</p>";
    return;
  }

  // Header
  const header = document.createElement("div");
  header.className = "leaderboard-header leaderboard-row";
  header.innerHTML = `
    <span class="rank">#</span>
    <span class="pseudo">Pseudo</span>
    <span class="score">Score</span>
    <span class="duration">Temps</span>
    <span class="undo">↩</span>
    <span class="jokers">🎲</span>
    <span class="date">Date</span>
  `;
  container.appendChild(header);

  // Lignes
  rows.forEach((row, i) => {
    const div = document.createElement("div");
    div.className = "leaderboard-row";

    const date = new Date(row.created_at).toLocaleDateString("fr-FR");

    div.innerHTML = `
      <span class="rank">${i + 1}</span>
      <span class="pseudo">${row.pseudo}</span>
      <span class="score">${row.score}</span>
      <span class="duration">${formatDuration(row.duration)}</span>
      <span class="undo">${row.undo}</span>
      <span class="jokers">${row.jokers}</span>
      <span class="date">${date}</span>
    `;

    container.appendChild(div);
  });
}

/* ------------------------------------------------------------
   Formatage du temps pour le leaderboard
------------------------------------------------------------ */

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ------------------------------------------------------------
   Ouverture du leaderboard
------------------------------------------------------------ */

async function openLeaderboard() {
  const overlay = document.getElementById("leaderboardOverlay");
  overlay.classList.remove("hidden");

  const rows = await fetchLeaderboard();
  renderLeaderboard(rows);
}

function closeLeaderboard() {
  document.getElementById("leaderboardOverlay").classList.add("hidden");
}

/* ============================================================
   BEST SCORE — Gestion du record personnel
   ============================================================ */

function loadBestScore() {
  const raw = localStorage.getItem("bestScore");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveBestScore(score, duration) {
  const best = loadBestScore();

  if (!best || score > best.score) {
    localStorage.setItem("bestScore", JSON.stringify({ score, duration }));
    return true; // nouveau record
  }

  return false;
}

function showBestScore(score, duration) {
  const overlay = document.getElementById("bestScoreOverlay");
  const content = document.getElementById("bestScoreContent");

  content.innerHTML = `
    <div class="record-line">🎉 Nouveau record : <strong>${score}</strong></div>
    <div>Temps : ${formatDuration(duration)}</div>
  `;

  overlay.classList.remove("hidden");
}

/* ============================================================
   ENVOI DU SCORE À SUPABASE
   ============================================================ */

async function sendScoreToSupabase(score, duration, undo, jokers) {
  const session = supa.auth.session();
  const user = session?.user;

  if (!user) return;

  await supa.from("scores").insert([{
    player_id: user.id,
    score,
    duration,
    undo,
    jokers,
    created_at: new Date().toISOString()
  }]);
}

/* ============================================================
   BLOC C — SAUVEGARDE, AUDIO, UI, TIMER, GRILLE, REDRAW
   ============================================================ */

/* ------------------------------------------------------------
   AUDIO
------------------------------------------------------------ */

function playClickSound() {
  if (!soundEnabled || !audioUnlocked) return;
  document.getElementById("clickSound").play();
}

function playErrorSound() {
  if (!soundEnabled || !audioUnlocked) return;
  document.getElementById("errorSound").play();
}

function playSuccessSound() {
  if (!soundEnabled || !audioUnlocked) return;
  document.getElementById("successSound").play();
}

function playStartGameSound() {
  if (!soundEnabled || !audioUnlocked) return;
  document.getElementById("startGameSound").play();
}

function playEndGameSound() {
  if (!soundEnabled || !audioUnlocked) return;
  document.getElementById("endGameSound").play();
}

function updateSoundButton() {
  const btn = document.getElementById("burgerSoundBtn");
  btn.textContent = soundEnabled ? "Son : on" : "Son : off";
}

/* ------------------------------------------------------------
   FLASH MESSAGES
------------------------------------------------------------ */

function flash(message, type = "info") {
  const container = document.getElementById("flashContainer");

  const div = document.createElement("div");
  div.className = "flashMessage";
  div.textContent = message;

  container.appendChild(div);

  requestAnimationFrame(() => div.classList.add("show"));

  setTimeout(() => {
    div.classList.remove("show");
    setTimeout(() => div.remove(), 300);
  }, 1800);
}

/* ------------------------------------------------------------
   TIMER
------------------------------------------------------------ */

function startTimer() {
  if (timerRunning) return;
  timerRunning = true;

  timerInterval = setInterval(() => {
    timerSeconds++;
    updateTimerUI();
  }, 1000);
}

function stopTimer() {
  timerRunning = false;
  clearInterval(timerInterval);
}

function updateTimerUI() {
  const m = Math.floor(timerSeconds / 60);
  const s = timerSeconds % 60;
  document.getElementById("timerValue").textContent =
    `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/* ------------------------------------------------------------
   PAUSE
------------------------------------------------------------ */

function togglePause() {
  if (paused) {
    resumeGame();
  } else {
    pauseGame();
  }
}

function pauseGame() {
  paused = true;
  stopTimer();
  flash("Pause");
}

function resumeGame() {
  paused = false;
  startTimer();
  flash("Reprise");
}

/* ------------------------------------------------------------
   SAUVEGARDE LOCALE
------------------------------------------------------------ */

function autoSave() {
  const state = {
    score,
    jokersAvailable,
    jokersTotal,
    undoCount,
    timerSeconds,
    activePoints: [...activePoints],
    usedEdges: [...usedEdges],
    validatedSegments,
  };

  localStorage.setItem("currentGameState", JSON.stringify(state));
}

function loadSavedGame() {
  const raw = localStorage.getItem("currentGameState");
  if (!raw) return false;

  try {
    const state = JSON.parse(raw);

    score = state.score;
    jokersAvailable = state.jokersAvailable;
    jokersTotal = state.jokersTotal;
    undoCount = state.undoCount;
    timerSeconds = state.timerSeconds;

    activePoints = new Set(state.activePoints);
    usedEdges = new Set(state.usedEdges);
    validatedSegments = state.validatedSegments;

    updateCounters();
    updateTimerUI();

    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------
   UI — COMPTEURS
------------------------------------------------------------ */

function updateCounters() {
  document.getElementById("scoreValue").textContent = score;
  document.getElementById("jokersCombinedValue").textContent =
    `${jokersAvailable} / ${jokersTotal}`;
  document.getElementById("undoCount").textContent = undoCount;
}


/* ------------------------------------------------------------
   GRILLE — OUTILS
------------------------------------------------------------ */

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


function getNearestPoint(mx, my) {
  const x = Math.round((mx - offset) / spacing);
  const y = Math.round((my - offset) / spacing);

  if (x < 1 || x > size || y < 1 || y > size) return null;

  return { x, y };
}

/* ------------------------------------------------------------
   GRILLE — REDESSIN COMPLET
------------------------------------------------------------ */

function redrawEverything() {
  if (!canvas || !ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Points permanents (Croix de Malte)
  permanentPoints.forEach(key => {
    const [x, y] = key.split(",").map(Number);
    drawPoint(x, y);
  });

  // Segments validés
  validatedSegments.forEach(seg => {
    drawSegment(seg.points);
  });

  // Points actifs
  activePoints.forEach(key => {
    const [x, y] = key.split(",").map(Number);
    drawPoint(x, y);
  });
}

/* ------------------------------------------------------------
   CROIX DE MALTE — INITIALISATION
------------------------------------------------------------ */

function drawMaltaCross() {
  permanentPoints.forEach(key => {
    const [x, y] = key.split(",").map(Number);
    drawPoint(x, y);
  });
}

function initMaltaCross() {
  permanentPoints.clear();
  activePoints.clear();

  const mid = Math.floor(size / 2) + 1;

  const coords = [
    [mid, mid - 2],
    [mid, mid - 1],
    [mid, mid],
    [mid, mid + 1],
    [mid, mid + 2],

    [mid - 2, mid],
    [mid - 1, mid],
    [mid + 1, mid],
    [mid + 2, mid],
  ];

  coords.forEach(([x, y]) => {
    const key = `${x},${y}`;
    permanentPoints.add(key);
    activePoints.add(key);
  });
}

/* ------------------------------------------------------------
   INITIALISATION DU JEU
------------------------------------------------------------ */

function initGame() {
  canvas = document.getElementById("gameCanvas");
  ctx = canvas.getContext("2d");

  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  spacing = canvas.width / (size + 1);
  offset = spacing;

  initMaltaCross();
  redrawEverything();
  updateCounters();
}

/* ------------------------------------------------------------
   HISTORIQUE
------------------------------------------------------------ */

function appendHistoryEntry(points, activeCount) {
  const list = document.getElementById("historyList");

  const li = document.createElement("li");
  li.className = activeCount >= 4 ? "gain" : activeCount === 3 ? "neutral" : "loss";

  li.textContent = points.join(" → ");

  list.prepend(li);
}

/* ============================================================
   BLOC D — LOGIQUE DU JEU, SEGMENTS, JOKERS, UNDO, FIN
   ============================================================ */

/* ------------------------------------------------------------
   OUTILS SEGMENTS
------------------------------------------------------------ */

function keyFromPoint(p) {
  return `${p.x},${p.y}`;
}

function isPointActive(key) {
  return activePoints.has(key);
}

function isPointPermanent(key) {
  return permanentPoints.has(key);
}

function isEdgeUsed(aKey, bKey) {
  const edge1 = `${aKey}-${bKey}`;
  const edge2 = `${bKey}-${aKey}`;
  return usedEdges.has(edge1) || usedEdges.has(edge2);
}

function markEdgeUsed(aKey, bKey) {
  const edge = `${aKey}-${bKey}`;
  usedEdges.add(edge);
}

/* ------------------------------------------------------------
   VALIDATION D’UNE LIGNE DE 5 POINTS
------------------------------------------------------------ */

function buildSegment(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // doit être aligné
  if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return null;

  const length = Math.max(Math.abs(dx), Math.abs(dy));
  if (length !== 4) return null; // 5 points = 4 intervalles

  const stepX = dx === 0 ? 0 : dx / length;
  const stepY = dy === 0 ? 0 : dy / length;

  const points = [];
  for (let i = 0; i <= length; i++) {
    const x = start.x + stepX * i;
    const y = start.y + stepY * i;
    points.push({ x, y });
  }

  return points;
}

function countActiveInSegment(points) {
  let count = 0;
  points.forEach(p => {
    if (isPointActive(keyFromPoint(p))) count++;
  });
  return count;
}

function canUseJokersFor(activeCount) {
  if (activeCount >= 4) return { ok: true, jokersNeeded: 0 };
  if (activeCount === 3) return { ok: jokersAvailable >= 1, jokersNeeded: 1 };
  if (activeCount === 2) return { ok: jokersAvailable >= 2, jokersNeeded: 2 };
  return { ok: false, jokersNeeded: Infinity };
}

/* ------------------------------------------------------------
   APPLICATION D’UN COUP
------------------------------------------------------------ */

function applyMove(points) {
  const keys = points.map(keyFromPoint);
  const activeCount = countActiveInSegment(points);

  const { ok, jokersNeeded } = canUseJokersFor(activeCount);
  if (!ok) {
    flash("Ligne invalide (trop peu de points actifs)", "error");
    playErrorSound();
    return false;
  }

  // Vérifier les arêtes déjà utilisées
  for (let i = 0; i < keys.length - 1; i++) {
    if (isEdgeUsed(keys[i], keys[i + 1])) {
      flash("Cette ligne utilise déjà un segment existant", "error");
      playErrorSound();
      return false;
    }
  }

  // Historique pour undo
  historyStack.push({
    type: "segment",
    points: keys,
    jokersUsed: jokersNeeded,
  });

  // Marquer les arêtes
  for (let i = 0; i < keys.length - 1; i++) {
    markEdgeUsed(keys[i], keys[i + 1]);
  }

  // Ajouter les points comme actifs
  keys.forEach(k => activePoints.add(k));

  // Score
  score += 1;
  if (activeCount === 5) {
    jokersAvailable += 1;
    jokersTotal += 1;
  } else if (jokersNeeded > 0) {
    jokersAvailable -= jokersNeeded;
  }

  undoCount++;
  validatedSegments.push({ points: keys });

  appendHistoryEntry(keys, activeCount);
  updateCounters();
  redrawEverything();
  autoSave();
  playSuccessSound();

  return true;
}

/* ------------------------------------------------------------
   GESTION DU CLIC SUR LE CANVAS
------------------------------------------------------------ */

function handleCanvasClick(evt) {
  if (paused || gameOver) return;

  const rect = canvas.getBoundingClientRect();
  const mx = evt.clientX - rect.left;
  const my = evt.clientY - rect.top;

  const p = getNearestPoint(mx, my);
  if (!p) return;

  const key = keyFromPoint(p);

  if (!selectedStart) {
    // Premier clic
    if (!isPointActive(key)) {
      flash("Choisis un point actif pour commencer", "error");
      playErrorSound();
      return;
    }
    selectedStart = p;
    playClickSound();
    return;
  }

  // Deuxième clic
  const segmentPoints = buildSegment(selectedStart, p);
  if (!segmentPoints) {
    flash("La ligne doit faire exactement 5 points alignés", "error");
    playErrorSound();
    selectedStart = null;
    return;
  }

  const success = applyMove(segmentPoints);
  selectedStart = null;

  if (!success) return;

  // Condition de fin de partie : plus de coups possibles ?
  // (simple version : on laisse le joueur décider de s’arrêter)
}

/* ------------------------------------------------------------
   UNDO
------------------------------------------------------------ */

function undoLastMove() {
  if (historyStack.length === 0) {
    flash("Rien à annuler");
    return;
  }

  const last = historyStack.pop();
  if (last.type !== "segment") return;

  // Retirer les arêtes
  for (let i = 0; i < last.points.length - 1; i++) {
    const a = last.points[i];
    const b = last.points[i + 1];
    const edge1 = `${a}-${b}`;
    const edge2 = `${b}-${a}`;
    usedEdges.delete(edge1);
    usedEdges.delete(edge2);
  }

  // Retirer les points non permanents
  last.points.forEach(k => {
    if (!permanentPoints.has(k)) {
      activePoints.delete(k);
    }
  });

  // Retirer le segment validé
  validatedSegments = validatedSegments.filter(seg => {
    return seg.points.join("|") !== last.points.join("|");
  });

  // Score & jokers
  score = Math.max(0, score - 1);
  if (last.jokersUsed > 0) {
    jokersAvailable += last.jokersUsed;
  }

  undoCount = Math.max(0, undoCount - 1);

  updateCounters();
  redrawEverything();
  autoSave();
}

/* ------------------------------------------------------------
   FIN DE PARTIE
------------------------------------------------------------ */

function endGame() {
  gameOver = true;
  stopTimer();
  playEndGameSound();

  const isNewRecord = saveBestScore(score, timerSeconds);
  if (isNewRecord) {
    showBestScore(score, timerSeconds);
  }

  const overlay = document.getElementById("endGameOverlay");
  const finalScore = document.getElementById("finalScore");
  finalScore.textContent = `Score final : ${score}`;
  overlay.classList.remove("hidden");

  // Envoi à Supabase si connecté
  sendScoreToSupabase(score, timerSeconds, undoCount, jokersTotal);
}

function closeEndGame() {
  document.getElementById("endGameOverlay").classList.add("hidden");
}

/* ============================================================
   BLOC E — TUTORIEL COMPLET
   ============================================================ */

/* ------------------------------------------------------------
   ÉTAPES DU TUTORIEL
------------------------------------------------------------ */

const tutorialSteps = [
  {
    text: "Bienvenue ! Je vais te montrer comment créer une ligne.",
    highlight: null
  },
  {
    text: "Pour commencer, clique sur un point actif (noir).",
    highlight: "active"
  },
  {
    text: "Ensuite, clique sur un autre point aligné pour former une ligne de 5 points.",
    highlight: "aligned"
  },
  {
    text: "Si la ligne est valide, elle sera créée automatiquement.",
    highlight: null
  },
  {
    text: "Tu peux utiliser des jokers si la ligne contient peu de points actifs.",
    highlight: null
  },
  {
    text: "Le bouton Retour annule la dernière ligne.",
    highlight: "undo"
  },
  {
    text: "Le bouton Pause arrête le chrono.",
    highlight: "pause"
  },
  {
    text: "Tu peux ouvrir ce tutoriel à tout moment via le menu ☰.",
    highlight: null
  },
  {
    text: "C’est parti ! Amuse-toi bien 🙂",
    highlight: null,
    end: true
  }
];

/* ------------------------------------------------------------
   AFFICHAGE DE LA BULLE
------------------------------------------------------------ */

function showTutorialBubble(text) {
  const bubble = document.getElementById("tutorialBubble");
  bubble.textContent = text;
  bubble.classList.add("visible");
}

function hideTutorialBubble() {
  const bubble = document.getElementById("tutorialBubble");
  bubble.classList.remove("visible");
}

/* ------------------------------------------------------------
   DÉMARRAGE DU TUTORIEL
------------------------------------------------------------ */

function startTutorial() {
  tutorialRunning = true;
  currentTutorialStep = 0;
  showTutorialStep();
}

/* ------------------------------------------------------------
   AFFICHAGE D’UNE ÉTAPE
------------------------------------------------------------ */

function showTutorialStep() {
  const step = tutorialSteps[currentTutorialStep];
  if (!step) return;

  showTutorialBubble(step.text);

  // Effets visuels selon l’étape
  highlightTutorialElement(step.highlight);

  if (step.end) {
    setTimeout(() => {
      endTutorial();
    }, 2000);
  }
}

/* ------------------------------------------------------------
   MISE EN ÉVIDENCE D’ÉLÉMENTS
------------------------------------------------------------ */

function highlightTutorialElement(type) {
  const undoBtn = document.getElementById("undoBtn");
  const pauseBtn = document.getElementById("pauseBtn");

  undoBtn.classList.remove("highlight");
  pauseBtn.classList.remove("highlight");

  if (type === "undo") undoBtn.classList.add("highlight");
  if (type === "pause") pauseBtn.classList.add("highlight");
}

/* ------------------------------------------------------------
   ÉTAPE SUIVANTE
------------------------------------------------------------ */

function nextTutorialStep() {
  if (!tutorialRunning) return;

  currentTutorialStep++;
  if (currentTutorialStep >= tutorialSteps.length) {
    endTutorial();
    return;
  }

  showTutorialStep();
}

/* ------------------------------------------------------------
   FIN DU TUTORIEL
------------------------------------------------------------ */

function endTutorial() {
  tutorialRunning = false;
  hideTutorialBubble();

  const undoBtn = document.getElementById("undoBtn");
  const pauseBtn = document.getElementById("pauseBtn");

  undoBtn.classList.remove("highlight");
  pauseBtn.classList.remove("highlight");
}

/* ------------------------------------------------------------
   INTÉGRATION AVEC LE CANVAS
------------------------------------------------------------ */

function handleTutorialClick() {
  if (!tutorialRunning) return;

  // Avance le tutoriel à chaque clic
  nextTutorialStep();
}

/* ============================================================
   BLOC F — FLUX INITIAL + DOMCONTENTLOADED + MODALES + BINDINGS
   ============================================================ */

/* ------------------------------------------------------------
   OUTIL GÉNÉRIQUE POUR LES MODALES
------------------------------------------------------------ */
console.log("Bloc F : début DOMContentLoaded");

function enableModalBehavior(overlayId, panelSelector, closeFn) {
  const overlay = document.getElementById(overlayId);
  if (!overlay) return;

  const panel = overlay.querySelector(panelSelector);
  if (!panel) return;

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeFn();
  });

  panel.addEventListener("click", (e) => e.stopPropagation());
}

/* ------------------------------------------------------------
   MODALES — FERMETURES
------------------------------------------------------------ */

function closeWhySignup() {
  document.getElementById("whySignupModal").classList.add("hidden");
}

function closeLogin() {
  document.getElementById("authOverlay").classList.add("hidden");
}

function closeHelp() {
  document.getElementById("helpOverlay").classList.add("hidden");
}

function closeBestScore() {
  document.getElementById("bestScoreOverlay").classList.add("hidden");
}

function closeEndGame() {
  document.getElementById("endGameOverlay").classList.add("hidden");
}

/* ------------------------------------------------------------
   READY MODAL
------------------------------------------------------------ */

function openReadyModal() {
  document.getElementById("readyModal").classList.remove("hidden");
}

function closeReadyModal() {
  document.getElementById("readyModal").classList.add("hidden");
}

/* ------------------------------------------------------------
   WHY SIGNUP (première fois)
------------------------------------------------------------ */

function handleFirstLaunchFlow() {
  const skip = localStorage.getItem("skipWhySignup");
  if (skip) {
    openReadyModal();
    return;
  }

  document.getElementById("whySignupModal").classList.remove("hidden");
}

/* ------------------------------------------------------------
   DOMCONTENTLOADED — POINT D’ENTRÉE PRINCIPAL
------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", () => {

  /* --- MODALES --- */
  enableModalBehavior("whySignupModal", ".panel", closeWhySignup);
  enableModalBehavior("authOverlay", ".panel", closeLogin);
  enableModalBehavior("helpOverlay", ".panel", closeHelp);
  enableModalBehavior("leaderboardOverlay", ".leaderboard-panel", closeLeaderboard);
  enableModalBehavior("endGameOverlay", ".panel", closeEndGame);
  enableModalBehavior("bestScoreOverlay", ".panel", closeBestScore);

  /* --- CANVAS --- */
  canvas = document.getElementById("gameCanvas");
  ctx = canvas.getContext("2d");

  window.addEventListener("resize", () => {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    spacing = canvas.width / (size + 1);
    offset = spacing;

    redrawEverything();
  });

  /* ------------------------------------------------------------
     INITIALISATION DU JEU (CORRIGÉE)
  ------------------------------------------------------------ */

  let loaded = false;

  try {
    loaded = loadSavedGame();

    // Si la sauvegarde est vide → on l’ignore
    if (
      loaded &&
      activePoints.size === 0 &&
      permanentPoints.size === 0 &&
      validatedSegments.length === 0
    ) {
      loaded = false;
    }
  } catch {
    loaded = false;
  }

  if (!loaded) {
    initGame();
  } else {
    redrawEverything();
    updateCounters();
  }

  /* --- INITIALISATION DU JEU --- */
console.log("Bloc F : avant initGame");

initGame();
console.log("initGame() appelé");

updateSoundButton();

const session = supa.auth.session();
updateAuthUI(session?.user || null);

handleFirstLaunchFlow();


  /* --- BOUTONS TOP BAR --- */
  document.getElementById("undoBtn").addEventListener("click", undoLastMove);
  document.getElementById("pauseBtn").addEventListener("click", togglePause);

  /* --- BOUTON USER --- */
  document.getElementById("btnUser").addEventListener("click", () => {
    const session = supa.auth.session();
    const user = session?.user;

    if (!user) {
      document.getElementById("authOverlay").classList.remove("hidden");
      return;
    }

    openProfileBlock();
    showProfileView1();
  });

  /* --- PROFIL --- */
  document.getElementById("btnEditProfile").addEventListener("click", showProfileView2);
  document.getElementById("btnCancelEdit").addEventListener("click", showProfileView1);

  document.getElementById("btnLogout").addEventListener("click", async () => {
    await supa.auth.signOut();
    updateAuthUI(null);
    closeProfileBlock();
  });

  document.getElementById("btnSaveProfile").addEventListener("click", async () => {
    const session = supa.auth.session();
    const user = session?.user;
    if (!user) return;

    const newPseudo = document.getElementById("inputPseudo").value.trim();
    const newEmail = document.getElementById("inputEmail").value.trim();
    const newPassword = document.getElementById("inputPasswordNew").value.trim();
    const confirm = document.getElementById("inputPasswordConfirm").value.trim();
    const avatarFile = document.getElementById("inputAvatar").files[0];

    if (newPassword && newPassword !== confirm) {
      document.getElementById("profileErrorMessage").textContent =
        "Les mots de passe ne correspondent pas.";
      return;
    }

    const avatarUrl = await updatePlayerProfile(
      user.id,
      newPseudo,
      newEmail,
      newPassword,
      avatarFile
    );

    updateAuthUI({ id: user.id, email: newEmail || user.email });
    showProfileView1();
  });

  /* --- AUTH : LOGIN / SIGNUP --- */
  document.getElementById("loginBtn").addEventListener("click", async () => {
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value.trim();

    const { user, error } = await supa.auth.signIn({ email, password });
    if (error) {
      flash("Identifiants incorrects", "error");
      return;
    }

    updateAuthUI(user);
    closeLogin();
  });

  document.getElementById("signupBtn").addEventListener("click", async () => {
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value.trim();

    const { user, error } = await supa.auth.signUp({ email, password });
    if (error) {
      flash("Erreur lors de l'inscription", "error");
      return;
    }

    await supa.from("players").insert([{ id: user.id, pseudo: "Joueur" }]);

    updateAuthUI(user);
    closeLogin();
  });

  /* --- MENU BURGER --- */
  document.getElementById("burgerBtn").addEventListener("click", () => {
    document.getElementById("burgerOverlay").classList.toggle("show");
  });

  document.getElementById("burgerHelpBtn").addEventListener("click", () => {
    document.getElementById("helpOverlay").classList.remove("hidden");
  });

  document.getElementById("burgerLeaderboardBtn").addEventListener("click", openLeaderboard);

  document.getElementById("burgerReplayBtn").addEventListener("click", () => {
    localStorage.removeItem("currentGameState");
    location.reload();
  });

  document.getElementById("burgerSoundBtn").addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    updateSoundButton();
  });

  /* --- READY MODAL --- */
  document.getElementById("readyBtn").addEventListener("click", () => {
    closeReadyModal();
    playStartGameSound();
    startTimer();
  });

  /* --- WHY SIGNUP --- */
  document.getElementById("whySignupContinueBtn").addEventListener("click", () => {
    closeWhySignup();
    openReadyModal();
  });

  document.getElementById("whySignupRegisterBtn").addEventListener("click", () => {
    closeWhySignup();
    document.getElementById("authOverlay").classList.remove("hidden");
  });

  document.getElementById("whySignupDontRemind").addEventListener("change", (e) => {
    if (e.target.checked) {
      localStorage.setItem("skipWhySignup", "1");
    } else {
      localStorage.removeItem("skipWhySignup");
    }
  });

  /* --- CANVAS CLIC --- */
  canvas.addEventListener("click", (evt) => {
    handleCanvasClick(evt);
    handleTutorialClick(evt);
  });
});
