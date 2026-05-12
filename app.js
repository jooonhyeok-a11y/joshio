// ★ 필수수정: Render에 배포한 서버 주소로 변경하세요!
const socket = io('https://joshio.onrender.com');

let myId = '';
let currentRoomId = '';
let selectedCards = [];

const lobbyEl = document.getElementById('lobby');
const gameBoardEl = document.getElementById('game-board');
const roomListUl = document.getElementById('roomList');
const nicknameInput = document.getElementById('nicknameInput');
const roomNameInput = document.getElementById('roomNameInput');
const playerCountSelect = document.getElementById('playerCountSelect');

// 로비: 방 목록 업데이트 수신
socket.on('roomList', (rooms) => {
  roomListUl.innerHTML = '';
  if(rooms.length === 0) {
    roomListUl.innerHTML = '<li>현재 생성된 방이 없습니다.</li>';
    return;
  }
  
  rooms.forEach(room => {
    const li = document.createElement('li');
    li.className = 'room-item';
    li.innerHTML = `
      <span><strong>${room.name}</strong> (${room.currentPlayers}/${room.maxPlayers}명)</span>
      <button onclick="joinRoom('${room.id}')">입장</button>
    `;
    roomListUl.appendChild(li);
  });
});

// 로비: 방 만들기 버튼 클릭
document.getElementById('createRoomBtn').addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  const roomName = roomNameInput.value.trim();
  const maxPlayers = playerCountSelect.value;
  
  if (!nickname) return alert("닉네임을 입력하세요!");
  if (!roomName) return alert("방 제목을 입력하세요!");

  socket.emit('createRoom', { roomName, maxPlayers, nickname });
  enterGameMode();
});

// 로비: 만들어진 방에 입장하기
window.joinRoom = function(roomId) {
  const nickname = nicknameInput.value.trim();
  if (!nickname) return alert("닉네임을 먼저 입력하세요!");
  
  socket.emit('joinRoom', { roomId, nickname });
  enterGameMode();
}

function enterGameMode() {
  lobbyEl.style.display = 'none';
  gameBoardEl.style.display = 'block';
}

// 게임: 카드 렌더링 함수 (색상 반영)
function renderCard(cardData, isHand = false) {
  const div = document.createElement('div');
  // 카드의 수트에 맞는 클래스명 추가 (예: suit-🐉)
  div.className = `card suit-${cardData.suit}` + (isHand ? ' in-hand' : '');
  div.innerHTML = `<div class="number">${cardData.number}</div><div class="suit">${cardData.suit}</div>`;
  
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

function getComboName(cards) {
  if (cards.length === 1) return "싱글";
  if (cards.length === 2) return "페어";
  if (cards.length === 3) return "트리플";
  if (cards.length === 5) return "5장 조합";
  return "잘못된 조합";
}

// 게임: 서버로부터 상태 업데이트 수신
socket.on('updateRoom', (room) => {
  currentRoomId = room.id;
  document.getElementById('center-field').innerHTML = '';
  room.field.forEach(card => {
    document.getElementById('center-field').appendChild(renderCard(card, false));
  });
  document.getElementById('combo-text').innerText = room.comboText;

  const myHandEl = document.getElementById('my-hand');
  const opponentsEl = document.getElementById('opponents');
  myHandEl.innerHTML = '';
  opponentsEl.innerHTML = '';
  selectedCards = []; 

  let myIndex = -1;
  room.players.forEach((player, index) => {
    if (player.id === socket.id) {
      myIndex = index;
      player.hand.forEach(card => myHandEl.appendChild(renderCard(card, true)));
    } else {
      const opDiv = document.createElement('div');
      opDiv.innerText = `${player.nickname}: ${player.hand.length}장`;
      opponentsEl.appendChild(opDiv);
    }
  });

  const turnIndicator = document.getElementById('my-turn-indicator');
  const playBtn = document.getElementById('playBtn');
  const passBtn = document.getElementById('passBtn');

  if (room.isPlaying) {
      if (myIndex !== -1 && room.currentTurn === myIndex) {
        turnIndicator.style.display = 'block';
        turnIndicator.innerText = "👉 내 턴입니다!";
        playBtn.disabled = false;
        passBtn.disabled = false;
      } else {
        turnIndicator.style.display = 'none';
        playBtn.disabled = true;
        passBtn.disabled = true;
      }
  } else {
      turnIndicator.style.display = 'block';
      turnIndicator.innerText = `대기중... (${room.players.length}/${room.maxPlayers}명)`;
  }
});

document.getElementById('playBtn').addEventListener('click', () => {
  if (selectedCards.length === 0) return alert('카드를 선택해주세요!');
  const comboName = getComboName(selectedCards);
  socket.emit('playCards', { roomId: currentRoomId, cards: selectedCards, comboName });
});

document.getElementById('passBtn').addEventListener('click', () => {
  socket.emit('passTurn', { roomId: currentRoomId });
});
