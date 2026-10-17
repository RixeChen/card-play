/* 唬牌（吹牛）—— 前端渲染 */
window.CPGames = window.CPGames || {};
window.CPGames.cheat = (function () {
  'use strict';
  var sel = {};   // 我选中的牌 id 集合
  var timer = null;

  function render(root, snap, api) {
    var v = snap.view || {};
    if (!v.stage || v.stage === 'idle') {
      root.innerHTML = '<div class="notice">等待房主点击「开始游戏」…</div>';
      return;
    }
    var h = '';
    var curName = nameOf(v, v.turnPlayerId);

    h += '<div class="panel"><div class="row">' +
      '<div>本轮要出：<b class="big-num">' + v.currentRank + '</b></div>' +
      '<div>牌堆 <b>' + v.pileCount + '</b> 张</div>' +
      '<div class="dim">下一次：' + v.nextRank + '</div>' +
      '</div></div>';

    if (v.stage === 'challenge' && v.lastPlay) {
      var left = v.challengeDeadline - snap.serverTime;
      h += '<div class="notice"><b>' + UI.esc(nameOf(v, v.lastPlay.playerId)) + '</b> 出了 ' +
        v.lastPlay.count + ' 张，说是 <b class="gold">' + v.lastPlay.declaredRank + '</b>' +
        '<div class="timer" id="cd">质疑倒计时 ' + UI.fmtTime(left) + '</div>' +
        '<div class="acts">' +
        (v.lastPlay.playerId === api.meId
          ? '<button class="btn" data-act="skipTimer">不等了，直接继续</button>'
          : '<button class="btn danger" data-act="challenge">唬！我不信</button>') +
        '</div></div>';
    }

    if (v.lastReveal) {
      h += '<div class="result-box"><h3 style="margin:0 0 6px">翻开结果</h3>' +
        '<div>' + UI.esc(nameOf(v, v.lastReveal.byPlayer)) + ' 声明是 <b>' + v.lastReveal.declared + '</b>，实际是：</div>' +
        '<div class="cards-row">' + v.lastReveal.cards.map(function (c) { return UI.cardHTML(c, { size: 'xs', click: false }); }).join('') + '</div>' +
        '<div style="margin-top:6px">' + (v.lastReveal.loserId
          ? UI.esc(nameOf(v, v.lastReveal.loserId)) + ' 收走牌堆'
          : '无人质疑') + '</div></div>';
    }

    // 玩家列表
    h += '<div class="panel"><h3>牌桌</h3><div class="row">';
    v.players.forEach(function (p) {
      var turn = (v.turnPlayerId === p.id && v.stage === 'play');
      h += '<div class="pchip ' + (turn ? 'turn' : '') + (p.id === api.meId ? ' me' : '') + '">' +
        '<span class="dot"></span>' + UI.esc(p.name) +
        '<span class="tag">' + p.handCount + ' 张</span>' +
        (p.finished ? '<span class="tag">第' + p.rank + '名</span>' : '') +
        '</div>';
    });
    h += '</div></div>';

    if (v.result) {
      h += '<div class="result-box"><h3 style="margin:0 0 8px">名次</h3><table>';
      h += '<tr><th>名次</th><th>玩家</th><th>剩余</th><th>本局分</th></tr>';
      v.result.ranking.forEach(function (r) {
        h += '<tr><td>第 ' + r.rank + ' 名</td><td>' + UI.esc(r.name) + '</td><td>' + r.left + '</td>' +
          '<td class="gold">' + (r.score > 0 ? '+' : '') + r.score + '</td></tr>';
      });
      h += '</table></div>';
    } else {
      h += '<div class="notice center">' +
        (v.stage === 'play'
          ? (v.turnPlayerId === api.meId ? '<b class="gold">轮到你出牌了</b>' : '等待 ' + UI.esc(curName) + ' 出牌…')
          : '') + '</div>';
    }

    // 我的手牌
    var hand = v.myHand || [];
    h += '<div class="panel"><h3>我的手牌（选 1~' + v.opts.maxPlay + ' 张）</h3>';
    h += '<div class="hand-wrap" data-scroll>';
    hand.forEach(function (c) {
      h += UI.cardHTML(c, { size: 'sm', selected: !!sel[c.id] });
    });
    h += '</div>';
    if (v.stage === 'play' && v.turnPlayerId === api.meId) {
      h += '<div class="acts">' +
        '<button class="btn primary" data-act="play">出牌（' + countSel(hand) + '）</button>' +
        '<button class="btn" data-act="clear">取消选择</button>' +
        '</div>';
    }
    h += '</div>';

    root.innerHTML = h;

    // 倒计时
    if (timer) { clearInterval(timer); timer = null; }
    if (v.stage === 'challenge' && v.challengeDeadline) {
      var cd = root.querySelector('#cd');
      var deadline = v.challengeDeadline;
      timer = setInterval(function () {
        if (!cd) return;
        var l = deadline - (Date.now() + window.__serverOffset);
        if (l <= 0) { clearInterval(timer); timer = null; cd.textContent = '等待结算…'; return; }
        cd.textContent = '质疑倒计时 ' + UI.fmtTime(l);
      }, 250);
    }

    root.querySelectorAll('.hand-wrap .card').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-id');
        if (sel[id]) delete sel[id]; else sel[id] = 1;
        el.classList.toggle('sel');
        var b = root.querySelector('[data-act="play"]');
        if (b) b.textContent = '出牌（' + Object.keys(sel).length + '）';
      });
    });
    root.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-act');
        if (a === 'play') {
          var ids = (v.myHand || []).map(function (c) { return c.id; }).filter(function (id) { return sel[id]; });
          if (!ids.length) return UI.toast('请先选牌');
          if (ids.length > v.opts.maxPlay) return UI.toast('一次最多出 ' + v.opts.maxPlay + ' 张');
          sel = {};
          api.send({ type: 'play', cardIds: ids });
        } else if (a === 'clear') { sel = {}; api.send({ type: '__refresh' }); }
        else api.send({ type: a });
      });
    });
  }

  function countSel(hand) { return Object.keys(sel).length; }
  function nameOf(v, id) {
    var p = (v.players || []).filter(function (x) { return x.id === id; })[0];
    return p ? p.name : '?';
  }

  return { render: render };
})();
