/// ===============================
//   VARIABLES GLOBALES
// ===============================

const SUPABASE_ANON_KEY = "sb_publishable_5dLGMNbcTZoT3_ixNE9XyA_Er8hV5Vb";

const supa = window.supabase.createClient(
  "https://gjzqghhqpycbcwykxvgw.supabase.co",
  SUPABASE_ANON_KEY
);

let currentLeaderboardPage = 1;
const LEADERBOARD_PAGE_SIZE = 10;

// ===============================
//   AUDIO WEB API - CONTEXTE
// ===============================
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

const audioBuffers = {};

async function loadSound(id, url) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const ctx = getAudioContext();
  audioBuffers[id] = await ctx.decodeAudioData(arrayBuffer);
}

// ===============================
//   PRECHARGEMENT DES SONS
// ===============================

async function preloadAllSounds() {
  getAudioContext(); // création ici si nécessaire

  await Promise.all([
    loadSound("clickSound", "sounds/click.mp3"),
    loadSound("errorSound", "sounds/error.mp3"),
    loadSound("successSound", "sounds/success.mp3"),
    loadSound("tutorialSound", "sounds/tutorial.mp3"),
    loadSound("jokerSound", "sounds/joker.mp3"),
    loadSound("jokerLossSound", "sounds/jokerloss.mp3"),
    loadSound("endGameSound", "sounds/end.mp3"),
    loadSound("startGameSound", "sounds/start.mp3"),
    loadSound("newRecordSound", "sounds/new-record.mp3")
  ]);
}

preloadAllSounds();

// ===============================
//   DEBLOCAGE AUDIO AU 1er CLIC
// ===============================

window.addEventListener("pointerdown", () => {
  const ctx = getAudioContext(); // <-- correction ici
  if (ctx.state === "suspended") {
    ctx.resume();
  }
}, { once: true });

// ===============================
//   LECTURE D'UN SON (INSTANTANÉE)
// ===============================

function playSound(id) {
  if (!soundEnabled) return;

  const ctx = getAudioContext();
  const buffer = audioBuffers[id];
  if (!buffer) return;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
}

// ===============================
//   AUTH : UTILITAIRES
// ===============================

// Fonction pour mettre à jour l'UI d'authentification
function updateAuthUI(user) {
  console.log("Updating UI with user:", user);

  const burgerAuthBtn = document.getElementById("burgerAuthBtn");
  const burgerPseudo = document.getElementById("burgerPseudo");

  if (!user) {
    if (burgerAuthBtn) burgerAuthBtn.textContent = "Se connecter";
    if (burgerPseudo) burgerPseudo.textContent = "";
    localStorage.removeItem("playerPseudo");
    localStorage.removeItem("bestScoreData");
    return;
  }

  if (burgerAuthBtn) burgerAuthBtn.textContent = "Se déconnecter";

  let fallbackPseudo = localStorage.getItem("playerPseudo") || "Joueur";
  if (burgerPseudo) burgerPseudo.textContent = fallbackPseudo;
}

// Fonction pour récupérer la session (utilise le JWT stocké)
async function getSession() {
  const token = localStorage.getItem('supabase.access.token');
  if (!token) {
    console.log("Aucun JWT trouvé.");
    return null;
  }

  const { data: { user }, error } = await supa.auth.getUser(token);
  if (error) {
    console.error("Erreur lors de la récupération de l'utilisateur :", error);
    return null;
  }

  return user;
}

// Fonction pour récupérer le pseudo
async function fetchPlayerPseudo(userId) {
  const token = localStorage.getItem('supabase.access.token');

  if (!token) {
    console.error("Aucun JWT trouvé.");
    return null;
  }

  // Configurer le client Supabase avec le JWT
  supa.auth.setSession(token);

  try {
    const { data, error } = await supa
      .from("players")
      .select("pseudo")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Erreur lors de la récupération du pseudo :", error);
      return null;
    }

    return data.pseudo;
  } catch (err) {
    console.error("Erreur inattendue lors de la récupération du pseudo :", err);
    return null;
  }
}

// Fonction pour gérer la déconnexion
async function logout() {
  console.log("Début de la déconnexion");

  // Supprimer les tokens du localStorage
  localStorage.removeItem('supabase.access.token');
  localStorage.removeItem('supabase.refresh.token');

  // Déconnecter l'utilisateur de Supabase
  const { error } = await supa.auth.signOut();

  if (error) {
    console.error("Erreur lors de la déconnexion :", error);
  }

  // Mettre à jour l'UI immédiatement
  updateAuthUI(null);

  // Recharger la page pour réinitialiser l'état
  window.location.reload();
}

// Fonction pour vérifier la session au démarrage
async function checkSessionOnStartup() {
  const { data: { session }, error } = await supa.auth.getSession();

  if (error) {
    console.error("Erreur lors de la récupération de la session :", error);
    updateAuthUI(null);
    initialFlow(null);
    return;
  }

  // Si une session existe, stocker le JWT et mettre à jour l'UI
  if (session) {
    localStorage.setItem('supabase.access.token', session.access_token);
    localStorage.setItem('supabase.refresh.token', session.refresh_token);
    updateAuthUI(session.user);
    initialFlow(session.user);
  } else {
    updateAuthUI(null);
    initialFlow(null);
  }
}

// Fonction pour mettre à jour les informations du profil
async function updateProfileInfo() {
  const user = await getSession();
  const profileBtn = document.getElementById("profileBtn");

  console.log("User in updateProfileInfo:", user);

  if (!user) {
    if (profileBtn) {
      profileBtn.disabled = true;
      console.log("Bouton désactivé");
      document.getElementById("profilePseudoDisplay").textContent = "";
      document.getElementById("profilePseudoDisplay").title = "";
      const profileAvatar = document.getElementById("profileAvatar");
      if (profileAvatar) profileAvatar.src = "images/avatarDefault.png";
    }
    return;
  } else {
    if (profileBtn) {
      profileBtn.disabled = false;
      profileBtn.removeAttribute('disabled');
      console.log("Bouton activé, disabled:", profileBtn.disabled);
    }
  }

  try {
    const { data: player, error } = await supa
      .from("players")
      .select("pseudo, avatar_url, created_at")
      .eq("id", user.id)
      .single();

    if (error) {
      throw error;
    }

    const pseudoDisplay = document.getElementById("profilePseudoDisplay");
    if (pseudoDisplay) {
      pseudoDisplay.textContent = player.pseudo || "";
      pseudoDisplay.title = player.pseudo || "";
    }

    const profileAvatar = document.getElementById("profileAvatar");
    if (profileAvatar) profileAvatar.src = player.avatar_url || "images/avatarDefault.png";

    const profileEmail = document.getElementById("profileEmail");
    if (profileEmail) profileEmail.textContent = user.email || "";

    const profileCreationDate = document.getElementById("profileCreationDate");
    if (profileCreationDate) profileCreationDate.textContent = new Date(player.created_at).toLocaleDateString() || "";
  } catch (error) {
    console.error("Erreur lors de la récupération des informations du profil :", error);
  }
}

// Fonction pour ouvrir la modale de modification du profil
async function ouvrirProfil() {
  const user = await getSession();
  if (!user) return;

  const { data: player } = await supa
    .from("players")
    .select("*")
    .eq("id", user.id)
    .single();

  document.getElementById("profilePseudoInput").value = player.pseudo || "";
  document.getElementById("profileAvatarPreview").src = player.avatar_url || "images/avatarDefault.png";

  const modal = document.getElementById("profileModal");
  modal.classList.remove("hidden");
}

// Fonction pour configurer le menu profil
function setupProfileMenu() {
  const profileBtn = document.getElementById("profileBtn");
  const profileDropdown = document.getElementById("profileDropdown");

  if (profileBtn && profileDropdown) {
    profileBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      console.log("Clic sur profileBtn");
      profileDropdown.classList.toggle("show");
      console.log("Menu déroulant affiché:", profileDropdown.classList.contains("show")); // Log de débogage
      console.log("Style display:", window.getComputedStyle(profileDropdown).display); // Log de débogage
    });

    document.addEventListener("click", (e) => {
      if (!profileDropdown.contains(e.target) && !profileBtn.contains(e.target)) {
        profileDropdown.classList.remove("show");
      }
    });
  } else {
    console.error("Élément(s) du menu profil manquant(s)");
  }
}
// --------------------------------------------------
// AIDE
// --------------------------------------------------

function openHelpOverlay(auto = false) {

  if (!auto) playClickSound();
  const overlay = document.getElementById("helpOverlay");
  const topBar = document.getElementById("topBar");

  overlay.style.paddingTop = `${topBar.offsetHeight + 20}px`;
  overlay.classList.remove("hidden");

  // Le flash ne doit apparaître que si ce n’est PAS automatique
  //if (!auto) {
  //  flash("Jeu en pause");
  //}

  window.helpAutoOpened = auto;
}

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

let readyModalAlreadyShown = false;

let currentPage = 1;
const limit = 20;
let isLoading = false;
let allScoresLoaded = false;
let loadedScores = [];

const HELP_SEEN_KEY = "helpSeen";

async function sendScoreToSupabase(userId, score, durationMs, undoCount, jokersUsed) {
  try {
    // Récupérer les scores existants du joueur connecté
    const { data: existingScores, error: fetchError } = await supa
      .from("scores")
      .select("id, score")
      .eq("player_id", userId)
      .order("score", { ascending: false })
      .limit(10);

    if (fetchError) {
      console.error("Erreur lors de la récupération des scores du joueur :", fetchError);
      return;
    }

    // Vérifier si le joueur a déjà 10 scores
    if (existingScores.length >= 10) {
	console.log(">= à 10 score :", existingScores.length);

      // Trouver le score le plus faible parmi les 10 meilleurs du joueur
      const worstScore = existingScores[existingScores.length - 1];

      // Supprimer le score le plus faible du joueur
      const { error: deleteError } = await supa
        .from("scores")
        .delete()
        .eq("id", worstScore.id);

      if (deleteError) {
        console.error("Erreur lors de la suppression du pire score :", deleteError);
        return;
      }
    }

    // Récupérer le pseudo du joueur depuis la table players
    const { data: playerData, error: playerError } = await supa
      .from("players")
      .select("pseudo")
      .eq("id", userId)
      .single();

    if (playerError) {
      console.error("Erreur lors de la récupération du pseudo du joueur :", playerError);
      return;
    }

    const pseudo = playerData.pseudo;

    // Créer un message unique basé sur les données du score
    const message = `${userId}-${score}-${durationMs}-${undoCount}-${jokersUsed}-${Date.now()}`;

    // Générer le hash
    const hash = await sha256(message);

    // Ajouter le nouveau score avec le pseudo
    const { error: insertError } = await supa
      .from("scores")
      .insert({
        player_id: userId,
        pseudo: pseudo,  // Ajouter le pseudo
        score: score,
        duration_ms: durationMs,
        undo_count: undoCount,
        jokers_used: jokersUsed,
        hash: hash,
        created_at: new Date().toISOString()
      });

    if (insertError) {
      console.error("Erreur lors de l'insertion du score :", insertError);
    }
  } catch (err) {
    console.error("Erreur inattendue lors de l'enregistrement du score :", err);
  }
}

const tutorialSteps = [
  { message: "Exemple 1 : une ligne horizontale.", start: { x: 15, y: 12 }, end: { x: 19, y: 12 } },
  { message: "Exemple 2 : une ligne verticale.",   start: { x: 15, y: 12 }, end: { x: 15, y: 16 } },
  { message: "Exemple 3 : une ligne diagonale.",   start: { x: 12, y: 16 }, end: { x: 16, y: 12 } }
];

// ===============================
//   MEILLEUR SCORE
// ===============================

async function loadMoreScores() {
  if (isLoading || allScoresLoaded) return;

  isLoading = true;
  const container = document.getElementById("leaderboardContainer");
  const { data: { session }, error } = await supa.auth.getSession();
  const user = session?.user || null;
  const isLoggedIn = !!user;

  const list = await fetchLeaderboard(currentPage, limit);
  console.log("Liste des scores récupérés :", list); // Log pour vérifier les scores récupérés

  if (list.length === 0) {
    allScoresLoaded = true;
    isLoading = false;
    return;
  }

  const newScores = list.filter(score => !loadedScores.some(loadedScore => loadedScore.created_at === score.created_at && loadedScore.score === score.score));
  loadedScores = [...loadedScores, ...newScores];

  if (newScores.length > 0) {
    renderLeaderboard(newScores, isLoggedIn, user?.id || null, true);
    currentPage++;
  }

  isLoading = false;
}

document.getElementById("leaderboardContainer").addEventListener("scroll", async () => {
  const container = document.getElementById("leaderboardContainer");
  if (container.scrollTop + container.clientHeight >= container.scrollHeight - 10) {
    await loadMoreScores();
  }
});

// Fonction pour récupérer le meilleur score depuis Supabase
async function fetchBestScore(userId) {
  try {
    const token = localStorage.getItem('supabase.access.token');
    if (!token) {
      console.error("Aucun JWT trouvé.");
      return null;
    }

    supa.auth.setSession(token);

    const { data, error } = await supa
      .from("scores")
      .select("score, duration_ms, returnsUsed:undo_count, jokersUsed:jokers_used, created_at")
      .eq("player_id", userId)
      .order("score", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error("Erreur lors de la récupération du meilleur score :", error);
      return null;
    }

    if (data) {
      data.duration = Math.floor(data.duration_ms / 1000);
      delete data.duration_ms;
    }

    return data;
  } catch (err) {
    console.error("Erreur inattendue lors de la récupération du meilleur score :", err);
    return null;
  }
}

// Fonction pour sauvegarder le meilleur score
function saveBestScore(bestScoreData) {
  if (bestScoreData) {
    localStorage.setItem("bestScoreData", JSON.stringify(bestScoreData));
  }
}

// Fonction pour mettre à jour l'affichage du meilleur score
function updateBestScoreTop() {
  const bestScoreData = localStorage.getItem("bestScoreData");
  if (bestScoreData) {
    const scoreData = JSON.parse(bestScoreData);
    const bestScoreElement = document.getElementById("bestScoreTop");
    if (bestScoreElement) {
      bestScoreElement.textContent = `Meilleur score: ${scoreData.score} en ${scoreData.duration} secondes`;
    }
  }
}

async function fetchLeaderboard(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const response = await fetch(
    `https://gjzqghhqpycbcwykxvgw.supabase.co/rest/v1/scores?select=score,duration_ms,undo_count,jokers_used,created_at,players(id,pseudo)&order=score.desc,duration_ms.asc,undo_count.asc,jokers_used.asc&limit=${limit}&offset=${offset}`,
    {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  );
  const data = await response.json();
  console.log("Scores récupérés depuis Supabase :", data); // Log pour vérifier les données retournées
  return data;
}

async function fetchPlayerScores(userId) {
  const response = await fetch(
    `https://gjzqghhqpycbcwykxvgw.supabase.co/rest/v1/scores?player_id=eq.${userId}&select=*`,
    {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  );

  const data = await response.json();
  console.log("Scores de l'utilisateur connecté :", data); // Log pour vérifier les scores de l'utilisateur
  return data;
}

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec.toString().padStart(2, "0")}s`;
}

function formatDate(value) {
  if (!value) return "";

  const normalized = value.replace(" ", "T");
  const d = new Date(normalized);

  if (isNaN(d.getTime())) return "";

  return d.toLocaleDateString("fr-FR", {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  });
}

/* ============================================================
   TITRE DU LEADERBOARD
   ============================================================ */

function renderLeaderboardHeader(isLoggedIn) {
  const title = document.getElementById("leaderboardTitle");
  const hintContainer = document.querySelector(".leaderboard-hint");

  if (!title || !hintContainer) return;

  // Titre toujours simple
  title.textContent = "Leaderboard";

  // Si non connecté → afficher le message
  if (!isLoggedIn) {
    hintContainer.textContent = "Si tu veux voir tes scores, inscris‑toi 🙂";
    hintContainer.style.display = "block";
  } else {
    // Si connecté → cacher le message
    hintContainer.style.display = "none";
  }
}



/* ============================================================
   AFFICHAGE DU LEADERBOARD (scroll + snapping)
   ============================================================ */

function truncatePseudo(pseudo) {
  return pseudo.length > 12 ? pseudo.slice(0, 12) + "…" : pseudo;
}

function renderLeaderboard(list, isLoggedIn, userId = null, append = false) {
  renderLeaderboardHeader(isLoggedIn);

  const container = document.getElementById("leaderboardContainer");
  if (!container) return;

  console.log("Liste des scores à afficher :", list); // Log pour vérifier les scores à afficher

  if (!append) {
    container.innerHTML = "";
  }

  let filteredList = [...list];

  let bestScore = null;
  if (userId) {
    const userScores = list.filter(entry => entry.players?.id === userId);
    if (userScores.length > 0) {
      bestScore = Math.max(...userScores.map(score => score.score));
    }
  }

  if (!append) {
    const header = document.createElement("div");
    header.className = "leaderboard-row leaderboard-header";
    header.innerHTML = `
      <span class="rank">#</span>
      <span class="pseudo">Pseudo</span>
      <span class="score">🏆</span>
      <span class="duration">⏱️</span>
      <span class="undo">↩️</span>
      <span class="jokers">🃏</span>
      <span class="date">📅</span>
    `;
    container.appendChild(header);
  }

  filteredList.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "leaderboard-row";

    const pseudo = truncatePseudo(entry.players?.pseudo ?? "???");
    const date = formatDate(entry.created_at);

    const rank = append ? (currentPage - 1) * limit + index + 1 : index + 1;

    row.innerHTML = `
      <span class="rank">${rank}</span>
      <span class="pseudo">${pseudo}</span>
      <span class="score">${entry.score}</span>
      <span class="duration">${formatDuration(entry.duration_ms)}</span>
      <span class="undo">${entry.undo_count}</span>
      <span class="jokers">${entry.jokers_used}</span>
      <span class="date">${date}</span>
    `;

    if (userId && entry.players?.id === userId && entry.score === bestScore) {
      row.classList.add("my-best-score");
      console.log("Meilleur score de l'utilisateur mis en évidence :", entry.score);
    }

    container.appendChild(row);
  });

  if (!append) {
    container.scrollTop = 0;
  }
}

/* ============================================================
   OUVERTURE / FERMETURE DU LEADERBOARD
   ============================================================ */

// --- OUVERTURE LEADERBOARD ---

document.getElementById("burgerLeaderboardBtn").addEventListener("click", async () => {
  playClickSound();
  pauseGame();

  const overlay = document.getElementById("leaderboardOverlay");
  overlay.classList.remove("hidden");

  const { data: { session }, error } = await supa.auth.getSession();
  const user = session?.user || null;
  const isLoggedIn = !!user;

  // Réinitialiser les variables de chargement
  currentPage = 1;
  isLoading = false;
  allScoresLoaded = false;
  loadedScores = [];

  const list = await fetchLeaderboard(currentPage, limit);
  loadedScores = [...list];
  renderLeaderboard(list, isLoggedIn, user?.id || null);
});

// Ajout du scroll event pour le chargement par lots
document.getElementById("leaderboardContainer").addEventListener("scroll", async () => {
  const container = document.getElementById("leaderboardContainer");
  if (container.scrollTop + container.clientHeight >= container.scrollHeight - 10) {
    await loadMoreScores();
  }
});

// --- FERMETURE LEADERBOARD (fonction centralisée) ---
function closeLeaderboard() {
  const overlay = document.getElementById("leaderboardOverlay");
  overlay.classList.add("hidden");

}

// --- Bouton de fermeture ---
document.getElementById("closeLeaderboardBtn").addEventListener("click", () => {
  playClickSound();
  closeLeaderboard();
});


/* ============================================================
   COMPORTEMENT MODAL DU LEADERBOARD
   ============================================================ */

const leaderboardOverlay = document.getElementById("leaderboardOverlay");
const leaderboardPanel = leaderboardOverlay.querySelector(".leaderboard-panel");

// Clic sur le fond sombre → fermer
leaderboardOverlay.addEventListener("click", (e) => {
  if (e.target === leaderboardOverlay) {
    playClickSound();
    closeLeaderboard();
  }
});

// Clic dans la fenêtre → ne pas fermer
leaderboardPanel.addEventListener("click", (e) => e.stopPropagation());


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
  const btn = document.getElementById("burgerSoundBtn");
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

function playClickSound()      { playSound("clickSound"); }
function playErrorSound()      { playSound("errorSound"); }
function playSuccessSound()    { playSound("successSound"); }
function playTutorialSound()   { playSound("tutorialSound"); }
function playJokerGainSound()  { playSound("jokerSound"); }
function playJokerLossSound()  { playSound("jokerLossSound"); }
function playEndGameSound()    { playSound("endGameSound"); }
function playStartGameSound()  { playSound("startGameSound"); }
function playNewRecordSound()  { playSound("newRecordSound"); }


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
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function startTimer() {
  if (timerInterval) return; // empêche tout double interval
  timerRunning = true;
  timerInterval = setInterval(() => {
  timerSeconds++;
  autoSave();

  document.getElementById("timerValue").textContent = formatTime(timerSeconds);
  }, 1000);
}

function stopTimer() {
  if (!timerInterval) return;
  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
}

function resetTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerSeconds = 0;
  timerRunning = false;
  document.getElementById("timerValue").textContent = "00:00";
}

function pauseGame() {
  if (gameTimer) clearInterval(gameTimer);
}

function resumeGame() {
  startGameTimer(); // ta fonction existante
}

function enableModalBehavior(overlayId, panelSelector, closeFn) {
  const overlay = document.getElementById(overlayId);
  const panel = overlay.querySelector(panelSelector);

  // Clic sur le fond sombre → fermer
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeFn();
  });

  // Clic dans la fenêtre → ne pas fermer
  panel.addEventListener("click", (e) => e.stopPropagation());
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

function snapToAlignedPoint(first, clicked, mx, my) {
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

  resumeGame();
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

async function checkGameOver() {
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

    if (isNewRecord) {
      saveBestScore(current);
      updateBestScoreTop();
      playNewRecordSound();
      showBestScorePanel();
    } else {
      showEndGamePanel();
    }

    // Récupère la session de manière asynchrone
    const { data: { session }, error } = await supa.auth.getSession();
    const user = session?.user;

    if (user) {
      console.log("User ID:", user.id); // Vérifie que l'ID est correct
      await sendScoreToSupabase(
        user.id,
        current.score,
        current.duration * 1000,
        current.returnsUsed,
        current.jokersUsed
      );
    }
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
  if (gameOver) return; // Empêche la pause après la fin de partie

  paused = true;

  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;

  document.getElementById("pauseBtn").textContent = "Reprendre";
  flash("Jeu en pause");
}

function resumeGame() {
  if (gameOver) return; // Empêche la reprise après la fin de partie

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

  const stepBtn = document.getElementById("burgerStepBtn");
  stepBtn.disabled = false;
  stepBtn.classList.remove("disabled");


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

  const tutorialBtn = document.getElementById("burgerStepBtn");
  tutorialBtn.disabled = true;
  tutorialBtn.classList.add("disabled");

  playTutorialStep();
  tutorialBtn.disabled = false;
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

  const tutorialBtn = document.getElementById("burgerStepBtn");
  tutorialBtn.disabled = false;
  tutorialBtn.classList.remove("disabled");

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

  updateBestScoreTop();

  //if (!paused && !gameOver) {
  //  startTimer();
 // }

}

// ===============================
//   FIRST LAUNCH FLOW
// ===============================

function handleFirstLaunchFlow(userFromEvent) {

  const helpAlreadySeen = localStorage.getItem(HELP_SEEN_KEY) === "true";

  if (!helpAlreadySeen) {
    openHelpOverlay(true);
    return;
  }

  initialFlow(userFromEvent);
}

// ===============================
//   INITIAL FLOW (VERSION FINALE)
// ===============================

let gameStarted = false; // global

function initialFlow(user) {
  console.log("initialFlow appelé avec user :", user);

  let lastEmail;
  let skip;

  try {
    lastEmail = localStorage.getItem("lastEmail");
    skip = localStorage.getItem("skipWhySignup") === "1";
  } catch (err) {
    console.error("Erreur d'accès à localStorage :", err);
    lastEmail = null;
    skip = false;
  }

  console.log("lastEmail :", lastEmail);
  console.log("skip :", skip);

  // 1. Utilisateur connecté → readyModal
  if (user) {
    console.log("Utilisateur connecté, affichage de readyModal...");
    showReadyModal("connected");
    return;
  }

  // 2. Joueur déconnecté mais a choisi "Ne plus me rappeler" → readyModal
  if (skip) {
    console.log("Joueur déconnecté mais a choisi 'Ne plus me rappeler', affichage de readyModal...");
    showReadyModal("skipWhySignup");
    return;
  }

  // 3. Joueur déconnecté + a déjà saisi un email → whySignupModal
  if (lastEmail) {
    console.log("Joueur déconnecté et a déjà saisi un email, affichage de whySignupModal...");
    document.getElementById("whySignupModal").classList.remove("hidden");
    return;
  }

  // 4. Nouveau joueur → whySignupModal
  if (!lastEmail) {
    console.log("Nouveau joueur, affichage de whySignupModal...");
    document.getElementById("whySignupModal").classList.remove("hidden");
    return;
  }

  // 5. Fallback (ne devrait jamais arriver)
  console.log("Fallback, affichage de authOverlay...");
  const auth = document.getElementById("authOverlay");
  auth.classList.remove("hidden");
}

function showReadyModal(reason) {
  console.log(`Affichage de readyModal pour la raison : ${reason}`);
  const modal = document.getElementById("readyModal");
  if (modal) {
    modal.classList.remove("hidden");
  } else {
    console.error("Élément readyModal non trouvé dans le DOM.");
  }
}

function closeReady() {
 document.getElementById("readyModal").classList.add("hidden");
}

// Déclarez toutes les fonctions de fermeture avant DOMContentLoaded

function closeEndGame() {
  const overlay = document.getElementById("endGameOverlay");
  if (overlay) overlay.classList.add("hidden");
}

function closeWhySignup() {
  const overlay = document.getElementById("whySignupModal");
  if (overlay) overlay.classList.add("hidden");
}

function closeLogin() {
  const auth = document.getElementById("authOverlay");
  if (auth) auth.classList.add("hidden");
}

function closeProfile() {
  const overlay = document.getElementById("profileModal");
  if (overlay) overlay.classList.add("hidden");
}

function closeHelp() {
  const overlay = document.getElementById("helpOverlay");
  if (overlay) {
    overlay.classList.add("hidden");
    if (window.helpAutoOpened) {
      localStorage.setItem("helpSeen", "true");
      const readyModal = document.getElementById("readyModal");
      if (readyModal) readyModal.classList.remove("hidden");
      if (typeof startNewGame === 'function') startNewGame();
    }
  }
}

function closeLeaderboard() {
  const overlay = document.getElementById("leaderboardOverlay");
  if (overlay) overlay.classList.add("hidden");
}

function closeBestScore() {
  const overlay = document.getElementById("bestScoreOverlay");
  if (overlay) overlay.classList.add("hidden");
}

// Assurez-vous que enableModalBehavior est définie
function enableModalBehavior(modalId, panelSelector, closeFunction) {
  const modal = document.getElementById(modalId);
  if (!modal) {
    console.error(`Modal ${modalId} not found`);
    return;
  }

  const closeBtn = modal.querySelector('.close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeFunction);
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeFunction();
    }
  });
}

// ===============================
//   DOMContentLoaded
// ===============================

document.addEventListener("DOMContentLoaded", async () => {
  // Vérifie la session au démarrage
  try {
    const { data: { session }, error } = await supa.auth.getSession();
    if (session) {
      localStorage.setItem('supabase.access.token', session.access_token);
      localStorage.setItem('supabase.refresh.token', session.refresh_token);
      if (typeof updateAuthUI === 'function') updateAuthUI(session.user);
      if (typeof initialFlow === 'function') initialFlow(session.user);
    } else {
      if (typeof updateAuthUI === 'function') updateAuthUI(null);
      if (typeof initialFlow === 'function') initialFlow(null);
    }
  } catch (err) {
    console.error("Erreur lors de la vérification de la session:", err);
    if (typeof updateAuthUI === 'function') updateAuthUI(null);
    if (typeof initialFlow === 'function') initialFlow(null);
  }

// Activation des comportements des modales
  enableModalBehavior("whySignupModal", ".panel", closeWhySignup);
  enableModalBehavior("authOverlay", ".panel", closeLogin);
  enableModalBehavior("profileModal", ".panel", closeProfile);
  enableModalBehavior("helpOverlay", ".panel", closeHelp);
  enableModalBehavior("leaderboardOverlay", ".leaderboard-panel", closeLeaderboard);
  enableModalBehavior("endGameOverlay", ".panel", closeEndGame);
  enableModalBehavior("bestScoreOverlay", ".panel", closeBestScore);

// ===============================
//   FIN DE PARTIE
// ===============================

  const closeEndGameButton = document.getElementById("closeEndGame"); // Nom différent
  if (closeEndGameButton) {
    closeEndGameButton.addEventListener("click", closeEndGame); // Utilise la fonction
  }

  // Références DOM essentielles
  const canvas = document.getElementById("gameCanvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");

// ===============================
//   CALCUL RÉEL DU CANVAS + GRILLE
// ===============================
  canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    if (typeof size !== 'undefined') {
      const spacing = canvas.width / (size + 1);
      const offset = spacing;

// ===============================
//   POSITIONNEMENT DES REPÈRES
// ===============================
      const topLabels = document.querySelectorAll('#topLabels span');
      const leftLabels = document.querySelectorAll('#leftLabels span');

      if (topLabels.length && leftLabels.length) {
        topLabels.forEach(span => {
          const pos = Number(span.textContent);
          if (!Number.isFinite(pos)) return;
          span.style.left = `${offset + (pos - 1) * spacing - 6}px`;
        });

        leftLabels.forEach(span => {
          const pos = Number(span.textContent);
          if (!Number.isFinite(pos)) return;
          span.style.top = `${offset + (pos - 1) * spacing - 6}px`;
        });
      }
    }
  }

  // ===============================
  //   CLIC SUR LA GRILLE
  // ===============================
  if (canvas) {
    canvas.addEventListener("click", (e) => {
      if (gameOver) return;
      if (!tutorialRunning && !timerRunning) {
        if (typeof startTimer === 'function') startTimer();
      }
      if (tutorialRunning) return;
      if (paused && typeof resumeGame === 'function') resumeGame();

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const nearest = getNearestPoint(mx, my);
      if (!nearest) {
        if (typeof flash === 'function') flash("Hors grille", "error");
        if (typeof playErrorSound === 'function') playErrorSound();
        selectedStart = null;
        return;
      }

      const { x, y } = nearest;

      if (!selectedStart) {
        selectedStart = { x, y };
        return;
      }

      const result = getSegmentBetween(selectedStart, { x, y });
      selectedStart = null;

      if (result) {
        if (typeof playSuccessSound === 'function') playSuccessSound();
        validatedSegments.push(result);
        if (typeof drawSegment === 'function') drawSegment(result.points);
        score++;

        const stepBtn = document.getElementById("burgerStepBtn");
        if (stepBtn) {
          stepBtn.disabled = true;
          stepBtn.classList.add("disabled");
        }

        if (typeof updateCounters === 'function') updateCounters();
        if (typeof appendHistoryEntry === 'function') appendHistoryEntry(result.points, result.activeCount);
        if (typeof checkGameOver === 'function') checkGameOver();
      }
    });
  }


// ===============================
//   BOUTONS TOP BAR
// ===============================

  document.getElementById("undoBtn").addEventListener("click", () => {
    playClickSound();
    if (!tutorialRunning) undoLastMove();
  });

  document.getElementById("pauseBtn").addEventListener("click", () => {
    playClickSound();
    if (!tutorialRunning) togglePause();
  });


// ===============================
//   AIDE
// ===============================
  const closeHelpBtn = document.getElementById("closeHelpBtn");
  if (closeHelpBtn) {
    closeHelpBtn.addEventListener("click", () => {
      if (typeof playClickSound === 'function') playClickSound();
      if (typeof closeHelp === 'function') closeHelp();
    });
  }

// ===============================
  //   MENU BURGER
  // ===============================
  const burgerBtn = document.getElementById("burgerBtn");
  if (burgerBtn) {
    burgerBtn.addEventListener("click", () => {
      if (typeof playClickSound === 'function') playClickSound();
      const ov = document.getElementById("burgerOverlay");
      if (ov) ov.classList.toggle("show");
    });
  }

  document.addEventListener("click", (e) => {
    const menu = document.getElementById("burgerOverlay");
    const burger = document.getElementById("burgerBtn");
    if (menu && burger && !menu.contains(e.target) && e.target !== burger) {
      menu.classList.remove("show");
    }
  });

  // ===============================
  //   AUTH BURGER (v1)
  // ===============================
  const burgerAuthBtn = document.getElementById("burgerAuthBtn");
  if (burgerAuthBtn) {
    burgerAuthBtn.addEventListener("click", async () => {
      console.log("Clic sur le bouton d'authentification");
      if (typeof playClickSound === 'function') playClickSound();
      const user = await getSession();
      if (!user) {
        console.log("Ouverture de la fenêtre de connexion");
        const authOverlay = document.getElementById("authOverlay");
        if (authOverlay) authOverlay.classList.remove("hidden");
        if (typeof pauseGame === 'function') pauseGame();
        return;
      }
      console.log("Début de la déconnexion");
      if (typeof logout === 'function') await logout();
    });
  }

// ===============================
  //   AUTRES ÉCOUTEURS DE BOUTONS
  // ===============================
  const burgerReplayBtn = document.getElementById("burgerReplayBtn");
  if (burgerReplayBtn) {
    burgerReplayBtn.addEventListener("click", () => {
      if (typeof playClickSound === 'function') playClickSound();
      localStorage.removeItem("currentGameState");
      if (typeof startNewGame === 'function') startNewGame();
      if (typeof initGame === 'function') initGame();
    });
  }

  const burgerStepBtn = document.getElementById("burgerStepBtn");
  if (burgerStepBtn) {
    burgerStepBtn.addEventListener("click", () => {
      if (typeof playClickSound === 'function') playClickSound();
      if (!tutorialRunning) {
        localStorage.removeItem("currentGameState");
        const readyModal = document.getElementById("readyModal");
        if (readyModal) readyModal.classList.add("hidden");
        if (typeof resetGameState === 'function') resetGameState();
        if (typeof initMaltaCross === 'function') initMaltaCross();
        if (typeof redrawEverything === 'function') redrawEverything();
        if (typeof initGame === 'function') initGame();
        if (typeof runTutorial === 'function') runTutorial();
      }
    });
  }

  const burgerHelpBtn = document.getElementById("burgerHelpBtn");
  if (burgerHelpBtn) {
    burgerHelpBtn.addEventListener("click", () => {
      if (typeof openHelpOverlay === 'function') openHelpOverlay(false);
      if (typeof pauseGame === 'function') pauseGame();
    });
  }

  const burgerSoundBtn = document.getElementById("burgerSoundBtn");
  if (burgerSoundBtn) {
    burgerSoundBtn.addEventListener("click", () => {
      if (typeof playClickSound === 'function') playClickSound();
      soundEnabled = !soundEnabled;
      if (typeof updateSoundButton === 'function') updateSoundButton();
    });
  }

// ===============================
//   READY BUTTON
// ===============================
  const readyBtn = document.getElementById("readyBtn");
  if (readyBtn) {
    readyBtn.addEventListener("click", () => {
      if (typeof playClickSound === 'function') playClickSound();
      const readyModal = document.getElementById("readyModal");
      if (readyModal) readyModal.classList.add("hidden");
      if (typeof initGame === 'function') initGame();
      const board = document.getElementById("canvasContainer");
      if (board) {
        board.classList.remove("show");
        board.classList.add("slide-in-premium");
        void board.offsetWidth;
        board.classList.add("show");
        setTimeout(() => {
          if (typeof playStartGameSound === 'function') playStartGameSound();
        }, 1500);
      }
    });
  } 

  // ===============================
  //   ÉCOUTEURS DE CONNEXION/INSCRIPTION
  // ===============================

  // Écouteur pour le bouton "Se connecter"
  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) {
    loginBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (typeof playClickSound === 'function') playClickSound();

      const email = document.getElementById("authEmail")?.value.trim();
      const password = document.getElementById("authPassword")?.value.trim();

      if (!email || !password) {
        alert("Veuillez remplir tous les champs.");
        return;
      }

      if (!email.includes("@") || !email.includes(".")) {
        alert("Adresse email invalide.");
        return;
      }

      try {
        console.log("Tentative de connexion avec email:", email);
        const { data, error } = await supa.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          console.error("Erreur de connexion :", error);
          alert("Erreur : " + error.message);
          return;
        }

        // Récupérer la session après la connexion
        const { data: { session }, error: sessionError } = await supa.auth.getSession();

        if (sessionError || !session) {
          console.error("Erreur récupération session :", sessionError);
          alert("Impossible de récupérer la session.");
          return;
        }

        // Stocker le JWT après connexion
        localStorage.setItem('supabase.access.token', session.access_token);
        localStorage.setItem('supabase.refresh.token', session.refresh_token);

        // Fermer la fenêtre de connexion
        const authOverlay = document.getElementById("authOverlay");
        if (authOverlay) authOverlay.classList.add("hidden");

        // Mettre à jour l'UI
        if (typeof updateAuthUI === 'function') await updateAuthUI(session.user);
        if (typeof updateProfileInfo === 'function') await updateProfileInfo();

        // Récupérer le meilleur score depuis Supabase
        if (typeof fetchBestScore === 'function') {
          const bestScoreData = await fetchBestScore(session.user.id);
          if (bestScoreData && typeof saveBestScore === 'function') {
            saveBestScore(bestScoreData);
            console.log("Meilleur score récupéré depuis Supabase et sauvegardé dans localStorage :", bestScoreData);
          }
        }

        // Mettre à jour l'affichage du meilleur score
        if (typeof updateBestScoreTop === 'function') updateBestScoreTop();
      } catch (err) {
        console.error("Erreur inattendue lors de la connexion :", err);
        alert("Une erreur inattendue est survenue.");
      }
    });
  }

  // Écouteur pour le bouton "S'inscrire"
  const signupBtn = document.getElementById("signupBtn");
  if (signupBtn) {
    signupBtn.addEventListener("click", () => {
      if (typeof playClickSound === 'function') playClickSound();
      const authOverlay = document.getElementById("authOverlay");
      const signupModal = document.getElementById("signupModal");
      if (authOverlay) authOverlay.classList.add("hidden");
      if (signupModal) signupModal.classList.remove("hidden");
    });
  }

  // Écouteur pour le bouton "Confirmer l'inscription"
  const signupConfirmBtn = document.getElementById("signupConfirmBtn");
  if (signupConfirmBtn) {
    signupConfirmBtn.addEventListener("click", async () => {
      if (typeof playClickSound === 'function') playClickSound();

      const email = document.getElementById("authEmail")?.value.trim();
      const password = document.getElementById("authPassword")?.value.trim();
      const pseudo = document.getElementById("signupPseudoInput")?.value.trim();

      if (!email || !password || !pseudo) {
        alert("Merci de remplir tous les champs.");
        return;
      }

      try {
        // Vérification pseudo unique
        const { data: existingPseudo, error: checkPseudoError } = await supa
          .from("players")
          .select("id")
          .eq("pseudo", pseudo)
          .maybeSingle();

        if (checkPseudoError && checkPseudoError.code !== "PGRST116") {
          console.error("Erreur SELECT pseudo :", checkPseudoError);
          alert("Erreur interne.");
          return;
        }

        if (existingPseudo) {
          alert("Ce pseudo est déjà pris.");
          return;
        }

        // Inscription de l'utilisateur
        const { data: signupData, error: signupError } = await supa.auth.signUp({
          email,
          password
        });

        if (signupError) {
          console.error("Erreur lors de l'inscription :", signupError);
          alert("Erreur lors de l'inscription : " + signupError.message);
          return;
        }

        // Connexion automatique après l'inscription
        const { error: signinError, data: signinData } = await supa.auth.signInWithPassword({
          email,
          password
        });

        if (signinError) {
          console.error("Erreur lors de la connexion après inscription :", signinError);
          alert("Erreur lors de la connexion : " + signinError.message);
          return;
        }

        // Récupérer la session après la connexion
        const { data: { session }, error: sessionError } = await supa.auth.getSession();

        if (sessionError || !session) {
          console.error("Erreur récupération session :", sessionError);
          alert("Impossible de récupérer la session.");
          return;
        }

        // Stocker le JWT après connexion
        localStorage.setItem('supabase.access.token', session.access_token);
        localStorage.setItem('supabase.refresh.token', session.refresh_token);

        const userId = session.user.id;
        console.log("ID de l'utilisateur :", userId);

        // Vérifier si le joueur existe déjà dans la table players
        const { data: existingPlayer, error: checkPlayerError } = await supa
          .from("players")
          .select("id")
          .eq("id", userId)
          .maybeSingle();

        if (checkPlayerError && checkPlayerError.code !== "PGRST116") {
          console.error("Erreur SELECT player :", checkPlayerError);
          alert("Erreur interne.");
          return;
        }

        // Insertion dans players
        if (existingPlayer) {
          console.log("Le joueur existe déjà dans la table players, mise à jour du pseudo...");

          const { error: updateError } = await supa
            .from("players")
            .update({
              pseudo: pseudo
            })
            .eq("id", userId);

          if (updateError) {
            console.error("Erreur UPDATE player :", updateError);
            alert("Erreur lors de la mise à jour du joueur : " + updateError.message);
          } else {
            console.log("Pseudo mis à jour avec succès dans la table players.");
          }
        } else {
          console.log("Insertion d'un nouveau joueur dans la table players...");
          const { error: insertError } = await supa
            .from("players")
            .insert({
              id: userId,
              pseudo: pseudo,
              created_at: new Date().toISOString(),
              premium: false
            });

          if (insertError) {
            console.error("Erreur INSERT player :", insertError);
            alert("Erreur lors de l’enregistrement du joueur : " + insertError.message);
          } else {
            console.log("Joueur inséré avec succès dans la table players.");
          }
        }

        // Mise à jour UI
        if (typeof updateAuthUI === 'function') updateAuthUI(session.user);

        // Fermeture modals
        const signupModal = document.getElementById("signupModal");
        if (signupModal) signupModal.classList.add("hidden");
        if (typeof playSound === 'function') playSound("successSound");
        alert("Compte créé ! Bienvenue dans le jeu.");
      } catch (err) {
        console.error("Erreur inattendue lors de l'inscription :", err);
        alert("Une erreur inattendue est survenue.");
      }
    });
  }

  // ===============================
  //   GESTION DU MENU PROFIL
  // ===============================
  const profileBtn = document.getElementById("profileBtn");
  const profileDropdown = document.getElementById("profileDropdown");

  if (profileBtn && profileDropdown) {
    profileBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      console.log("Clic sur profileBtn");
      profileDropdown.classList.toggle("show");
      console.log("Menu déroulant affiché:", profileDropdown.classList.contains("show"));
    });

    document.addEventListener("click", (e) => {
      if (!profileDropdown.contains(e.target) && !profileBtn.contains(e.target)) {
        profileDropdown.classList.remove("show");
      }
    });
  } else {
    console.error("Élément(s) du menu profil manquant(s)");
  }

  // Écouteur pour afficher/masquer le mot de passe
  const togglePasswordVisibilityBtn = document.getElementById("togglePasswordVisibility");
  if (togglePasswordVisibilityBtn) {
    togglePasswordVisibilityBtn.addEventListener("click", () => {
      const passwordSpan = document.getElementById("profilePassword");
      if (passwordSpan) {
        if (passwordSpan.textContent === "••••••••") {
          passwordSpan.textContent = "motdepasse"; // Remplacez par la logique réelle
        } else {
          passwordSpan.textContent = "••••••••";
        }
      }
    });
  }

  // Écouteur pour la déconnexion
  const logoutProfileBtn = document.getElementById("logoutProfileBtn");
  if (logoutProfileBtn) {
    logoutProfileBtn.addEventListener("click", async () => {
      if (typeof logout === 'function') await logout();
      if (profileDropdown) profileDropdown.classList.remove("show");
    });
  }

  // Écouteur pour ouvrir la modale de modification du profil
  const editProfileBtn = document.getElementById("editProfileBtn");
  if (editProfileBtn) {
    editProfileBtn.addEventListener("click", async () => {
      if (typeof ouvrirProfil === 'function') await ouvrirProfil();
    });
  }

  // Mettre à jour les informations du profil
  if (typeof updateProfileInfo === 'function') updateProfileInfo();

  

  

// ===============================
//   WHY SIGNUP
// ===============================

document.getElementById("whySignupRegisterBtn").addEventListener("click", () => {
  playClickSound();
  closeWhySignup();
  document.getElementById("authOverlay").classList.remove("hidden");
});

document.getElementById("whySignupContinueBtn").addEventListener("click", () => {
  playClickSound();

  const dontRemind = document.getElementById("whySignupDontRemind").checked;
  if (dontRemind) localStorage.setItem("skipWhySignup", "1");

  closeWhySignup();
  document.getElementById("readyModal").classList.remove("hidden");
});
  
});
