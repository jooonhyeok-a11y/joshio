const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

const rooms = {};
const SUITS = ['🐉', '🐍', '🐺', '🐿️'];

// 인원수에 맞춘 렉시오 덱 생성
function generateDeck(maxPlayers) {
  let maxNum = 15; // 5인: 1~15 (총 60장, 인당 12장)
  if (maxPlayers === 3) maxNum = 9;  // 3인: 1~9 (총 36장, 인당 12장)
  if (maxPlayers === 4) maxNum = 13; // 4인: 1~13 (총 52장, 인당 13장)

  let deck = [];
  SUITS.forEach(suit => {
    for (let i = 1; i <= maxNum; i++) {
      deck.push({ suit, number: i, id: `${suit}${i}` });
    }
  });
  return deck.sort(() => Math.random() - 0.5);
}

// 로비에 있는 유저들에게 현재 방 목록 전송
function broadcastRoomList() {
  const roomList = Object.values(rooms).map(r => ({
    id: r.id,
    name: r.name,
    maxPlayers: r.maxPlayers,
    currentPlayers: r.players.length,
    isPlaying: r.isPlaying
  })).filter(r => !r.isPlaying); // 꽉 차지 않고 진행중이지 않은 방만 노출
  
  io.emit('roomList', roomList);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // 접속 시 바로 방 목록을 보여줌
  socket.emit('roomList', Object.values(rooms).filter(r => !r.isPlaying));

  // 방 만들기
  socket.on('createRoom', ({ roomName, maxPlayers, nickname }) => {
    const roomId = 'room_' + Date.now();
    rooms[roomId] = {
      id: roomId,
      name: roomName,
      maxPlayers: parseInt(maxPlayers),
      players: [],
      currentTurn: 0,
      field: [],
      comboText: "대기중",
      isPlaying: false
    };
    broadcastRoomList();
    // 방 만든 사람이 자동으로 입장
    joinRoomLogic(socket, roomId, nickname);
  });

  // 기존 방 입장
  socket.on('joinRoom', ({ roomId, nickname }) => {
    joinRoomLogic(socket, roomId, nickname);
  });

  function joinRoomLogic(socket, roomId, nickname) {
    const room = rooms[roomId];
    if (!room) return;
    if (room.players.length >= room.maxPlayers) return; // 꽉 찬 방

    socket.join(roomId);
    room.players.push({ id: socket.id, nickname, hand: [] });

    // 인원이 다 모이면 게임 자동 시작
    if (room.players.length === room.maxPlayers && !room.isPlaying) {
      room.isPlaying = true;
      const deck = generateDeck(room.maxPlayers);
      const cardsPerPlayer = Math.floor(deck.length / room.maxPlayers);
      
      room.players.forEach((p, index) => {
        p.hand = deck.slice(index * cardsPerPlayer, (index + 1) * cardsPerPlayer);
        p.hand.sort((a, b) => a.number - b.number);
      });
      broadcastRoomList(); // 방이 꽉 찼으니 목록에서 제거
    }

    io.to(roomId).emit('updateRoom', room);
    broadcastRoomList();
  }

  // 카드 내기
  socket.on('playCards', ({ roomId, cards, comboName }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.field = cards; 
    room.comboText = comboName;

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
    if (room) {
      room.currentTurn = (room.currentTurn + 1) % room.players.length;
      io.to(roomId).emit('updateRoom', room);
    }
  });

  socket.on('disconnect', () => {
    // 플레이어 나감 처리 로직 (생략)
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
