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
  for(let i=1; i<5; i++) { if (nums[i] !== nums[i-1] + 1) { isConsecutive = false; break; } }
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
  // 파산하거나 접속이 끊긴(isDisconnected) 사람은 패스
  while (room.players[next].isOut || room.players[next].isDisconnected) {
    next = (next + 1) % room.players.length;
    // 무한 루프 방지
    if (next === room.currentTurn) break; 
  }
  room.currentTurn = next;
}

function sendSystemLog(roomId, msg) {
  io.to(roomId).emit('systemLog', msg);
}

io.on('connection', (socket) => {
  socket.emit('roomList', getRoomList());

  socket.on('createRoom', ({ roomName, maxPlayers, nickname, sessionId }) => {
    const roomId = 'room_' + Date.now();
    rooms[roomId] = { id: roomId, name: roomName, maxPlayers: parseInt(maxPlayers), players: [], currentTurn: 0, field: [], comboText: "대기중", isPlaying: false, passCount: 0 };
    joinRoomLogic(socket, roomId, nickname, sessionId);
  });

  socket.on('joinRoom', ({ roomId, nickname, sessionId }) => joinRoomLogic(socket, roomId, nickname, sessionId));

  function joinRoomLogic(socket, roomId, nickname, sessionId) {
    const room = rooms[roomId];
    if (!room) return socket.emit('playError', '방이 존재하지 않습니다.');

    // 1. 재접속 체크
    const existingPlayer = room.players.find(p => p.sessionId === sessionId);
    if (existingPlayer) {
      if (existingPlayer.disconnectTimer) clearTimeout(existingPlayer.disconnectTimer);
      existingPlayer.id = socket.id;
      existingPlayer.isDisconnected = false;
      existingPlayer.nickname = nickname; // 닉네임 변경 반영
      socket.join(roomId);
      sendSystemLog(roomId, `[재접속] ${nickname}님이 돌아왔습니다!`);
      io.to(roomId).emit('updateRoom', room);
      return;
    }

    if (room.players.length >= room.maxPlayers) return socket.emit('playError', '방이 가득 찼습니다.');

    socket.join(roomId);
    room.players.push({ id: socket.id, sessionId, nickname, hand: [], coins: 64, isOut: false, isDisconnected: false });
    sendSystemLog(roomId, `[입장] ${nickname}님이 들어왔습니다.`);

    if (room.players.length === room.maxPlayers && !room.isPlaying) {
      room.isPlaying = true;
      sendSystemLog(roomId, `[게임시작] 인원이 모두 모여 게임을 시작합니다!`);
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

    // 로그 기록
    const cardStrs = cards.map(c => `${c.suit}${c.number}`).join(', ');
    sendSystemLog(roomId, `[플레이] ${player.nickname}님이 ${newCombo.name} 제출 (${cardStrs})`);

    if (player.hand.length === 0) {
      room.players.forEach(p => {
        if (!p.isOut && p.id !== player.id) {
          const twoCount = p.hand.filter(c => c.number === 2).length;
          p.effCards = p.hand.length * Math.pow(2, twoCount);
          p.roundChange = 0; 
        }
      });
      player.effCards = 0; player.roundChange = 0;

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

      io.to(roomId).emit('gameWin', { winnerId: player.id, winnerName: player.nickname });
      sendSystemLog(roomId, `[승리] ${player.nickname}님이 라운드에서 승리했습니다!`);

      const remainingActive = room.players.filter(p => !p.isOut);
      if (remainingActive.length <= 1) {
        room.comboText = `🎉 ${player.nickname} 최종 승리!`;
        room.isPlaying = false; 
        io.to(roomId).emit('updateRoom', room);
        io.emit('roomList', getRoomList());
        return;
      }
      room.comboText = `🎉 ${player.nickname} 승리! (5초 뒤 시작)`;
      io.to(roomId).emit('updateRoom', room);
      setTimeout(() => { dealCards(room); room.currentTurn = playerIndex; io.to(roomId).emit('updateRoom', room); sendSystemLog(roomId, `[새게임] 새로운 라운드가 시작되었습니다.`); }, 5000);
      return;
    }
    nextTurn(room);
    io.to(roomId).emit('updateRoom', room);
  });

  socket.on('passTurn', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.field.length === 0) return socket.emit('playError', '선(Start)은 패스할 수 없습니다!');
    
    const player = room.players.find(p => p.id === socket.id);
    sendSystemLog(roomId, `[패스] ${player.nickname} 패스.`);

    room.passCount += 1;
    nextTurn(room);
    
    const activeCount = room.players.filter(p => !p.isOut && !p.isDisconnected).length;
    if (room.passCount >= activeCount - 1) {
      room.field = []; room.comboText = ""; room.passCount = 0; 
      sendSystemLog(roomId, `[초기화] 모든 유저가 패스하여 필드가 초기화됩니다.`);
    }
    io.to(roomId).emit('updateRoom', room);
  });

  socket.on('chatMessage', ({ roomId, nickname, msg }) => {
    io.to(roomId).emit('chatMessage', { nickname, msg });
  });

  // 연결 끊김 (재접속 대기 타이머)
  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        
        if (!room.isPlaying) {
          // 게임 시작 전이면 바로 삭제
          room.players.splice(playerIndex, 1);
          if (room.players.length === 0) delete rooms[roomId];
          else {
            sendSystemLog(roomId, `[퇴장] ${player.nickname}님이 나갔습니다.`);
            io.to(roomId).emit('updateRoom', room);
          }
          io.emit('roomList', getRoomList());
        } else {
          // 게임 중이면 연결 끊김 상태로 전환 후 60초 대기
          player.isDisconnected = true;
          sendSystemLog(roomId, `[끊김] ${player.nickname}님의 연결이 끊겼습니다. (60초 대기)`);
          
          // 내 턴이었다면 자동으로 턴 넘기기
          if (room.currentTurn === playerIndex) {
             room.passCount += 1;
             nextTurn(room);
             const activeCount = room.players.filter(p => !p.isOut && !p.isDisconnected).length;
             if (room.passCount >= activeCount - 1) { room.field = []; room.comboText = ""; room.passCount = 0; }
          }
          io.to(roomId).emit('updateRoom', room);

          // 60초 후 완전 강퇴
          player.disconnectTimer = setTimeout(() => {
            const idx = room.players.findIndex(p => p.id === player.id);
            if (idx !== -1 && room.players[idx].isDisconnected) {
              room.players[idx].isOut = true; // 파산 처리로 게임 강제종료 방지
              sendSystemLog(roomId, `[강퇴] ${player.nickname}님이 미복귀로 강퇴(파산) 처리되었습니다.`);
              io.to(roomId).emit('updateRoom', room);
            }
          }, 60000);
        }
        break;
      }
    }
  });
});

server.listen(process.env.PORT || 3000);
