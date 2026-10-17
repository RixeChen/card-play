/* =====================================================================
 * 唬牌（吹牛 / 骗牌 / I Doubt It / Cheat）
 *
 * 采用的玩法版本（有歧义处按通行做法，均已在下方注明）：
 *   1) 牌具：默认 1 副牌 52 张（可选加 2 张王当万能牌）。全部发完，尽量平均。
 *   2) 先手：持有「♠A」的玩家先出（若开启万能牌则同样以 ♠A 为准）。
 *   3) 点数顺序：A → 2 → 3 → … → 10 → J → Q → K → A → … 循环。
 *      每次出牌后，需要声明的点数自动推进到下一级。
 *   4) 出牌：轮到的玩家必须出 1~4 张（可在房间选项里改上限）牌，背面朝下放在牌堆上，
 *      并声明「这几张都是当前点数」。允许撒谎。
 *   5) 质疑（唬）：出牌后进入质疑窗口（默认 15 秒），任何其他玩家可点「唬」。
 *      第一个点的人获得质疑权；倒计时结束则视为无人质疑。
 *   6) 结算质疑：只检查「最后一次出牌」的牌。
 *      - 全是所声明的点数（王算万能）→ 质疑失败，质疑者收走整个牌堆。
 *      - 否则 → 质疑成功，出牌者收走整个牌堆。
 *      收牌者把牌堆拿回手里，并由他先出下一手。
 *   7) 出完牌：出牌后无人质疑（或质疑失败）且手上没牌了 → 该玩家出完，记录名次。
 *   8) 结束：只剩 1 人手上还有牌时结束。名次 = 出完的先后顺序 + 余下按手牌数从少到多。
 *   9) 计分：n 人局，第 r 名得分 = n + 1 - 2r（例如 5 人：+4 / +2 / 0 / -2 / -4，总和为 0）。
 * ===================================================================== */
'use strict';
var Cards = require('../../public/shared/cards.js');

var DEFAULTS = { maxPlay: 4, challengeSeconds: 15, useJokers: false };

var OPTION_FIELDS = [
  { key: 'maxPlay', label: '单次最多出牌张数', type: 'number', min: 1, max: 8, step: 1 },
  { key: 'challengeSeconds', label: '质疑倒计时（秒）', type: 'number', min: 5, max: 60, step: 5 },
  { key: 'useJokers', label: '加入 2 张王当万能牌', type: 'bool' }
];

var RULES = [
  '点数顺序 A→2→3→…→K 循环，每出一次推进一级。',
  '轮到你必须出 1~4 张（可改），背面朝下并声明是「当前点数」，可以撒谎。',
  '出牌后有质疑窗口，任何人可点「唬」。',
  '质疑成功 → 出牌者收走整堆；质疑失败 → 质疑者收走整堆。',
  '王牌（若开启）算万能，永远不算穿帮。',
  '先出完手上所有牌的人获胜，名次越靠前分数越高。'
];

var ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function log(st, s) { st.log.push(s); if (st.log.length > 80) st.log.shift(); }
function byId(st, id) { return st.players.filter(function (p) { return p.id === id; })[0]; }
function nextIndex(st, from) {
  var n = st.players.length;
  for (var i = 1; i <= n; i++) {
    var idx = (from + i) % n;
    if (!st.players[idx].finished) return idx;
  }
  return -1;
}

function init(room) {
  var opts = {};
  for (var k in DEFAULTS) opts[k] = (room.options && room.options[k] !== undefined) ? room.options[k] : DEFAULTS[k];
  room.state = { ui: 'cheat', opts: opts, players: [], stage: 'idle' };
  return room.state;
}

function start(room, ctx) {
  init(room);
  var st = room.state;
  var ps = room.activePlayers();
  if (ps.length < 2) return;
  st.players = ps.map(function (p) { return { id: p.id, name: p.name, hand: [], finished: false, rank: null }; });

  var deck = Cards.shuffle(Cards.createShoe(1, !!st.opts.useJokers));
  var i = 0;
  while (deck.length) { st.players[i % st.players.length].hand.push(deck.pop()); i++; }

  // 先手：持有 ♠A 者
  var first = 0;
  for (var k = 0; k < st.players.length; k++) {
    if (st.players[k].hand.some(function (c) { return c.id.indexOf('SA#') === 0; })) { first = k; break; }
  }
  st.turnIndex = first;
  st.currentRank = 'A';
  st.pile = [];
  st.lastPlay = null;
  st.lastReveal = null;
  st.stage = 'play';
  st.finishedOrder = [];
  st.log = [];
  st.challengeDeadline = null;
  st.result = null;
  log(st, '游戏开始，' + st.players[first].name + '（持有♠A）先出，从 A 开始');
}

/** 结束判定与名次 */
function finishOrder(st) {
  var rest = st.players.filter(function (p) { return !p.finished; });
  rest.sort(function (a, b) { return a.hand.length - b.hand.length; });
  var rank = st.finishedOrder.length;
  rest.forEach(function (p) { p.rank = ++rank; p.finished = true; });
  var n = st.players.length;
  st.result = {
    ranking: st.players.slice().sort(function (a, b) { return a.rank - b.rank; }).map(function (p) {
      return { id: p.id, name: p.name, rank: p.rank, score: n + 1 - 2 * p.rank, left: p.hand.length };
    })
  };
  st.stage = 'ended';
}

function afterTurnResolved(st, ctx, nextStarterId) {
  var alive = st.players.filter(function (p) { return !p.finished; });
  if (alive.length <= 1) { finishOrder(st); return; }
  var idx = -1;
  if (nextStarterId) idx = st.players.indexOf(byId(st, nextStarterId));
  if (idx < 0 || st.players[idx].finished) idx = nextIndex(st, st.turnIndex);
  st.turnIndex = idx;
  st.stage = 'play';
  st.lastPlay = null;
  st.challengeDeadline = null;
}

function advanceRank(st) {
  var i = ORDER.indexOf(st.currentRank);
  st.currentRank = ORDER[(i + 1) % ORDER.length];
}

function resolveChallenge(st, ctx, challengerId) {
  ctx.clearTimer();
  var play = st.lastPlay;
  if (!play) return;
  var loserId = null;
  var punishOriginal = false;   // 出牌者是否被抓（被抓就要收牌堆，不能算出完）
  if (challengerId) {
    var bad = play.cards.some(function (c) { return !c.joker && c.rank !== play.declaredRank; });
    if (bad) {
      loserId = play.playerId; punishOriginal = true;
      log(st, byId(st, challengerId).name + ' 质疑成功！' + byId(st, play.playerId).name + ' 出的不全是 ' + play.declaredRank);
    } else {
      loserId = challengerId;
      log(st, byId(st, challengerId).name + ' 质疑失败，' + byId(st, play.playerId).name + ' 出的确实是 ' + play.declaredRank);
    }
  } else {
    log(st, '无人质疑');
  }
  if (loserId) {
    var lp = byId(st, loserId);
    lp.hand = lp.hand.concat(st.pile);
    lp.hand = Cards.sortPoker(lp.hand);
    log(st, lp.name + ' 收走牌堆 ' + st.pile.length + ' 张');
    st.pile = [];
  }
  // 没被抓的出牌者，如果手上没牌了就算出完
  if (!punishOriginal) {
    var pp = byId(st, play.playerId);
    if (pp.hand.length === 0 && !pp.finished) {
      pp.finished = true;
      pp.rank = st.finishedOrder.length + 1;
      st.finishedOrder.push(pp.id);
      log(st, pp.name + ' 出完了所有牌，第 ' + pp.rank + ' 名！');
    }
  }
  st.lastReveal = { cards: play.cards, byPlayer: play.playerId, declared: play.declaredRank, loserId: loserId };
  advanceRank(st);
  afterTurnResolved(st, ctx, loserId);
}

function handle(room, playerId, action, ctx) {
  var st = room.state;
  if (!st || st.stage === 'idle') return { ok: false, error: '牌局尚未开始' };
  if (st.stage === 'ended') return { ok: false, error: '本局已结束' };

  if (action.type === 'play') {
    if (st.stage !== 'play') return { ok: false, error: '现在不能出牌' };
    var cur = st.players[st.turnIndex];
    if (!cur || cur.id !== playerId) return { ok: false, error: '还没轮到你' };
    var ids = action.cardIds || [];
    if (!ids.length) return { ok: false, error: '请至少选 1 张牌' };
    if (ids.length > st.opts.maxPlay) return { ok: false, error: '一次最多出 ' + st.opts.maxPlay + ' 张' };
    var uniq = {};
    for (var z = 0; z < ids.length; z++) { if (uniq[ids[z]]) return { ok: false, error: '选牌重复' }; uniq[ids[z]] = 1; }
    var cards = Cards.takeByIds(cur.hand, ids);
    if (cards.length !== ids.length) return { ok: false, error: '所选牌不在你手里' };

    st.pile = st.pile.concat(cards);
    st.lastPlay = { playerId: cur.id, count: cards.length, declaredRank: st.currentRank, cards: cards };
    st.lastReveal = null;
    st.stage = 'challenge';
    var secs = st.opts.challengeSeconds || 15;
    st.challengeDeadline = Date.now() + secs * 1000;
    log(st, cur.name + ' 出 ' + cards.length + ' 张，声明是 ' + st.currentRank);

    var roomRef = room;
    ctx.setTimer(function () {
      if (roomRef.state && roomRef.state.stage === 'challenge') {
        resolveChallenge(roomRef.state, ctx, null);
        ctx.broadcast();
      }
    }, secs * 1000);
    return { ok: true };
  }

  if (action.type === 'challenge') {
    if (st.stage !== 'challenge') return { ok: false, error: '现在不能质疑' };
    if (!st.lastPlay || st.lastPlay.playerId === playerId) return { ok: false, error: '不能质疑自己' };
    var me = byId(st, playerId);
    if (!me || me.finished) return { ok: false, error: '你已出完牌' };
    resolveChallenge(st, ctx, playerId);
    return { ok: true };
  }

  if (action.type === 'skipTimer') {
    if (st.stage !== 'challenge') return { ok: false, error: '现在不能跳过' };
    if (st.lastPlay && st.lastPlay.playerId !== playerId) return { ok: false, error: '只有出牌者本人可以提前结束等待' };
    resolveChallenge(st, ctx, null);
    return { ok: true };
  }
  return { ok: false, error: '未知动作' };
}

function view(room, playerId) {
  var st = room.state;
  if (!st || st.stage === 'idle') return { ui: 'cheat', stage: 'idle' };
  var me = null;
  var players = st.players.map(function (p) {
    if (p.id === playerId) me = p;
    return { id: p.id, name: p.name, handCount: p.hand.length, finished: p.finished, rank: p.rank };
  });
  return {
    ui: 'cheat', stage: st.stage,
    players: players, meId: playerId,
    myHand: me ? Cards.sortPoker(me.hand.slice()) : [],
    turnPlayerId: st.players[st.turnIndex] ? st.players[st.turnIndex].id : null,
    currentRank: st.currentRank,
    nextRank: ORDER[(ORDER.indexOf(st.currentRank) + 1) % ORDER.length],
    pileCount: st.pile.length,
    lastPlay: st.lastPlay ? {
      playerId: st.lastPlay.playerId, count: st.lastPlay.count, declaredRank: st.lastPlay.declaredRank
    } : null,
    lastReveal: st.lastReveal ? {
      cards: st.lastReveal.cards, byPlayer: st.lastReveal.byPlayer,
      declared: st.lastReveal.declared, loserId: st.lastReveal.loserId
    } : null,
    challengeDeadline: st.challengeDeadline,
    log: st.log.slice(-16),
    result: st.result,
    opts: st.opts
  };
}

module.exports = {
  id: 'cheat', name: '唬牌（吹牛）', minPlayers: 2, maxPlayers: 8,
  defaults: DEFAULTS, optionFields: OPTION_FIELDS, rules: RULES,
  init: init, start: start, handle: handle, view: view, nextLabel: '再来一局'
};
