// app.js — ฝั่ง client เกมไพ่สลาฟ
import { io } from 'socket.io-client';
import { icon, iconize, refreshIcons } from './icons.js';
import { NameSchema, CodeSchema, validateField } from './validation.js';
import './style.css';

const socket = io();

// เลขเวอร์ชัน (Vite แทนค่า __APP_VERSION__ จาก package.json ตอน build)
const appVersionEl = document.getElementById('app-version');
if (appVersionEl) appVersionEl.textContent = `v${__APP_VERSION__}`;

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

// แสดง/ล้าง error ใต้ฟิลด์ (shadcn FormMessage) + ตั้ง aria-invalid
function setFieldError(inputId, errorId, message) {
  const input = $(inputId), err = $(errorId);
  if (message) {
    err.innerHTML = `${icon('circle-alert')} ${esc(message)}`;
    input.setAttribute('aria-invalid', 'true');
    refreshIcons();
  } else {
    err.textContent = '';
    input.removeAttribute('aria-invalid');
  }
}

// ---------- Progress bar บนสุด (shadcn) — ref-count ให้ซ้อน action ได้ ----------
let _progCount = 0, _progTimer = null, _progVal = 0;
function _progBegin() {
  const bar = $('progress-bar');
  _progVal = 8;
  bar.classList.add('active');
  bar.style.width = _progVal + '%';
  clearInterval(_progTimer);
  _progTimer = setInterval(() => { // ค่อยๆ ไต่เข้าใกล้ 92% แล้วรอจังหวะ done
    _progVal += (92 - _progVal) * 0.12;
    $('progress-bar').style.width = _progVal.toFixed(1) + '%';
  }, 220);
}
function _progEnd() {
  clearInterval(_progTimer);
  const bar = $('progress-bar');
  bar.style.width = '100%';
  setTimeout(() => { bar.classList.remove('active'); setTimeout(() => { bar.style.width = '0%'; }, 250); }, 180);
}
function progStart() { if (++_progCount === 1) _progBegin(); }
function progDone() { if (_progCount > 0 && --_progCount === 0) _progEnd(); }

// ---------- ปุ่ม loading: สปินเนอร์ + ข้อความ + disabled (shadcn) ----------
const _btnHTML = new WeakMap();
function setBtnLoading(btn, loading, label) {
  if (loading) {
    if (!_btnHTML.has(btn)) _btnHTML.set(btn, btn.innerHTML); // เก็บ HTML เดิมไว้คืนค่า
    btn.innerHTML = `${icon('loader-circle', 'spin')} ${esc(label || '')}`;
    btn.classList.add('loading');
    btn.disabled = true;
  } else if (_btnHTML.has(btn)) {
    btn.innerHTML = _btnHTML.get(btn);
    btn.classList.remove('loading');
    btn.disabled = false;
  }
  refreshIcons();
}

// เริ่ม/จบ action ฟอร์มเข้าห้อง — ล็อกฟอร์ม + progress + timeout กันค้างถ้า server เงียบ
let _lobbyTimer = null, _lobbyBtn = null;
function startLobbyAction(btn, label) {
  if (_lobbyBtn) return false; // มี action ค้างอยู่แล้ว
  _lobbyBtn = btn;
  setBtnLoading(btn, true, label);
  $('name-input').disabled = $('code-input').disabled = true;
  $('create-btn').disabled = $('join-btn').disabled = true;
  progStart();
  clearTimeout(_lobbyTimer);
  _lobbyTimer = setTimeout(() => { endLobbyAction(); showLobbyError('เชื่อมต่อช้า ลองอีกครั้ง'); }, 10000);
  return true;
}
function endLobbyAction() {
  if (!_lobbyBtn) return;
  clearTimeout(_lobbyTimer);
  setBtnLoading(_lobbyBtn, false);
  _lobbyBtn = null;
  $('name-input').disabled = $('code-input').disabled = false;
  $('create-btn').disabled = $('join-btn').disabled = false;
  progDone();
}

$('create-btn').onclick = () => {
  const res = validateField(NameSchema, $('name-input').value);
  setFieldError('name-input', 'name-error', res.ok ? null : res.message);
  if (!res.ok) return;
  localStorage.setItem('slaveName', res.value);
  if (startLobbyAction($('create-btn'), 'กำลังสร้างห้อง...')) socket.emit('create', { name: res.value });
};
$('join-btn').onclick = () => {
  const nameRes = validateField(NameSchema, $('name-input').value);
  const codeRes = validateField(CodeSchema, $('code-input').value);
  setFieldError('name-input', 'name-error', nameRes.ok ? null : nameRes.message);
  setFieldError('code-input', 'code-error', codeRes.ok ? null : codeRes.message);
  if (!nameRes.ok || !codeRes.ok) return;
  localStorage.setItem('slaveName', nameRes.value);
  if (startLobbyAction($('join-btn'), 'กำลังเข้าห้อง...')) socket.emit('join', { code: codeRes.value, name: nameRes.value });
};

// ล้าง error ทันทีที่ผู้ใช้แก้ + กด Enter เพื่อ submit
$('name-input').addEventListener('input', () => setFieldError('name-input', 'name-error', null));
$('code-input').addEventListener('input', () => setFieldError('code-input', 'code-error', null));
$('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('create-btn').click(); });
$('code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('join-btn').click(); });

// error จาก server (เช่น ไม่พบห้อง) → Toast (บน-กลางจอ สีแดง)
function showLobbyError(msg) { showToast(msg, { top: true, error: true, duration: 2500 }); }

// เข้าห้องผ่าน URL ?room=CODE — ถ้ามีชื่อเก็บไว้แล้ว เข้าห้องอัตโนมัติเลย
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) {
  const code = urlRoom.toUpperCase();
  $('code-input').value = code; // เติมรหัสให้ แต่ "หุบ" ช่องไว้
  const name = savedName();
  // เข้าเลย / reconnect ที่นั่งเดิม — โชว์ loading ที่ปุ่มเข้าห้อง
  if (name && startLobbyAction($('join-btn'), 'กำลังเข้าห้อง...')) socket.emit('join', { code, name });
}

// ---------- socket events ----------
// progress ตอนโหลดหน้า: เริ่มทันที จบเมื่อ socket เชื่อมต่อครั้งแรก
let _firstConnect = true;
progStart();
socket.on('connect', () => { if (_firstConnect) { _firstConnect = false; progDone(); } });

socket.on('joined', ({ code }) => {
  endLobbyAction();
  $('lobby-screen').classList.add('hidden');
  $('game-screen').classList.remove('hidden');
  $('room-code').textContent = code;
  history.replaceState(null, '', `?room=${code}`);
});

// กลับเข้าหน้าล็อบบี้ (หลังออกจากห้อง)
socket.on('left', () => {
  $('game-screen').classList.add('hidden');
  $('lobby-screen').classList.remove('hidden');
  selected.clear();
  myState = null;
  history.replaceState(null, '', location.pathname); // ลบ ?room=... ออก
});

socket.on('errorMsg', (msg) => {
  endLobbyAction(); // ปลดล็อกฟอร์ม + จบ progress (no-op ถ้าไม่มี action ค้าง)
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
// ออกจากห้อง — เปิด AlertDialog ยืนยันก่อนเสมอ (กันกดพลาด)
$('leave-btn').onclick = () => {
  const playing = myState && myState.phase !== 'lobby' && myState.phase !== 'finished';
  $('leave-desc').textContent = playing
    ? 'เกมยังเล่นอยู่ — ที่นั่งของคุณจะถูกพักไว้ กลับเข้ามาด้วยชื่อเดิมได้'
    : 'คุณกำลังจะออกจากห้องนี้';
  openDialog($('leave-modal'));
};
$('leave-confirm').onclick = () => { closeDialog($('leave-modal')); socket.emit('leave'); };

// ---------- Dialog (shadcn) — เปิด/ปิดมี animation, ปิดด้วยปุ่ม X / คลิก overlay / Escape ----------
function openDialog(el) {
  if (el.classList.contains('open')) return; // เปิดอยู่แล้ว ไม่ต้อง re-animate
  clearTimeout(el._closeTimer);
  el.classList.remove('hidden');
  void el.offsetWidth; // reflow ให้ transition เข้าทำงาน
  el.classList.add('open');
}
function closeDialog(el) {
  if (!el || el.classList.contains('hidden')) return;
  el.classList.remove('open');
  clearTimeout(el._closeTimer);
  el._closeTimer = setTimeout(() => el.classList.add('hidden'), 180); // รอ exit animation จบ
}

$('rules-btn').onclick = () => openDialog($('rules-modal'));

// คลิกพื้นหลัง (overlay) ที่ว่าง = ปิด — ยกเว้น AlertDialog (ต้องเลือกปุ่มเอง ตามแบบ shadcn)
document.querySelectorAll('.modal').forEach((m) => {
  m.addEventListener('click', (e) => {
    if (e.target === m && m.getAttribute('role') !== 'alertdialog') closeDialog(m);
  });
});
// ปุ่มปิดทุกตัว (รวมปุ่ม X) ที่ติด data-dialog-close
document.querySelectorAll('[data-dialog-close]').forEach((btn) => {
  btn.addEventListener('click', () => closeDialog(btn.closest('.modal')));
});
// Escape = ปิด dialog ที่เปิดอยู่บนสุด
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const top = [...document.querySelectorAll('.modal.open')].pop();
  if (top) closeDialog(top);
});

// ---------- render ----------
function render(s) {
  renderPlayers(s);
  renderPile(s);
  renderLog(s);
  renderHand(s);
  renderCombos(s);
  renderControls(s);
  renderTurnTimer(s);

  if (s.phase === 'finished' && s.result) showResult(s.result);
  else hideModal(); // ออกจากเฟสจบรอบ (เช่นเข้าเฟสแลกไพ่) → ปิด modal

  refreshIcons(); // แปลง <i data-lucide> ที่เพิ่ง render เป็น <svg>
}

const SEAT_IDS = [
  'seat-tl', 'seat-top', 'seat-tr', 'seat-left',
  'seat-right', 'seat-bl', 'seat-bottom', 'seat-br',
];

// ที่นั่งบนตาราง 3×3 ตามตำแหน่งสัมพัทธ์จาก "คุณ" (rel 0 = คุณ)
function seatFor(rel, n) {
  if (n === 4) {
    // 4 คน → ใช้ "มุม" 1/3/9/7: คุณ=ล่างซ้าย(1) แล้วไล่ตามเข็ม
    return ['seat-bl', 'seat-br', 'seat-tr', 'seat-tl'][rel];
  }
  // คุณ = ล่าง (2) เสมอ
  if (rel === 0) return 'seat-bottom';
  if (n === 2) return 'seat-top';                            // 2 คน: ตรงข้าม (8)
  return rel === 1 ? 'seat-tr' : 'seat-tl';                  // 3 คน: มุมบน ขวา(9)/ซ้าย(7)
}

function chipHTML(p, s) {
  const cls = ['player-chip'];
  if (p.isTurn && s.phase === 'playing') cls.push('turn');
  if (p.finished) cls.push('finished');
  if (!p.connected) cls.push('offline');
  if (p.isYou) cls.push('you');
  const badge = p.isHost ? icon('crown', 'host-ico') + ' ' : '';
  const off = !p.connected ? ' ' + icon('wifi-off', 'off-ico') : '';
  const title = p.title ? `<span class="ptitle">${iconize(esc(p.title))}</span>` : '';
  const count = p.finished ? `${icon('circle-check')} หมดมือ` : p.cardCount + ' ใบ';
  return `<div class="${cls.join(' ')}">
    <span class="pname">${badge}${esc(p.name)}${p.isYou ? ' (คุณ)' : ''}${off}</span>
    <span class="pcount">${count}</span>
    ${title}
  </div>`;
}

function renderPlayers(s) {
  SEAT_IDS.forEach((id) => { $(id).innerHTML = ''; }); // เคลียร์ทุกที่นั่งก่อน
  const n = s.players.length;
  const you = s.youIndex >= 0 ? s.youIndex : 0;
  s.players.forEach((p, i) => {
    const rel = ((i - you) % n + n) % n; // 0 = คุณ, ไล่ตามลำดับรอบโต๊ะ
    $(seatFor(rel, n)).innerHTML = chipHTML(p, s);
  });
}

function renderPile(s) {
  // ลายน้ำทิศทาง (หลังไพ่) — โชว์เฉพาะตอนเล่น
  $('dir-indicator').innerHTML = s.phase === 'playing' ? icon(s.dir === -1 ? 'rotate-ccw' : 'rotate-cw') : '';

  // ชื่อคนที่ต้องลงไพ่ — ใต้กองไพ่
  const ti = $('turn-info');
  if (s.phase === 'exchange' && s.exchange) {
    const ex = s.exchange;
    if (ex.role === 'winner' && !ex.myDone) {
      ti.innerHTML = `${icon('gift')} เลือกไพ่ ${ex.myCount} ใบ คืนให้ ${esc(ex.toName)}`;
    } else if (ex.role === 'loser') {
      ti.innerHTML = `${icon('link')} ส่งไพ่สูงสุด ${ex.gaveCount} ใบ ให้ ${esc(ex.fromName)} แล้ว · รอรับไพ่คืน...`;
    } else {
      ti.innerHTML = `${icon('hourglass')} รอผู้เล่นอื่นเลือกไพ่...`;
    }
    ti.classList.toggle('your-turn', ex.role === 'winner' && !ex.myDone);
  } else if (s.phase === 'playing') {
    const yours = s.turn === s.youIndex;
    ti.innerHTML = yours ? `${icon('circle-dot')} ตาคุณแล้ว!` : `${icon('hourglass')} ตาของ ${esc(s.turnName)}`;
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

// ---------- นาฬิกานับถอยหลังต่อตา ----------
let turnEndsAt = null;
let turnTick = null;
function stopTurnTimer() {
  clearInterval(turnTick);
  turnTick = null;
  turnEndsAt = null;
  const el = $('turn-timer');
  if (el) el.classList.add('hidden');
}
function renderTurnTimer(s) {
  const el = $('turn-timer');
  if (!el) return;
  if (s.phase !== 'playing' || s.turnRemainingMs == null) { stopTurnTimer(); return; }
  // sync กับเวลาที่ server บอก (กัน clock skew) แล้วเดินด้วยนาฬิกาเครื่องเรา
  turnEndsAt = Date.now() + s.turnRemainingMs;
  el.classList.toggle('mine', s.turn === s.youIndex); // ตาเรา = เน้นสี
  clearInterval(turnTick);
  const tick = () => {
    const ms = Math.max(0, turnEndsAt - Date.now());
    const sec = Math.ceil(ms / 1000);
    $('turn-timer-sec').textContent = sec;
    el.classList.remove('hidden');
    el.classList.toggle('urgent', sec <= 5); // ใกล้หมด → แดงเต้น
    if (ms <= 0) { clearInterval(turnTick); turnTick = null; }
  };
  tick();
  turnTick = setInterval(tick, 250);
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
  return handSort === 'bomb' ? `${icon('bomb')} ดันบอมไปขวา` : `${icon('list-ordered')} เรียงตามเลข`;
}
function sortedHand(hand) {
  const arr = (hand || []).slice().sort((a, b) => a.r - b.r || a.s - b.s); // เรียงตามเลขก่อนเสมอ
  if (handSort !== 'bomb') return arr;
  // โหมดบอม: ดันไพ่ที่อยู่ในบอม (ตอง/โฟร์/เรียงดอกเดียว) ไปไว้ขวาสุด ที่เหลือคงเรียงเลขเดิม
  // บอมบ์ที่ใช้ไพ่ร่วมกันจะ "เชื่อมต่อกัน" โดยใช้ไพ่ร่วมเป็นสะพาน
  //   เช่น โฟร์ 3♣3♦3♥3♠ + เรียง♥ 3♥4♥5♥ → 3♣ 3♦ 3♠ [3♥] 4♥ 5♥
  const blocks = [];
  const idBlock = new Map();
  for (const cb of detectCombos(arr)) {
    const shared = cb.ids.find((id) => idBlock.has(id));
    if (!shared) {
      const block = cb.ids.slice();
      blocks.push(block);
      block.forEach((id) => idBlock.set(id, block));
    } else {
      // ย้ายไพ่ร่วมไปท้ายบล็อก แล้วต่อไพ่ใหม่ของบอมบ์นี้ ให้เรียงต่อเนื่องผ่านไพ่ร่วม
      const block = idBlock.get(shared);
      block.splice(block.indexOf(shared), 1);
      block.push(shared);
      for (const id of cb.ids) {
        if (id === shared || idBlock.has(id)) continue;
        block.push(id);
        idBlock.set(id, block);
      }
    }
  }
  const bombIds = blocks.flat();
  if (!bombIds.length) return arr;
  const inBomb = new Set(bombIds);
  const byId = new Map(arr.map((c) => [c.id, c]));
  const left = arr.filter((c) => !inBomb.has(c.id)); // ไม่ใช่บอม → เรียงเลขปกติ (ซ้าย)
  const right = bombIds.map((id) => byId.get(id)); // บอม → กลุ่ม+เชื่อมต่อ (ขวา)
  return [...left, ...right];
}
$('sort-toggle').innerHTML = sortLabel();
$('sort-toggle').onclick = () => {
  handSort = handSort === 'rank' ? 'bomb' : 'rank';
  localStorage.setItem('handSort', handSort);
  $('sort-toggle').innerHTML = sortLabel();
  refreshIcons();
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
    `<span class="combo-hints-label">${icon('bomb')} บอมบ์ในมือ:</span>` +
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
    const medal = i === 0 ? icon('trophy') + ' ' : (i === result.length - 1 ? icon('skull') + ' ' : '');
    return `<li class="${cls}">${medal}${iconize(esc(r.title))} — ${esc(r.name)}</li>`;
  }).join('');
  openDialog($('result-modal'));
}
function hideModal() { closeDialog($('result-modal')); }

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

// ---------- คัดลอกลิงก์ห้อง + Toast (shadcn / Sonner) ----------
let toastTimer, toastHideTimer;
function showToast(msg, opts = {}) {
  const t = $('toast');
  const variant = opts.error ? 'error' : (opts.success ? 'success' : 'default'); // ชนิด toast
  const lead = variant === 'error' ? icon('circle-alert', 'toast-ico')
    : variant === 'success' ? icon('circle-check', 'toast-ico')
      : ''; // default ไม่มีไอคอนนำ (เนื้อหามักมีไอคอนของตัวเองอยู่แล้ว)
  // esc กันชื่อผู้เล่นมี HTML, แล้วค่อยแปลง emoji → ไอคอน
  t.innerHTML = `${lead}<span class="toast-msg">${iconize(esc(msg))}</span>`;
  refreshIcons();
  t.classList.toggle('top', opts.top !== false); // บน-กลางจอเป็นค่าเริ่มต้น (ส่ง top:false ถ้าอยากล่าง)
  t.classList.toggle('error', !!opts.error); // destructive variant
  t.classList.toggle('success', !!opts.success);
  t.classList.remove('hidden');
  t.classList.remove('show'); // รีเซ็ตก่อน เพื่อให้ animation เล่นซ้ำได้แม้ข้อความเดิม
  clearTimeout(toastHideTimer);
  void t.offsetWidth; // บังคับ reflow ให้ transition เล่นใหม่
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    toastHideTimer = setTimeout(() => t.classList.add('hidden'), 200);
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
  const box = $('room-code-box');
  const code = $('room-code').textContent.trim();
  if (!code) return;
  const ok = await copyText(code);
  if (ok) {
    // feedback: ไอคอน copy → เช็คเขียว ชั่วคราว
    box.classList.add('copied');
    const ico = box.querySelector('.room-copy-ico');
    if (ico) ico.outerHTML = icon('check', 'room-copy-ico');
    refreshIcons();
    clearTimeout(box._copiedTimer);
    box._copiedTimer = setTimeout(() => {
      box.classList.remove('copied');
      const cur = box.querySelector('.room-copy-ico');
      if (cur) cur.outerHTML = icon('copy', 'room-copy-ico');
      refreshIcons();
    }, 1400);
  }
  showToast(ok ? `คัดลอกรหัสห้องแล้ว (${code})` : `คัดลอกไม่สำเร็จ — ${code}`, { top: true });
};

// แปลงไอคอน static ครั้งแรก (ปุ่มกติกา/ออกจากห้อง, modal กติกา/ผลรอบ, ปุ่มเรียงไพ่)
refreshIcons();
