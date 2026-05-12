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
const SUITS = ['🐉', '🐍', '🐺', '🐿️'];

// 렉시오의 실제 랭킹 (3이 가장 작고, 2가 가장 큼)
function getLexioRank(number) {
  if (number === 1) return 14;
  if (number === 2) return 15;
  return number - 2; // 3은 1, 4는 2... 15는 13
}

// 인원수에 맞춘 렉시오 덱 생성
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

function broadcastRoomList() {
  const roomList = Object.values(rooms).map(r => ({
    id: r.id, name: r.name, maxPlayers: r.maxPlayers, currentPlayers: r.players.length, isPlaying: r.isPlaying
  })).filter(r => !r.isPlaying);
  io.emit('roomList', roomList);
}

io.on('connection', (socket) => {
  socket.emit('roomList', Object.values(rooms).filter(r => !r.isPlaying));

  socket.on('createRoom', ({ roomName, maxPlayers, nickname }) => {
    const roomId = 'room_' + Date.now();
    rooms[roomId] = {
      id: roomId, name: roomName, maxPlayers: parseInt(maxPlayers),
      players: [], currentTurn: 0, field: [], comboText: "대기중", isPlaying: false,
      passCount: 0 // 모두 패스했는지 체크하기 위한 카운트
    };
    broadcastRoomList();
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
        // 렉시오 랭크에 따라 정렬 (3이 왼쪽, 2가 오른쪽)
        p.hand.sort((a, b) => getLexioRank(a.number) - getLexioRank(b.number));
      });
      broadcastRoomList();
    }
    io.to(roomId).emit('updateRoom', room);
    broadcastRoomList();
  }

  socket.on('playCards', ({ roomId, cards, comboName }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.field = cards; 
    room.comboText = comboName;
    room.passCount = 0; // 누군가 패를 냈으므로 패스 카운트 초기화

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

    // 나를 제외한 모든 사람이 패스했다면 (필드 클리어 및 선 잡기)
    if (room.passCount >= room.players.length - 1) {
      room.field = []; // 필드 초기화
      room.comboText = "새로운 턴 (원하는 패를 내세요!)";
      room.passCount = 0; // 패스 카운트 초기화
    }

    io.to(roomId).emit('updateRoom', room);
  });
});

server.listen(process.env.PORT || 3000);
