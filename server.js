const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const rooms = {};
const SUITS = ['☀️', '🌙', '⭐', '☁️'];

// 렉시오 숫자 랭킹 (3=1, 4=2 ... 14(1)=12, 15(2)=13)
function getLexioRank(number) {
  if (number === 1) return 14;
  if (number === 2) return 15;
  return number - 2; 
}

// 렉시오 문양 랭킹 (구름 < 별 < 달 < 해)
function getSuitRank(suit) {
  if (suit === '☁️') return 1;
  if (suit === '⭐') return 2;
  if (suit === '🌙') return 3;
  if (suit === '☀️') return 4;
  return 0;
}

function generateDeck(maxPlayers) {
  let maxNum = 15;
  if (maxPlayers === 3) maxNum = 9;
  if (maxPlayers === 4) maxNum = 13;

  let deck = [];
  SUITS.forEach(suit => {
    for (let i = 1; i <= maxNum; i++) deck.push({ suit, number: i, id: `${suit}${i}` });
  });
  return deck.sort(() => Math.random() - 0.5);
}

function getRoomList() {
  return Object.values(rooms)
    .filter(r => !r.isPlaying && r.players.length < r.maxPlayers)
    .map(r => ({ id: r.id, name: r.name, maxPlayers: r.maxPlayers, currentPlayers: r.players.length, isPlaying: r.isPlaying }));
}

function broadcastRoomList() { io.emit('roomList', getRoomList()); }

// --- 렉시오 족보 판독 엔진 ---
function analyzeCombo(cards) {
  // 랭크 오름차순 -> 문양 오름차순 정렬
  cards.sort((a,b) => getLexioRank(a.number) - getLexioRank(b.number) || getSuitRank(a.suit) - getSuitRank(b.suit));
  const len = cards.length;

  if (len === 1) return { valid: true, type: 1, rank: getLexioRank(cards[0].number), suitRank: getSuitRank(cards[0].suit), name: '싱글' };
  
  if (len === 2) {
    if (cards[0].number !== cards[1].number) return { valid: false };
    return { valid: true, type: 2, rank: getLexioRank(cards[0].number), suitRank: getSuitRank(cards[1].suit), name: '페어' }; // 높은 문양 기준
  }

  if (len === 3) {
    if (cards[0].number === cards[1].number && cards[1].number === cards[2].number) {
      return { valid: true, type: 3, rank: getLexioRank(cards[0].number), suitRank: getSuitRank(cards[2].suit), name: '트리플' };
    }
    return { valid: false };
  }

  if (len === 5) {
    const ranks = cards.map(c => getLexioRank(c.number));
    const suits = cards.map(c => getSuitRank(c.suit));
    const isFlush = suits.every(s => s === suits[0]);
    let isStraight = true;
    for(let i=1; i<5; i++) if (ranks[i] !== ranks[0] + i) isStraight = false;

    const counts = {};
    ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
    const countVals = Object.values(counts).sort((a,b)=>b-a);

    if (isStraight && isFlush) return { valid: true, type: 5, power: 5, rank: ranks[4], suitRank: suits[4], name: "스트레이트 플러시" };
    if (countVals[0] === 4) {
      const quadRank = Number(Object.keys(counts).find(k => counts[k] === 4));
      return { valid: true, type: 5, power: 4, rank: quadRank, suitRank: 4, name: "포카드" };
    }
    if (countVals[0] === 3 && countVals[1] === 2) {
      const tripleRank = Number(Object.keys(counts).find(k => counts[k] === 3));
      return { valid: true, type: 5, power: 3, rank: tripleRank, suitRank: 4, name: "풀하우스" };
    }
    if (isFlush) return { valid: true, type: 5, power: 2, rank: ranks[4], suitRank: suits[4], name: "플러시" };
    if (isStraight) return { valid: true, type: 5, power: 1, rank: ranks[4], suitRank: suits[4], name: "스트레이트" };
    
    return { valid: false };
  }
  return { valid: false }; // 4장이나 6장이상 제출 차단
}

// 이전 패와 새로운 패 비교 로직
function canPlay(lastCombo, newCombo) {
  if (!newCombo.valid) return false;
  if (!lastCombo) return true; // 선(Start)일 때는 유효한 패면 무조건 통과
  if (lastCombo.type !== newCombo.type) return false; // 싱글엔 싱글, 페어엔 페어만

  if (newCombo.type === 5) {
    if (newCombo.power > lastCombo.power) return true; // (예: 풀하우스 > 스트레이트)
    if (newCombo.power < lastCombo.power) return false;
  }
  
  // 타입이 같을 때 숫자(Rank) 비교
  if (newCombo.rank > lastCombo.rank) return true;
  // 숫자가 같을 때 문양(Suit) 비교
  if (newCombo.rank === lastCombo.rank && newCombo.suitRank > lastCombo.suitRank) return true;
  return false;
}

io.on('connection', (socket) => {
  socket.emit('roomList', getRoomList());

  socket.on('createRoom', ({ roomName, maxPlayers, nickname }) => {
    const roomId = 'room_' + Date.now();
    rooms[roomId] = {
      id: roomId, name: roomName, maxPlayers: parseInt(maxPlayers),
      players: [], currentTurn: 0, field: [], comboText: "대기중", isPlaying: false, passCount: 0
    };
    joinRoomLogic(socket, roomId, nickname);
  });

  socket.on('joinRoom', ({ roomId, nickname }) => joinRoomLogic(socket, roomId, nickname));

  function joinRoomLogic(socket, roomId, nickname) {
    const room = rooms[roomId];
    if (!room || room.players.length >= room.maxPlayers) return;

    socket.join(roomId);
    // 기본 코인 100개 지급
    room.players.push({ id: socket.id, nickname, hand: [], coins: 100 });

    if (room.players.length === room.maxPlayers && !room.isPlaying) {
      room.isPlaying = true;
      dealCards(room);
    }
    io.to(roomId).emit('updateRoom', room);
    broadcastRoomList(); 
  }

  function dealCards(room) {
    const deck = generateDeck(room.maxPlayers);
    const cardsPerPlayer = Math.floor(deck.length / room.maxPlayers);
    room.players.forEach((p, index) => {
      p.hand = deck.slice(index * cardsPerPlayer, (index + 1) * cardsPerPlayer);
      p.hand.sort((a, b) => getLexioRank(a.number) - getLexioRank(b.number) || getSuitRank(a.suit) - getSuitRank(b.suit));
    });
    room.field = [];
    room.passCount = 0;
    room.comboText = "선입니다!";
  }

  socket.on('playCards', ({ roomId, cards }) => {
    const room = rooms[roomId];
    if (!room) return;

    const newCombo = analyzeCombo(cards);
    if (!newCombo.valid) return socket.emit('playError', '제출할 수 없는 족보입니다. 장수와 규칙을 확인하세요.');

    const lastCombo = room.field.length > 0 ? analyzeCombo(room.field) : null;
    if (!canPlay(lastCombo, newCombo)) return socket.emit('playError', '현재 깔린 패보다 강력한 패를 내거나 같은 규칙(싱글/페어 등)으로 내야합니다.');

    // 정상 처리
    room.field = cards; 
    room.comboText = newCombo.name;
    room.passCount = 0; 

    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    const player = room.players[playerIndex];
    player.hand = player.hand.filter(hc => !cards.find(c => c.id === hc.id));

    // 게임 종료 (승리) 체크 및 코인 정산
    if (player.hand.length === 0) {
      room.players.forEach(p => {
        if (p.id !== player.id) {
          const penalty = p.hand.length;
          p.coins -= penalty;
          player.coins += penalty;
        }
      });
      room.comboText = `🎉 ${player.nickname} 승리! (5초 뒤 새게임)`;
      io.to(roomId).emit('updateRoom', room);

      // 5초 뒤 자동 재시작
      setTimeout(() => {
        dealCards(room);
        room.currentTurn = playerIndex; // 이긴 사람이 다음 판 선
        io.to(roomId).emit('updateRoom', room);
      }, 5000);
      return;
    }

    room.currentTurn = (room.currentTurn + 1) % room.players.length;
    io.to(roomId).emit('updateRoom', room);
  });

  socket.on('passTurn', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.field.length === 0) return socket.emit('playError', '선(Start)은 패스할 수 없습니다!');

    room.passCount += 1;
    room.currentTurn = (room.currentTurn + 1) % room.players.length;

    if (room.passCount >= room.players.length - 1) {
      room.field = []; 
      room.comboText = "선입니다!";
      room.passCount = 0; 
    }
    io.to(roomId).emit('updateRoom', room);
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        if (room.players.length === 0) delete rooms[roomId];
        else io.to(roomId).emit('updateRoom', room);
        broadcastRoomList();
        break;
      }
    }
  });
});

server.listen(process.env.PORT || 3000);
