// app.js — ฝั่ง client เกมไพ่สลาฟ
const socket = io();

// ︎ = text-presentation selector: บังคับให้ดอกแสดงเป็นตัวอักษร (ไม่ใช่ emoji)
// เพื่อให้สี CSS (.red) มีผลจริงบนมือถือ
const SUITS = ['♣︎', '♦︎', '♥︎', '♠︎'];
const RED = new Set([1, 2]); // ข้าวหลามตัด, โพแดง = สีแดง

function rankLabel(r) {
  return { 15: '2', 14: 'A', 13: 'K', 12: 'Q', 11: 'J' }[r] || String(r);
}

const $ = (id) => document.getElementById(id);
let selected = new Set();
let myState = null;

// ---------- หน้าเข้าห้อง ----------
function savedName() { return localStorage.getItem('slaveName') || ''; }
$('name-input').value = savedName();

$('create-btn').onclick = () => {
  const name = $('name-input').value.trim();
  if (!name) return showLobbyError('กรุณาใส่ชื่อก่อน');
  localStorage.setItem('slaveName', name);
  socket.emit('create', { name });
};
// ปุ่ม "เข้าห้อง" ด้านบน = สไลด์เผยช่องรหัสห้อง (ต้องมีชื่อก่อน)
$('join-toggle-btn').onclick = () => {
  const name = $('name-input').value.trim();
  if (!name) return showLobbyError('กรุณาใส่ชื่อก่อน');
  const opened = $('join-section').classList.toggle('open');
  $('join-toggle-btn').classList.toggle('active', opened);
  if (opened) setTimeout(() => $('code-input').focus(), 60);
};
$('join-btn').onclick = () => {
  const name = $('name-input').value.trim();
  const code = $('code-input').value.trim().toUpperCase();
  if (!name) return showLobbyError('กรุณาใส่ชื่อก่อน');
  if (!code) return showLobbyError('กรุณาใส่รหัสห้อง');
  localStorage.setItem('slaveName', name);
  socket.emit('join', { code, name });
};

// validate / error ของ lobby → ใช้ Toast (บน-กลางจอ สีแดง)
function showLobbyError(msg) { showToast(msg, { top: true, error: true, duration: 2500 }); }

// เข้าห้องผ่าน URL ?room=CODE — ถ้ามีชื่อเก็บไว้แล้ว เข้าห้องอัตโนมัติเลย
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) {
  const code = urlRoom.toUpperCase();
  $('code-input').value = code; // เติมรหัสให้ แต่ "หุบ" ช่องไว้
  const name = savedName();
  if (name) socket.emit('join', { code, name }); // เข้าเลย / reconnect ที่นั่งเดิม
}

// ---------- socket events ----------
socket.on('joined', ({ code }) => {
  $('lobby-screen').classList.add('hidden');
  $('game-screen').classList.remove('hidden');
  $('room-code').textContent = code;
  history.replaceState(null, '', `?room=${code}`);
});

socket.on('errorMsg', (msg) => {
  if (!$('game-screen').classList.contains('hidden')) {
    showToast(msg, { top: true, error: true, duration: 2500 }); // toast บน-กลางจอ
  } else {
    showLobbyError(msg);
  }
});

let lastNoticeSeq = 0;
socket.on('state', (state) => {
  myState = state;
  render(state);
  // แจ้งเตือนเด้ง (เช่น คิงตกบัลลังก์) — โชว์ครั้งเดียวต่อ seq
  if (state.notice && state.notice.seq !== lastNoticeSeq) {
    lastNoticeSeq = state.notice.seq;
    showToast(state.notice.text, { top: true, duration: 3500 });
  }
});

// ---------- ปุ่ม ----------
$('start-btn').onclick = () => socket.emit('start');
$('again-btn').onclick = () => { hideModal(); socket.emit('again'); };
$('pass-btn').onclick = () => { socket.emit('pass'); selected.clear(); };
$('play-btn').onclick = () => {
  if (selected.size === 0) return;
  socket.emit('play', { cards: [...selected] });
  selected.clear();
};
$('give-btn').onclick = () => {
  const ex = myState && myState.exchange;
  if (!ex || selected.size !== ex.myCount) return;
  socket.emit('give', { cards: [...selected] });
  selected.clear();
};
$('result-close').onclick = hideModal;

// กติกา (modal)
$('rules-btn').onclick = () => $('rules-modal').classList.remove('hidden');
$('rules-close').onclick = () => $('rules-modal').classList.add('hidden');
$('rules-modal').onclick = (e) => { if (e.target.id === 'rules-modal') $('rules-modal').classList.add('hidden'); };

// ---------- render ----------
function render(s) {
  renderPlayers(s);
  renderPile(s);
  renderLog(s);
  renderHand(s);
  renderCombos(s);
  renderControls(s);

  if (s.phase === 'finished' && s.result) showResult(s.result);
  else hideModal(); // ออกจากเฟสจบรอบ (เช่นเข้าเฟสแลกไพ่) → ปิด modal
}

function renderPlayers(s) {
  $('players').innerHTML = s.players.map((p) => {
    const cls = ['player-chip'];
    if (p.isTurn && s.phase === 'playing') cls.push('turn');
    if (p.finished) cls.push('finished');
    if (!p.connected) cls.push('offline');
    const badge = p.isHost ? '👑 ' : '';
    const title = p.title ? `<span class="ptitle">${esc(p.title)}</span>` : '';
    return `<div class="${cls.join(' ')}">
      <span class="pname">${badge}${esc(p.name)}${p.isYou ? ' (คุณ)' : ''}</span>
      <span class="pcount">${p.finished ? '✅ หมดมือ' : p.cardCount + ' ใบ'}</span>
      ${title}
    </div>`;
  }).join('');
}

function renderPile(s) {
  // ลายน้ำทิศทาง (หลังไพ่) — โชว์เฉพาะตอนเล่น
  $('dir-indicator').textContent = s.phase === 'playing' ? (s.dir === -1 ? '↺' : '↻') : '';

  // ชื่อคนที่ต้องลงไพ่ — ใต้กองไพ่
  const ti = $('turn-info');
  if (s.phase === 'exchange' && s.exchange) {
    const ex = s.exchange;
    if (ex.role === 'winner' && !ex.myDone) {
      ti.textContent = `🎁 เลือกไพ่ ${ex.myCount} ใบ คืนให้ ${ex.toName}`;
    } else if (ex.role === 'loser') {
      ti.textContent = `⛓️ ส่งไพ่สูงสุด ${ex.gaveCount} ใบ ให้ ${ex.fromName} แล้ว · รอรับไพ่คืน...`;
    } else {
      ti.textContent = '⏳ รอผู้เล่นอื่นเลือกไพ่...';
    }
    ti.classList.toggle('your-turn', ex.role === 'winner' && !ex.myDone);
  } else if (s.phase === 'playing') {
    const yours = s.turn === s.youIndex;
    ti.textContent = yours ? '🟢 ตาคุณแล้ว!' : `⏳ ตาของ ${s.turnName}`;
    ti.classList.toggle('your-turn', yours);
  } else {
    ti.textContent = '';
    ti.classList.remove('your-turn');
  }

  const el = $('pile-cards');
  if (s.pileCards && s.pileCards.length) {
    el.innerHTML = s.pileCards.map((c) => cardHTML(c)).join('');
    $('pile-label').textContent = 'กองบนโต๊ะ';
  } else {
    el.innerHTML = '';
    $('pile-label').textContent = s.phase === 'playing' ? 'โต๊ะว่าง — ลงไพ่ได้เลย' : 'กองบนโต๊ะ';
  }
}

// มินิการ์ดสำหรับประวัติ (เล็ก แสดงเลข+ดอก)
function miniCardHTML(c) {
  const red = RED.has(c.s) ? ' red' : '';
  return `<span class="mini-card${red}">${rankLabel(c.r)}${SUITS[c.s]}</span>`;
}

function renderLog(s) {
  const el = $('log');
  const hist = (s.history || []).filter((h) => !h.event); // ไม่โชว์ event (เริ่มรอบ/ขึ้นก่อน ฯลฯ)
  el.innerHTML = hist.map((h) => {
    if (h.pass) return `<span class="log-item log-pass">ผ่าน</span>`;
    const cards = (h.cards || []).map(miniCardHTML).join('');
    return `<span class="log-item">${cards}</span>`;
  }).join('');
  el.scrollLeft = el.scrollWidth; // เลื่อนไปล่าสุด (ขวาสุด)
}

// โหมดเรียงไพ่ในมือ: 'rank' = ตามเลขปกติ, 'bomb' = ดันไพ่ที่เป็นบอมไปขวาสุด
let handSort = localStorage.getItem('handSort') === 'bomb' ? 'bomb' : 'rank';
function sortLabel() {
  return handSort === 'bomb' ? '💣 ดันบอมไปขวา' : '🔢 เรียงตามเลข';
}
function sortedHand(hand) {
  const arr = (hand || []).slice().sort((a, b) => a.r - b.r || a.s - b.s); // เรียงตามเลขก่อนเสมอ
  if (handSort !== 'bomb') return arr;
  // โหมดบอม: แยกไพ่ที่อยู่ในบอม (ตอง/โฟร์/เรียงดอกเดียว) ไปไว้ขวาสุด ที่เหลือคงเรียงเลขเดิม
  const bombIds = [];
  const inBomb = new Set();
  for (const cb of detectCombos(arr)) {
    for (const id of cb.ids) if (!inBomb.has(id)) { inBomb.add(id); bombIds.push(id); }
  }
  if (!bombIds.length) return arr;
  const byId = new Map(arr.map((c) => [c.id, c]));
  const left = arr.filter((c) => !inBomb.has(c.id)); // ไม่ใช่บอม → เรียงเลขปกติ (ซ้าย)
  const right = bombIds.map((id) => byId.get(id)); // บอม → กลุ่มไว้ (ขวา)
  return [...left, ...right];
}
$('sort-toggle').textContent = sortLabel();
$('sort-toggle').onclick = () => {
  handSort = handSort === 'rank' ? 'bomb' : 'rank';
  localStorage.setItem('handSort', handSort);
  $('sort-toggle').textContent = sortLabel();
  if (myState) renderHand(myState);
};

function renderHand(s) {
  const hand = $('hand');
  hand.innerHTML = sortedHand(s.hand).map((c) => {
    const sel = selected.has(c.id) ? ' selected' : '';
    return cardHTML(c, ` data-id="${c.id}"`, sel);
  }).join('');
  hand.querySelectorAll('.playing-card').forEach((el) => {
    el.onclick = () => {
      const id = el.dataset.id;
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      el.classList.toggle('selected');
      updatePlayBtn();
    };
  });
}

// ตรวจหา "บอมบ์" ที่ทำได้จากไพ่ในมือ: ตอง, โฟร์, เรียงดอกเดียว (ยาว >=3)
function detectCombos(hand) {
  const out = [];

  // ตอง / โฟร์ — จัดกลุ่มตามอันดับ
  const byRank = {};
  for (const c of hand) (byRank[c.r] ||= []).push(c);
  Object.keys(byRank).map(Number).sort((a, b) => a - b).forEach((r) => {
    const cards = byRank[r];
    if (cards.length === 4) {
      out.push({ label: `โฟร์ ${rankLabel(r)}`, ids: cards.map((c) => c.id) });
    } else if (cards.length === 3) {
      out.push({ label: `ตอง ${rankLabel(r)}`, ids: cards.map((c) => c.id) });
    }
  });

  // เรียงดอกเดียว (flush straight) — จัดกลุ่มตามดอก, ห้ามมีไพ่ 2 (r=15)
  const bySuit = {};
  for (const c of hand) if (c.r !== 15) (bySuit[c.s] ||= []).push(c);
  Object.keys(bySuit).map(Number).forEach((s) => {
    const cards = bySuit[s].slice().sort((a, b) => a.r - b.r);
    let run = [cards[0]];
    const flush = (rn) => {
      if (rn.length >= 3) {
        out.push({
          label: `เรียง${SUITS[s]} ${rankLabel(rn[0].r)}-${rankLabel(rn[rn.length - 1].r)} (${rn.length})`,
          ids: rn.map((c) => c.id),
        });
      }
    };
    for (let i = 1; i < cards.length; i++) {
      if (cards[i].r === cards[i - 1].r + 1) run.push(cards[i]);
      else { flush(run); run = [cards[i]]; }
    }
    flush(run);
  });

  return out;
}

function renderCombos(s) {
  const box = $('combo-hints');
  const combos = s.phase === 'playing' && s.hand && s.hand.length ? detectCombos(s.hand) : [];
  if (!combos.length) {
    box.innerHTML = '';
    box.classList.add('hidden');
    return;
  }
  const isActive = (ids) => selected.size === ids.length && ids.every((id) => selected.has(id));
  box.classList.remove('hidden');
  box.innerHTML =
    '<span class="combo-hints-label">💣 บอมบ์ในมือ:</span>' +
    combos.map((cb, i) =>
      `<button class="combo-chip${isActive(cb.ids) ? ' active' : ''}" data-i="${i}">${esc(cb.label)}</button>`
    ).join('');
  box.querySelectorAll('.combo-chip').forEach((btn) => {
    btn.onclick = () => {
      const ids = combos[+btn.dataset.i].ids;
      // กดครั้งแรก = เลือกชุดนี้, กดซ้ำ (ชุดเดิม) = ยกเลิก
      selected = isActive(ids) ? new Set() : new Set(ids);
      renderHand(myState);
      renderCombos(myState);
      updatePlayBtn();
    };
  });
}

function renderControls(s) {
  const isHost = s.youAreHost;
  const startBtn = $('start-btn');
  const againBtn = $('again-btn');
  const playBtn = $('play-btn');
  const passBtn = $('pass-btn');

  startBtn.classList.toggle('hidden', !(s.phase === 'lobby' && isHost));
  startBtn.disabled = s.players.filter((p) => p.connected).length < 2;
  if (s.phase === 'lobby' && isHost && startBtn.disabled) {
    startBtn.textContent = 'รออีกอย่างน้อย 2 คน';
  } else {
    startBtn.textContent = 'เริ่มเกม';
  }

  againBtn.classList.toggle('hidden', !(s.phase === 'finished' && isHost));

  const myTurn = s.phase === 'playing' && s.turn === s.youIndex;
  playBtn.classList.toggle('hidden', s.phase !== 'playing');
  passBtn.classList.toggle('hidden', s.phase !== 'playing');
  $('sort-toggle').classList.toggle('hidden', s.phase !== 'playing');
  passBtn.disabled = !myTurn || !s.pile; // นำกองไม่ให้ผ่าน

  // เฟสแลกไพ่: โชว์ปุ่มส่งไพ่เฉพาะคนที่ยังต้องเลือก
  const showGive = s.phase === 'exchange' && s.exchange && !s.exchange.myDone;
  $('give-btn').classList.toggle('hidden', !showGive);

  updatePlayBtn();
}

function updatePlayBtn() {
  const s = myState;
  const myTurn = s && s.phase === 'playing' && s.turn === s.youIndex;
  $('play-btn').disabled = !myTurn || selected.size === 0;
  const ex = s && s.phase === 'exchange' ? s.exchange : null;
  $('give-btn').disabled = !(ex && !ex.myDone && selected.size === ex.myCount);
}

// ---------- result modal ----------
function showResult(result) {
  $('result-list').innerHTML = result.map((r, i) => {
    const cls = i === 0 ? 'rank-0' : (i === result.length - 1 ? 'rank-last' : '');
    const medal = i === 0 ? '🏆 ' : (i === result.length - 1 ? '💀 ' : '');
    return `<li class="${cls}">${medal}${esc(r.title)} — ${esc(r.name)}</li>`;
  }).join('');
  $('result-modal').classList.remove('hidden');
}
function hideModal() { $('result-modal').classList.add('hidden'); }

// ---------- helpers ----------
function cardHTML(c, attrs = '', extraClass = '') {
  const red = RED.has(c.s) ? ' red' : '';
  const r = rankLabel(c.r), suit = SUITS[c.s];
  return `<div class="playing-card${red}${extraClass}"${attrs}>
    <span class="corner tl">${r}<br>${suit}</span>
    <span class="pip">${suit}</span>
    <span class="corner br">${r}<br>${suit}</span>
  </div>`;
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, (m) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
  ));
}

// ---------- คัดลอกลิงก์ห้อง + toast ----------
let toastTimer;
function showToast(msg, opts = {}) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('top', !!opts.top); // บน-กลางจอ (ไม่งั้น ล่าง-กลาง)
  t.classList.toggle('error', !!opts.error); // สีแดงสำหรับ error
  t.classList.remove('hidden');
  void t.offsetWidth; // บังคับ reflow ให้ transition ทำงาน
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.classList.add('hidden'), 200);
  }, opts.duration || 1800);
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* ตกไป fallback */ }
  // fallback สำหรับ http บน LAN (ไม่ใช่ secure context)
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

$('room-code-box').onclick = async () => {
  const code = $('room-code').textContent.trim();
  if (!code) return;
  const ok = await copyText(code);
  showToast(ok ? `คัดลอกรหัสห้องแล้ว ✓ (${code})` : `คัดลอกไม่สำเร็จ — ${code}`);
};
