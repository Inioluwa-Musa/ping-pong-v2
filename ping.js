const canvas = document.getElementById('pingpongCanvas');
const c = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 600;
canvas.style.background = "#000";

const PADDLE_WIDTH = 15;
const PADDLE_HEIGHT = 100;
const ballRadius = 10;
const winningScore = 7;
let start = false;
let gameIsOver = false;
let gameMode = null; 
let difficulty = null;

// --- GLOBAL STATE & CUSTOMIZATION ---
let isPaused = false; 
let player1DisplayName = "Player 1";
let player1PaddleColor = "white";
let player1PaddleTColor = "white";

// --- CURRENCY AND CUSTOMIZATION STATE ---
let coins = 0;
let currentPaddlePattern = 'none';
let currentBallPattern = 'default';
let currentPaddleTrail = 'none';

// Only true "no effect" defaults are unlocked initially.
let ownedPaddlePatterns = ['none']; 
let ownedBallPatterns = ['default']; 
let ownedPaddleTrails = ['none']; 

let paddleTrail = []; 

// ===== CHARACTER SYSTEM =====
let activeCharacter = null;
let ownedCharacters = [];
let ghostAbilityUsed = false; // Track if Ghost ability was used this round

const characters = {
    dash: {
        id: 'dash',
        name: 'Dash',
        description: 'The Speedster',
        ability: 'Increases paddle movement speed by 25%',
        price: 50,
        glowColor: '#00f2ff', // Cyan
        speedMultiplier: 1.25,
        icon: '⚡'
    },
    titan: {
        id: 'titan',
        name: 'Titan',
        description: 'The Wall',
        ability: 'Increases paddle height by 20%, slightly slower movement',
        price: 50,
        glowColor: '#ffd700', // Gold
        heightMultiplier: 1.2,
        speedMultiplier: 0.85,
        icon: '🛡️'
    },
    magneto: {
        id: 'magneto',
        name: 'Magneto',
        description: 'The Curver',
        ability: 'Magnetic pull attracts ball toward paddle center',
        price: 50,
        glowColor: '#9d00ff', // Purple
        magneticRange: 60,
        magneticStrength: 0.3,
        icon: '🧲'
    },
    ghost: {
        id: 'ghost',
        name: 'Ghost',
        description: 'Phase Master',
        ability: 'Once per round: edge hits trigger soft bounce',
        price: 50,
        glowColor: '#00ffaa', // Teal
        edgeThreshold: 0.8, // 80% from center triggers ability
        slowdownFactor: 0.4,
        icon: '👻'
    },
    midas: {
        id: 'midas',
        name: 'Midas',
        description: 'Gold-Getter',
        ability: 'Permanently doubles coin rewards',
        price: 50,
        glowColor: '#ffaa00', // Orange-Gold
        coinMultiplier: 2,
        icon: '💰'
    }
};

// Prices for all cosmetic items, including the entry-level ones.
const ITEM_PRICES = {
    // Basic Cosmetics (Now Locked)
    'stripes_pat': 10, 
    'dot_pat': 10, 
    'basic_trail': 10, 
    
    // Tier 1 Paid Cosmetics
    'dots_pat': 50,
    'chevrons': 100,
    // Tier 2 Paid Cosmetics
    'grid_pattern': 75,
    'ring_pattern': 125,
    'wavy_trail': 150,
    'fire_trail': 75
};

const ITEM_DISPLAY_NAMES = {
    // True Defaults (No effect, free/unlocked)
    'none': 'None (Plain)', 
    'default': 'Default (White Ball)', 
    
    // Basic Cosmetic Items (Now Locked, must be purchased)
    'stripes_pat': 'Stripes',
    'dot_pat': 'Dots Pattern',
    'basic_trail': 'Basic Trail',

    // Paid Cosmetics
    'dots_pat': 'Small Dots Pattern',
    'chevrons': 'Chevrons Pattern',
    'grid_pattern': 'Grid Pattern',
    'ring_pattern': 'Ring Pattern',
    'fire_trail': 'Fire Trail',
    'wavy_trail': 'Wavy Trail'
};


// Tournament state variables
let tournamentPlayers = [];
let tournamentMatches = []; 
let currentMatchIndex = -1;

// AI Movement Speed Configuration
const AI_SPEEDS = {
    'easy': 2,
    'medium': 4,
    'hard': 5.5
};

// --- Game Object Definitions ---
const player1 = {
    x: 10,
    y: canvas.height / 2 - PADDLE_HEIGHT / 2,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
    dy: 0,
    score: 0,
    color: 'white',
    isStriking: false,
    name: "Player 1",
    paddleTC: "white",
};

const player2 = {
    x: canvas.width - 10 - PADDLE_WIDTH,
    y: canvas.height / 2 - PADDLE_HEIGHT / 2,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
    dy: 0,
    score: 0,
    color: 'white',
    name: 'Player 2/AI'
};

const ball = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: ballRadius,
    speedX: 0,
    speedY: 0,
    color: 'white',
    owner: 'default' 
};

// =================================================================
// --- CHARACTER ABILITY FUNCTIONS ---
// =================================================================

function getCharacterSpeedMultiplier() {
    if (!activeCharacter) return 1;
    
    const char = characters[activeCharacter];
    if (char.id === 'dash') return char.speedMultiplier;
    if (char.id === 'titan') return char.speedMultiplier;
    
    return 1;
}

function getCharacterHeightMultiplier() {
    if (!activeCharacter) return 1;
    
    const char = characters[activeCharacter];
    if (char.id === 'titan') return char.heightMultiplier;
    
    return 1;
}

function applyMagneticPull() {
    if (!activeCharacter || activeCharacter !== 'magneto') return;
    
    const char = characters.magneto;
    const paddleCenterY = player1.y + player1.height / 2;
    const distance = Math.abs(ball.x - (player1.x + player1.width));
    
    // Only apply when ball is close and moving towards paddle
    if (distance < char.magneticRange && ball.speedX < 0) {
        const pullY = (paddleCenterY - ball.y) * char.magneticStrength;
        ball.y += pullY;
    }
}

function checkGhostAbility(paddle) {
    if (!activeCharacter || activeCharacter !== 'ghost' || ghostAbilityUsed) return false;
    
    const char = characters.ghost;
    const paddleCenterY = paddle.y + paddle.height / 2;
    const hitDistanceFromCenter = Math.abs(ball.y - paddleCenterY);
    const maxDistance = paddle.height / 2;
    const normalizedDistance = hitDistanceFromCenter / maxDistance;
    
    // If ball hits the edge (80% or more from center)
    if (normalizedDistance >= char.edgeThreshold) {
        ghostAbilityUsed = true;
        
        // Trigger soft bounce - slow down the ball significantly
        ball.speedX *= char.slowdownFactor;
        ball.speedY *= char.slowdownFactor;
        
        // Show notification
        if (window.showNotification) {
            window.showNotification('Ghost Ability: Soft Bounce!', '👻');
        }
        
        // Add visual effect
        if (window.shakeCanvas) {
            window.shakeCanvas();
        }
        
        return true;
    }
    
    return false;
}

function getCoinReward(baseAmount) {
    if (!activeCharacter || activeCharacter !== 'midas') return baseAmount;
    
    const char = characters.midas;
    return Math.floor(baseAmount * char.coinMultiplier);
}

function applyCharacterGlow() {
    if (!activeCharacter) return 'white';
    
    const char = characters[activeCharacter];
    return char.glowColor;
}

// =================================================================
// --- MUSIC PLAYER & PLAYLIST LOGIC ---
// =================================================================
const musicPlayer = document.getElementById('gameMusic');
const playlist = [
    'music_track1.mp3',
    'music_track2.mp3'
];
let currentTrackIndex = 0;

function setupMusicPlayer() {
    if (!musicPlayer) return;

    musicPlayer.src = playlist[currentTrackIndex];
    musicPlayer.volume = 0.5; 
    musicPlayer.muted = false;
    musicPlayer.load();
    
    musicPlayer.addEventListener('ended', playNextTrack);

    musicPlayer.play().catch(error => {
        console.log("Music Autoplay prevented. Music will start once user interacts with the page.");
    });
}

function playNextTrack() {
    if (!musicPlayer) return;
    
    currentTrackIndex++;
    
    if (currentTrackIndex >= playlist.length) {
        currentTrackIndex = 0; 
    }
    
    musicPlayer.src = playlist[currentTrackIndex];
    musicPlayer.load();
    musicPlayer.play().catch(error => {
        console.log("Failed to play next track.");
    });
}

// =================================================================
// --- CORE GAME UTILITY FUNCTIONS ---
// =================================================================

function resetBall() {
    ball.x = canvas.width / 2;
    ball.y = canvas.height / 2;
    ball.speedX = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 3 + 2);
    ball.speedY = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 3 + 2);
    ball.owner = 'default';
    ghostAbilityUsed = false; // Reset Ghost ability for new round
    start = true; 
}

function drawBall(x, y, radius, color, pattern) {
    c.fillStyle = color;
    c.beginPath();
    c.arc(x, y, radius, 0, Math.PI * 2);
    c.fill();
    c.closePath();

    c.fillStyle = 'rgba(0, 0, 0, 0.5)';

    switch (pattern) {
        case 'dot_pat':
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    c.beginPath();
                    c.arc(x + (i - 1) * 5, y + (j - 1) * 5, 0.8, 0, Math.PI * 2);
                    c.fill();
                    c.closePath();
                }
            }
            break;
        case 'grid_pattern':
            c.strokeStyle = 'rgba(0, 0, 0, 0.6)';
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(x - 5, y); c.lineTo(x + 5, y);
            c.moveTo(x, y - 5); c.lineTo(x, y + 5);
            c.stroke();
            break;
        case 'ring_pattern':
            c.strokeStyle = 'rgba(0, 0, 0, 0.6)';
            c.lineWidth = 1;
            c.beginPath();
            c.arc(x, y, 3, 0, Math.PI * 2);
            c.stroke();
            c.beginPath();
            c.arc(x, y, 6, 0, Math.PI * 2);
            c.stroke();
            break;
        case 'default':
        case 'none':
            break;
    }
}

function drawPaddle(x, y, w, h, color, name, pattern) {
    // Apply character glow if active
    const finalColor = (name === player1DisplayName && activeCharacter) 
        ? applyCharacterGlow() 
        : color;
    
    c.fillStyle = finalColor;
    c.fillRect(x, y, w, h);
    
    // Add glow effect for active character
    if (name === player1DisplayName && activeCharacter) {
        c.shadowBlur = 20;
        c.shadowColor = finalColor;
        c.fillRect(x, y, w, h);
        c.shadowBlur = 0;
    }
    
    if (name === player1DisplayName && pattern !== 'none') {
        c.fillStyle = 'rgba(255, 255, 255, 0.7)';
        
        switch (pattern) {
            case 'stripes_pat':
                for (let i = 0; i < h; i += 15) {
                    c.fillRect(x, y + i, w, 5);
                }
                break;
            case 'dots_pat':
                for (let i = 1; i < w / 3; i++) {
                    for (let j = 1; j < h / 3; j++) {
                        c.beginPath();
                        c.arc(x + i * 3, y + j * 3, 1, 0, Math.PI * 2);
                        c.fill();
                        c.closePath();
                    }
                }
                break;
            case 'chevrons':
                c.strokeStyle = 'rgba(255, 255, 255, 0.7)';
                c.lineWidth = 1;
                for (let i = 0; i < h; i += 10) {
                    c.beginPath();
                    c.moveTo(x + w, y + i);
                    c.lineTo(x, y + i + 5);
                    c.lineTo(x + w, y + i + 10);
                    c.stroke();
                }
                break;
        }
    }
}

function drawNet() {
    c.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    c.lineWidth = 2;
    c.setLineDash([10, 10]);
    c.beginPath();
    c.moveTo(canvas.width / 2, 0);
    c.lineTo(canvas.width / 2, canvas.height);
    c.stroke();
    c.setLineDash([]);
}

function drawScore() {
    c.fillStyle = 'white';
    c.font = '32px Arial';
    c.fillText(player1.score, canvas.width / 4, 50);
    c.fillText(player2.score, (canvas.width * 3) / 4, 50);
}

function drawPaddleTrail(trailColor) {
    if (currentPaddleTrail === 'none' || paddleTrail.length === 0) return;
    
    for (let i = 0; i < paddleTrail.length; i++) {
        let trail = paddleTrail[i];
        let alpha = trail.life / 30;
        
        if (currentPaddleTrail === 'basic_trail') {
            c.fillStyle = `rgba(255, 255, 255, ${alpha * 0.3})`;
            c.fillRect(trail.x, trail.y, player1.width, player1.height);
        } else if (currentPaddleTrail === 'fire_trail') {
            let gradient = c.createLinearGradient(trail.x, trail.y, trail.x + player1.width, trail.y);
            gradient.addColorStop(0, `rgba(255, 69, 0, ${alpha * 0.6})`);
            gradient.addColorStop(0.5, `rgba(255, 140, 0, ${alpha * 0.4})`);
            gradient.addColorStop(1, `rgba(255, 215, 0, ${alpha * 0.2})`);
            c.fillStyle = gradient;
            c.fillRect(trail.x, trail.y, player1.width, player1.height);
        } else if (currentPaddleTrail === 'wavy_trail') {
            c.strokeStyle = trailColor.replace('rgb', 'rgba').replace(')', `, ${alpha * 0.5})`);
            c.lineWidth = 3;
            c.beginPath();
            for (let j = 0; j < player1.height; j += 5) {
                let wave = Math.sin((j + Date.now() * 0.01) * 0.1) * 3;
                c.lineTo(trail.x + wave, trail.y + j);
            }
            c.stroke();
        }
        
        trail.life--;
    }
    
    paddleTrail = paddleTrail.filter(t => t.life > 0);
}

function showMenu(menu) {
    const btnsDiv = document.getElementById('btns');
    const difficultyBtnsDiv = document.getElementById('difficultyBtns');
    const customiseMenuDiv = document.getElementById('customiseMenu');
    const tournamentMenuDiv = document.getElementById('tournamentMenu');
    const infoShopMenuDiv = document.getElementById('infoShopMenu');

    btnsDiv.style.display = 'none';
    difficultyBtnsDiv.style.display = 'none';
    customiseMenuDiv.style.display = 'none';
    tournamentMenuDiv.style.display = 'none';
    infoShopMenuDiv.style.display = 'none';
    canvas.style.display = 'none';
    document.getElementById('backBtn').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'none';

    if (menu === null) {
        btnsDiv.style.display = 'flex';
    } else {
        menu.style.display = 'flex';
    }
}

function showMessage(msg, duration) {
    const messageDiv = document.getElementById('message');
    messageDiv.innerText = msg;
    messageDiv.style.display = 'block';
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, duration);
}

function checkWin() {
    if (player1.score >= winningScore) {
        gameIsOver = true;
        const reward = getCoinReward(20); // Base reward 20 coins
        coins += reward;
        showMessage(`${player1.name} Wins! +${reward} coins 💰`, 3000);
        
        if (window.showNotification) {
            window.showNotification(`Victory! +${reward} coins earned`, '🎉');
        }
        
        saveGameState();
        setTimeout(() => {
            handleBackToMenu();
        }, 3500);
    } else if (player2.score >= winningScore) {
        gameIsOver = true;
        showMessage(`${player2.name} Wins!`, 3000);
        setTimeout(() => {
            handleBackToMenu();
        }, 3500);
    }
}

function startGame(mode, diff = 'medium') {
    gameMode = mode;
    difficulty = diff;
    gameIsOver = false;
    start = false;

    player1.score = 0;
    player2.score = 0;

    // Apply character height modification
    const heightMult = getCharacterHeightMultiplier();
    player1.height = Math.floor(PADDLE_HEIGHT * heightMult);
    player2.height = PADDLE_HEIGHT;

    player1.y = canvas.height / 2 - player1.height / 2;
    player2.y = canvas.height / 2 - player2.height / 2;

    player1.name = player1DisplayName;
    player1.color = player1PaddleColor;
    player1.paddleTC = player1PaddleTColor;

    player2.name = mode === '2player' ? 'Player 2' : 'AI';
    player2.color = 'white';

    const btnsDiv = document.getElementById('btns');
    const difficultyBtnsDiv = document.getElementById('difficultyBtns');
    btnsDiv.style.display = 'none';
    difficultyBtnsDiv.style.display = 'none';

    canvas.style.display = 'block';
    document.getElementById('backBtn').style.display = 'block';
    document.getElementById('pauseBtn').style.display = 'block';

    resetBall();
}

function handleBackToMenu() {
    gameIsOver = true;
    start = false;
    isPaused = false;
    
    player1.height = PADDLE_HEIGHT; // Reset to default
    
    showMenu(null);
}

function togglePause() {
    isPaused = !isPaused;
    const pauseBtn = document.getElementById('pauseBtn');
    pauseBtn.textContent = isPaused ? '▶️ Resume' : '⏸️ P';
    
    if (isPaused) {
        showMessage('PAUSED', 99999);
    } else {
        document.getElementById('message').style.display = 'none';
    }
}

function loadGameState() {
    const savedState = localStorage.getItem('pongGameState');
    if (savedState) {
        const state = JSON.parse(savedState);
        coins = state.coins || 0;
        player1DisplayName = state.username || "Player 1";
        player1PaddleColor = state.paddleColor || "white";
        player1PaddleTColor = state.paddleTrailColor || "white";
        currentPaddlePattern = state.currentPaddlePattern || 'none';
        currentBallPattern = state.currentBallPattern || 'default';
        currentPaddleTrail = state.currentPaddleTrail || 'none';
        ownedPaddlePatterns = state.ownedPaddlePatterns || ['none'];
        ownedBallPatterns = state.ownedBallPatterns || ['default'];
        ownedPaddleTrails = state.ownedPaddleTrails || ['none'];
        ownedCharacters = state.ownedCharacters || [];
        activeCharacter = state.activeCharacter || null;
    }

    document.getElementById('usernameInput').value = player1DisplayName;
    document.getElementById('paddleColorInput').value = player1PaddleColor;
    document.getElementById('paddleTColorInput').value = player1PaddleTColor;
}

function saveGameState() {
    const state = {
        coins: coins,
        username: player1DisplayName,
        paddleColor: player1PaddleColor,
        paddleTrailColor: player1PaddleTColor,
        currentPaddlePattern: currentPaddlePattern,
        currentBallPattern: currentBallPattern,
        currentPaddleTrail: currentPaddleTrail,
        ownedPaddlePatterns: ownedPaddlePatterns,
        ownedBallPatterns: ownedBallPatterns,
        ownedPaddleTrails: ownedPaddleTrails,
        ownedCharacters: ownedCharacters,
        activeCharacter: activeCharacter
    };
    localStorage.setItem('pongGameState', JSON.stringify(state));
}

function saveCustomisation() {
    player1DisplayName = document.getElementById('usernameInput').value || "Player 1";
    player1PaddleColor = document.getElementById('paddleColorInput').value;
    player1PaddleTColor = document.getElementById('paddleTColorInput').value;
    saveGameState();
}

// =================================================================
// --- CHARACTER SHOP UI ---
// =================================================================

function showInfoShopMenu() {
    const infoShopMenuDiv = document.getElementById('infoShopMenu');
    const btnsDiv = document.getElementById('btns');
    
    btnsDiv.style.display = 'none';
    infoShopMenuDiv.style.display = 'flex';

    document.getElementById('infoUsername').textContent = player1DisplayName;
    document.getElementById('infoCoins').textContent = coins;

    populateCharacterShop();
    populatePaddlePatternsShop();
    populateBallPatternsShop();
    populatePaddleTrailsShop();
}

function populateCharacterShop() {
    const characterList = document.getElementById('infoCharactersList');
    if (!characterList) {
        // Create character section if it doesn't exist
        const infoShopMenu = document.getElementById('infoShopMenu');
        const characterSection = document.createElement('div');
        characterSection.style.color = 'white';
        characterSection.innerHTML = '<h3>Characters</h3><ul id="infoCharactersList" class="tournament-list"></ul>';
        
        // Insert after the coins display but before paddle patterns
        const paddlePatternsSection = infoShopMenu.querySelector('div:has(#infoPaddlePatternsList)');
        infoShopMenu.insertBefore(characterSection, paddlePatternsSection);
    }
    
    const list = document.getElementById('infoCharactersList');
    list.innerHTML = '';

    Object.values(characters).forEach(char => {
        const li = document.createElement('li');
        
        const isOwned = ownedCharacters.includes(char.id);
        const isActive = activeCharacter === char.id;
        
        const nameSpan = document.createElement('span');
        nameSpan.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                <span style="font-size: 24px;">${char.icon}</span>
                <div>
                    <div style="font-weight: bold; color: ${char.glowColor};">${char.name} - ${char.description}</div>
                    <div style="font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 3px;">${char.ability}</div>
                    ${!isOwned ? `<div style="font-size: 11px; color: #ffd700; margin-top: 2px;">${char.price} coins</div>` : ''}
                </div>
            </div>
        `;
        
        const btn = document.createElement('button');
        
        if (isActive) {
            btn.textContent = 'Active';
            btn.disabled = true;
            btn.style.background = `linear-gradient(135deg, ${char.glowColor}40, ${char.glowColor}20)`;
            btn.style.borderColor = char.glowColor;
        } else if (isOwned) {
            btn.textContent = 'Equip';
            btn.style.background = 'rgba(0, 242, 255, 0.2)';
            btn.onclick = () => equipCharacter(char.id);
        } else {
            btn.textContent = 'Buy';
            btn.style.background = 'rgba(255, 215, 0, 0.2)';
            btn.onclick = () => purchaseCharacter(char.id);
            if (coins < char.price) {
                btn.disabled = true;
            }
        }
        
        li.appendChild(nameSpan);
        li.appendChild(btn);
        list.appendChild(li);
    });
}

function purchaseCharacter(charId) {
    const char = characters[charId];
    
    if (coins >= char.price && !ownedCharacters.includes(charId)) {
        coins -= char.price;
        ownedCharacters.push(charId);
        saveGameState();
        
        if (window.showNotification) {
            window.showNotification(`Character ${char.name} Unlocked! ${char.icon}`, '🎉');
        }
        
        showInfoShopMenu();
    }
}

function equipCharacter(charId) {
    if (ownedCharacters.includes(charId)) {
        activeCharacter = charId;
        saveGameState();
        
        const char = characters[charId];
        if (window.showNotification) {
            window.showNotification(`${char.name} equipped! ${char.icon}`, '✨');
        }
        
        showInfoShopMenu();
    }
}

function populatePaddlePatternsShop() {
    const list = document.getElementById('infoPaddlePatternsList');
    list.innerHTML = '';

    const patterns = ['stripes_pat', 'dots_pat', 'chevrons'];
    
    patterns.forEach(patternId => {
        const li = document.createElement('li');
        
        const isOwned = ownedPaddlePatterns.includes(patternId);
        const isActive = currentPaddlePattern === patternId;
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${ITEM_DISPLAY_NAMES[patternId]} ${!isOwned ? `(${ITEM_PRICES[patternId]} coins)` : ''}`;
        
        const btn = document.createElement('button');
        
        if (isActive) {
            btn.textContent = 'Active';
            btn.disabled = true;
        } else if (isOwned) {
            btn.textContent = 'Equip';
            btn.onclick = () => {
                currentPaddlePattern = patternId;
                saveGameState();
                showInfoShopMenu();
            };
        } else {
            btn.textContent = 'Buy';
            btn.onclick = () => {
                if (coins >= ITEM_PRICES[patternId]) {
                    coins -= ITEM_PRICES[patternId];
                    ownedPaddlePatterns.push(patternId);
                    saveGameState();
                    showInfoShopMenu();
                    
                    if (window.showNotification) {
                        window.showNotification(`Unlocked: ${ITEM_DISPLAY_NAMES[patternId]}!`, '🎨');
                    }
                }
            };
            if (coins < ITEM_PRICES[patternId]) {
                btn.disabled = true;
            }
        }
        
        li.appendChild(nameSpan);
        li.appendChild(btn);
        list.appendChild(li);
    });
}

function populateBallPatternsShop() {
    const list = document.getElementById('infoBallPatternsList');
    list.innerHTML = '';

    const patterns = ['dot_pat', 'grid_pattern', 'ring_pattern'];
    
    patterns.forEach(patternId => {
        const li = document.createElement('li');
        
        const isOwned = ownedBallPatterns.includes(patternId);
        const isActive = currentBallPattern === patternId;
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${ITEM_DISPLAY_NAMES[patternId]} ${!isOwned ? `(${ITEM_PRICES[patternId]} coins)` : ''}`;
        
        const btn = document.createElement('button');
        
        if (isActive) {
            btn.textContent = 'Active';
            btn.disabled = true;
        } else if (isOwned) {
            btn.textContent = 'Equip';
            btn.onclick = () => {
                currentBallPattern = patternId;
                saveGameState();
                showInfoShopMenu();
            };
        } else {
            btn.textContent = 'Buy';
            btn.onclick = () => {
                if (coins >= ITEM_PRICES[patternId]) {
                    coins -= ITEM_PRICES[patternId];
                    ownedBallPatterns.push(patternId);
                    saveGameState();
                    showInfoShopMenu();
                    
                    if (window.showNotification) {
                        window.showNotification(`Unlocked: ${ITEM_DISPLAY_NAMES[patternId]}!`, '🎨');
                    }
                }
            };
            if (coins < ITEM_PRICES[patternId]) {
                btn.disabled = true;
            }
        }
        
        li.appendChild(nameSpan);
        li.appendChild(btn);
        list.appendChild(li);
    });
}

function populatePaddleTrailsShop() {
    const list = document.getElementById('infoPaddleTrailsList');
    list.innerHTML = '';

    const trails = ['basic_trail', 'fire_trail', 'wavy_trail'];
    
    trails.forEach(trailId => {
        const li = document.createElement('li');
        
        const isOwned = ownedPaddleTrails.includes(trailId);
        const isActive = currentPaddleTrail === trailId;
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${ITEM_DISPLAY_NAMES[trailId]} ${!isOwned ? `(${ITEM_PRICES[trailId]} coins)` : ''}`;
        
        const btn = document.createElement('button');
        
        if (isActive) {
            btn.textContent = 'Active';
            btn.disabled = true;
        } else if (isOwned) {
            btn.textContent = 'Equip';
            btn.onclick = () => {
                currentPaddleTrail = trailId;
                saveGameState();
                showInfoShopMenu();
            };
        } else {
            btn.textContent = 'Buy';
            btn.onclick = () => {
                if (coins >= ITEM_PRICES[trailId]) {
                    coins -= ITEM_PRICES[trailId];
                    ownedPaddleTrails.push(trailId);
                    saveGameState();
                    showInfoShopMenu();
                    
                    if (window.showNotification) {
                        window.showNotification(`Unlocked: ${ITEM_DISPLAY_NAMES[trailId]}!`, '🎨');
                    }
                }
            };
            if (coins < ITEM_PRICES[trailId]) {
                btn.disabled = true;
            }
        }
        
        li.appendChild(nameSpan);
        li.appendChild(btn);
        list.appendChild(li);
    });
}

// =================================================================
// --- TOURNAMENT SYSTEM ---
// =================================================================

function setupTournament(playerCount) {
    tournamentPlayers = [];
    tournamentMatches = [];

    tournamentPlayers.push({
        name: player1DisplayName,
        isPlayer: true
    });

    for (let i = 1; i < playerCount; i++) {
        tournamentPlayers.push({
            name: `AI ${i}`,
            isPlayer: false
        });
    }

    for (let i = 0; i < tournamentPlayers.length; i += 2) {
        tournamentMatches.push({
            player1: tournamentPlayers[i],
            player2: tournamentPlayers[i + 1],
            winner: null
        });
    }

    currentMatchIndex = 0;
    startNextTournamentMatch();
}

function startNextTournamentMatch() {
    if (currentMatchIndex >= tournamentMatches.length) {
        if (tournamentMatches.length === 1) {
            const finalWinner = tournamentMatches[0].winner;
            if (finalWinner.name === player1DisplayName) {
                const reward = getCoinReward(100); // Tournament win: 100 coins base
                coins += reward;
                showMessage(`🏆 Tournament Champion! +${reward} coins 💰`, 3000);
                
                if (window.showNotification) {
                    window.showNotification(`Tournament Victory! +${reward} coins`, '🏆');
                }
                
                saveGameState();
            } else {
                showMessage(`Tournament Over. ${finalWinner.name} wins!`, 3000);
            }
            setTimeout(() => {
                handleBackToMenu();
            }, 3500);
            return;
        }

        const nextRoundMatches = [];
        for (let i = 0; i < tournamentMatches.length; i += 2) {
            nextRoundMatches.push({
                player1: tournamentMatches[i].winner,
                player2: tournamentMatches[i + 1].winner,
                winner: null
            });
        }
        tournamentMatches = nextRoundMatches;
        currentMatchIndex = 0;
        startNextTournamentMatch();
        return;
    }

    const match = tournamentMatches[currentMatchIndex];
    gameMode = 'tournament';
    difficulty = 'medium';
    gameIsOver = false;
    start = false;

    player1.score = 0;
    player2.score = 0;

    // Apply character height modification
    const heightMult = getCharacterHeightMultiplier();
    player1.height = Math.floor(PADDLE_HEIGHT * heightMult);
    player2.height = PADDLE_HEIGHT;

    player1.y = canvas.height / 2 - player1.height / 2;
    player2.y = canvas.height / 2 - player2.height / 2;

    if (match.player1.isPlayer) {
        player1.name = match.player1.name;
        player1.color = player1PaddleColor;
        player1.paddleTC = player1PaddleTColor;
    } else {
        player1.name = match.player1.name;
        player1.color = 'white';
    }

    if (match.player2.isPlayer) {
        player2.name = match.player2.name;
        player2.color = player1PaddleColor;
    } else {
        player2.name = match.player2.name;
        player2.color = 'white';
    }

    canvas.style.display = 'block';
    document.getElementById('backBtn').style.display = 'block';
    document.getElementById('pauseBtn').style.display = 'block';

    showMessage(`${match.player1.name} vs ${match.player2.name}`, 2000);
    setTimeout(() => {
        resetBall();
    }, 2500);
}

function checkTournamentWin() {
    if (player1.score >= winningScore) {
        gameIsOver = true;
        const match = tournamentMatches[currentMatchIndex];
        match.winner = match.player1;

        if (match.player1.name === player1DisplayName) {
            const reward = getCoinReward(10); // Match win: 10 coins base
            coins += reward;
            showMessage(`${match.player1.name} Wins! +${reward} coins 💰`, 2000);
            
            if (window.showNotification) {
                window.showNotification(`Match Won! +${reward} coins`, '🎉');
            }
            
            saveGameState();
        } else {
            showMessage(`${match.player1.name} Wins!`, 2000);
        }

        currentMatchIndex++;
        setTimeout(() => {
            startNextTournamentMatch();
        }, 2500);
    } else if (player2.score >= winningScore) {
        gameIsOver = true;
        const match = tournamentMatches[currentMatchIndex];
        match.winner = match.player2;

        if (match.player2.name === player1DisplayName) {
            const reward = getCoinReward(10);
            coins += reward;
            showMessage(`${match.player2.name} Wins! +${reward} coins 💰`, 2000);
            
            if (window.showNotification) {
                window.showNotification(`Match Won! +${reward} coins`, '🎉');
            }
            
            saveGameState();
        } else {
            showMessage(`${match.player2.name} Wins!`, 2000);
        }

        currentMatchIndex++;
        setTimeout(() => {
            startNextTournamentMatch();
        }, 2500);
    }
}

// =================================================================
// --- GAME UPDATE & DRAW FUNCTIONS ---
// =================================================================

function update() {
    if (currentPaddleTrail !== 'none') {
        paddleTrail.push({
            x: player1.x,
            y: player1.y,
            life: 30
        });
    }

    // Apply character abilities
    if (activeCharacter === 'magneto') {
        applyMagneticPull();
    }

    ball.x += ball.speedX;
    ball.y += ball.speedY;

    if (ball.y - ball.radius < 0 || ball.y + ball.radius > canvas.height) {
        ball.speedY *= -1;
        if (window.shakeCanvas) window.shakeCanvas();
    }

    // Get character speed multiplier
    const speedMult = getCharacterSpeedMultiplier();
    let aiSpeed = AI_SPEEDS[difficulty] || AI_SPEEDS['medium'];
    
    const p1IsUser = (player1.name === player1DisplayName && gameMode !== 'tutorial'); 
    const p2IsUser = (gameMode === '2player');
    
    if (p1IsUser) {
        player1.y += player1.dy * speedMult; // Apply character speed modifier
    } else {
        if (gameMode === 'tutorial') {
             const p1Center = player1.y + player1.height / 2;
             if (ball.y < p1Center - 10) { player1.y -= aiSpeed; } 
             else if (ball.y > p1Center + 10) { player1.y += aiSpeed; }
        } else {
            const p1Center = player1.y + player1.height / 2;
            if (ball.y < p1Center - 10) { player1.y -= aiSpeed; } 
            else if (ball.y > p1Center + 10) { player1.y += aiSpeed; }
        }
    }

    if (p2IsUser) {
        player2.y += player2.dy;
    } else if (gameMode === 'tutorial') {
        player2.y = ball.y - player2.height / 2;
    } else {
        const p2Center = player2.y + player2.height / 2;
        if (ball.y < p2Center - 10) { player2.y -= aiSpeed; } 
        else if (ball.y > p2Center + 10) { player2.y += aiSpeed; }
    }

    player1.y = Math.max(0, Math.min(canvas.height - player1.height, player1.y));
    player2.y = Math.max(0, Math.min(canvas.height - player2.height, player2.y));

    // Player 1 collision
    if (ball.x - ball.radius < player1.x + player1.width && 
        ball.y > player1.y && 
        ball.y < player1.y + player1.height) {
        
        let collidePoint = ball.y - (player1.y + player1.height / 2);
        collidePoint /= (player1.height / 2);
        let angle = collidePoint * Math.PI / 3;
        let currentSpeed = Math.sqrt(ball.speedX**2 + ball.speedY**2);
        
        // Check Ghost ability before normal bounce
        if (!checkGhostAbility(player1)) {
            ball.speedX = Math.abs(currentSpeed) * Math.cos(angle); 
            ball.speedY = currentSpeed * Math.sin(angle);
        } else {
            // Ghost ability triggered, speeds already reduced
            ball.speedX = Math.abs(ball.speedX);
        }
        
        ball.owner = 'player1';

        if (player1.isStriking) {
            ball.speedX *= 1.15;
            ball.speedY *= 1.15;
            player1.isStriking = false;
        }
        
        if (window.shakeCanvas) window.shakeCanvas();
    }

    // Player 2 collision
    if (ball.x + ball.radius > player2.x && 
        ball.y > player2.y && 
        ball.y < player2.y + player2.height) {
        
        let collidePoint = ball.y - (player2.y + player2.height / 2);
        collidePoint /= (player2.height / 2);
        let angle = collidePoint * Math.PI / 3;
        let currentSpeed = Math.sqrt(ball.speedX**2 + ball.speedY**2);
        ball.speedX = -Math.abs(currentSpeed) * Math.cos(angle); 
        ball.speedY = currentSpeed * Math.sin(angle); 
        
        ball.owner = 'default';
        
        if (player2.isStriking) {
            ball.speedX *= 1.15;
            ball.speedY *= 1.15;
            player2.isStriking = false;
        }
        
        if (window.shakeCanvas) window.shakeCanvas();
    }

    // Scoring
    if (ball.x - ball.radius < 0) {
        player2.score++;
        if (gameMode === 'tournament') {
            checkTournamentWin();
        } else {
            checkWin();
        }
        if (!gameIsOver) {
            start = false; 
            showMessage("Player 2/AI scores!", 1000); 
            setTimeout(() => {
                resetBall(); 
            }, 1500); 
        }
    } else if (ball.x + ball.radius > canvas.width) {
        player1.score++;
        if (gameMode === 'tournament') {
            checkTournamentWin();
        } else {
            checkWin();
        }
        if (!gameIsOver) {
            start = false; 
            showMessage("Player 1 scores!", 1000); 
            setTimeout(() => {
                resetBall(); 
            }, 1500); 
        }
    }
    
    // Update ball trail for visual effects
    if (window.updateBallTrail) {
        const speed = Math.sqrt(ball.speedX**2 + ball.speedY**2);
        window.updateBallTrail(ball.x, ball.y, speed);
    }
}

function draw() {
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = '#000';
    c.fillRect(0, 0, canvas.width, canvas.height);
    
    if (canvas.style.display === 'block') {
        drawNet();
        drawScore();
        
        // Draw ball trail effect
        if (window.drawBallTrail) {
            window.drawBallTrail(c);
        }
        
        drawPaddleTrail(player1.paddleTC);
        
        drawPaddle(player1.x, player1.y, player1.width, player1.height, player1.color, player1.name, currentPaddlePattern);
        drawPaddle(player2.x, player2.y, player2.width, player2.height, player2.color, player2.name, 'none'); 

        const ballColor = ball.owner === 'player1' ? player1PaddleColor : 'white';
        const ballPattern = ball.owner === 'player1' ? currentBallPattern : 'default';

        drawBall(ball.x, ball.y, ball.radius, ballColor, ballPattern);
    }
}

function gameLoop() {
    if (start && !gameIsOver && !isPaused) {
        update();
    }
    draw();
    requestAnimationFrame(gameLoop);
}


// =================================================================
// --- GET DOM ELEMENTS ---
// =================================================================

const btnsDiv = document.getElementById('btns');
const difficultyBtnsDiv = document.getElementById('difficultyBtns');
const customiseMenuDiv = document.getElementById('customiseMenu');
const tournamentMenuDiv = document.getElementById('tournamentMenu');
const infoShopMenuDiv = document.getElementById('infoShopMenu');
const backBtn = document.getElementById('backBtn');
const pauseBtn = document.getElementById('pauseBtn');

const onePlayerBtn = document.getElementById('onePlayerBtn');
const twoPlayerBtn = document.getElementById('twoPlayerBtn');
const tournamentBtn = document.getElementById('tournamentBtn');
const customiseBtn = document.getElementById('customiseBtn');
const tutorialBtn = document.getElementById('tutorialBtn');

const easyBtn = document.getElementById('easyBtn');
const mediumBtn = document.getElementById('mediumBtn');
const hardBtn = document.getElementById('hardBtn');
const backFromDifficultyBtn = document.getElementById('backFromDifficultyBtn');

const saveCustomisationBtn = document.getElementById('saveCustomisationBtn');
const backFromCustomiseBtn = document.getElementById('backFromCustomiseBtn');

const startTournament4Btn = document.getElementById('startTournament4Btn');
const startTournament8Btn = document.getElementById('startTournament8Btn');
const backFromTournamentBtn = document.getElementById('backFromTournamentBtn');

const infoBackBtn = document.getElementById('infoBackBtn');

const menuButtons = [
    onePlayerBtn, twoPlayerBtn, tournamentBtn, customiseBtn, tutorialBtn,
    easyBtn, mediumBtn, hardBtn, backFromDifficultyBtn, 
    saveCustomisationBtn, backFromCustomiseBtn, 
    startTournament4Btn, startTournament8Btn, backFromTournamentBtn,
    infoBackBtn
];

// =================================================================
// --- EVENT LISTENERS ---
// =================================================================

document.addEventListener('keydown', e => {
    if (!start || gameIsOver) return;

    if (e.key === 'p' || e.key === 'P') { 
        togglePause();
        if (!isPaused && musicPlayer) {
             musicPlayer.play().catch(error => {});
        }
        return; 
    }
    
    if (e.key === 'Escape') { 
        handleBackToMenu();
        return;
    }
    
    if (isPaused) return;

    const isP1User = (player1.name === player1DisplayName && gameMode !== 'tutorial');

    switch (e.key) {
        case 'w':
            if (isP1User) { player1.dy = -3.3; }
            break;
        case 's':
            if (isP1User) { player1.dy = 3.3; }
            break;
        case 'e': 
            if (isP1User && Math.abs(ball.x - (player1.x + player1.width)) < 50) { 
                player1.isStriking = true; 
            } 
            break;
        case 'ArrowUp':
            if (gameMode === '2player') { player2.dy = -3.3; }
            break;
        case 'ArrowDown':
            if (gameMode === '2player') { player2.dy = 3.3; }
            break;
        case '/':
            if (gameMode === '2player' && Math.abs(ball.x - player2.x) < 50) { 
                player2.isStriking = true; 
            } 
            break;
    }
});

document.addEventListener('keyup', e => {
    if (!start || gameIsOver || isPaused) return; 

    const isP1User = (player1.name === player1DisplayName && gameMode !== 'tutorial');

    switch (e.key) {
        case 'w':
        case 's':
            if (isP1User) { player1.dy = 0; }
            break;
        case 'ArrowUp':
        case 'ArrowDown':
            if (gameMode === '2player') { player2.dy = 0; }
            break;
    }
});


// --- Menu Button Listeners ---
menuButtons.forEach(button => {
    button.addEventListener('click', () => {
        if(musicPlayer && musicPlayer.paused) {
            musicPlayer.play().catch(error => {});
        }
    });
});

onePlayerBtn.addEventListener('click', () => showMenu(difficultyBtnsDiv));
twoPlayerBtn.addEventListener('click', () => startGame('2player'));
tournamentBtn.addEventListener('click', () => showMenu(tournamentMenuDiv));
customiseBtn.addEventListener('click', () => {
    loadGameState(); 
    showMenu(customiseMenuDiv);
});
tutorialBtn.addEventListener('click', showInfoShopMenu);

easyBtn.addEventListener('click', () => startGame('1player', 'easy'));
mediumBtn.addEventListener('click', () => startGame('1player', 'medium'));
hardBtn.addEventListener('click', () => startGame('1player', 'hard'));
backFromDifficultyBtn.addEventListener('click', () => showMenu(null));

saveCustomisationBtn.addEventListener('click', () => {
    saveCustomisation();
    showMenu(null);
});
backFromCustomiseBtn.addEventListener('click', () => showMenu(null));

startTournament4Btn.addEventListener('click', () => {
    btnsDiv.style.display = 'none'; 
    tournamentMenuDiv.style.display = 'none';
    setupTournament(4);
});
startTournament8Btn.addEventListener('click', () => {
    btnsDiv.style.display = 'none'; 
    tournamentMenuDiv.style.display = 'none';
    setupTournament(8);
});
backFromTournamentBtn.addEventListener('click', () => showMenu(null));

infoBackBtn.addEventListener('click', () => showMenu(null));

backBtn.addEventListener('click', handleBackToMenu);
pauseBtn.addEventListener('click', togglePause);


// Start the game loop
loadGameState();
setupMusicPlayer(); 
showMenu(null);
gameLoop();

// =================================================================
// --- CONSOLE COMMANDS FOR TESTING ---
// =================================================================

// Expose these globally for console access
window.giveCoins = function(amount) {
    coins += amount;
    saveGameState();
    console.log(`Added ${amount} coins. Total: ${coins}`);
};

window.unlockAllCharacters = function() {
    ownedCharacters = Object.keys(characters);
    saveGameState();
    console.log('All characters unlocked!');
};

window.setCharacter = function(charId) {
    if (characters[charId]) {
        activeCharacter = charId;
        saveGameState();
        console.log(`Character ${characters[charId].name} equipped!`);
    } else {
        console.log('Invalid character ID. Available:', Object.keys(characters));
    }
};

window.resetProgress = function() {
    localStorage.removeItem('pongGameState');
    coins = 0;
    ownedCharacters = [];
    activeCharacter = null;
    console.log('Progress reset!');
};

console.log('=== NEO PONG CONSOLE COMMANDS ===');
console.log('giveCoins(amount) - Add coins');
console.log('unlockAllCharacters() - Unlock all characters');
console.log('setCharacter("dash"|"titan"|"magneto"|"ghost"|"midas") - Equip character');
console.log('resetProgress() - Reset all progress');
console.log('================================');
