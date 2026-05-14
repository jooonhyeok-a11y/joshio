const socket = io('https://joshio.onrender.com');

let currentRoomId = '';
let selectedCards = [];
let myNickname = localStorage.getItem('lexio_nickname') || '';
let myPassword = localStorage.getItem('lexio_password') || '';
let sortMode = 'number'; 
let lastTurnWasMe = false; 
let sessionId = localStorage.getItem('lexio_sessionId') || '';

if(myNickname && myPassword) {
    document.getElementById('nicknameInput').value = myNickname;
    document.getElementById('passwordInput').value = myPassword;
}

function getLexioRank(num) { const number = Number(num); if (number === 1) return 14; if (number === 2) return 15; return number - 2; }
function getSuitRank(suit) { if (suit === '☁️') return 1; if (suit === '⭐') return 2; if (suit === '🌙') return 3; if (suit === '☀️') return 4; return 0; }

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
  if(audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  if (type === 'select') { osc.type = 'sine'; osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05); gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05); osc.start(now); osc.stop(now + 0.05); }
  else if (type === 'unselect') { osc.type = 'sine'; osc.frequency.setValueAtTime(1200, now); osc.frequency.exponentialRampToValueAtTime(600, now + 0.05); gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05); osc.start(now); osc.stop(now + 0.05); }
  else if (type === 'play') { osc.type = 'triangle'; osc.frequency.setValueAtTime(300, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.1); gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1); osc.start(now); osc.stop(now + 0.1); }
  else if (type === 'pass') { osc.type = 'square'; osc.frequency.setValueAtTime(150, now); osc.frequency.exponentialRampToValueAtTime(50, now + 0.15); gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15); osc.start(now); osc.stop(now + 0.15); }
  else if (type === 'turn') { osc.type = 'sine'; osc.frequency.setValueAtTime(880, now); gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3); osc.start(now); osc.stop(now + 0.3); }
  else if (type === 'error') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, now); gain.gain.setValueAtTime(0.1, now); osc.start(now); osc.stop(now + 0.2); }
  else if (type === 'win') { osc.type = 'triangle'; osc.frequency.setValueAtTime(440, now); osc.frequency.setValueAtTime(880, now + 0.3); gain.gain.setValueAtTime(0.1, now); osc.start(now); osc.stop(now + 0.5); }
  else if (type === 'chat') { osc.type = 'sine'; osc.frequency.setValueAtTime(1000, now); gain.gain.setValueAtTime(0.05, now); osc.start(now); osc.stop(now + 0.1); }
}

const lobbyEl = document.getElementById('lobby');
const gameBoardEl = document.getElementById('game-board');

socket.on('playError', (msg) => { 
    alert(msg); 
    playSound('error'); 
    document.getElementById('playBtn').disabled = false;
    document.getElementById('passBtn').disabled = false;
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

document.getElementById('loginRejoinBtn').addEventListener('click', () => {
  const nick = document.getElementById('nicknameInput').value.trim();
  const pass = document.getElementById('passwordInput').value.trim();
  if (!nick || !pass) return alert("닉네임과 비밀번호를 모두 입력하세요.");

  socket.emit('authenticate', { nickname: nick, password: pass }, (res) => {
      if (!res.success) { playSound('error'); return alert(res.msg); }
      
      sessionId = res.sessionId;
      myNickname = nick;
      localStorage.setItem('lexio_nickname', nick);
      localStorage.setItem('lexio_password', pass);
      localStorage.setItem('lexio_sessionId', sessionId);

      document.getElementById('stats-display').innerText = `누적 승리: ${res.stats.wins}회 | 최고 자산: ${res.stats.maxCoins}개`;

      if (res.activeRoomId) {
          socket.emit('joinRoom', { roomId: res.activeRoomId, nickname: nick, sessionId });
          enterGameMode();
      } else {
          alert("로그인 성공! 현재 참여 중인 게임이 없습니다. 방을 만들거나 목록에서 입장해주세요.");
      }
  });
});

function authenticateAndGo(action, data) {
  const nick = document.getElementById('nicknameInput').value.trim();
  const pass = document.getElementById('passwordInput').value.trim();
  if (!nick || !pass) return alert("닉네임과 비밀번호를 모두 입력하세요.");

  socket.emit('authenticate', { nickname: nick, password: pass }, (res) => {
      if (!res.success) { playSound('error'); return alert(res.msg); }
      
      sessionId = res.sessionId;
      myNickname = nick;
      localStorage.setItem('lexio_nickname', nick);
      localStorage.setItem('lexio_password', pass);
      localStorage.setItem('lexio_sessionId', sessionId);
      
      document.getElementById('stats-display').innerText = `누적 승리: ${res.stats.wins}회 | 최고 자산: ${res.stats.maxCoins}개`;

      if (res.activeRoomId && action !== 'joinRoom') {
          return alert("이미 참여 중인 방이 있습니다. '로그인 / 진행 중인 게임 복귀' 버튼을 눌러주세요.");
      }

      data.nickname = nick;
      data.sessionId = sessionId;
      socket.emit(action, data);
      enterGameMode();
  });
}

document.getElementById('createRoomBtn').addEventListener('click', () => {
  const rName = document.getElementById('roomNameInput').value.trim();
  const maxP = document.getElementById('playerCountSelect').value;
  if (!rName) return alert("방 제목을 입력하세요.");
  authenticateAndGo('createRoom', { roomName: rName, maxPlayers: maxP });
});

window.joinRoom = function(id) { authenticateAndGo('joinRoom', { roomId: id }); }

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

function renderCard(cardData, isHand = false, oldSelectedIds = []) {
  const div = document.createElement('div');
  div.className = `card suit-${cardData.suit}` + (isHand ? ' in-hand' : '');
  div.innerHTML = `<div class="number">${cardData.number}</div><div class="suit">${cardData.suit}</div>`;
  div.dataset.id = cardData.id;
  div.dataset.card = JSON.stringify(cardData);
  
  if (isHand) {
    if (oldSelectedIds.includes(cardData.id)) {
        div.classList.add('selected');
        if (!selectedCards.find(c => c.id === cardData.id)) selectedCards.push(cardData);
    }
    div.addEventListener('click', () => {
      const idx = selectedCards.findIndex(c => c.id === cardData.id);
      if (idx > -1) {
        selectedCards.splice(idx, 1); div.classList.remove('selected'); playSound('unselect');
      } else { 
        selectedCards.push(cardData); div.classList.add('selected'); playSound('select');
      }
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
  if(len === 2) text = Number(selectedCards[0].number) === Number(selectedCards[1].number) ? "페어 (2장)" : "잘못된 조합";
  if(len === 3) text = (Number(selectedCards[0].number) === Number(selectedCards[1].number) && Number(selectedCards[1].number) === Number(selectedCards[2].number)) ? "트리플 (3장)" : "잘못된 조합";
  if(len === 5) text = "5장 조합 (검증 대기)";
  if(len === 4 || len > 5) text = "불가능한 장수";
  g.innerText = `현재 선택: ${text}`;
  g.style.color = text.includes("잘못") || text.includes("불가능") ? "#ff6b6b" : "#4ade80";
}

socket.on('roundEndAnimation', (data) => {
  playSound('win');
  document.getElementById('combo-text').innerText = data.msg;
});

socket.on('showRoundSummary', (room) => {
  const modal = document.getElementById('round-modal');
  const myData = room.roundSummary.data[sessionId];
  if (!myData) return;

  const titleEl = document.getElementById('modal-title');
  const winnerAnnounceEl = document.getElementById('modal-winner-announce');
  const roundDetailsEl = document.getElementById('modal-round-details');
  const finalRankingsEl = document.getElementById('modal-final-rankings');
  const btn = document.getElementById('modal-confirm-btn');

  // ★ 게임 완전 종료 여부와 무관하게 결산 정보(roundDetailsEl)를 무조건 보여주도록 수정
  roundDetailsEl.style.display = 'block';

  if (room.roundSummary.isGameOver) {
    titleEl.innerText = room.roundSummary.gameEndReason;
    winnerAnnounceEl.innerText = `🏆 ${room.roundSummary.overallWinnerName} 최종 우승!`;
    winnerAnnounceEl.style.display = 'block';
    
    finalRankingsEl.innerHTML = '';
    room.roundSummary.finalRankings.forEach((r, idx) => {
        const div = document.createElement('div');
        div.className = 'ranking-item' + (idx === 0 ? ' ranking-1st' : '');
        div.innerHTML = `<span>${idx + 1}위: ${r.avatar} ${r.nickname}</span><span>💰 ${r.coins}</span>`;
        finalRankingsEl.appendChild(div);
    });
    finalRankingsEl.style.display = 'block';
    
    // ★ 게임 완전히 종료 시 "새 게임 시작" 레디 이벤트 연동
    btn.innerText = "새 게임 시작하기"; 
    btn.disabled = false;
    btn.onclick = () => { 
        playSound('select');
        socket.emit('readyRestartGame', { roomId: currentRoomId, sessionId }); 
        btn.innerText = `대기 중...`;
        btn.disabled = true;
    };
  } else {
    titleEl.innerText = `${room.roundSummary.roundNum}라운드 결산`;
    winnerAnnounceEl.style.display = 'none';
    finalRankingsEl.style.display = 'none';
    
    // ★ 라운드 종료 시 다음 라운드 레디 이벤트 연동
    btn.innerText = "확인 (다음 라운드 대기)";
    btn.disabled = false;
    btn.onclick = () => {
        playSound('select');
        socket.emit('readyNextRound', { roomId: currentRoomId, sessionId });
        btn.innerText = `대기 중...`;
        btn.disabled = true;
    };
  }

  let tileText = `${myData.remainingTiles}개`;
  if (myData.twoCount > 0) {
      const multi = Math.pow(2, myData.twoCount);
      tileText = `${myData.effCards}개 (기본 ${myData.remainingTiles}개 x '2' ${myData.twoCount}장 소지 벌금 ${multi}배!)`;
  }
  document.getElementById('modal-my-tiles').innerText = `내 남은 타일: ${tileText}`;
  
  const exBox = document.getElementById('modal-exchanges'); exBox.innerHTML = '';
  for (const [opp, val] of Object.entries(myData.exchanges)) {
    if(val === 0) continue;
    const item = document.createElement('div'); 
    item.className = 'exchange-item' + (val < 0 ? ' negative' : '');
    const arrow = val > 0 ? '⬅️ 받음' : '지급 ➡️';
    const sign = val > 0 ? '+' : '';
    item.innerHTML = `<span>상대: <b>${opp}</b></span> <span>${arrow}</span> <span class="ex-amount" style="color:${val > 0 ? '#4ade80' : '#ff6b6b'}">${sign}${val}</span>`;
    exBox.appendChild(item);
  }
  
  document.getElementById('modal-total-change').innerText = `나의 총 변동: ${myData.roundChange > 0 ? '+' : ''}${myData.roundChange}개`;
  document.getElementById('modal-current-coins').innerText = `💰 현재 소지 코인: ${myData.totalCoins}개`;
  modal.style.display = 'flex';
});

// ★ 레디 시스템 UI (준비 완료)
socket.on('readyStatus', ({ current, total }) => {
   const btn = document.getElementById('modal-confirm-btn');
   if(btn.disabled) btn.innerText = `${current}/${total} 준비 완료.`;
});

socket.on('updateRoom', (room) => {
  currentRoomId = room.id;
  document.getElementById('round-indicator-text').innerText = `${room.currentRound} / ${room.maxRound} ROUND`;
  
  if(!room.roundSummary) document.getElementById('round-modal').style.display = 'none';

  const field = document.getElementById('center-field'); field.innerHTML = '';
  room.field.forEach(c => field.appendChild(renderCard(c, false)));
  
  document.getElementById('combo-text').innerText = room.comboText;
  document.getElementById('last-played-name').innerText = (room.field.length > 0 && room.lastPlayedName && !room.isRoundEnding) ? `🗣️ ${room.lastPlayedName}님이 낸 패` : '';

  const oldSelectedIds = selectedCards.map(c => c.id);
  selectedCards = [];

  const myHand = document.getElementById('my-hand'); myHand.innerHTML = '';
  const opps = document.getElementById('opponents'); opps.innerHTML = '';

  let myIdx = -1;
  room.players.forEach((p, i) => { if(p.sessionId === sessionId) myIdx = i; });

  room.players.forEach((p, i) => {
    if (i === myIdx) {
      document.getElementById('my-coins-display').innerText = `💰 ${p.coins}`;
      if (!p.isOut) {
        let handCopy = [...p.hand];
        handCopy.sort((a,b) => {
          if (sortMode === 'number') return getLexioRank(a.number) - getLexioRank(b.number) || getSuitRank(a.suit) - getSuitRank(b.suit);
          return getSuitRank(a.suit) - getSuitRank(b.suit) || getLexioRank(a.number) - getLexioRank(b.number);
        });
        handCopy.forEach(c => myHand.appendChild(renderCard(c, true, oldSelectedIds)));
      }
    } else {
      let rel = (i - myIdx + room.players.length) % room.players.length;
      let pos = ''; const total = room.players.length;
      if (total === 2) pos = 'pos-top';
      else if (total === 3) pos = (rel === 1 ? 'pos-left' : 'pos-right');
      else if (total === 4) pos = (rel === 1 ? 'pos-left' : rel === 2 ? 'pos-top' : 'pos-right');
      else { pos = (rel === 1 ? 'pos-left' : rel === 2 ? 'pos-top-left' : rel === 3 ? 'pos-top-right' : 'pos-right'); }
      const isTurn = (room.currentTurn === i && room.isPlaying && !p.isOut);
      const div = document.createElement('div'); div.className = `opponent-area ${pos}` + (isTurn ? ' is-turn' : '');
      div.innerHTML = (isTurn ? '<span class="turn-badge">현재 턴</span><br>' : '') + `<span class="opponent-name">${p.isOut ? '💀' : p.isDisconnected ? '⏳' : p.avatar} ${p.nickname} (💰${p.coins})</span>`;
      const cardsWrapper = document.createElement('div'); cardsWrapper.className = 'opponent-hand';
      if (!p.isOut) {
          for(let k=0; k<p.hand.length; k++) cardsWrapper.innerHTML += '<div class="card-back"></div>';
          cardsWrapper.innerHTML += `<div class="card-count-badge">${p.hand.length}장</div>`;
      }
      div.appendChild(cardsWrapper); opps.appendChild(div);
    }
  });

  updateComboGuide();

  const turnIndicator = document.getElementById('my-turn-indicator');
  const playBtn = document.getElementById('playBtn');
  const passBtn = document.getElementById('passBtn');
  
  if (room.isPlaying && !room.isRoundEnding) {
    if (myIdx !== -1 && room.currentTurn === myIdx && !room.players[myIdx].isOut) {
      turnIndicator.style.display = 'block';
      turnIndicator.innerText = room.field.length === 0 ? "👉 내 턴! (선입니다)" : "👉 내 턴입니다!";
      playBtn.disabled = false; passBtn.disabled = false;
      if (!lastTurnWasMe) playSound('turn'); lastTurnWasMe = true;
    } else {
      turnIndicator.style.display = 'block'; turnIndicator.innerText = "내 턴이 아닙니다";
      playBtn.disabled = true; passBtn.disabled = true; lastTurnWasMe = false;
    }
  } else {
    turnIndicator.style.display = 'block'; turnIndicator.innerText = room.isRoundEnding ? `라운드 결산 중...` : `대기/종료 (${room.players.length}/${room.maxPlayers}명)`;
    playBtn.disabled = true; passBtn.disabled = true; lastTurnWasMe = false;
  }
});

document.getElementById('playBtn').addEventListener('click', () => {
  if (selectedCards.length === 0) { playSound('error'); return alert('카드를 선택하세요.'); }
  if (![1, 2, 3, 5].includes(selectedCards.length)) { playSound('error'); return alert('1, 2, 3, 5장만 낼 수 있습니다.'); }
  
  // ★ 버튼 잠금
  document.getElementById('playBtn').disabled = true;
  document.getElementById('passBtn').disabled = true;
  playSound('play'); 
  socket.emit('playCards', { roomId: currentRoomId, sessionId, cards: selectedCards });
});

document.getElementById('passBtn').addEventListener('click', () => { 
  document.getElementById('playBtn').disabled = true;
  document.getElementById('passBtn').disabled = true;
  playSound('pass'); 
  socket.emit('passTurn', { roomId: currentRoomId, sessionId }); 
});

document.getElementById('sendChatBtn').addEventListener('click', () => {
  const m = document.getElementById('chatInput').value.trim();
  if (m) { socket.emit('chatMessage', { roomId: currentRoomId, nickname: myNickname, msg: m }); document.getElementById('chatInput').value = ''; }
});

socket.on('chatMessage', (d) => {
  playSound('chat');
  const box = document.getElementById('chat-messages');
  const div = document.createElement('div'); div.innerHTML = `<b>${d.nickname}:</b> ${d.msg}`;
  box.appendChild(div); box.scrollTop = box.scrollHeight;
});
