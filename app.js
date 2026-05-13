// ★ Render 주소로 변경 필수!
const socket = io('https://여기에-본인의-render-서비스-이름.onrender.com'); 

let myId = '';
let currentRoomId = '';
let selectedCards = [];
let myNickname = '';

// --- 1. 기록 시스템 (LocalStorage) ---
function loadStats() {
  const wins = localStorage.getItem('lexio_wins') || 0;
  const maxCoins = localStorage.getItem('lexio_max_coins') || 0;
  document.getElementById('stats-display').innerText = `누적 승리: ${wins}회 | 최고 코인: ${maxCoins}개`;
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
loadStats(); // 초기 로드

// --- 2. 사운드 시스템 (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
  if(audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  if(type === 'play') { // 타격음
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.start(); osc.stop(audioCtx.currentTime + 0.1);
  } else if(type === 'turn') { // 턴 알림음 (띠링)
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.setValueAtTime(800, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.start(); osc.stop(audioCtx.currentTime + 0.3);
  } else if(type === 'pass') { // 패스 (낮은 휙)
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.15);
    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    osc.start(); osc.stop(audioCtx.currentTime + 0.15);
  }
}

// --- 3. 로비 기능 ---
const lobbyEl = document.getElementById('lobby');
const gameBoardEl = document.getElementById('game-board');
const roomListUl = document.getElementById('roomList');
const nicknameInput = document.getElementById('nicknameInput');
const roomNameInput = document.getElementById('roomNameInput');

socket.on('playError', (msg) => { alert(msg); });

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

document.getElementById('createRoomBtn').addEventListener('click', () => {
  myNickname = nicknameInput.value.trim();
  const roomName = roomNameInput.value.trim();
  const maxPlayers = document.getElementById('playerCountSelect').value;
  if (!myNickname) return alert("닉네임을 입력하세요!");
  if (!roomName) return alert("방 제목을 입력하세요!");

  socket.emit('createRoom', { roomName, maxPlayers, nickname: myNickname });
  enterGameMode();
});

window.joinRoom = function(roomId) {
  myNickname = nicknameInput.value.trim();
  if (!myNickname) return alert("닉네임을 먼저 입력하세요!");
  socket.emit('joinRoom', { roomId, nickname: myNickname });
  enterGameMode();
}

function enterGameMode() {
  lobbyEl.style.display = 'none';
  gameBoardEl.style.display = 'block';
  // 모바일에서 오디오 권한 허용을 위한 꼼수 트리거
  if(audioCtx.state === 'suspended') audioCtx.resume();
}

// --- 4. 족보 가이드 시스템 ---
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
  
  if (isHand) {
    div.addEventListener('click', () => {
      div.classList.toggle('selected');
      const index = selectedCards.findIndex(c => c.id === cardData.id);
      if (index > -1) selectedCards.splice(index, 1);
      else selectedCards.push(cardData);
      playSound('pass'); // 카드 클릭 시 가벼운 소리
      updateComboGuide(); // 가이드 업데이트
    });
  }
  return div;
}

// --- 5. 폭죽 애니메이션 이벤트 ---
socket.on('gameWin', ({ winnerId, winnerName }) => {
  if (socket.id === winnerId) {
    // 내가 이겼을 때 화려하게!
    confetti({ particleCount: 150, spread: 100, origin: { y: 0.5 }, colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] });
    updateStats(true, 0); // 승리 횟수 저장 (코인은 updateRoom에서 저장)
  }
});

// --- 6. 룸 업데이트 (메인 로직) ---
socket.on('updateRoom', (room) => {
  currentRoomId = room.id;
  
  document.getElementById('center-field').innerHTML = '';
  room.field.forEach(card => {
    document.getElementById('center-field').appendChild(renderCard(card, false));
  });
  document.getElementById('combo-text').innerText = room.comboText;

  const myHandEl = document.getElementById('my-hand');
  const opponentsEl = document.getElementById('opponents');
  myHandEl.innerHTML = ''; opponentsEl.innerHTML = '';
  selectedCards = []; 
  updateComboGuide();

  let myIndex = -1;
  let isMyTurn = false;
  
  room.players.forEach((player, index) => {
    if (player.id === socket.id) {
      myIndex = index;
      if (room.currentTurn === myIndex && room.isPlaying) {
        if (!isMyTurn) playSound('turn'); // 방금 내 턴이 되었다면 알림음
        isMyTurn = true;
      }
      
      const coinsDisplay = document.getElementById('my-coins-display');
      if (player.isOut) {
        coinsDisplay.innerHTML = `💀 파산 (Out)`; coinsDisplay.style.color = "#ff6b6b"; coinsDisplay.style.borderColor = "#ff6b6b";
      } else {
        coinsDisplay.innerHTML = `🪙 내 코인: ${player.coins}`; coinsDisplay.style.color = "#ffeb3b"; coinsDisplay.style.borderColor = "#fff";
        updateStats(false, player.coins); // 코인 최대 기록 갱신
        player.hand.forEach(card => myHandEl.appendChild(renderCard(card, true)));
      }
    } else {
      const opDiv = document.createElement('div');
      opDiv.className = 'opponent-area';
      if (player.isOut) opDiv.style.opacity = '0.4';
      
      const nameDiv = document.createElement('div');
      nameDiv.className = 'opponent-name';
      if (player.isOut) nameDiv.innerHTML = `<span style="color:red;">💀파산</span><br>${player.nickname}`;
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

// 컨트롤 버튼
document.getElementById('playBtn').addEventListener('click', () => {
  if (selectedCards.length === 0) return alert('카드를 선택해주세요!');
  playSound('play'); // 쿵 소리
  socket.emit('playCards', { roomId: currentRoomId, cards: selectedCards });
});

document.getElementById('passBtn').addEventListener('click', () => {
  playSound('pass');
  socket.emit('passTurn', { roomId: currentRoomId });
});

// --- 7. 채팅 시스템 ---
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');

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
  msgBox.scrollTop = msgBox.scrollHeight; // 스크롤 맨 아래로
});
