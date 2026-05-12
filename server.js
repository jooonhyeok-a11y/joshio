const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const rooms = {};
const SUITS = ['☁️', '⭐', '🌙', '☀️']; // 로직 처리를 위해 오름차순으로 배치 (구름이 1, 해가 4)

function getLexioRank(number) {
  if (number === 1) return 14;
  if (number === 2) return 15;
  return number - 2; 
}

function getSuitRank(suit) {
  if (suit === '☁️') return 1;
  if (suit === '⭐') return 2;
  if (suit === '🌙') return 3;
  if (suit === '☀️') return 4;
  return 0;
}

// 렉시오 특수 스트레이트 판별 및 랭킹 부여
function getStraightInfo(cards) {
  const nums = cards.map(c => c.number).sort((a,b) => a-b);
  const str = nums.join(',');
  
  if (str === '1,2,3,4,5') return { valid: true, rank: 999 }; // 1등 스트레이트
  if (str === '2,3,4,5,6') return { valid: true, rank: 998 }; // 2등 스트레이트
  if (str === '1,12,13,14,15') return { valid: true, rank: 997 }; // 3등 스트레이트 (12,13,14,15,1)
  
  let isConsecutive = true;
  for(let i=1; i<5; i++) {
    if (nums[i] !== nums[i-1] + 1) { isConsecutive = false; break; }
  }
  if (isConsecutive) return { valid: true, rank: getLexioRank(nums[4]) };
  return { valid: false, rank: 0 };
}

function getStraightHighestCardNum(cards) {
  const nums = cards.map(c => c.number).sort((a,b) => a-b);
  const str = nums.join(',');
  if (str === '1,2,3,4,5') return 2;
  if (str === '2,3,4,5,6') return 2;
  if (str === '1,12,13,14,15') return 1;
  return nums[4]; 
}

function generateDeck(playerCount) {
  let maxNum = 15;
  if (playerCount === 3) maxNum = 9;
  if (playerCount === 4) maxNum = 13;

  let deck = [];
  ['☀️', '🌙', '⭐', '☁️'].forEach(suit => {
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

function analyzeCombo(cards) {
  cards.sort((a,b) => getLexioRank(a.number) - getLexioRank(b.number) || getSuitRank(a.suit) - getSuitRank(b.suit));
  const len = cards.length;

  if (len === 1) return { valid: true, type: 1, rank: getLexioRank(cards[0].number), suitRank: getSuitRank(cards[0].suit), name: '싱글' };
  if (len === 2) {
    if (cards[0].number !== cards[1].number) return { valid: false };
    return { valid: true, type: 2, rank: getLexioRank(cards[0].number), suitRank: getSuitRank(cards[1].suit), name: '페어' }; 
  }
  if (len === 3) {
    if (cards[0].number === cards[1].number && cards[1].number === cards[2].number) {
      return { valid: true, type: 3, rank: getLexioRank(cards[0].number), suitRank: getSuitRank(cards[2].suit), name: '트리플' };
    }
    return { valid: false };
  }
  if (len === 5) {
    const straightInfo = getStraightInfo(cards);
    const isStraight = straightInfo.valid;
    const suits = cards.map(c => getSuitRank(c.suit));
    const isFlush = suits.every(s => s === suits[0]);
    
    const counts = {};
    cards.forEach(c => counts[getLexioRank(c.number)] = (counts[getLexioRank(c.number)] || 0) + 1);
    const countVals = Object.values(counts).sort((a,b)=>b-a);

    if (isStraight && isFlush) {
      const highestNum = getStraightHighestCardNum(cards);
      return { valid: true, type: 5, power: 5, rank: straightInfo.rank, suitRank: getSuitRank(cards.find(c => c.number === highestNum).suit), name: "스트레이트 플러시" };
    }
    if (countVals[0] === 4) {
      const quadRank = Number(Object.keys(counts).find(k => counts[k] === 4));
      return { valid: true, type: 5, power: 4, rank: quadRank, suitRank: 4, name: "포카드" };
    }
    if (countVals[0] === 3 && countVals[1] === 2) {
      const tripleRank = Number(Object.keys(counts).find(k => counts[k] === 3));
      return { valid: true, type: 5, power: 3, rank: tripleRank, suitRank: 4, name: "풀하우스" };
    }
    if (isFlush) return { valid: true, type: 5, power: 2, rank: Math.max(...cards.map(c=>getLexioRank(c.number))), suitRank: suits[0], name: "플러시" };
    if (isStraight) {
      const highestNum = getStraightHighestCardNum(cards);
      return { valid: true, type: 5, power: 1, rank: straightInfo.rank, suitRank: getSuitRank(cards.find(c => c.number === highestNum).suit), name: "스트레이트" };
    }
  }
  return { valid: false }; 
}

function canPlay(lastCombo, newCombo) {
  if (!newCombo.valid) return false;
  if (!lastCombo) return true; 
  if (lastCombo.type !== newCombo.type) return false; 

  if (newCombo.type === 5) {
    if (newCombo.power > lastCombo.power) return true;
    if (newCombo.power < lastCombo.power) return false;
  }
  
  if (newCombo.rank > lastCombo.rank) return true;
  if (newCombo.rank === lastCombo.rank && newCombo.suitRank > lastCombo.suitRank) return true;
  return false;
}

// 다음 턴을 찾을 때 파산(isOut)한 유저를 건너뛰는 함수
function nextTurn(room) {
  let next = (room.currentTurn + 1) % room.players.length;
  while (room.players[next].isOut) {
    next = (next + 1) % room.players.length;
  }
  room.currentTurn = next;
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
    // 기본 코인 64, 파산 상태 isOut: false
    room.players.push({ id: socket.id, nickname, hand: [], coins: 64, isOut: false });

    if (room.players.length === room.maxPlayers && !room.isPlaying) {
      room.isPlaying = true;
      dealCards(room);
    }
    io.to(roomId).emit('updateRoom', room);
    broadcastRoomList(); 
  }

  function dealCards(room) {
    const activePlayers = room.players.filter(p => !p.isOut);
    const deck = generateDeck(activePlayers.length); 
    const cardsPerPlayer = Math.floor(deck.length / activePlayers.length);
    
    activePlayers.forEach((p, index) => {
      p.hand = deck.slice(index * cardsPerPlayer, (index + 1) * cardsPerPlayer);
      p.hand.sort((a, b) => getLexioRank(a.number) - getLexioRank(b.number) || getSuitRank(a.suit) - getSuitRank(b.suit));
    });
    
    room.players.forEach(p => { if (p.isOut) p.hand = []; }); // 파산자는 카드 없음
    room.field = [];
    room.passCount = 0;
    room.comboText = "새 게임 (선입니다!)";
  }

  socket.on('playCards', ({ roomId, cards }) => {
    const room = rooms[roomId];
    if (!room) return;

    const newCombo = analyzeCombo(cards);
    if (!newCombo.valid) return socket.emit('playError', '제출할 수 없는 족보입니다. 규칙을 확인하세요.');

    const lastCombo = room.field.length > 0 ? analyzeCombo(room.field) : null;
    if (!canPlay(lastCombo, newCombo)) return socket.emit('playError', '깔린 패보다 높거나, 같은 조합 단위로 내야합니다.');

    room.field = cards; 
    room.comboText = newCombo.name;
    room.passCount = 0; 

    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    const player = room.players[playerIndex];
    player.hand = player.hand.filter(hc => !cards.find(c => c.id === hc.id));

    // 누군가 손을 다 털었을 때 (라운드 승리)
    if (player.hand.length === 0) {
      room.players.forEach(p => {
        if (p.id !== player.id && !p.isOut) {
          let penalty = p.hand.length;
          // 2를 들고 있는 개수만큼 벌금 2배 증가 (1장이면 2배, 2장이면 4배)
          const twoCount = p.hand.filter(c => c.number === 2).length;
          if (twoCount > 0) penalty = penalty * Math.pow(2, twoCount);
          
          p.coins -= penalty;
          player.coins += penalty;
          
          // 파산 체크
          if (p.coins <= 0) {
            p.coins = 0;
            p.isOut = true;
          }
        }
      });

      const remainingActive = room.players.filter(p => !p.isOut);
      // 나 혼자 살아남았다면 게임 완전 종료
      if (remainingActive.length <= 1) {
        room.comboText = `🎉 ${player.nickname} 최종 승리! (다른 유저 파산)`;
        room.isPlaying = false; 
        io.to(roomId).emit('updateRoom', room);
        broadcastRoomList();
        return;
      }

      room.comboText = `🎉 ${player.nickname} 라운드 승리! (5초 뒤 새게임)`;
      io.to(roomId).emit('updateRoom', room);

      setTimeout(() => {
        dealCards(room);
        room.currentTurn = playerIndex; // 승자가 다음 판 선
        io.to(roomId).emit('updateRoom', room);
      }, 5000);
      return;
    }

    nextTurn(room);
    io.to(roomId).emit('updateRoom', room);
  });

  socket.on('passTurn', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.field.length === 0) return socket.emit('playError', '선(Start)은 패스할 수 없습니다!');

    room.passCount += 1;
    nextTurn(room);

    const activeCount = room.players.filter(p => !p.isOut).length;
    if (room.passCount >= activeCount - 1) {
      room.field = []; 
      room.comboText = "모두 패스! (선입니다)";
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
