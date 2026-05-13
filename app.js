// ★ 본인의 Render 주소로 꼭 교체하세요!
const socket = io('https://joshio.onrender.com'); 

let currentRoomId = '';
let selectedCards = [];
let myNickname = localStorage.getItem('lexio_nickname') || '';
let sortMode = 'number'; 
let currentSummaryStr = null; // 모달창 중복 띄움 방지용

let sessionId = localStorage.getItem('lexio_sessionId');
if (!sessionId) {
  sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  localStorage.setItem('lexio_sessionId', sessionId);
}

socket.on('connect', () => { if (sessionId) socket.emit('checkReconnect', { sessionId }); });
socket.on('reconnectSuccess', (roomId) => {
  myNickname = localStorage.getItem('lexio_nickname') || '알수없음';
  currentRoomId = roomId;
  enterGameMode();
});

function getLexioRank(number) { if (number === 1) return 14; if (number === 2) return 15; return number - 2; }
function getSuitRank(suit) { if (suit === '☁️') return 1; if (suit === '⭐') return 2; if (suit === '🌙') return 3; if (suit === '☀️') return 4; return 0; }

function loadStats() {
  const wins = localStorage.getItem('lexio_wins') || 0;
  const maxCoins = localStorage.getItem('lexio_max_coins') || 0;
  document.getElementById('stats-display').innerText = `누적 승리: ${wins}회 | 최고 코인: ${maxCoins}개`;
  if(myNickname) document.getElementById('nicknameInput').value = myNickname;
}
function updateStats(isWin, currentCoins) {
  if (isWin) localStorage.setItem('lexio_wins', parseInt(localStorage.getItem('lexio_wins') || 0) + 1);
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
    gainNode.gain.setValueAtTime(1, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.start(); osc.stop(audioCtx.currentTime + 0.1);
  } else if(type === 'turn') {
    osc.type = 'sine'; osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.setValueAtTime(800, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.start(); osc.stop(audioCtx.currentTime + 0.3);
  } else if(type === 'pass') {
    osc.type = 'sine'; osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.15);
    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
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
  const div = document.createElement('div'); div.innerText = msg;
  logsBox.appendChild(div); logsBox.parentElement.scrollTop = logsBox.parentElement.scrollHeight;
});

socket.on('roomList', (rooms) => {
  roomListUl.innerHTML = '';
  if(rooms.length === 0) { roomListUl.innerHTML = '<li class="room-item" style="justify-content:center; color:#888;">현재 방이 없습니다.</li>'; return; }
  rooms.forEach(room => {
    const li = document.createElement('li'); li.className = 'room-item';
    li.innerHTML = `<span><strong>${room.name}</strong> (${room.currentPlayers}/${room.maxPlayers}명)</span><button onclick="joinRoom('${room.id}')">입장</button>`;
    roomListUl.appendChild(li);
  });
});

document.getElementById('createRoomBtn').addEventListener('click', () => {
  const inputNickname = nicknameInput.value.trim();
  const roomName = roomNameInput.value.trim();
  const maxPlayers = document.getElementById('playerCountSelect').value;
  if (inputNickname === '') return alert("닉네임을 입력해주세요!");
  if (roomName === '') return alert("방 제목을 입력해주세요!");

  myNickname = inputNickname; localStorage.setItem('lexio_nickname', myNickname);
  socket.emit('createRoom', { roomName, maxPlayers, nickname: myNickname, sessionId });
  enterGameMode();
});

window.joinRoom = function(roomId) {
  const inputNickname = nicknameInput.value.trim();
  if (inputNickname === '') return alert("닉네임을 입력해주세요!");
  myNickname = inputNickname; localStorage.setItem('lexio_nickname', myNickname);
  socket.emit('joinRoom', { roomId, nickname: myNickname, sessionId });
  enterGameMode();
}

function enterGameMode() {
  lobbyEl.style.display = 'none'; gameBoardEl.style.display = 'block';
  if(audioCtx.state === 'suspended') audioCtx.resume();
}

document.getElementById('toggleSortBtn').addEventListener('click', () => {
  sortMode = sortMode === 'number' ? 'suit' : 'number';
  document.getElementById('toggleSortBtn').innerText = `🔀 현재: ${sortMode === 'number' ? '숫자순' : '문양순'}`;
  const myHandEl = document.getElementById('my-hand');
  const cards = Array.from(myHandEl.children);
  cards.sort((a, b) => {
    const aData = JSON.parse(a.dataset.card); const bData = JSON.parse(b.dataset.card);
    if (sortMode === 'number') return getLexioRank(aData.number) - getLexioRank(bData.number) || getSuitRank(aData.suit) - getSuitRank(bData.suit);
    else return getSuitRank(aData.suit) - getSuitRank(bData.suit) || getLexioRank(aData.number) - getLexioRank(bData.number);
  });
  myHandEl.innerHTML = ''; cards.forEach(card => myHandEl.appendChild(card));
});

function updateComboGuide() {
  const guideEl = document.getElementById('combo-guide');
  if (selectedCards.length === 0) { guideEl.innerText = "선택한 카드: 없음"; guideEl.style.color = "#fff"; return; }
  const len = selectedCards.length; let text = "알 수 없는 조합";
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
      if (index > -1) selectedCards.splice(index, 1); else selectedCards.push(cardData);
      playSound('pass'); updateComboGuide(); 
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

// ★ 라운드 정산 모달 그리기 함수
function showRoundSummary(room) {
  const modal = document.getElementById('round-modal');
  
  // 내 데이터 찾기
  let myData = null;
  for (const pid in room.roundSummary.data) {
    if (pid === socket.id || room.roundSummary.data[pid].nickname === myNickname) {
      myData = room.roundSummary.data[pid]; break;
    }
  }
  if (!myData) return;

  document.getElementById('modal-title').innerText = room.roundSummary.isGameOver ? "🚩 경기 종료!" : "라운드 종료결산";
  document.getElementById('modal-my-tiles').innerText = `내 남은 타일: ${myData.remainingTiles}개`;

  const exchangesGrid = document.getElementById('modal-exchanges');
  exchangesGrid.innerHTML = '';
  
  // 상대방과의 교환 내역 출력
  for (const [oppName, amount] of Object.entries(myData.exchanges)) {
    if (amount !== 0) {
      const item = document.createElement('div');
      item.className = 'exchange-item';
      const arrow = amount > 0 ? '⬇️' : '⬆️'; // 받으면 ⬇️, 주면 ⬆️
      const sign = amount > 0 ? '+' : '';
      const color = amount > 0 ? '#4ade80' : '#ff6b6b';
      
      item.innerHTML = `
        <div style="color:#ccc;">${oppName}</div>
        <div style="color:${color}; font-weight:bold; font-size:15px; margin-top:2px;">${arrow} ${sign}${amount}개</div>
      `;
      exchangesGrid.appendChild(item);
    }
  }

  const totalSign = myData.roundChange > 0 ? '+' : '';
  document.getElementById('modal-total-change').innerText = `나의 코인 변동: ${totalSign}${myData.roundChange}개`;
  document.getElementById('modal-current-coins').innerHTML = `<span class="gold-coin">C</span> 내가 가진 코인: ${myData.totalCoins}개`;

  const btn = document.getElementById('modal-confirm-btn');
  if(window.summaryInterval) clearInterval(window.summaryInterval);

  if (room.roundSummary.isGameOver) {
    btn.innerText = "새 게임 시작하기";
    btn.onclick = () => { 
      socket.emit('restartGame', { roomId: currentRoomId }); 
      modal.style.display = 'none'; 
    };
  } else {
    let timeLeft = 10;
    btn.innerText = `확인 (다음 라운드로 ${timeLeft}초)`;
    btn.onclick = () => { modal.style.display = 'none'; };
    
    // 10초 카운트다운 다운
    window.summaryInterval = setInterval(() => {
      timeLeft--;
      if(timeLeft > 0) btn.innerText = `확인 (다음 라운드로 ${timeLeft}초)`;
      else {
        clearInterval(window.summaryInterval);
        modal.style.display = 'none';
      }
    }, 1000);
  }
  
  modal.style.display = 'flex';
}

socket.on('updateRoom', (room) => {
  currentRoomId = room.id;
  if(lobbyEl.style.display !== 'none') enterGameMode();

  // ★ 라운드 표시기 업데이트
  document.getElementById('round-indicator-text').innerText = `현재 라운드: ${room.currentRound} / ${room.maxRound}`;

  // ★ 정산 모달 트리거
  if (room.roundSummary) {
    const sumStr = JSON.stringify(room.roundSummary);
    if (currentSummaryStr !== sumStr) {
      currentSummaryStr = sumStr;
      showRoundSummary(room);
    }
  } else {
    document.getElementById('round-modal').style.display = 'none';
    currentSummaryStr = null;
  }

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
  room.players.forEach((p, idx) => { if(p.sessionId === sessionId) myIndex = idx; });
  
  room.players.forEach((player, index) => {
    if (index === myIndex) {
      if (room.currentTurn === myIndex && room.isPlaying && !player.isDisconnected) {
        if (!isMyTurn) playSound('turn'); 
        isMyTurn = true;
      }
      
      const coinsDisplay = document.getElementById('my-coins-display');
      if (player.isOut) {
        coinsDisplay.innerHTML = `💀 파산 (Out)`; coinsDisplay.style.color = "#ff6b6b"; coinsDisplay.style.borderColor = "#ff6b6b";
      } else {
        coinsDisplay.innerHTML = `<span class="gold-coin">C</span> 내 코인: ${player.coins}`; 
        coinsDisplay.style.color = "#ffeb3b"; coinsDisplay.style.borderColor = "#fff";
        updateStats(false, player.coins); 
        
        let myHandArr = [...player.hand];
        myHandArr.sort((a, b) => {
          if (sortMode === 'number') return getLexioRank(a.number) - getLexioRank(b.number) || getSuitRank(a.suit) - getSuitRank(b.suit);
          else return getSuitRank(a.suit) - getSuitRank(b.suit) || getLexioRank(a.number) - getLexioRank(b.number);
        });
        myHandArr.forEach(card => myHandEl.appendChild(renderCard(card, true)));
      }
    } else {
      let relIndex = (index - Math.max(myIndex, 0) + room.players.length) % room.players.length;
      let posClass = '';
      const total = room.players.length;
      if (total === 2) { if (relIndex === 1) posClass = 'pos-top'; } 
      else if (total === 3) { if (relIndex === 1) posClass = 'pos-left'; if (relIndex === 2) posClass = 'pos-right'; } 
      else if (total === 4) { if (relIndex === 1) posClass = 'pos-left'; if (relIndex === 2) posClass = 'pos-top'; if (relIndex === 3) posClass = 'pos-right'; } 
      else if (total === 5) { if (relIndex === 1) posClass = 'pos-left'; if (relIndex === 2) posClass = 'pos-top-left'; if (relIndex === 3) posClass = 'pos-top-right'; if (relIndex === 4) posClass = 'pos-right'; }

      const opDiv = document.createElement('div');
      opDiv.className = `opponent-area ${posClass}` + (player.isDisconnected ? ' disconnected' : '');
      if (player.isOut) opDiv.style.opacity = '0.4';
      
      const nameDiv = document.createElement('div');
      nameDiv.className = 'opponent-name';
      if (player.isOut) nameDiv.innerHTML = `<span style="color:red;">💀파산</span><br>${player.nickname}`;
      else if (player.isDisconnected) nameDiv.innerHTML = `<span style="color:orange;">⏳연결끊김</span><br>${player.nickname}`;
      else nameDiv.innerHTML = `<span class="gold-coin">C</span>${player.coins}<br>${player.nickname} (${player.hand.length}장)`;
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
      if (isMyTurn && myIndex !== -1 && !room.players[myIndex].isOut) {
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
