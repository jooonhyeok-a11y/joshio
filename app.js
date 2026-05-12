// ★ Render.com 주소로 수정
const socket = io('https://joshio.onrender.com'); 

let myId = '';
let currentRoomId = '';
let selectedCards = [];

const lobbyEl = document.getElementById('lobby');
const gameBoardEl = document.getElementById('game-board');
const roomListUl = document.getElementById('roomList');
const nicknameInput = document.getElementById('nicknameInput');
const roomNameInput = document.getElementById('roomNameInput');

socket.on('playError', (msg) => { alert(msg); });

socket.on('roomList', (rooms) => {
  roomListUl.innerHTML = '';
  if(rooms.length === 0) {
    roomListUl.innerHTML = '<li class="room-item" style="justify-content:center; color:#888;">현재 생성된 방이 없습니다.</li>';
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
  const nickname = nicknameInput.value.trim();
  const roomName = roomNameInput.value.trim();
  const maxPlayers = document.getElementById('playerCountSelect').value;
  if (!nickname) return alert("닉네임을 입력하세요!");
  if (!roomName) return alert("방 제목을 입력하세요!");

  socket.emit('createRoom', { roomName, maxPlayers, nickname });
  enterGameMode();
});

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
    });
  }
  return div;
}

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
  let isMyTurn = false;
  
  room.players.forEach((player, index) => {
    if (player.id === socket.id) {
      myIndex = index;
      if (room.currentTurn === myIndex) isMyTurn = true;
      
      const coinsDisplay = document.getElementById('my-coins-display');
      // 파산 처리
      if (player.isOut) {
        coinsDisplay.innerHTML = `💀 파산 (Out)`;
        coinsDisplay.style.color = "#ff6b6b";
        coinsDisplay.style.borderColor = "#ff6b6b";
      } else {
        coinsDisplay.innerHTML = `🪙 내 코인: ${player.coins}`;
        coinsDisplay.style.color = "#ffeb3b";
        coinsDisplay.style.borderColor = "#fff";
        player.hand.forEach(card => myHandEl.appendChild(renderCard(card, true)));
      }
    } else {
      // 상대방 렌더링
      const opDiv = document.createElement('div');
      opDiv.className = 'opponent-area';
      if (player.isOut) opDiv.style.opacity = '0.4'; // 파산자 흐리게
      
      const nameDiv = document.createElement('div');
      nameDiv.className = 'opponent-name';
      if (player.isOut) {
        nameDiv.innerHTML = `<span style="color:red;">💀파산</span><br>${player.nickname}`;
      } else {
        nameDiv.innerHTML = `🪙${player.coins}<br>${player.nickname} (${player.hand.length}장)`;
      }
      opDiv.appendChild(nameDiv);

      const cardsDiv = document.createElement('div');
      cardsDiv.className = 'opponent-hand';
      if (!player.isOut) {
        for(let i=0; i<player.hand.length; i++) {
          const backCard = document.createElement('div');
          backCard.className = 'card-back';
          cardsDiv.appendChild(backCard);
        }
      }
      opDiv.appendChild(cardsDiv);
      opponentsEl.appendChild(opDiv);
    }
  });

  const turnIndicator = document.getElementById('my-turn-indicator');
  const playBtn = document.getElementById('playBtn');
  const passBtn = document.getElementById('passBtn');

  if (room.isPlaying) {
      if (isMyTurn && !room.players[myIndex].isOut) {
        turnIndicator.style.display = 'block';
        turnIndicator.innerText = room.field.length === 0 ? "👉 내 턴! (선입니다)" : "👉 내 턴입니다!";
        playBtn.disabled = false;
        passBtn.disabled = false;
      } else {
        turnIndicator.style.display = 'none';
        playBtn.disabled = true;
        passBtn.disabled = true;
      }
  } else {
      turnIndicator.style.display = 'block';
      turnIndicator.innerText = `대기/종료 (${room.players.length}/${room.maxPlayers}명)`;
  }
});

document.getElementById('playBtn').addEventListener('click', () => {
  if (selectedCards.length === 0) return alert('카드를 선택해주세요!');
  socket.emit('playCards', { roomId: currentRoomId, cards: selectedCards });
});

document.getElementById('passBtn').addEventListener('click', () => {
  socket.emit('passTurn', { roomId: currentRoomId });
});
