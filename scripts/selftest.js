/* 自检脚本：node scripts/selftest.js
 * 不需要起服务器，直接把四款游戏的规则跑很多遍，检查有没有崩溃 / 死循环 / 明显错误。
 */
'use strict';
var Cards = require('../public/shared/cards.js');
var Poker = require('../public/shared/poker.js');
var Combos = require('../public/shared/combos.js');
var SJ = require('../public/shared/shengji-rules.js');

var pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name); } }
function section(t) { console.log('\n== ' + t + ' =='); }
function card(suit, rank) {
  var shoe = Cards.createShoe(1, true);
  for (var i = 0; i < shoe.length; i++) {
    if (shoe[i].suit === suit && shoe[i].rank === rank) return shoe[i];
  }
  return null;
}

/* ---------- 1. 五张牌牌力 ---------- */
section('港式五张牌 · 牌力评估');
function ev(list) { return Poker.evaluate(list.map(function (x) { return card(x[0], x[1]); })); }
ok(ev([['S', 'A'], ['S', 'K'], ['S', 'Q'], ['S', 'J'], ['S', '10']]).cat === 8, '黑桃 AKQJ10 = 同花顺');
ok(ev([['S', 'A'], ['S', '2'], ['S', '3'], ['S', '4'], ['S', '5']]).key[0] === 5, 'A2345 同花 = 5 高同花顺');
ok(ev([['S', '9'], ['H', '9'], ['D', '9'], ['C', '9'], ['S', '2']]).cat === 7, '四条');
ok(ev([['S', '9'], ['H', '9'], ['D', '9'], ['C', 'K'], ['S', 'K']]).cat === 6, '葫芦');
ok(ev([['S', '2'], ['S', '5'], ['S', '9'], ['S', 'J'], ['S', 'K']]).cat === 5, '同花');
ok(ev([['S', '5'], ['H', '6'], ['D', '7'], ['C', '8'], ['S', '9']]).cat === 4, '顺子');
ok(ev([['S', 'A'], ['H', '2'], ['D', '3'], ['C', '4'], ['S', '5']]).cat === 4, 'A2345 = 小顺子');
ok(ev([['S', '7'], ['H', '7'], ['D', '7'], ['C', '2'], ['S', '9']]).cat === 3, '三条');
ok(ev([['S', '7'], ['H', '7'], ['D', '9'], ['C', '9'], ['S', '2']]).cat === 2, '两对');
ok(ev([['S', '7'], ['H', '7'], ['D', '9'], ['C', '3'], ['S', '2']]).cat === 1, '一对');
ok(ev([['S', '7'], ['H', '9'], ['D', 'J'], ['C', '3'], ['S', '2']]).cat === 0, '散牌');
ok(Poker.compare(ev([['S', '9'], ['H', '9'], ['D', '9'], ['C', '9'], ['S', '2']]),
  ev([['S', '8'], ['H', '8'], ['D', '8'], ['C', '8'], ['S', '2']])) > 0, '四条 9 > 四条 8');

/* ---------- 2. 保皇牌型 ---------- */
section('保皇 · 牌型识别');
function bh(list) { return Combos.analyze(list.map(function (x) { return card(x[0], x[1]); })); }
ok(bh([['S', '5']]).type === 'single', '单张');
ok(bh([['S', '5'], ['H', '5']]).type === 'pair', '对子');
ok(bh([['S', '5'], ['H', '5'], ['D', '5']]).type === 'trio', '三张');
ok(bh([['S', '5'], ['H', '5'], ['D', '5'], ['C', '9']]).type === 'trio1', '三带一');
ok(bh([['S', '5'], ['H', '5'], ['D', '5'], ['C', '9'], ['S', '9']]).type === 'trio2', '三带二');
ok(bh([['S', '5'], ['H', '6'], ['D', '7'], ['C', '8'], ['S', '9']]).type === 'straight', '顺子 56789');
ok(bh([['S', '5'], ['H', '5'], ['D', '6'], ['C', '6'], ['S', '7'], ['H', '7']]).type === 'dstraight', '连对');
ok(bh([['S', 'A'], ['H', '2'], ['D', '3'], ['C', '4'], ['S', '5']]) === null, '含 2 不是顺子');
ok(bh([['S', '5'], ['H', '5'], ['D', '5'], ['C', '5']]).type === 'bomb', '炸弹');
ok(bh([['J', 'BJ'], ['J', 'RJ']]).type === 'jbomb', '双王 = 王炸');
ok(Combos.beats(bh([['S', '6']]), bh([['S', '5']])), '6 压 5');
ok(Combos.beats(bh([['S', '5'], ['H', '5'], ['D', '5'], ['C', '5']]), bh([['S', 'A']])), '炸弹压单张');
ok(!Combos.beats(bh([['S', '5']]), bh([['S', '6']])), '5 压不过 6');

/* ---------- 3. 升级规则 ---------- */
section('升级 · 主牌与牌型');
var ctx = { level: '2', trumpSuit: 'H' };
function g(c) { return SJ.groupOf(c, ctx); }
ok(g(card('J', 'RJ')) === 'T', '大王是主');
ok(g(card('S', '2')) === 'T', '级牌（打2时所有2）是主');
ok(g(card('H', '9')) === 'T', '主花色是主');
ok(g(card('S', '9')) === 'S', '非主花色非级牌是副牌');
ok(SJ.analyze([card('H', '9'), card('D', '9')], ctx) === null, '主9 + 副9 不能凑一对');
ok(SJ.analyze([card('H', '9'), card('S', '9')], ctx) === null, '跨门出牌不合法');
var ctxL3 = { level: '3', trumpSuit: 'H' };
ok(SJ.analyze([card('H', '3'), card('H', '3')], ctxL3).kind === 'pair', '打3时两张主3（♥3）可成对');
ok(SJ.analyze([card('H', '9'), card('H', '9'), card('H', '10'), card('H', '10')], ctx).kind === 'tractor', '主牌 ♥99♥1010 是拖拉机');
ok(SJ.analyze([card('S', '9'), card('S', '9'), card('S', '10'), card('S', '10')], ctx).kind === 'tractor', '副牌 ♠99♠1010 是拖拉机');
ok(SJ.analyze([card('S', '9'), card('S', '9'), card('S', 'J'), card('S', 'J')], ctx) === null ||
  SJ.analyze([card('S', '9'), card('S', '9'), card('S', 'J'), card('S', 'J')], ctx).kind === 'throw', '99 JJ 不相邻不是拖拉机');
ok(SJ.scoreOfCards([card('S', '5'), card('H', '10'), card('D', 'K')]) === 25, '5+10+K = 25 分');

/* ---------- 4~7. 完整对局模拟 ---------- */
function fakeRoom(gameId, n, options) {
  var players = [];
  for (var i = 0; i < n; i++) players.push({ id: 'p' + i, name: '玩家' + i });
  return {
    id: 'TEST', gameId: gameId, options: options || {},
    _players: players,
    activePlayers: function () { return this._players.slice(); }
  };
}
function ctxFor(broadcast) {
  return {
    setTimer: function () { }, clearTimer: function () { }, broadcast: broadcast || function () { }
  };
}

section('港式五张牌 · 模拟 200 局');
var stud5 = require('../server/games/stud5.js');
(function () {
  var rounds = 0;
  for (var t = 0; t < 200; t++) {
    var room = fakeRoom('stud5', 2 + (t % 6));
    stud5.init(room);
    var c = ctxFor();
    stud5.start(room, c);
    var guard = 0;
    while (room.state.stage === 'betting' && guard++ < 4000) {
      var cur = room.state.players[room.state.turnIndex];
      var act = Math.random();
      var type = act < 0.15 ? 'fold' : (act < 0.75 ? 'call' : 'raise');
      var r = stud5.handle(room, cur.id, { type: type }, c);
      if (!r.ok) { stud5.handle(room, cur.id, { type: 'call' }, c); }
    }
    if (room.state.stage === 'settle') rounds++;
    var v = stud5.view(room, room.state.players[0].id);
    if (!v.players) { console.log('  ✗ view 返回异常'); fail++; break; }
  }
  ok(rounds >= 190, '200 局中 ' + rounds + ' 局正常走到结算');
})();

section('唬牌 · 模拟 200 局');
var cheat = require('../server/games/cheat.js');
(function () {
  var done = 0;
  for (var t = 0; t < 200; t++) {
    var n = 2 + (t % 7);
    var room = fakeRoom('cheat', n);
    cheat.init(room);
    var c = ctxFor();
    cheat.start(room, c);
    var guard = 0;
    while (room.state.stage !== 'ended' && guard++ < 20000) {
      var st = room.state;
      if (st.stage === 'play') {
        var cur = st.players[st.turnIndex];
        var k = 1 + Math.floor(Math.random() * Math.min(4, cur.hand.length));
        var ids = cur.hand.slice(0, k).map(function (x) { return x.id; });
        var r = cheat.handle(room, cur.id, { type: 'play', cardIds: ids }, c);
        if (!r.ok) { console.log('  ✗ 出牌失败：' + r.error); fail++; break; }
      } else if (st.stage === 'challenge') {
        if (Math.random() < 0.35) {
          var others = st.players.filter(function (p) { return !p.finished && p.id !== st.lastPlay.playerId; });
          if (others.length) {
            cheat.handle(room, others[Math.floor(Math.random() * others.length)].id, { type: 'challenge' }, c);
            continue;
          }
        }
        cheat.handle(room, st.lastPlay.playerId, { type: 'skipTimer' }, c);
      } else break;
    }
    if (room.state.stage === 'ended') done++;
  }
  ok(done >= 190, '200 局中 ' + done + ' 局正常结束');
})();

section('保皇 · 模拟 100 局');
var baohuang = require('../server/games/baohuang.js');
(function () {
  var done = 0;
  for (var t = 0; t < 100; t++) {
    var n = 4 + (t % 2);
    var room = fakeRoom('baohuang', n);
    baohuang.init(room);
    var c = ctxFor();
    baohuang.start(room, c);
    baohuang.handle(room, room.state.emperorId, { type: 'choose', solo: (t % 3 === 0), guardKey: 'BJ' }, c);
    if (room.state.stage === 'guardChoose') {
      baohuang.handle(room, room.state.guardId, { type: 'choose', open: (t % 2 === 0) }, c);
    }
    var guard = 0;
    while (room.state.stage === 'play' && guard++ < 20000) {
      var st = room.state;
      var cur = null;
      for (var i = 0; i < st.players.length; i++) if (st.players[i].id === st.turnId) cur = st.players[i];
      if (!cur) break;
      var mustLead = (!st.lastCombo || st.lastPlayerId === cur.id);
      var played = false;
      if (mustLead) {
        var one = [cur.hand[cur.hand.length - 1]];
        played = baohuang.handle(room, cur.id, { type: 'play', cardIds: [one[0].id] }, c).ok;
      } else {
        var beat = Combos.findBeat(cur.hand, st.lastCombo);
        if (beat) {
          played = baohuang.handle(room, cur.id, { type: 'play', cardIds: beat.map(function (x) { return x.id; }) }, c).ok;
        }
        if (!played) {
          var rp = baohuang.handle(room, cur.id, { type: 'pass' }, c);
          if (!rp.ok) { console.log('  ✗ 过牌失败：' + rp.error); break; }
        }
      }
      if (!played && mustLead) { console.log('  ✗ 领出失败'); break; }
    }
    if (room.state.stage === 'ended') {
      done++;
      var res = room.state.result;
      var sum = 0;
      res.ranking.forEach(function (r) { sum += r.delta; });
      if (Math.abs(sum) > 0.001) { console.log('  ✗ 分数总和不为 0：' + sum); fail++; }
      if (res.ranking.some(function (r) { return !isFinite(r.delta) || r.delta % 1 !== 0; })) {
        console.log('  ✗ 出现非整数分数'); fail++;
      }
    }
  }
  ok(done >= 90, '100 局中 ' + done + ' 局正常结束');
})();

section('升级 · 模拟 30 局');
var shengji = require('../server/games/shengji.js');
(function () {
  var done = 0;
  for (var t = 0; t < 30; t++) {
    var room = fakeRoom('shengji', 4, { startLevel: '2', allowThrow: true, bottomDouble: true });
    shengji.init(room);
    var c = ctxFor();
    shengji.start(room, c);
    shengji.handle(room, bySeatId(room), { type: 'chooseTrump', suit: ['S', 'H', 'D', 'C'][t % 4] }, c);
    shengji.handle(room, bySeatId(room), { type: 'discard', auto: true }, c);
    var guard = 0;
    var ctx2 = { level: room.state.level, trumpSuit: room.state.trumpSuit };
    while (room.state.stage === 'play' && guard++ < 5000) {
      var st = room.state;
      var cur = null;
      for (var i = 0; i < st.players.length; i++) if (st.players[i].seat === st.turnSeat) cur = st.players[i];
      if (!cur) break;
      var ids;
      if (!st.trick.length) {
        // 领出：出最小的一张
        ids = [cur.hand[cur.hand.length - 1].id];
      } else {
        var lead = st.trick[0].combo;
        var lg = lead.group;
        var same = cur.hand.filter(function (x) { return SJ.groupOf(x, ctx2) === lg; });
        var need = Math.min(same.length, lead.size);
        var pick = same.slice(same.length - need);
        if (pick.length < lead.size) {
          var rest = cur.hand.filter(function (x) { return pick.indexOf(x) < 0; });
          pick = pick.concat(rest.slice(0, lead.size - pick.length));
        }
        ids = pick.map(function (x) { return x.id; });
      }
      var r = shengji.handle(room, cur.id, { type: 'play', cardIds: ids }, c);
      if (!r.ok) { console.log('  ✗ 升级出牌失败：' + r.error); break; }
    }
    if (room.state.stage === 'ended') done++;
  }
  ok(done >= 25, '30 局中 ' + done + ' 局正常打完');
  function bySeatId(room) {
    var st = room.state;
    for (var i = 0; i < st.players.length; i++) if (st.players[i].seat === st.bankerSeat) return st.players[i].id;
    return st.players[0].id;
  }
})();

console.log('\n---------------------------------------');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
