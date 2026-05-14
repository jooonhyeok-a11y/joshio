const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const rooms = {};
const globalUsers = {}; // ★ 계정, 전적, 세션을 영구 보존하는 전역 데이터베이스
const SUITS = ['☁️', '⭐', '🌙', '☀️']; 
const AVATARS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐥', '🦆', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐢', '🐙', '🦑', '🦐', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🐘', '🦏', '🐪', '🐫', '🦒', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🐐', '🦌', '🐕', '🐩', '🐈', '🐓', '🦃', '🕊️', '🐇', '🐁', '🐀', '🐿️'];

function getLexioRank(num) { const number = Number(num); if (number === 1) return 14; if (number === 2) return 15; return number - 2; }
function getSuitRank(suit) { if (suit === '☁️') return 1; if (suit === '⭐') return 2; if (suit === '🌙') return 3; if (suit === '☀️') return 4; return 0; }

function getStraightInfo(cards) {
  const nums = cards.map(c => Number(c.number)).sort((a,b) => a-b);
  const str = nums.join(',');
  if (str === '1,2,3,4,5') return { valid: true, rank: 999 }; 
  if (str === '2,3,4,5,6') return { valid: true, rank: 998 }; 
  let isConsecutive = true;
  for(let i=1; i<5; i++) { if (nums[i] !== nums[i-1] + 1) { isConsecutive = false; break; } }
  if (isConsecutive && nums[0] >= 3) return { valid: true, rank: getLexioRank(nums[4]) };
  return { valid: false, rank: 0 };
}

function getStraightHighestCard(cards) {
  const nums = cards.map(c => Number(c.number)).sort((a,b) => a-b);
  const str = nums.join(',');
  if (str === '1,2,3,4,5' || str === '2,3,4,5,6') return cards.find(c => Number(c.number) === 2);
  const highestNum = Math.max(...nums);
  return cards.find(c => Number(c.number) === highestNum);
}

function generateDeck(playerCount) {
  let maxNum = 15;
  if (playerCount === 3) maxNum = 9;
  if (playerCount === 4) maxNum = 13;
  let deck = [];
  SUITS.forEach(suit => { for (let i = 1; i <= maxNum; i++) deck.push({ suit, number: i, id: `${suit}${i}` }); });
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
    if (Number(cards[0].number) !== Number(cards[1].number)) return { valid: false };
    return { valid: true, type: 2, rank: getLexioRank(cards[0].number), suitRank: getSuitRank(cards[1].suit), name: '페어' }; 
  }
  if (len === 3) {
    if (Number(cards[0].number) === Number(cards[1].number) && Number(cards[1].number) === Number(cards[2].number)) {
      return { valid: true, type: 3, rank: getLexioRank(cards[0].number), suitRank: getSuitRank(cards[2].suit), name: '트리플' };
    }
    return { valid: false };
  }
  if (len === 5) {
    const straightInfo = getStraightInfo(cards);
    const suits = cards.map(c => getSuitRank(c.suit));
    const isFlush = suits.every(s => s === suits[0]);
    const counts = {};
    cards.forEach(c => counts[getLexioRank(c.number)] = (counts[getLexioRank(c.number)] || 0) + 1);
    const countVals = Object.values(counts).sort((a,b)=>b-a);

    if (straightInfo.valid && isFlush) return { valid: true, type: 5, power: 5, rank: straightInfo.rank, suitRank: getSuitRank(getStraightHighestCard(cards).suit), name: "스트레이트 플러시" };
    if (countVals[0] === 4) return { valid: true, type: 5, power: 4, rank: Number(Object.keys(counts).find(k => counts[k] === 4)), suitRank: 4, name: "포카드" };
    if (countVals[0] === 3 && countVals[1] === 2) return { valid: true, type: 5, power: 3, rank: Number(Object.keys(counts).find(k => counts[k] === 3)), suitRank: 4, name: "풀하우스" };
    if (isFlush) return { valid: true, type: 5, power: 2, rank: Math.max(...cards.map(c=>getLexioRank(c.number))), suitRank: suits[0], name: "플러시" };
    if (straightInfo.valid) return { valid: true, type: 5, power: 1, rank: straightInfo.rank, suitRank: getSuitRank(getStraightHighestCard(cards).suit), name: "스트레이트" };
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
  while (room.players[next].isOut || room.players[next].isDisconnected) {
    next = (next + 1) % room.players.length;
    if (next === room.currentTurn) break; 
  }
  room.currentTurn = next;
}

io.on('connection', (socket) => {
  socket.emit('roomList', getRoomList());
  
  // ★ 로그인 시 현재 활성화된 방이 있는지 완벽 검사하여 반환
  socket.on('authenticate', ({ nickname, password }, callback) => {
    if (!nickname || !password) return callback({ success: false, msg: '닉네임과 비밀번호를 입력하세요.' });
    if (globalUsers[nickname]) {
      if (globalUsers[nickname].password !== password) return callback({ success: false, msg: '비밀번호가 일치하지 않습니다.' });
    } else {
      globalUsers[nickname] = { password, sessionId: 'sess_' + Date.now() + Math.random().toString(36).substr(2), wins: 0, maxCoins: 64 };
    }
    
    const sessId = globalUsers[nickname].sessionId;
    const activeRoom = Object.values(rooms).find(r => r.players.some(p => p.sessionId === sessId));
    
    callback({ 
        success: true, 
        sessionId: sessId, 
        stats: globalUsers[nickname],
        activeRoomId: activeRoom ? activeRoom.id : null
    });
  });

  socket.on('createRoom', ({ roomName, maxPlayers, nickname, sessionId }) => {
    // 중복 방 생성 방지
    for (const rid in rooms) {
        if (rooms[rid].players.some(p => p.sessionId === sessionId)) {
            return socket.emit('playError', '이미 참여 중인 방이 있습니다. 로그인/복귀 버튼을 눌러주세요.');
        }
    }
    const roomId = 'room_' + Date.now();
    rooms[roomId] = { id: roomId, name: roomName, maxPlayers: parseInt(maxPlayers), players: [], currentTurn: 0, field: [], comboText: "대기중", lastPlayedName: "", isPlaying: false, isRoundEnding: false, passCount: 0, currentRound: 1, maxRound: 5, roundSummary: null, readyPlayers: new Set() };
    joinRoomLogic(socket, roomId, nickname, sessionId);
  });

  socket.on('joinRoom', ({ roomId, nickname, sessionId }) => joinRoomLogic(socket, roomId, nickname, sessionId));

  function joinRoomLogic(socket, roomId, nickname, sessionId) {
    const room = rooms[roomId];
    if (!room) return socket.emit('playError', '방이 존재하지 않습니다. 이미 종료되었을 수 있습니다.');
    
    const existingPlayer = room.players.find(p => p.sessionId === sessionId);
    if (existingPlayer) {
        if (existingPlayer.disconnectTimer) clearTimeout(existingPlayer.disconnectTimer);
        existingPlayer.id = socket.id;
        existingPlayer.nickname = nickname;
        existingPlayer.isDisconnected = false;
        socket.join(roomId);
        io.to(roomId).emit('updateRoom', room);
        return;
    }

    if (room.players.length >= room.maxPlayers) return socket.emit('playError', '방이 가득 찼습니다.');
    
    socket.join(roomId);
    room.players.push({ id: socket.id, sessionId, nickname, hand: [], coins: 64, isOut: false, isDisconnected: false, avatar: '👤' });
    
    if (room.players.length === room.maxPlayers && !room.isPlaying) {
      room.isPlaying = true;
      dealCards(room, true);
    }
    io.to(roomId).emit('updateRoom', room);
    io.emit('roomList', getRoomList()); 
  }

  function dealCards(room, isNewGame = false) {
    room.players.forEach(p => p.hand = []);
    const activePlayers = room.players.filter(p => !p.isOut);
    const deck = generateDeck(activePlayers.length); 
    const cardsPerPlayer = Math.floor(deck.length / activePlayers.length);
    
    if (isNewGame) {
      const shuffledAvatars = [...AVATARS].sort(() => Math.random() - 0.5);
      room.players.forEach((p, i) => { p.avatar = shuffledAvatars[i]; });
    }

    activePlayers.forEach((p, index) => {
      p.hand = deck.slice(index * cardsPerPlayer, (index + 1) * cardsPerPlayer);
    });
    room.field = []; room.passCount = 0; room.comboText = ""; room.roundSummary = null; room.lastPlayedName = ""; room.readyPlayers.clear();

    // ★ 파란색 3을 가진 사람을 찾아 무조건 선 턴 강제 부여 로직 점검 완료
    if (isNewGame) {
      let startPlayerIndex = 0; // 혹시나 못찾을경우 대비 기본값
      room.players.forEach((p, idx) => {
        if (p.hand.some(c => c.suit === '☁️' && Number(c.number) === 3)) {
            startPlayerIndex = idx;
        }
      });
      room.currentTurn = startPlayerIndex;
      room.comboText = "파란색 3을 가진 플레이어부터 시작!";
    }
  }

  socket.on('readyNextRound', ({ roomId, sessionId }) => {
    const room = rooms[roomId];
    if (!room || !room.roundSummary || room.roundSummary.isGameOver) return;

    room.readyPlayers.add(sessionId);
    const activeCount = room.players.filter(p => !p.isOut).length;
    io.to(roomId).emit('readyStatus', { current: room.readyPlayers.size, total: activeCount });

    if (room.readyPlayers.size >= activeCount) {
        room.currentRound++; 
        dealCards(room, false);
        room.currentTurn = room.players.findIndex(p => p.nickname === room.roundSummary.winnerName);
        if(room.currentTurn === -1) room.currentTurn = 0;
        room.isRoundEnding = false;
        io.to(roomId).emit('updateRoom', room); 
    }
  });

  socket.on('restartGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (room && (!room.isPlaying || (room.roundSummary && room.roundSummary.isGameOver))) {
        room.currentRound = 1;
        room.isRoundEnding = false;
        room.players.forEach(p => { p.coins = 64; p.isOut = false; p.hand = []; });
        room.isPlaying = true;
        dealCards(room, true);
        io.to(roomId).emit('updateRoom', room);
    }
  });

  socket.on('playCards', ({ roomId, sessionId, cards }) => {
    const room = rooms[roomId];
    if (!room || room.isRoundEnding) return; 

    const playerIndex = room.players.findIndex(p => p.sessionId === sessionId);
    if (playerIndex === -1 || room.currentTurn !== playerIndex) return;
    const player = room.players[playerIndex];

    const newCombo = analyzeCombo(cards);
    if (!newCombo.valid) return socket.emit('playError', '유효하지 않은 조합입니다.');
    const lastCombo = room.field.length > 0 ? analyzeCombo(room.field) : null;
    if (!canPlay(lastCombo, newCombo)) return socket.emit('playError', '더 높은 패를 내야 합니다.');

    room.field = cards; room.comboText = newCombo.name; room.passCount = 0; 
    player.hand = player.hand.filter(hc => !cards.find(c => c.id === hc.id));
    room.lastPlayedName = player.nickname;

    if (player.hand.length === 0) {
      room.isRoundEnding = true;
      const winMsg = `🎉 ${player.nickname} 남은패 없음! ${room.currentRound}라운드 승리!`;
      room.comboText = winMsg;
      io.to(roomId).emit('updateRoom', room);
      io.to(roomId).emit('roundEndAnimation', { winnerName: player.nickname, msg: winMsg });

      setTimeout(() => {
        let summaryData = {};
        let bankruptPlayerName = null;
        room.players.forEach(p => {
          const twoCount = p.hand.filter(c => Number(c.number) === 2).length;
          p.effCards = p.hand.length * Math.pow(2, twoCount);
          p.roundChange = 0;
          summaryData[p.sessionId] = { nickname: p.nickname, remainingTiles: p.hand.length, twoCount: twoCount, effCards: p.effCards, exchanges: {}, roundChange: 0, totalCoins: 0, avatar: p.avatar };
        });

        const activePlayers = room.players.filter(p => !p.isOut);
        for (let i = 0; i < activePlayers.length; i++) {
          for (let j = i + 1; j < activePlayers.length; j++) {
            let p1 = activePlayers[i], p2 = activePlayers[j];
            let diff = p1.effCards - p2.effCards;
            if (diff !== 0) {
              p1.roundChange -= diff; p2.roundChange += diff;
              summaryData[p1.sessionId].exchanges[p2.nickname] = -diff; 
              summaryData[p2.sessionId].exchanges[p1.nickname] = diff;
            }
          }
        }
        
        activePlayers.forEach(p => {
          p.coins = Number(p.coins) + Number(p.roundChange);
          if (p.coins <= 0) { p.coins = 0; p.isOut = true; bankruptPlayerName = p.nickname; }
          summaryData[p.sessionId].roundChange = p.roundChange;
          summaryData[p.sessionId].totalCoins = p.coins;
          if(globalUsers[p.nickname]) {
              if (p.coins > globalUsers[p.nickname].maxCoins) globalUsers[p.nickname].maxCoins = p.coins;
              if (p.id === player.id) globalUsers[p.nickname].wins += 1;
          }
        });

        const isGameOver = (bankruptPlayerName !== null) || room.currentRound >= room.maxRound || activePlayers.filter(p => !p.isOut).length <= 1;
        let gameEndReason = ""; let finalRankings = null; let overallWinnerName = "";
        
        if (isGameOver) {
            finalRankings = room.players.map(p => ({ nickname: p.nickname, coins: p.coins, avatar: p.avatar })).sort((a,b) => b.coins - a.coins);
            overallWinnerName = finalRankings[0].nickname;
            if (bankruptPlayerName) gameEndReason = `${bankruptPlayerName} 파산! 경기 종료!`;
            else gameEndReason = `${room.maxRound}라운드 완료! 경기 종료!`;
        }

        room.roundSummary = { isGameOver, data: summaryData, winnerName: player.nickname, gameEndReason, finalRankings, overallWinnerName, roundNum: room.currentRound };
        if(isGameOver) room.isPlaying = false;
        
        io.to(roomId).emit('showRoundSummary', room);
      }, 5000); 
      return;
    }
    nextTurn(room);
    io.to(roomId).emit('updateRoom', room);
  });

  socket.on('passTurn', ({ roomId, sessionId }) => {
    const room = rooms[roomId];
    if (!room || room.field.length === 0 || room.isRoundEnding) return;
    const playerIndex = room.players.findIndex(p => p.sessionId === sessionId);
    if (playerIndex === -1 || room.currentTurn !== playerIndex) return;

    room.passCount += 1;
    nextTurn(room);
    const activeCount = room.players.filter(p => !p.isOut && !p.isDisconnected).length;
    if (room.passCount >= activeCount - 1) {
      room.field = []; room.comboText = ""; room.passCount = 0; room.lastPlayedName = ""; 
    }
    io.to(roomId).emit('updateRoom', room);
  });

  socket.on('chatMessage', ({ roomId, nickname, msg }) => io.to(roomId).emit('chatMessage', { nickname, msg }));

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        player.isDisconnected = true;
        if (!room.isPlaying) {
          room.players.splice(playerIndex, 1);
          if (room.players.length === 0) delete rooms[roomId];
        }
        io.to(roomId).emit('updateRoom', room);
        io.emit('roomList', getRoomList());
        break;
      }
    }
  });
});

server.listen(process.env.PORT || 3000);
