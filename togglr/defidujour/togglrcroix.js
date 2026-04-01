const grid = document.getElementById('grid');
    const movesDisplay = document.getElementById('moves');
    const timeDisplay = document.getElementById('time');
    const startButton = document.getElementById('startButton');
    const resetButton = document.getElementById('resetButton');
    const victoryPopup = document.getElementById('victory-popup');
    const victoryTime = document.getElementById('victory-time');
    const victoryMoves = document.getElementById('victory-moves');

    const rows = 6;
    const cols = 6;
    let cells = [];
    let moves = 0;
    let time = 0;
    let timer;
    let gameStarted = false;
    let gameWon = false;

    // Forme cible (exemple - à remplacer par la forme du jour)
    const target = [
      [1, 1, 0, 0, 1, 1],
      [1, 1, 0, 0, 1, 1],
      [1, 1, 0, 0, 1, 1],
      [1, 1, 0, 0, 1, 1],
      [1, 1, 0, 0, 1, 1],
      [1, 1, 0, 0, 1, 1]
    ];

    // Initialisation de la grille
 function initGrid() {
  grid.innerHTML = '';
  cells = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (target[i][j] === 1) {
        cell.classList.add('blue'); // Points non-cibles en bleu
      } else {
        cell.classList.add('white'); // Points cibles en blanc
      }
      cell.dataset.row = i;
      cell.dataset.col = j;
      cell.addEventListener('click', () => toggleCell(i, j));
      grid.appendChild(cell);
      cells.push(cell);
    }
  }
  gameWon = false;
}

function updateTimeDisplay() {
  const minutes = Math.floor(time / 60);
  const seconds = time % 60;
  timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

    // Inverser la couleur d'une cellule et de ses voisins
function toggleCell(row, col) {
  if (!gameStarted || gameWon) return;

  const index = row * cols + col;
  const isTargetCell = target[row][col] === 0; // Vérifie si c'est un point de la forme cible

  // Ajoute l'effet de clic
  cells[index].classList.add('clicked');

  // Retire l'effet après un court délai
  setTimeout(() => {
    cells[index].classList.remove('clicked');
  }, 300);

  // Logique spécifique pour les points de la forme cible
  if (isTargetCell) {
    if (cells[index].classList.contains('dark-blue')) {
      cells[index].classList.replace('dark-blue', 'white');
    } else if (cells[index].classList.contains('white')) {
      cells[index].classList.replace('white', 'dark-blue');
    }
  } else {
    cells[index].classList.toggle('blue');
  }

  // Gestion des voisins
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  directions.forEach(([dr, dc]) => {
    const newRow = row + dr;
    const newCol = col + dc;
    if (newRow >= 0 && newRow < rows && newCol >= 0 && newCol < cols) {
      const neighborIndex = newRow * cols + newCol;
      const isNeighborTargetCell = target[newRow][newCol] === 0;

      if (isNeighborTargetCell) {
        if (cells[neighborIndex].classList.contains('dark-blue')) {
          cells[neighborIndex].classList.replace('dark-blue', 'white');
        } else if (cells[neighborIndex].classList.contains('white')) {
          cells[neighborIndex].classList.replace('white', 'dark-blue');
        }
      } else {
        cells[neighborIndex].classList.toggle('blue');
      }
    }
  });

  moves++;
  movesDisplay.textContent = moves;
  checkWin();
}

    // Inverser la couleur d'une cellule
    function toggleColor(row, col) {
      const index = row * cols + col;
      cells[index].classList.toggle('blue');
    }

    // Vérifier si le joueur a gagné
 function checkWin() {
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const index = i * cols + j;
      const isTargetCell = target[i][j] === 0; // Vérifie si c'est un point de la forme cible

      if (isTargetCell) {
        // Les points de la forme cible doivent être blancs
        if (!cells[index].classList.contains('white')) {
          return; // Si un point cible n'est pas blanc, le joueur n'a pas encore gagné
        }
      } else {
        // Les autres points doivent être bleus
        if (!cells[index].classList.contains('blue')) {
          return; // Si un point non-cible n'est pas bleu, le joueur n'a pas encore gagné
        }
      }
    }
  }

  // Si on arrive ici, le joueur a gagné
  gameWon = true;
  clearInterval(timer);

  const minutes = Math.floor(time / 60);
  const seconds = time % 60;
  victoryTime.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  victoryMoves.textContent = moves;
  victoryPopup.style.display = 'block';

  // Masquer la pop-up après quelques secondes
  setTimeout(() => {
    victoryPopup.style.display = 'none';
  }, 3000);
}

// Démarrer le jeu
function startGame() {
  const startButton = document.getElementById('startButton');
  startButton.classList.remove('blink'); // Désactive le clignotement

  cells.forEach((cell, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const isTargetCell = target[row][col] === 0;

    if (isTargetCell) {
      cell.classList.replace('white', 'dark-blue');
    } else {
      cell.classList.add('blue');
      cell.classList.remove('white');
    }
  });

  gameStarted = true;
  moves = 0;
  movesDisplay.textContent = moves;
  time = 0;
  updateTimeDisplay();

  if (timer) {
    clearInterval(timer);
  }

  timer = setInterval(() => {
    time++;
    updateTimeDisplay();
  }, 1000);

  gameWon = false;
}
    // Recommencer le jeu
    function resetGame() {
      clearInterval(timer);
      initGrid();
      gameStarted = false;
      moves = 0;
      movesDisplay.textContent = moves;
      time = 0;
      updateTimeDisplay();
      victoryPopup.style.display = 'none';
    }

    // Écouteurs d'événements
    startButton.addEventListener('click', startGame);
    resetButton.addEventListener('click', resetGame);
    window.addEventListener('load', function() {
      const startButton = document.getElementById('startButton');
      startButton.classList.add('blink');
    });

    // Initialisation
    initGrid();