// 주의: Render.com 배포 후 본인의 서버 URL로 반드시 변경하세요!
const socket = io('https://joshio.onrender.com'); 

let myId = '';
let currentRoomId = '';
let selectedCards = [];

const lobbyEl = document.getElementById('lobby');
const gameBoardEl = document.getElementById('game-board');
const nicknameInput = document.getElementById('nicknameInput');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');

const centerFieldEl = document.getElementById('center-field');
const comboTextEl = document.getElementById('combo-text');
const myHandEl = document.getElementById('my-hand');
const opponentsEl = document.getElementById('opponents');
const playBtn = document.getElementById('playBtn');
const passBtn = document.getElementById('passBtn');
const turnIndicator = document.getElementById('my-turn-indicator');

// 방 입장 이벤트
joinBtn.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  const roomId = roomInput.value.trim();
  if (nickname && roomId) {
    myId = socket.id;
    currentRoomId = roomId;
    socket.emit('joinRoom', { roomId, nickname });
    lobbyEl.style.display = 'none';
    gameBoardEl.style.display = 'block';
  }
});

// UI 렌더링 함수
function renderCard(cardData, isHand = false) {
  const div = document.createElement('div');
  div.className = 'card' + (isHand ? ' in-hand' : '');
  div.innerHTML = `<span class="number">${cardData.number}</span><span class="suit">${cardData.suit}</span>`;
  
  if (isHand) {
    div.addEventListener('click', () => {
      div.classList.toggle('selected');
      const index = selectedCards.findIndex(c => c.id === cardData.id);
      if (index > -1) selectedCards.splice(index, 1);
      else selectedCards.push(cardData);
    });
  }
  return div;
}

// 간단한 조합 판별기 (UI 표기용)
function getComboName(cards) {
  if (cards.length === 1) return "싱글";
  if (cards.length === 2) return "페어";
  if (cards.length === 3) return "트리플";
  if (cards.length === 5) return "5장 조합 (스트레이트 등)";
  return "알 수 없음";
}

// 서버로부터 방 상태 업데이트 수신
socket.on('updateRoom', (room) => {
  // 1. 중앙 필드 업데이트
  centerFieldEl.innerHTML = '';
  room.field.forEach(card => {
    centerFieldEl.appendChild(renderCard(card, false));
  });
  comboTextEl.innerText = room.comboText;

  // 2. 플레이어 정보 (내 상태 및 상대방 카드 장수) 업데이트
  myHandEl.innerHTML = '';
  opponentsEl.innerHTML = '';
  selectedCards = []; // 턴이 바뀌거나 업데이트 되면 선택 초기화

  let myIndex = -1;
  room.players.forEach((player, index) => {
    if (player.id === socket.id) {
      myIndex = index;
      player.hand.forEach(card => {
        myHandEl.appendChild(renderCard(card, true));
      });
    } else {
      // 상대방 렌더링 (이름: 남은장수)
      const opDiv = document.createElement('div');
      opDiv.innerText = `${player.nickname}: ${player.hand.length}장 남음`;
      opponentsEl.appendChild(opDiv);
    }
  });

  // 3. 턴 관리 UI 제어
  if (myIndex !== -1 && room.currentTurn === myIndex) {
    turnIndicator.style.display = 'block';
    turnIndicator.innerText = "내 턴입니다!";
    playBtn.disabled = false;
    passBtn.disabled = false;
  } else {
    turnIndicator.style.display = 'none';
    playBtn.disabled = true;
    passBtn.disabled = true;
  }
});

// 조합 제출 버튼
playBtn.addEventListener('click', () => {
  if (selectedCards.length === 0) return alert('카드를 선택해주세요!');
  const comboName = getComboName(selectedCards);
  socket.emit('playCards', { roomId: currentRoomId, cards: selectedCards, comboName });
});

// 패스 버튼
passBtn.addEventListener('click', () => {
  socket.emit('passTurn', { roomId: currentRoomId });
});
