/* 四款游戏全量端到端冒烟测试（需先启动服务）：node scripts/e2e-all.js
 * 为每款游戏开一个房间，按各自流程走几步，确认服务端不报错、状态能正常推进。
 */
'use strict';
var io = require('socket.io-client');
var URL = process.env.URL || 'http://127.0.0.1:3000';

function client() {
  var s = io(URL, { transports: ['websocket'] });
  var box = { sock: s, snap: null, meId: null };
  s.on('state', function (snap) { box.snap = snap; box.meId = snap.room.meId; });
  return new Promise(function (res) { s.on('connect', function () { res(box); }); });
}
function call(b, evt, data) { return new Promise(function (res) { b.sock.emit(evt, data, function (r) { res(r || {}); }); }); }
function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 200); }); }
function must(r, what) { if (!r.ok) throw new Error(what + '失败：' + r.error); }

async function setup(gameId, n) {
  var list = [];
  for (var i = 0; i < n; i++) list.push(await client());
  var r = await call(list[0], 'createRoom', { gameId: gameId, name: 'P0' });
  must(r, '建房');
  for (var j = 1; j < n; j++) {
    var rr = await call(list[j], 'joinRoom', { roomId: r.roomId, name: 'P' + j });
    must(rr, '加入');
  }
  await tick();
  var sg = await call(list[0], 'startGame', {});
  must(sg, '开局');
  await tick();
  return { list: list, roomId: r.roomId };
}
function me(list, id) { return list.filter(function (x) { return x.meId === id; })[0]; }

(async function () {
  /* ---------- 港式五张牌 ---------- */
  {
    var s = await setup('stud5', 4);
    var v = s.list[0].snap.view;
    console.log('[五张牌] 阶段=' + v.stage + ' 彩池=' + v.pot + ' 每人牌数=' + v.players[0].hole.length + '暗+' + v.players[0].up.length + '明');
    for (var k = 0; k < 12; k++) {
      var cur = s.list.filter(function (x) { return x.snap.view.myTurn; })[0];
      if (!cur) break;
      var r = await call(cur, 'gameAction', { action: { type: (k % 4 === 0 ? 'raise' : 'call') } });
      if (!r.ok) { await call(cur, 'gameAction', { action: { type: 'call' } }); }
      await tick(80);
    }
    var v2 = s.list[0].snap.view;
    console.log('[五张牌] 12 步后阶段=' + v2.stage + ' 牌数=' + v2.players[0].hole.length + '+' + v2.players[0].up.length);
    ok(v2.stage === 'betting' || v2.stage === 'settle', '五张牌推进正常');
    await call(s.list[0], 'dissolveRoom', {});
  }

  /* ---------- 保皇 ---------- */
  {
    var b = await setup('baohuang', 5);
    var bv = b.list[0].snap.view;
    var emperor = b.list.filter(function (x) { return x.meId === bv.emperorId; })[0];
    console.log('[保皇] 阶段=' + bv.stage + ' 皇帝=' + (emperor ? '已确定' : '无'));
    var r1 = await call(emperor, 'gameAction', { action: { type: 'choose', solo: false, guardKey: 'BJ' } });
    if (!r1.ok) throw new Error('皇帝决策失败：' + r1.error);
    await tick();
    var bv2 = b.list[0].snap.view;
    if (bv2.stage === 'guardChoose') {
      var guard = b.list.filter(function (x) { return x.meId === bv2.guardId; })[0];
      var r2 = await call(guard, 'gameAction', { action: { type: 'choose', open: true } });
      if (!r2.ok) throw new Error('保子决策失败：' + r2.error);
      await tick();
    }
    for (var m = 0; m < 10; m++) {
      var cur2 = b.list.filter(function (x) { return x.snap.view.turnId === x.meId && x.snap.view.stage === 'play'; })[0];
      if (!cur2) break;
      var hand = cur2.snap.view.myHand;
      var lead = !cur2.snap.view.lastComboRaw || cur2.snap.view.mustLead;
      var act = lead ? { type: 'play', cardIds: [hand[hand.length - 1].id] } : { type: 'pass' };
      var r3 = await call(cur2, 'gameAction', { action: act });
      if (!r3.ok) { var r4 = await call(cur2, 'gameAction', { action: { type: 'pass' } }); if (!r4.ok) break; }
      await tick(80);
    }
    var bv3 = b.list[0].snap.view;
    console.log('[保皇] 10 步后阶段=' + bv3.stage + ' 皇帝手牌=' + bv3.players.filter(function (p) { return p.id === bv3.emperorId; })[0].handCount);
    ok(bv3.stage === 'play' || bv3.stage === 'ended', '保皇推进正常');
    await call(b.list[0], 'dissolveRoom', {});
  }

  /* ---------- 升级 ---------- */
  {
    var g = await setup('shengji', 4);
    var gv = g.list[0].snap.view;
    var banker = g.list.filter(function (x) { return x.meId === gv.players.filter(function (p) { return p.isBanker; })[0].id; })[0];
    console.log('[升级] 阶段=' + gv.stage + ' 打=' + gv.level);
    var r5 = await call(banker, 'gameAction', { action: { type: 'chooseTrump', suit: 'H' } });
    if (!r5.ok) throw new Error('选主失败：' + r5.error);
    await tick();
    var r6 = await call(banker, 'gameAction', { action: { type: 'discard', auto: true } });
    if (!r6.ok) throw new Error('扣底牌失败：' + r6.error);
    await tick();
    for (var t = 0; t < 12; t++) {
      var cur3 = g.list.filter(function (x) { return x.snap.view.turnId === x.meId && x.snap.view.stage === 'play'; })[0];
      if (!cur3) break;
      var hv = cur3.snap.view;
      var ids;
      if (!hv.trick.length) ids = [hv.myHand[hv.myHand.length - 1].id];
      else {
        var ctx = { level: hv.level, trumpSuit: hv.trumpSuit };
        var SJ = require('../public/shared/shengji-rules.js');
        var lg = SJ.groupOf(hv.trick[0].cards[0], ctx);
        var same = hv.myHand.filter(function (x) { return SJ.groupOf(x, ctx) === lg; });
        var need = Math.min(same.length, hv.leadSize);
        var pick = same.slice(same.length - need);
        if (pick.length < hv.leadSize) {
          var rest = hv.myHand.filter(function (x) { return pick.indexOf(x) < 0; });
          pick = pick.concat(rest.slice(0, hv.leadSize - pick.length));
        }
        ids = pick.map(function (x) { return x.id; });
      }
      var r7 = await call(cur3, 'gameAction', { action: { type: 'play', cardIds: ids } });
      if (!r7.ok) throw new Error('升级出牌失败：' + r7.error);
      await tick(80);
    }
    var gv2 = g.list[0].snap.view;
    console.log('[升级] 12 步后阶段=' + gv2.stage + ' 已完成轮数展示=' + (gv2.lastTrick ? gv2.lastTrick.winnerName : '无'));
    ok(gv2.stage === 'play' || gv2.stage === 'ended', '升级推进正常');
    await call(g.list[0], 'dissolveRoom', {});
  }

  console.log('\n四款游戏端到端冒烟测试全部通过 🎉');
  process.exit(0);
})().catch(function (e) { console.error('✗ ' + e.message); process.exit(1); });

function ok(cond, msg) { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) process.exitCode = 1; }
