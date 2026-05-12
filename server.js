const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // GitHub Pages 배포 후 해당 도메인으로 변경 권장
    methods: ["GET", "POST"]
  }
});

const rooms = {};
const SUITS = ['🐉', '🐍', '🐺', '🐿️'];

// 1~15까지 4가지 색상의 렉시오 덱 생성
function generateDeck() {
  let deck = [];
  SUITS.forEach(suit => {
    for (let i = 1; i <= 15; i++) {
      deck.push({ suit, number: i, id: `${suit}${i}` });
    }
  });
  return deck.sort(() => Math.random() - 0.5);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinRoom', ({ roomId, nickname }) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        currentTurn: 0,
        field: [], // 중앙에 놓인 카드들
        comboText: "대기중",
        isPlaying: false
      };
    }
    
    const room = rooms[roomId];
    if (room.players.length < 4 && !room.isPlaying) {
      room.players.push({ id: socket.id, nickname, hand: [] });
    }

    // 4명이 모이거나, 방장이 시작버튼을 눌렀다고 가정하고 자동 게임 시작 (테스트용)
    if (room.players.length >= 2 && !room.isPlaying) { // 테스트를 위해 2명 이상이면 세팅
      room.isPlaying = true;
      const deck = generateDeck();
      
      // 카드 분배 (인원수에 맞게 분배)
      const cardsPerPlayer = Math.floor(deck.length / room.players.length);
      room.players.forEach((p, index) => {
        p.hand = deck.slice(index * cardsPerPlayer, (index + 1) * cardsPerPlayer);
        // 번호 오름차순 정렬
        p.hand.sort((a, b) => a.number - b.number);
      });
    }

    io.to(roomId).emit('updateRoom', room);
  });

  socket.on('playCards', ({ roomId, cards, comboName }) => {
    const room = rooms[roomId];
    if (!room) return;

    // 실제로는 여기서 렉시오 족보 룰(이전 패보다 높은지) 검증 로직이 들어가야 함
    room.field = cards; 
    room.comboText = comboName;

    // 패를 낸 플레이어의 손에서 카드 제거
    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== -1) {
      room.players[playerIndex].hand = room.players[playerIndex].hand.filter(
        hc => !cards.find(c => c.id === hc.id)
      );
    }

    // 다음 턴으로 넘기기
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
    // 플레이어 퇴장 처리 로직 (생략: 프로토타입용)
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
