// ★ 본인의 Render 주소로 꼭 교체하세요!
const socket = io('https://joshio.onrender.com'); 

let currentRoomId = '';
let selectedCards = [];
let myNickname = localStorage.getItem('lexio_nickname') || '';
let sortMode = 'number'; 
let currentSummaryStr = null; 

let sessionId = localStorage.getItem('lexio_sessionId');
if (!sessionId) {
  sessionId = Math.random().toString(36).substring(2, 15);
  localStorage.setItem('lexio_sessionId', sessionId);
}

socket.on('connect', () => { if (sessionId) socket.emit('checkReconnect', { sessionId }); });
socket.on('reconnectSuccess', (roomId) => {
  myNickname = localStorage.getItem('lexio_nickname') || '재접속자';
  currentRoomId = roomId; enterGameMode();
});

function getLexioRank(number) { if (number === 1) return 14; if (number === 2) return 15; return number - 2; }
function getSuitRank(suit) { if (suit === '☁️') return 1; if (suit === '⭐') return 2; if (suit === '🌙') return 3; if (suit === '☀️') return 4; return 0; }

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
  if(audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  if(type === 'turn') { osc.frequency.setValueAtTime(600, audioCtx.currentTime); gain.gain.setValueAtTime(0.1, audioCtx.currentTime); osc.start(); osc.stop(audioCtx.currentTime + 0.2); }
}

const lobbyEl = document.getElementById('lobby');
const gameBoardEl = document.getElementById('game-board');

socket.on('playError', (msg) => alert(msg));
socket.on('systemLog', (msg) => {
  const logs = document.getElementById('system-logs');
  const div = document.createElement('div'); div.innerText = msg;
  logs.appendChild(div); logs.scrollTop = logs.scrollHeight;
});

socket.on('roomList', (rooms) => {
  const list = document.getElementById('roomList'); list.innerHTML = '';
  if(rooms.length === 0) { list.innerHTML = '<li>방이 없습니다.</li>'; return; }
  rooms.forEach(r => {
    const li = document.createElement('li'); li.className = 'room-item';
    li.innerHTML = `<span>${r.name} (${r.currentPlayers}/${r.maxPlayers})</span><button onclick="joinRoom('${r.id}')">입장</button>`;
    list.appendChild(li);
  });
});

document.getElementById('createRoomBtn').addEventListener('click', () => {
  const nick = document.getElementById('nicknameInput').value.trim();
  const rName = document.getElementById('roomNameInput').value.trim();
  const maxP = document.getElementById('playerCountSelect').value;
  if (!nick || !rName) return alert("필수 정보를 입력하세요.");
  myNickname = nick; localStorage.setItem('lexio_nickname', nick);
  socket.emit('createRoom', { roomName: rName, maxPlayers: maxP, nickname: nick, sessionId });
  enterGameMode();
});

window.joinRoom = function(id) {
  const nick = document.getElementById('nicknameInput').value.trim();
  if (!nick) return alert("닉네임을 입력하세요.");
  myNickname = nick; localStorage.setItem('lexio_nickname', nick);
  socket.emit('joinRoom', { roomId: id, nickname: nick, sessionId });
  enterGameMode();
}

function enterGameMode() { lobbyEl.style.display = 'none'; gameBoardEl.style.display = 'block'; if(audioCtx.state === 'suspended') audioCtx.resume(); }

// 정렬 버튼: 텍스트 고정, 로직만 처리
document.getElementById('toggleSortBtn').addEventListener('click', () => {
  sortMode = sortMode === 'number' ? 'suit' : 'number';
  
  const myHandEl = document.getElementById('my-hand');
  const cards = Array.from(myHandEl.children);
  cards.sort((a, b) => {
    const aData = JSON.parse(a.dataset.card); const bData = JSON.parse(b.dataset.card);
    if (sortMode === 'number') return getLexioRank(aData.number) - getLexioRank(bData.number) || getSuitRank(aData.suit) - getSuitRank(bData.suit);
    else return getSuitRank(aData.suit) - getSuitRank(bData.suit) || getLexioRank(aData.number) - getLexioRank(bData.number);
  });
  myHandEl.innerHTML = ''; cards.forEach(card => myHandEl.appendChild(card));
});

function renderCard(cardData, isHand = false) {
  const div = document.createElement('div');
  div.className = `card suit-${cardData.suit}` + (isHand ? ' in-hand' : '');
  div.innerHTML = `<div class="number">${cardData.number}</div><div class="suit">${cardData.suit}</div>`;
  div.dataset.card = JSON.stringify(cardData);
  if (isHand) {
    div.addEventListener('click', () => {
      div.classList.toggle('selected');
      const idx = selectedCards.findIndex(c => c.id === cardData.id);
      if (idx > -1) selectedCards.splice(idx, 1); else selectedCards.push(cardData);
      updateComboGuide();
    });
  }
  return div;
}

function updateComboGuide() {
  const g = document.getElementById('combo-guide');
  if (selectedCards.length === 0) { g.innerText = "선택한 카드: 없음"; return; }
  g.innerText = `현재 선택: ${selectedCards.length}장`;
}

function showRoundSummary(room) {
  const modal = document.getElementById('round-modal');
  let myData = null;
  for (const pid in room.roundSummary.data) {
    if (room.roundSummary.data[pid].nickname === myNickname) { myData = room.roundSummary.data[pid]; break; }
  }
  if (!myData) return;
  document.getElementById('modal-title').innerText = room.roundSummary.isGameOver ? "🚩 경기 종료!" : "결과 리포트";
  document.getElementById('modal-my-tiles').innerText = `내 남은 타일: ${myData.remainingTiles}개`;
  const exBox = document.getElementById('modal-exchanges'); exBox.innerHTML = '';
  for (const [opp, val] of Object.entries(myData.exchanges)) {
    const item = document.createElement('div'); item.className = 'exchange-item';
    const arrow = val > 0 ? '⬇️' : '⬆️';
    item.innerHTML = `${opp}: <span style="color:${val > 0 ? '#4ade80' : '#ff6b6b'}">${arrow} ${val}</span>`;
    exBox.appendChild(item);
  }
  document.getElementById('modal-total-change').innerText = `변동량: ${myData.roundChange > 0 ? '+' : ''}${myData.roundChange}`;
  document.getElementById('modal-current-coins').innerText = `🪙 내 코인: ${myData.totalCoins}개`;
  const btn = document.getElementById('modal-confirm-btn');
  if (room.roundSummary.isGameOver) {
    btn.innerText = "새 게임 시작하기"; btn.onclick = () => { socket.emit('restartGame', { roomId: currentRoomId }); modal.style.display = 'none'; };
  } else {
    let t = 10; btn.innerText = `확인 (${t}초)`; btn.onclick = () => modal.style.display = 'none';
    if(window.sumInt) clearInterval(window.sumSumInt);
    window.sumInt = setInterval(() => { t--; if(t > 0) btn.innerText = `확인 (${t}초)`; else { clearInterval(window.sumInt); modal.style.display = 'none'; }}, 1000);
  }
  modal.style.display = 'flex';
}

socket.on('updateRoom', (room) => {
  currentRoomId = room.id;
  document.getElementById('round-indicator-text').innerText = `${room.currentRound} / ${room.maxRound} ROUND`;
  if (room.roundSummary) {
    const s = JSON.stringify(room.roundSummary);
    if (currentSummaryStr !== s) { currentSummaryStr = s; showRoundSummary(room); }
  } else { document.getElementById('round-modal').style.display = 'none'; currentSummaryStr = null; }

  const field = document.getElementById('center-field'); field.innerHTML = '';
  room.field.forEach(c => field.appendChild(renderCard(c, false)));
  document.getElementById('combo-text').innerText = room.comboText;

  const myHand = document.getElementById('my-hand'); myHand.innerHTML = '';
  const opps = document.getElementById('opponents'); opps.innerHTML = '';
  selectedCards = []; updateComboGuide();

  let myIdx = -1;
  room.players.forEach((p, i) => { if(p.sessionId === sessionId) myIdx = i; });

  room.players.forEach((p, i) => {
    if (i === myIdx) {
      document.getElementById('my-coins-display').innerText = `🪙 ${p.coins}`;
      if (room.currentTurn === myIdx && room.isPlaying && !p.isDisconnected) {
        document.getElementById('my-turn-indicator').style.display = 'block'; playSound('turn');
      } else { document.getElementById('my-turn-indicator').style.display = 'none'; }
      if (!p.isOut) {
        let handCopy = [...p.hand];
        handCopy.sort((a,b) => {
          if (sortMode === 'number') return getLexioRank(a.number) - getLexioRank(b.number) || getSuitRank(a.suit) - getSuitRank(b.suit);
          return getSuitRank(a.suit) - getSuitRank(b.suit) || getLexioRank(a.number) - getLexioRank(b.number);
        });
        handCopy.forEach(c => myHand.appendChild(renderCard(c, true)));
      }
    } else {
      let rel = (i - myIdx + room.players.length) % room.players.length;
      let pos = ''; const total = room.players.length;
      if (total === 2) pos = 'pos-top';
      else if (total === 3) pos = (rel === 1 ? 'pos-left' : 'pos-right');
      else if (total === 4) pos = (rel === 1 ? 'pos-left' : rel === 2 ? 'pos-top' : 'pos-right');
      else { pos = (rel === 1 ? 'pos-left' : rel === 2 ? 'pos-top-left' : rel === 3 ? 'pos-top-right' : 'pos-right'); }
      
      const div = document.createElement('div'); div.className = `opponent-area ${pos}`;
      div.innerHTML = `<div class="opponent-name">${p.isOut ? '💀' : p.isDisconnected ? '⏳' : ''}${p.nickname} (🪙${p.coins})</div>`;
      const cards = document.createElement('div'); cards.className = 'opponent-hand';
      if (!p.isOut) for(let k=0; k<p.hand.length; k++) cards.appendChild(document.createElement('div')).className = 'card-back';
      div.appendChild(cards); opps.appendChild(div);
    }
  });

  const isMyTurn = (room.currentTurn === myIdx && room.isPlaying && myIdx !== -1);
  document.getElementById('playBtn').disabled = !isMyTurn;
  document.getElementById('passBtn').disabled = (!isMyTurn || room.field.length === 0);
});

document.getElementById('playBtn').addEventListener('click', () => {
  if (selectedCards.length === 0) return alert('카드를 선택하세요.');
  socket.emit('playCards', { roomId: currentRoomId, cards: selectedCards });
});
document.getElementById('passBtn').addEventListener('click', () => socket.emit('passTurn', { roomId: currentRoomId }));

// ★ 채팅창 UI 열기/닫기 로직
const chatPreview = document.getElementById('chat-preview');
const chatContainer = document.getElementById('chat-container');
const closeChatBtn = document.getElementById('closeChatBtn');

chatPreview.addEventListener('click', () => {
  chatContainer.classList.add('expanded');
  document.getElementById('chatInput').focus();
});
closeChatBtn.addEventListener('click', () => {
  chatContainer.classList.remove('expanded');
});

document.getElementById('sendChatBtn').addEventListener('click', () => {
  const m = document.getElementById('chatInput').value.trim();
  if (m) { socket.emit('chatMessage', { roomId: currentRoomId, nickname: myNickname, msg: m }); document.getElementById('chatInput').value = ''; }
});

socket.on('chatMessage', (d) => {
  // 전체 메세지창에 추가
  const box = document.getElementById('chat-messages');
  const div = document.createElement('div'); div.innerHTML = `<b>${d.nickname}:</b> ${d.msg}`;
  box.appendChild(div); box.scrollTop = box.scrollHeight;
  
  // 1줄 미리보기 업데이트
  chatPreview.innerHTML = `<span style="color:#ffeb3b;">${d.nickname}:</span> ${d.msg}`;
});
