const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const rooms = {};
// 렉시오 오리지널 수트: 해, 달, 별, 구름
const SUITS = ['☀️', '🌙', '⭐', '☁️'];

function getLexioRank(number) {
  if (number === 1) return 14;
  if (number === 2) return 15;
  return number - 2;
}

function generateDeck(maxPlayers) {
  let maxNum = 15;
  if (maxPlayers === 3) maxNum = 9;
  if (maxPlayers === 4) maxNum = 13;

  let deck = [];
  SUITS.forEach(suit => {
    for (let i = 1; i <= maxNum; i++) {
      deck.push({ suit, number: i, id: `${suit}${i}` });
    }
  });
  return deck.sort(() => Math.random() - 0.5);
}

// 방 목록 갱신용 함수
function getRoomList() {
  return Object.values(rooms)
    .filter(r => !r.isPlaying && r.players.length < r.maxPlayers)
    .map(r => ({
      id: r.id, name: r.name, maxPlayers: r.maxPlayers, 
      currentPlayers: r.players.length, isPlaying: r.isPlaying
    }));
}

// 로비에 있는 모두에게 최신 방 목록 쏘기
function broadcastRoomList() {
  io.emit('roomList', getRoomList());
}

io.on('connection', (socket) => {
  // 접속하자마자 방 목록 받기
  socket.emit('roomList', getRoomList());

  socket.on('createRoom', ({ roomName, maxPlayers, nickname }) => {
    const roomId = 'room_' + Date.now();
    rooms[roomId] = {
      id: roomId, name: roomName, maxPlayers: parseInt(maxPlayers),
      players: [], currentTurn: 0, field: [], comboText: "대기중", isPlaying: false,
      passCount: 0
    };
    joinRoomLogic(socket, roomId, nickname);
  });

  socket.on('joinRoom', ({ roomId, nickname }) => {
    joinRoomLogic(socket, roomId, nickname);
  });

  function joinRoomLogic(socket, roomId, nickname) {
    const room = rooms[roomId];
    if (!room || room.players.length >= room.maxPlayers) return;

    socket.join(roomId);
    room.players.push({ id: socket.id, nickname, hand: [] });

    if (room.players.length === room.maxPlayers && !room.isPlaying) {
      room.isPlaying = true;
      const deck = generateDeck(room.maxPlayers);
      const cardsPerPlayer = Math.floor(deck.length / room.maxPlayers);
      
      room.players.forEach((p, index) => {
        p.hand = deck.slice(index * cardsPerPlayer, (index + 1) * cardsPerPlayer);
        p.hand.sort((a, b) => getLexioRank(a.number) - getLexioRank(b.number));
      });
    }
    
    // 방 안의 사람들에게 게임상태 업데이트, 로비의 사람들에게 방 목록 업데이트
    io.to(roomId).emit('updateRoom', room);
    broadcastRoomList(); 
  }

  socket.on('playCards', ({ roomId, cards, comboName }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.field = cards; 
    room.comboText = comboName;
    room.passCount = 0; 

    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== -1) {
      room.players[playerIndex].hand = room.players[playerIndex].hand.filter(
        hc => !cards.find(c => c.id === hc.id)
      );
    }
    room.currentTurn = (room.currentTurn + 1) % room.players.length;
    io.to(roomId).emit('updateRoom', room);
  });

  socket.on('passTurn', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.passCount += 1;
    room.currentTurn = (room.currentTurn + 1) % room.players.length;

    if (room.passCount >= room.players.length - 1) {
      room.field = []; 
      room.comboText = "새로운 턴 (원하는 패를 내세요!)";
      room.passCount = 0; 
    }
    io.to(roomId).emit('updateRoom', room);
  });

  // 유저가 새로고침하거나 브라우저를 껐을 때의 청소 로직 (버그 방지 핵심)
  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1); // 방에서 유저 제거
        
        if (room.players.length === 0) {
          delete rooms[roomId]; // 방에 아무도 없으면 방 자체를 폭파
        } else {
          io.to(roomId).emit('updateRoom', room); // 남은 사람들에게 업데이트
        }
        broadcastRoomList(); // 방 폭파되거나 인원수 줄었으니 목록 새로고침
        break;
      }
    }
  });
});

server.listen(process.env.PORT || 3000);
