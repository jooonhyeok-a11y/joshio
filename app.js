// ★ 반드시 본인의 Render 주소로 교체하세요!
const socket = io('https://joshio.onrender.com');

let currentRoomId = '';
let selectedCards = [];
let myNickname = localStorage.getItem('lexio_nickname') || '';
let sortMode = 'number'; 

// 고유 세션 ID 생성
let sessionId = localStorage.getItem('lexio_sessionId');
if (!sessionId) {
  sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  localStorage.setItem('lexio_sessionId', sessionId);
}

function getLexioRank(number) { if (number === 1) return 14; if (number === 2) return 15; return number - 2; }
function getSuitRank(suit) { if (suit === '☁️') return 1; if (suit === '⭐') return 2; if (suit === '🌙') return 3; if (suit === '☀️') return 4; return 0; }

function loadStats() {
  const wins = localStorage.getItem('lexio_wins') || 0;
  const maxCoins = localStorage.getItem('lexio_max_coins') || 0;
  document.getElementById('stats-display').innerText = `누적 승리: ${wins}회 | 최고 코인: ${maxCoins}개`;
  if(myNickname) document.getElementById('nicknameInput').value = myNickname;
}
function updateStats(isWin, currentCoins) {
  if (isWin) {
    let wins = parseInt(localStorage.getItem('lexio_wins') || 0);
    localStorage.setItem('lexio_wins', wins + 1);
  }
  let maxCoins = parseInt(localStorage.getItem('lexio_max_coins') || 0);
  if (currentCoins > maxCoins) localStorage.setItem('lexio_max_coins', currentCoins);
  loadStats();
}
loadStats(); 

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
  if(audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.connect(gainNode); gainNode.connect(audioCtx.destination);
  if(type === 'play') {
    osc.type = 'triangle'; osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.start(); osc.stop(audioCtx.currentTime + 0.1);
  } else if(type === 'turn') {
    osc.type = 'sine'; osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.setValueAtTime(800, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.start(); osc.stop(audioCtx.currentTime + 0.3);
  } else if(type === 'pass') {
    osc.type = 'sine'; osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.15);
    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    osc.start(); osc.stop(audioCtx.currentTime + 0.15);
  }
}

const lobbyEl = document.getElementById('lobby');
const gameBoardEl = document.getElementById('game-board');
const roomListUl = document.getElementById('roomList');
const nicknameInput = document.getElementById('nicknameInput');
const roomNameInput = document.getElementById('roomNameInput');

socket.on('playError', (msg) => { alert(msg); });

socket.on('systemLog', (msg) => {
  const logsBox = document.getElementById('system-logs');
  const div = document.createElement('div');
  div.innerText = msg;
  logsBox.appendChild(div);
  logsBox.parentElement.scrollTop = logsBox.parentElement.scrollHeight;
});

socket.on('roomList', (rooms) => {
  roomListUl.innerHTML = '';
  if(rooms.length === 0) {
    roomListUl.innerHTML = '<li class="room-item" style="justify-content:center; color:#888;">현재 방이 없습니다.</li>';
    return;
  }
  rooms.forEach(room => {
    const li = document.createElement('li');
    li.className = 'room-item';
    li.innerHTML = `<span><strong>${room.name}</strong> (${room.currentPlayers}/${room.maxPlayers}명)</span>
                    <button onclick="joinRoom('${room.id}')">입장</button>`;
    roomListUl.appendChild(li);
  });
});

// ★ 닉네임 강력 검증 로직 추가
document.getElementById('createRoomBtn').addEventListener('click', () => {
  const inputNickname = nicknameInput.value.trim();
  const roomName = roomNameInput.value.trim();
  const maxPlayers = document.getElementById('playerCountSelect').value;
  
  if (inputNickname === '') {
    alert("닉네임을 반드시 입력해주세요!");
    nicknameInput.focus();
    return;
  }
  if (roomName === '') {
    alert("방 제목을 입력해주세요!");
    roomNameInput.focus();
    return;
  }

  myNickname = inputNickname;
  localStorage.setItem('lexio_nickname', myNickname);
  socket.emit('createRoom', { roomName, maxPlayers, nickname: myNickname, sessionId });
  enterGameMode();
});

// ★ 닉네임 강력 검증 로직 추가 (방 입장 시)
window.joinRoom = function(roomId) {
  const inputNickname = nicknameInput.value.trim();
  
  if (inputNickname === '') {
    alert("닉네임을 반드시 입력해주세요!");
    nicknameInput.focus();
    return;
  }

  myNickname = inputNickname;
  localStorage.setItem('lexio_nickname', myNickname);
  socket.emit('joinRoom', { roomId, nickname: myNickname, sessionId });
  enterGameMode();
}

function enterGameMode() {
  lobbyEl.style.display = 'none';
  gameBoardEl.style.display = 'block';
  if(audioCtx.state === 'suspended') audioCtx.resume();
}

document.getElementById('toggleSortBtn').addEventListener('click', () => {
  sortMode = sortMode === 'number' ? 'suit' : 'number';
  document.getElementById('toggleSortBtn').innerText = `🔀 현재: ${sortMode === 'number' ? '숫자순' : '문양순'}`;
  
  const myHandEl = document.getElementById('my-hand');
  const cards = Array.from(myHandEl.children);
  cards.sort((a, b) => {
    const aData = JSON.parse(a.dataset.card);
    const bData = JSON.parse(b.dataset.card);
    if (sortMode === 'number') {
      return getLexioRank(aData.number) - getLexioRank(bData.number) || getSuitRank(aData.suit) - getSuitRank(bData.suit);
    } else {
      return getSuitRank(aData.suit) - getSuitRank(bData.suit) || getLexioRank(aData.number) - getLexioRank(bData.number);
    }
  });
  myHandEl.innerHTML = '';
  cards.forEach(card => myHandEl.appendChild(card));
});

function updateComboGuide() {
  const guideEl = document.getElementById('combo-guide');
  if (selectedCards.length === 0) { guideEl.innerText = "선택한 카드: 없음"; guideEl.style.color = "#fff"; return; }
  const len = selectedCards.length;
  let text = "알 수 없는 조합";
  if(len === 1) text = "싱글 (1장)";
  if(len === 2) text = selectedCards[0].number === selectedCards[1].number ? "페어 (2장)" : "잘못된 조합 (페어 아님)";
  if(len === 3) text = (selectedCards[0].number === selectedCards[1].number && selectedCards[1].number === selectedCards[2].number) ? "트리플 (3장)" : "잘못된 조합";
  if(len === 5) text = "5장 조합 (제출 시 검증됨)";
  if(len === 4 || len > 5) text = "불가능한 장수 (1,2,3,5장만 가능)";

  guideEl.innerText = `현재 선택: ${text}`;
  guideEl.style.color = text.includes("잘못") || text.includes("불가능") ? "#ff6b6b" : "#4ade80";
}

function renderCard(cardData, isHand = false) {
  const div = document.createElement('div');
  div.className = `card suit-${cardData.suit}` + (isHand ? ' in-hand' : '');
  div.innerHTML = `<div class="number">${cardData.number}</div><div class="suit">${cardData.suit}</div>`;
  div.dataset.card = JSON.stringify(cardData); 
  
  if (isHand) {
    div.addEventListener('click', () => {
      div.classList.toggle('selected');
      const index = selectedCards.findIndex(c => c.id === cardData.id);
      if (index > -1) selectedCards.splice(index, 1);
      else selectedCards.push(cardData);
      playSound('pass'); 
      updateComboGuide(); 
    });
  }
  return div;
}

socket.on('gameWin', ({ winnerId, winnerName }) => {
  if (socket.id === winnerId || sessionId) { 
    confetti({ particleCount: 150, spread: 100, origin: { y: 0.5 }, colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] });
    updateStats(true, 0); 
  }
});

socket.on('updateRoom', (room) => {
  currentRoomId = room.id;
  
  if(lobbyEl.style.display !== 'none') enterGameMode();

  document.getElementById('center-field').innerHTML = '';
  room.field.forEach(card => { document.getElementById('center-field').appendChild(renderCard(card, false)); });
  document.getElementById('combo-text').innerText = room.comboText;

  const myHandEl = document.getElementById('my-hand');
  const opponentsEl = document.getElementById('opponents');
  myHandEl.innerHTML = ''; opponentsEl.innerHTML = '';
  selectedCards = []; 
  updateComboGuide();

  let myIndex = -1;
  let isMyTurn = false;
  
  room.players.forEach((player, index) => {
    if (player.sessionId === sessionId) {
      myIndex = index;
      if (room.currentTurn === myIndex && room.isPlaying && !player.isDisconnected) {
        if (!isMyTurn) playSound('turn'); 
        isMyTurn = true;
      }
      
      const coinsDisplay = document.getElementById('my-coins-display');
      if (player.isOut) {
        coinsDisplay.innerHTML = `💀 파산 (Out)`; coinsDisplay.style.color = "#ff6b6b"; coinsDisplay.style.borderColor = "#ff6b6b";
      } else {
        coinsDisplay.innerHTML = `🪙 내 코인: ${player.coins}`; coinsDisplay.style.color = "#ffeb3b"; coinsDisplay.style.borderColor = "#fff";
        updateStats(false, player.coins); 
        
        let myHandArr = [...player.hand];
        myHandArr.sort((a, b) => {
          if (sortMode === 'number') return getLexioRank(a.number) - getLexioRank(b.number) || getSuitRank(a.suit) - getSuitRank(b.suit);
          else return getSuitRank(a.suit) - getSuitRank(b.suit) || getLexioRank(a.number) - getLexioRank(b.number);
        });
        myHandArr.forEach(card => myHandEl.appendChild(renderCard(card, true)));
      }
    } else {
      const opDiv = document.createElement('div');
      opDiv.className = 'opponent-area' + (player.isDisconnected ? ' disconnected' : '');
      if (player.isOut) opDiv.style.opacity = '0.4';
      
      const nameDiv = document.createElement('div');
      nameDiv.className = 'opponent-name';
      if (player.isOut) nameDiv.innerHTML = `<span style="color:red;">💀파산</span><br>${player.nickname}`;
      else if (player.isDisconnected) nameDiv.innerHTML = `<span style="color:orange;">⏳연결끊김</span><br>${player.nickname}`;
      else nameDiv.innerHTML = `🪙${player.coins}<br>${player.nickname} (${player.hand.length}장)`;
      opDiv.appendChild(nameDiv);

      const cardsDiv = document.createElement('div');
      cardsDiv.className = 'opponent-hand';
      if (!player.isOut) {
        for(let i=0; i<player.hand.length; i++) cardsDiv.appendChild(document.createElement('div')).className = 'card-back';
      }
      opDiv.appendChild(cardsDiv); opponentsEl.appendChild(opDiv);
    }
  });

  const turnIndicator = document.getElementById('my-turn-indicator');
  const playBtn = document.getElementById('playBtn');
  const passBtn = document.getElementById('passBtn');

  if (room.isPlaying) {
      if (isMyTurn && !room.players[myIndex].isOut) {
        turnIndicator.style.display = 'block';
        turnIndicator.innerText = room.field.length === 0 ? "👉 내 턴! (선입니다)" : "👉 내 턴입니다!";
        playBtn.disabled = false; passBtn.disabled = false;
      } else {
        turnIndicator.style.display = 'none';
        playBtn.disabled = true; passBtn.disabled = true;
      }
  } else {
      turnIndicator.style.display = 'block';
      turnIndicator.innerText = `대기/종료 (${room.players.length}/${room.maxPlayers}명)`;
  }
});

document.getElementById('playBtn').addEventListener('click', () => {
  if (selectedCards.length === 0) return alert('카드를 선택해주세요!');
  playSound('play'); 
  socket.emit('playCards', { roomId: currentRoomId, cards: selectedCards });
});

document.getElementById('passBtn').addEventListener('click', () => {
  playSound('pass');
  socket.emit('passTurn', { roomId: currentRoomId });
});

const chatInput = document.getElementById('chatInput');
document.getElementById('sendChatBtn').addEventListener('click', sendChat);
chatInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') sendChat(); });

function sendChat() {
  const msg = chatInput.value.trim();
  if (msg && currentRoomId) {
    socket.emit('chatMessage', { roomId: currentRoomId, nickname: myNickname, msg });
    chatInput.value = '';
  }
}

socket.on('chatMessage', ({ nickname, msg }) => {
  const msgBox = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.innerHTML = `<strong style="color:#ffeb3b;">${nickname}:</strong> ${msg}`;
  msgBox.appendChild(div);
  msgBox.scrollTop = msgBox.scrollHeight; 
});
