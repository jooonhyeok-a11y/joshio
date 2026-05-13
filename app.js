// ★ 본인의 Render 주소로 꼭 교체하세요!
const socket = io('https://joshio.onrender.com'); 

let currentRoomId = '';
let selectedCards = [];
let myNickname = localStorage.getItem('lexio_nickname') || '';
let sortMode = 'number'; 
let currentSummaryStr = null; 
let lastTurnWasMe = false; 

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

function getLexioRank(num) { 
  const number = Number(num);
  if (number === 1) return 14; 
  if (number === 2) return 15; 
  return number - 2; 
}
function getSuitRank(suit) { if (suit === '☁️') return 1; if (suit === '⭐') return 2; if (suit === '🌙') return 3; if (suit === '☀️') return 4; return 0; }

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
  if(audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  if(type === 'turn') { 
    osc.frequency.setValueAtTime(600, audioCtx.currentTime); 
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime); 
    osc.start(); osc.stop(audioCtx.currentTime + 0.2); 
  }
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
  if(rooms.length === 0) { list.innerHTML = '<li class="room-item" style="justify-content:center; color:#888;">방이 없습니다.</li>'; return; }
  rooms.forEach(r => {
    const li = document.createElement('li'); li.className = 'room-item';
    li.innerHTML = `<span><strong>${r.name}</strong> (${r.currentPlayers}/${r.maxPlayers}명)</span><button onclick="joinRoom('${r.id}')">입장</button>`;
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
  const len = selectedCards.length; let text = "알 수 없는 조합";
  if(len === 1) text = "싱글 (1장)";
  if(len === 2) text = Number(selectedCards[0].number) === Number(selectedCards[1].number) ? "페어 (2장)" : "잘못된 조합 (페어 아님)";
  if(len === 3) text = (Number(selectedCards[0].number) === Number(selectedCards[1].number) && Number(selectedCards[1].number) === Number(selectedCards[2].number)) ? "트리플 (3장)" : "잘못된 조합";
  if(len === 5) text = "5장 조합 (제출 시 검증됨)";
  if(len === 4 || len > 5) text = "불가능한 장수 (1,2,3,5장만 가능)";
  g.innerText = `현재 선택: ${text}`;
  g.style.color = text.includes("잘못") || text.includes("불가능") ? "#ff6b6b" : "#4ade80";
}

function showRoundSummary(room) {
  const modal = document.getElementById('round-modal');
  
  // ★ 내 데이터 찾기를 오직 불변하는 sessionId로만 수행
  const myData = room.roundSummary.data[sessionId];
  if (!myData) return;

  const titleEl = document.getElementById('modal-title');
  const winnerAnnounceEl = document.getElementById('modal-winner-announce');
  const roundDetailsEl = document.getElementById('modal-round-details');
  const finalRankingsEl = document.getElementById('modal-final-rankings');
  const btn = document.getElementById('modal-confirm-btn');

  if (room.roundSummary.isGameOver) {
    titleEl.innerText = room.roundSummary.gameEndReason;
    winnerAnnounceEl.innerText = `🏆 ${room.roundSummary.overallWinnerName} 최종 우승!`;
    winnerAnnounceEl.style.display = 'block';
    
    finalRankingsEl.innerHTML = '';
    room.roundSummary.finalRankings.forEach((r, idx) => {
        const div = document.createElement('div');
        div.className = 'ranking-item' + (idx === 0 ? ' ranking-1st' : '');
        div.innerHTML = `<span>${idx + 1}위: ${r.nickname}</span><span>🪙 ${r.coins}</span>`;
        finalRankingsEl.appendChild(div);
    });
    finalRankingsEl.style.display = 'block';
    
    btn.innerText = "새 게임 시작하기"; 
    btn.onclick = () => { socket.emit('restartGame', { roomId: currentRoomId }); modal.style.display = 'none'; };
    if(window.sumInt) clearInterval(window.sumInt);
  } else {
    titleEl.innerText = "라운드 종료결산";
    winnerAnnounceEl.style.display = 'none';
    finalRankingsEl.style.display = 'none';
    roundDetailsEl.style.display = 'block';
    
    let t = 10; 
    btn.innerText = `확인 (다음 라운드로 ${t}초)`; 
    btn.onclick = () => modal.style.display = 'none';
    if(window.sumInt) clearInterval(window.sumInt);
    window.sumInt = setInterval(() => { 
      t--; 
      if(t > 0) btn.innerText = `확인 (다음 라운드로 ${t}초)`; 
      else { clearInterval(window.sumInt); modal.style.display = 'none'; }
    }, 1000);
  }

  document.getElementById('modal-my-tiles').innerText = `내 남은 타일: ${myData.remainingTiles}개`;
  const exBox = document.getElementById('modal-exchanges'); exBox.innerHTML = '';
  for (const [opp, val] of Object.entries(myData.exchanges)) {
    const item = document.createElement('div'); item.className = 'exchange-item';
    const arrow = val > 0 ? '⬇️' : '⬆️';
    item.innerHTML = `${opp}: <span style="color:${val > 0 ? '#4ade80' : '#ff6b6b'}">${arrow} ${val}</span>`;
    exBox.appendChild(item);
  }
  document.getElementById('modal-total-change').innerText = `나의 코인 변동: ${myData.roundChange > 0 ? '+' : ''}${myData.roundChange}개`;
  document.getElementById('modal-current-coins').innerText = `🪙 내가 가진 코인: ${myData.totalCoins}개`;

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

  // ★ 내 자리(Index)를 찾을 때도 무조건 sessionId 기준으로 탐색
  let myIdx = -1;
  room.players.forEach((p, i) => { if(p.sessionId === sessionId) myIdx = i; });

  room.players.forEach((p, i) => {
    if (i === myIdx) {
      document.getElementById('my-coins-display').innerText = `🪙 ${p.coins}`; // 코인 완벽 업데이트
      
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

  const turnIndicator = document.getElementById('my-turn-indicator');
  const playBtn = document.getElementById('playBtn');
  const passBtn = document.getElementById('passBtn');

  if (room.isPlaying) {
    if (myIdx !== -1 && room.currentTurn === myIdx && !room.players[myIdx].isOut) {
      turnIndicator.style.display = 'block';
      turnIndicator.innerText = room.field.length === 0 ? "👉 내 턴! (선입니다)" : "👉 내 턴입니다!";
      playBtn.disabled = false; passBtn.disabled = false;
      if (!lastTurnWasMe) playSound('turn');
      lastTurnWasMe = true;
    } else {
      turnIndicator.style.display = 'block';
      turnIndicator.innerText = "내 턴이 아닙니다";
      playBtn.disabled = true; passBtn.disabled = true;
      lastTurnWasMe = false;
    }
  } else {
    turnIndicator.style.display = 'block';
    turnIndicator.innerText = `대기/종료 (${room.players.length}/${room.maxPlayers}명)`;
    playBtn.disabled = true; passBtn.disabled = true;
    lastTurnWasMe = false;
  }
});

document.getElementById('playBtn').addEventListener('click', () => {
  if (selectedCards.length === 0) return alert('카드를 선택하세요.');
  socket.emit('playCards', { roomId: currentRoomId, cards: selectedCards });
});
document.getElementById('passBtn').addEventListener('click', () => socket.emit('passTurn', { roomId: currentRoomId }));

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
  const box = document.getElementById('chat-messages');
  const div = document.createElement('div'); div.innerHTML = `<b>${d.nickname}:</b> ${d.msg}`;
  box.appendChild(div); box.scrollTop = box.scrollHeight;
  chatPreview.innerHTML = `<span style="color:#ffeb3b;">${d.nickname}:</span> ${d.msg}`;
});
