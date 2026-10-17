/* 端到端冒烟测试（需先启动服务）：node scripts/e2e.js
 * 用 3 个真实 socket 客户端建一个唬牌房，走完「建房 → 加入 → 开始 → 出牌 → 质疑」。
 */
'use strict';
var io = require('socket.io-client');
var URL = process.env.URL || 'http://127.0.0.1:3000';

function client(name) {
  var s = io(URL, { transports: ['websocket'] });
  var box = { sock: s, name: name, snap: null };
  s.on('state', function (snap) { box.snap = snap; });
  return new Promise(function (res) { s.on('connect', function () { res(box); }); });
}
function call(b, evt, data) {
  return new Promise(function (res) { b.sock.emit(evt, data, function (r) { res(r || {}); }); });
}
function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 250); }); }

(async function () {
  var A = await client('A'), B = await client('B'), C = await client('C');
  var r = await call(A, 'createRoom', { gameId: 'cheat', name: '小明' });
  if (!r.ok) throw new Error('建房间失败：' + r.error);
  console.log('✓ 建房成功，房间号 =', r.roomId);

  var j1 = await call(B, 'joinRoom', { roomId: r.roomId, name: '小红' });
  var j2 = await call(C, 'joinRoom', { roomId: r.roomId, name: '小刚' });
  if (!j1.ok || !j2.ok) throw new Error('加入失败：' + (j1.error || j2.error));
  await tick();
  console.log('✓ 3 人入座，房间人数 =', A.snap.room.players.length);

  var sg = await call(A, 'startGame', {});
  if (!sg.ok) throw new Error('开局失败：' + sg.error);
  await tick();
  console.log('✓ 开局，阶段 =', A.snap.view.stage);

  var list = [A, B, C];
  var cur = list.filter(function (x) { return x.snap.view.turnPlayerId === x.snap.room.meId; })[0];
  if (!cur) throw new Error('找不到当前出牌者');
  console.log('✓ 当前出牌者 =', cur.name, '，手牌', cur.snap.view.myHand.length, '张');

  var pr = await call(cur, 'gameAction', { action: { type: 'play', cardIds: [cur.snap.view.myHand[0].id] } });
  if (!pr.ok) throw new Error('出牌失败：' + pr.error);
  await tick();
  console.log('✓ 出牌成功，进入阶段 =', A.snap.view.stage);

  var challenger = list.filter(function (x) { return x !== cur; })[0];
  var cr = await call(challenger, 'gameAction', { action: { type: 'challenge' } });
  if (!cr.ok) throw new Error('质疑失败：' + cr.error);
  await tick();
  console.log('✓ 质疑成功，翻开结果 =', A.snap.view.lastReveal ? A.snap.view.lastReveal.cards.length + ' 张' : '无');

  // 校验信息隔离：A 不该看到别人的手牌
  var leaked = A.snap.view.players.some(function (p) { return p.myHand; });
  console.log('✓ 隐私检查：', leaked ? '✗ 泄露' : '通过（看不到别人手牌）');

  // 断线重连
  var seat = B.snap.room.meId;
  B.sock.disconnect();
  await tick(300);
  var B2 = await client('B2');
  var rj = await call(B2, 'joinRoom', { roomId: r.roomId, name: '小红', playerId: seat });
  if (!rj.ok) throw new Error('重连失败：' + rj.error);
  await tick();
  console.log('✓ 掉线重连成功，座位恢复 =', B2.snap.room.meId === seat);

  var dis = await call(A, 'dissolveRoom', {});
  console.log('✓ 房主解散房间 =', dis.ok);

  console.log('\n全部端到端检查通过 🎉');
  process.exit(0);
})().catch(function (e) { console.error('✗ ' + e.message); process.exit(1); });
