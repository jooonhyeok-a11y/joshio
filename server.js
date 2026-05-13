const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const rooms = {};
const SUITS = ['☁️', '⭐', '🌙', '☀️']; 

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

function getStraightInfo(cards) {
  const nums = cards.map(c => c.number).sort((a,b) => a-b);
  const str = nums.join(',');
  if (str === '1,2,3,4,5') return { valid: true, rank: 999 }; 
  if (str === '2,3,4,5,6') return { valid: true, rank: 998 }; 
  if (str === '1,12,13,14,15') return { valid: true, rank: 997 }; 
  
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
  return Object.values(rooms).filter(r => !r.isPlaying && r.players.length < r.maxPlayers)
    .map(r => ({ id: r.id, name: r.name, maxPlayers: r.maxPlayers, currentPlayers: r.players.length, isPlaying: r.isPlaying }));
}

function analyzeCombo(cards) {
  cards.sort((a,b) => getLexioRank(a.number) - getLexioRank(b.number) || getSuitRank(a.suit) - getSuitRank(b.suit));
  const len = cards.length;
  if (len === 1) return { valid: true, type: 1, rank: getLexioRank(cards[0].number), suitRank: getSuitRank(cards[0].suit), name: '싱글' };
  if (len === 2) {
    if (cards[0].number !== cards[1].number) return { valid: false };
    return { valid: true, type: 2, rank: getLexioRank(cards[0].number), suitRank: getSuitRank(cards[1].suit), name: '페어' }; 
  }
  if (len === 3) {
    if (cards[0].number === cards[1].number && cards[1].number === cards[2].number) return { valid: true, type: 3, rank: getLexioRank(cards[0].number), suitRank: getSuitRank(cards[2].suit), name: '트리플' };
    return { valid: false };
  }
  if (len === 5) {
    const straightInfo = getStraightInfo(cards);
    const suits = cards.map(c => getSuitRank(c.suit));
    const isFlush = suits.every(s => s === suits[0]);
    const counts = {};
    cards.forEach(c => counts[getLexioRank(c.number)] = (counts[getLexioRank(c.number)] || 0) + 1);
    const countVals = Object.values(counts).sort((a,b)=>b-a);

    if (straightInfo.valid && isFlush) return { valid: true, type: 5, power: 5, rank: straightInfo.rank, suitRank: getSuitRank(cards.find(c => c.number === getStraightHighestCardNum(cards)).suit), name: "스트레이트 플러시" };
    if (countVals[0] === 4) return { valid: true, type: 5, power: 4, rank: Number(Object.keys(counts).find(k => counts[k] === 4)), suitRank: 4, name: "포카드" };
    if (countVals[0] === 3 && countVals[1] === 2) return { valid: true, type: 5, power: 3, rank: Number(Object.keys(counts).find(k => counts[k] === 3)), suitRank: 4, name: "풀하우스" };
    if (isFlush) return { valid: true, type: 5, power: 2, rank: Math.max(...cards.map(c=>getLexioRank(c.number))), suitRank: suits[0], name: "플러시" };
    if (straightInfo.valid) return { valid: true, type: 5, power: 1, rank: straightInfo.rank, suitRank: getSuitRank(cards.find(c => c.number === getStraightHighestCardNum(cards)).suit), name: "스트레이트" };
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

function nextTurn(room) {
  let next = (room.currentTurn + 1) % room.players.length;
  while (room.players[next].isOut) next = (next + 1) % room.players.length;
  room.currentTurn = next;
}

io.on('connection', (socket) => {
  socket.emit('roomList', getRoomList());

  socket.on('createRoom', ({ roomName, maxPlayers, nickname }) => {
    const roomId = 'room_' + Date.now();
    rooms[roomId] = { id: roomId, name: roomName, maxPlayers: parseInt(maxPlayers), players: [], currentTurn: 0, field: [], comboText: "대기중", isPlaying: false, passCount: 0 };
    joinRoomLogic(socket, roomId, nickname);
  });

  socket.on('joinRoom', ({ roomId, nickname }) => joinRoomLogic(socket, roomId, nickname));

  function joinRoomLogic(socket, roomId, nickname) {
    const room = rooms[roomId];
    if (!room || room.players.length >= room.maxPlayers) return;
    socket.join(roomId);
    room.players.push({ id: socket.id, nickname, hand: [], coins: 64, isOut: false });
    if (room.players.length === room.maxPlayers && !room.isPlaying) {
      room.isPlaying = true;
      dealCards(room);
    }
    io.to(roomId).emit('updateRoom', room);
    io.emit('roomList', getRoomList()); 
  }

  function dealCards(room) {
    const activePlayers = room.players.filter(p => !p.isOut);
    const deck = generateDeck(activePlayers.length); 
    const cardsPerPlayer = Math.floor(deck.length / activePlayers.length);
    activePlayers.forEach((p, index) => {
      p.hand = deck.slice(index * cardsPerPlayer, (index + 1) * cardsPerPlayer);
      p.hand.sort((a, b) => getLexioRank(a.number) - getLexioRank(b.number) || getSuitRank(a.suit) - getSuitRank(b.suit));
    });
    room.players.forEach(p => { if (p.isOut) p.hand = []; }); 
    room.field = []; room.passCount = 0; room.comboText = ""; 
  }

  socket.on('playCards', ({ roomId, cards }) => {
    const room = rooms[roomId];
    if (!room) return;
    const newCombo = analyzeCombo(cards);
    if (!newCombo.valid) return socket.emit('playError', '제출할 수 없는 족보입니다. 규칙을 확인하세요.');
    const lastCombo = room.field.length > 0 ? analyzeCombo(room.field) : null;
    if (!canPlay(lastCombo, newCombo)) return socket.emit('playError', '깔린 패보다 높거나, 같은 조합 단위로 내야합니다.');

    room.field = cards; room.comboText = newCombo.name; room.passCount = 0; 
    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    const player = room.players[playerIndex];
    player.hand = player.hand.filter(hc => !cards.find(c => c.id === hc.id));

    // 누군가 손을 다 털었을 때 (승리)
    if (player.hand.length === 0) {
      room.players.forEach(p => {
        if (!p.isOut) {
          const twoCount = p.hand.filter(c => c.number === 2).length;
          p.effCards = p.hand.length * Math.pow(2, twoCount);
          p.roundChange = 0; 
        }
      });

      const activePlayers = room.players.filter(p => !p.isOut);
      for (let i = 0; i < activePlayers.length; i++) {
        for (let j = i + 1; j < activePlayers.length; j++) {
          let p1 = activePlayers[i], p2 = activePlayers[j];
          let diff = p1.effCards - p2.effCards;
          if (diff > 0) { p1.roundChange -= diff; p2.roundChange += diff; } 
          else if (diff < 0) { p1.roundChange += Math.abs(diff); p2.roundChange -= Math.abs(diff); }
        }
      }

      activePlayers.forEach(p => {
        p.coins += p.roundChange;
        if (p.coins <= 0) { p.coins = 0; p.isOut = true; }
      });

      // 승리 이벤트 전송 (폭죽용)
      io.to(roomId).emit('gameWin', { winnerId: player.id, winnerName: player.nickname });

      const remainingActive = room.players.filter(p => !p.isOut);
      if (remainingActive.length <= 1) {
        room.comboText = `🎉 ${player.nickname} 최종 승리! (다른 유저 파산)`;
        room.isPlaying = false; 
        io.to(roomId).emit('updateRoom', room);
        io.emit('roomList', getRoomList());
        return;
      }
      room.comboText = `🎉 ${player.nickname} 라운드 승리! (5초 뒤 시작)`;
      io.to(roomId).emit('updateRoom', room);
      setTimeout(() => { dealCards(room); room.currentTurn = playerIndex; io.to(roomId).emit('updateRoom', room); }, 5000);
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
      room.field = []; room.comboText = ""; room.passCount = 0; 
    }
    io.to(roomId).emit('updateRoom', room);
  });

  // ★ 채팅 메시지 수신 및 전달
  socket.on('chatMessage', ({ roomId, nickname, msg }) => {
    io.to(roomId).emit('chatMessage', { nickname, msg });
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        if (room.players.length === 0) delete rooms[roomId];
        else io.to(roomId).emit('updateRoom', room);
        io.emit('roomList', getRoomList());
        break;
      }
    }
  });
});

server.listen(process.env.PORT || 3000);
