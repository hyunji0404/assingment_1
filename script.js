/* ═══════════════════════════════════════════════════
   아기 수유 기록 앱 — script.js

   구현된 기능:
   1. localStorage  — 새로고침해도 모든 데이터 유지
   2. 사진 업로드   — 앨범에 실제 기기 사진 추가 (Base64)
   3. 아기 정보 수정 — 이름·생년월일·체중 직접 편집
   4. 브라우저 알림  — 수유 시간 초과 시 Push Notification
   ═══════════════════════════════════════════════════ */

'use strict';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   1. 초기 데이터 & localStorage 로드
━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * localStorage에서 데이터를 불러오거나, 없으면 기본값 사용
 * 저장 키: 'babyInfo', 'feedLogs', 'photos', 'feedIntervalHours'
 */

const DEFAULT_BABY = {
  name: '하준',
  birth: '2023-12-07',   // YYYY-MM-DD 형식
  weight: 5.8            // kg
};

const DEFAULT_LOGS = [
  { id: 1, time: '08:10', ampm: '오전', ml: 160, ts: Date.now() - 1 * 3600 * 1000 },
  { id: 2, time: '05:00', ampm: '오전', ml: 150, ts: Date.now() - 4 * 3600 * 1000 },
  { id: 3, time: '01:40', ampm: '오전', ml: 155, ts: Date.now() - 7 * 3600 * 1000 },
  { id: 4, time: '22:30', ampm: '어제 오후', ml: 165, ts: Date.now() - 11 * 3600 * 1000 },
  { id: 5, time: '19:10', ampm: '어제 오후', ml: 160, ts: Date.now() - 14 * 3600 * 1000 },
];

const DEFAULT_PHOTOS = [
  { id: 1, src: null, emoji: '👶', bg: '#FDF0EA', day: 'D+98', date: '2024.03.15', caption: '첫 웃음 😊' },
  { id: 2, src: null, emoji: '🛁', bg: '#E8F2EF', day: 'D+92', date: '2024.03.09', caption: '목욕 시간' },
  { id: 3, src: null, emoji: '😴', bg: '#EEF0FA', day: 'D+87', date: '2024.03.04', caption: '낮잠 자는 중' },
  { id: 4, src: null, emoji: '🍼', bg: '#FDF5E8', day: 'D+80', date: '2024.02.25', caption: '수유 중' },
];

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* quota 초과 등 */ }
}

/* 앱 상태 */
let babyInfo         = load('babyInfo', DEFAULT_BABY);
let feedLogs         = load('feedLogs', DEFAULT_LOGS);
let photos           = load('photos', DEFAULT_PHOTOS);
let feedIntervalHours = load('feedIntervalHours', 3);
let nextId           = (feedLogs.length ? Math.max(...feedLogs.map(f => f.id)) : 0) + 1;
let nextPhotoId      = (photos.length  ? Math.max(...photos.map(p => p.id))  : 0) + 1;

/* 알림 관련 */
let notifPermission  = Notification.permission; // 'default' | 'granted' | 'denied'
let notifFired       = false;   // 한 주기에 한 번만 알림 발송
let lightboxSrc      = null;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   2. 탭 전환
━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function switchTab(tab) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById('page-' + tab);
  if (pg) pg.classList.add('active');
  const nv = document.getElementById('nav-' + tab);
  if (nv) nv.classList.add('active');
  document.querySelector('.scroll-area').scrollTop = 0;
  if (tab === 'home')    renderHome();
  if (tab === 'history') renderHistory();
  if (tab === 'album')   renderAlbum();
  if (tab === 'settings') renderSettings();
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   3. 수유 간격 슬라이더
━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function onIntervalChange(val) {
  feedIntervalHours = parseFloat(val);
  save('feedIntervalHours', feedIntervalHours);
  document.getElementById('interval-display').textContent = feedIntervalHours + 'h';
  document.getElementById('home-interval').textContent    = feedIntervalHours;
  document.getElementById('setting-interval-val').textContent = feedIntervalHours + '시간';
  notifFired = false; // 간격 변경 시 알림 재허용
  updateNextFeedDisplay();
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   4. 다음 수유 타이머 + 브라우저 알림
━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function updateNextFeedDisplay() {
  const timerEl = document.getElementById('next-feed-timer');
  const subEl   = document.getElementById('next-sub');
  const labelEl = document.getElementById('next-label');
  if (!timerEl) return;

  if (!feedLogs.length) {
    timerEl.textContent = '--:--:--';
    subEl.textContent   = '수유 기록이 없어요. 첫 기록을 추가해주세요.';
    timerEl.classList.remove('urgent');
    return;
  }

  const lastTs  = feedLogs[0].ts;
  const nextTs  = lastTs + feedIntervalHours * 3600 * 1000;
  const diffMs  = nextTs - Date.now();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec <= 0) {
    /* ── 수유 시간 초과 ── */
    const overSec = Math.abs(diffSec);
    const oh = String(Math.floor(overSec / 3600)).padStart(2, '0');
    const om = String(Math.floor((overSec % 3600) / 60)).padStart(2, '0');
    const os = String(overSec % 60).padStart(2, '0');
    labelEl.textContent = '⚠️ 수유 시간 초과';
    timerEl.textContent = `${oh}:${om}:${os}`;
    timerEl.classList.add('urgent');
    subEl.textContent   = `마지막 수유: ${feedLogs[0].ampm} ${feedLogs[0].time} · ${feedLogs[0].ml}ml`;

    /* ── 브라우저 알림 발송 (최초 1회) ── */
    if (!notifFired && notifPermission === 'granted') {
      notifFired = true;
      new Notification('🍼 수유 시간이 됐어요!', {
        body: `${babyInfo.name}이 ${feedIntervalHours}시간이 지났어요. 지금 수유 기록을 남겨주세요.`,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text y="52" font-size="52">🍼</text></svg>'
      });
    }
  } else {
    /* ── 카운트다운 ── */
    const hh = String(Math.floor(diffSec / 3600)).padStart(2, '0');
    const mm = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
    const ss = String(diffSec % 60).padStart(2, '0');
    labelEl.textContent = '▶ 다음 수유까지';
    timerEl.textContent = `${hh}:${mm}:${ss}`;
    timerEl.classList.toggle('urgent', diffSec < 1800);
    const nextDate = new Date(nextTs);
    const nh   = nextDate.getHours();
    const nm   = String(nextDate.getMinutes()).padStart(2, '0');
    const ap   = nh < 12 ? '오전' : '오후';
    const nh12 = nh % 12 || 12;
    subEl.textContent = `${ap} ${nh12}:${nm} 예정 · 마지막 ${feedLogs[0].ml}ml`;
    notifFired = false; // 새 수유 기록 후 타이머가 양수가 되면 재허용
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   5. 브라우저 알림 권한 요청
━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function requestNotifPermission() {
  if (!('Notification' in window)) {
    showToast('이 브라우저는 알림을 지원하지 않아요');
    return;
  }
  Notification.requestPermission().then(result => {
    notifPermission = result;
    if (result === 'granted') {
      showToast('✅ 알림이 허용되었어요!');
      renderHome(); // 배너 숨기기
    } else {
      showToast('알림이 거부되었어요. 브라우저 설정에서 허용해주세요.');
    }
  });
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   6. 분유량 계산 공식
━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*
  기본 공식 (소아과학회·분유 제조사 가이드라인):
    1일 총 수유량 = 체중(kg) × 150ml
    1회 수유량   = 1일 총 수유량 ÷ 1일 횟수

  월령별 1일 수유 횟수:
    0~1개월 → 8회 (3시간 간격)
    2개월   → 7회
    3~4개월 → 6회
    5개월~  → 5회

  코드: weight × 1000 / 6 / 횟수
    (체중(g)의 약 1/6을 하루 총량으로, 횟수로 나눠 1회량 산출)
  최소 60ml, 최대 240ml 클램핑
*/
function calcFormula() {
  const month  = parseFloat(document.getElementById('inp-month').value)  || 0;
  const weight = parseFloat(document.getElementById('inp-weight').value) || 0;
  let rec;
  if      (month <= 1) rec = Math.round(weight * 1000 / 6 / 8);
  else if (month <= 2) rec = Math.round(weight * 1000 / 6 / 7);
  else if (month <= 4) rec = Math.round(weight * 1000 / 6 / 6);
  else                 rec = Math.round(weight * 1000 / 6 / 5);
  rec = Math.min(Math.max(rec, 60), 240);
  const min = Math.max(rec - 20, 60);
  const max = Math.min(rec + 20, 240);
  document.getElementById('result-ml').textContent    = `${rec}ml`;
  document.getElementById('result-range').textContent = `범위: ${min} ~ ${max}ml`;
  document.getElementById('inp-actual').placeholder   = String(rec);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   7. 기록 저장
━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function saveFeed() {
  const ml = parseInt(document.getElementById('inp-actual').value);
  if (!ml || ml < 1) { showToast('실제 먹은 양을 입력해주세요'); return; }
  const now  = new Date();
  const h    = now.getHours();
  const m    = now.getMinutes();
  const ampm = h < 12 ? '오전' : '오후';
  const hh   = String(h % 12 || 12).padStart(2, '0');
  const mm   = String(m).padStart(2, '0');
  feedLogs.unshift({ id: nextId++, time: `${hh}:${mm}`, ampm, ml, ts: now.getTime() });
  save('feedLogs', feedLogs);
  notifFired = false;
  document.getElementById('inp-actual').value = '';
  showToast(`✅ ${ml}ml 수유 기록이 저장됐어요!`);
  setTimeout(() => switchTab('home'), 700);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   8. 홈 렌더링
━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function renderHome() {
  /* 아기 이름 업데이트 */
  const nameEl = document.getElementById('home-baby-name');
  if (nameEl) nameEl.textContent = babyInfo.name + '이의 수유 기록';

  /* 통계 */
  const total = feedLogs.reduce((s, f) => s + f.ml, 0);
  const avg   = feedLogs.length ? Math.round(total / feedLogs.length) : 0;
  document.getElementById('home-count').textContent    = feedLogs.length;
  document.getElementById('home-total').textContent    = total;
  document.getElementById('home-avg').textContent      = avg;
  document.getElementById('home-interval').textContent = feedIntervalHours;

  /* 슬라이더 값 동기화 */
  const slider = document.getElementById('interval-slider');
  if (slider) slider.value = feedIntervalHours;
  document.getElementById('interval-display').textContent = feedIntervalHours + 'h';

  /* 알림 배너 */
  const banner = document.getElementById('notif-banner');
  if (banner) {
    banner.style.display = (notifPermission === 'default') ? 'flex' : 'none';
  }

  updateNextFeedDisplay();

  /* 최근 기록 3개 */
  const list   = document.getElementById('home-feed-list');
  const recent = feedLogs.slice(0, 3);
  if (!recent.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🍼</div><div class="empty-text">아직 기록이 없어요</div></div>`;
    return;
  }
  list.innerHTML = recent.map(f => `
    <div class="feed-item">
      <div class="feed-dot">🍼</div>
      <div class="feed-info">
        <div class="feed-time">${f.ampm} ${f.time}</div>
        <div class="feed-detail">분유 · ${calcAgeLabel()}</div>
      </div>
      <div class="feed-amount">${f.ml}ml</div>
    </div>
  `).join('');
}

/** 생년월일로부터 현재 월령 문자열 계산 */
function calcAgeLabel() {
  if (!babyInfo.birth) return '신생아';
  const birth = new Date(babyInfo.birth);
  const now   = new Date();
  const diff  = now - birth;
  const months = Math.floor(diff / (1000 * 60 * 60 * 24 * 30.44));
  return months + '개월';
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   9. 히스토리 렌더링
━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function renderHistory() {
  const list = document.getElementById('history-list');
  if (!feedLogs.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">아직 기록이 없어요<br>+ 버튼을 눌러 기록해보세요</div></div>`;
    return;
  }
  const maxMl = Math.max(...feedLogs.map(f => f.ml));
  list.innerHTML = feedLogs.map(f => `
    <div class="history-item" id="item-${f.id}">
      <div class="history-time">${f.ampm}<br>${f.time}</div>
      <div class="history-bar-wrap">
        <div class="history-bar-bg">
          <div class="history-bar" style="width:${Math.round(f.ml / maxMl * 100)}%"></div>
        </div>
      </div>
      <div class="history-ml">${f.ml}ml</div>
      <div class="item-actions">
        <button class="btn-edit" onclick="openEdit(${f.id})" title="수정">✏️</button>
        <button class="btn-del"  onclick="openDelete(${f.id})" title="삭제">🗑️</button>
      </div>
    </div>
    <div class="edit-form" id="edit-${f.id}">
      <div class="edit-form-row">
        <div class="input-wrap">
          <input type="number" id="edit-inp-${f.id}" value="${f.ml}" min="1" max="300">
          <span class="input-unit">ml</span>
        </div>
        <button class="btn-confirm" onclick="confirmEdit(${f.id})">저장</button>
        <button class="btn-cancel-edit" onclick="closeAllPanels()">취소</button>
      </div>
    </div>
    <div class="delete-confirm" id="del-${f.id}">
      <div class="delete-confirm-text">이 기록을 삭제할까요?</div>
      <div class="delete-confirm-row">
        <button class="btn-delete-confirm" onclick="confirmDelete(${f.id})">삭제</button>
        <button class="btn-delete-cancel"  onclick="closeAllPanels()">취소</button>
      </div>
    </div>
  `).join('');
}

function openEdit(id) {
  closeAllPanels();
  document.getElementById('edit-' + id).classList.add('open');
  document.getElementById('item-' + id).classList.add('editing');
  document.getElementById('edit-inp-' + id).focus();
}
function openDelete(id) {
  closeAllPanels();
  document.getElementById('del-'  + id).classList.add('open');
  document.getElementById('item-' + id).classList.add('editing');
}
function closeAllPanels() {
  document.querySelectorAll('.edit-form.open, .delete-confirm.open')
    .forEach(el => el.classList.remove('open'));
  document.querySelectorAll('.history-item.editing')
    .forEach(el => el.classList.remove('editing'));
}
function confirmEdit(id) {
  const newMl = parseInt(document.getElementById('edit-inp-' + id).value);
  if (!newMl || newMl < 1) { showToast('올바른 수유량을 입력해주세요'); return; }
  const idx = feedLogs.findIndex(f => f.id === id);
  if (idx !== -1) feedLogs[idx].ml = newMl;
  save('feedLogs', feedLogs);
  closeAllPanels();
  renderHistory();
  renderHome();
  showToast('✏️ 기록이 수정되었어요!');
}
function confirmDelete(id) {
  feedLogs = feedLogs.filter(f => f.id !== id);
  save('feedLogs', feedLogs);
  closeAllPanels();
  renderHistory();
  renderHome();
  showToast('🗑️ 기록이 삭제되었어요');
}
function resetData() {
  if (!confirm('모든 수유 기록을 삭제할까요?')) return;
  feedLogs = [];
  save('feedLogs', feedLogs);
  renderHome();
  renderHistory();
  showToast('데이터가 초기화되었습니다');
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   10. 앨범 — 사진 업로드 (실제 구현)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/**
 * 파일 input을 통해 이미지 선택 → FileReader로 Base64 변환
 * → photos 배열에 추가 → localStorage 저장
 *
 * ※ Base64 이미지는 용량이 크므로 localStorage 할당량(5MB)
 *   초과 시 오래된 사진을 자동 제거하는 로직 포함
 */
function triggerPhotoUpload() {
  const input = document.getElementById('photo-file-input');
  if (input) input.click();
}

function onPhotoFileSelected(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;

  let processed = 0;
  files.forEach(file => {
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const src    = e.target.result; // Base64 data URL
      const now    = new Date();
      const birth  = babyInfo.birth ? new Date(babyInfo.birth) : null;
      const dayNum = birth ? Math.floor((now - birth) / 86400000) : '?';
      const dateStr = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;

      const newPhoto = {
        id: nextPhotoId++,
        src,           // Base64 실제 이미지
        emoji: null,   // 이미지가 있으면 emoji 불필요
        bg: '#F0EDE8',
        day: `D+${dayNum}`,
        date: dateStr,
        caption: file.name.replace(/\.[^/.]+$/, '') // 파일명을 캡션으로
      };

      photos.unshift(newPhoto);

      /* localStorage 용량 초과 방지 — 저장 실패 시 가장 오래된 사진 제거 */
      let saved = false;
      while (!saved && photos.length > 0) {
        try {
          save('photos', photos);
          saved = true;
        } catch (e) {
          photos.pop(); // 오래된 것부터 제거
        }
      }

      processed++;
      if (processed === files.length) {
        renderAlbum();
        showToast(`📷 사진 ${processed}장이 추가됐어요!`);
      }
    };
    reader.readAsDataURL(file);
  });

  /* input 초기화 (같은 파일 재선택 가능하도록) */
  event.target.value = '';
}

function renderAlbum() {
  const grid = document.getElementById('album-grid');
  if (!photos.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:span 2"><div class="empty-icon">📷</div><div class="empty-text">사진이 없어요<br>위 버튼으로 추가해보세요</div></div>`;
    return;
  }
  grid.innerHTML = photos.map(p => `
    <div class="album-item" id="photo-${p.id}">
      <div class="album-thumb" onclick="openLightbox('${p.id}')">
        ${p.src
          ? `<img src="${p.src}" alt="${p.caption}" loading="lazy">`
          : `<span style="font-size:48px">${p.emoji}</span>`
        }
        <div class="album-thumb-label">${p.day}</div>
      </div>
      <button class="album-del-btn" onclick="openPhotoDel(${p.id})" title="삭제">✕</button>
      <div class="album-del-confirm" id="pdel-${p.id}">
        <p>이 사진을<br>삭제할까요?</p>
        <div class="album-del-confirm-row">
          <button class="adc-yes" onclick="confirmPhotoDel(${p.id})">삭제</button>
          <button class="adc-no"  onclick="closePhotoDel(${p.id})">취소</button>
        </div>
      </div>
      <div class="album-meta">
        <div class="album-date">${p.date}</div>
        <div class="album-caption">${p.caption}</div>
      </div>
    </div>
  `).join('');
}

function openPhotoDel(id) {
  document.querySelectorAll('.album-del-confirm.open').forEach(el => el.classList.remove('open'));
  document.getElementById('pdel-' + id).classList.add('open');
}
function closePhotoDel(id) {
  document.getElementById('pdel-' + id).classList.remove('open');
}
function confirmPhotoDel(id) {
  photos = photos.filter(p => p.id !== id);
  save('photos', photos);
  renderAlbum();
  showToast('🗑️ 사진이 삭제되었어요');
}

/* 라이트박스 — 실제 사진 클릭 시 원본 크기 미리보기 */
function openLightbox(id) {
  const photo = photos.find(p => p.id == id);
  if (!photo || !photo.src) return; // emoji 썸네일은 라이트박스 미사용
  const lb  = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  img.src   = photo.src;
  lb.classList.add('open');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   11. 아기 정보 수정 모달
━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function openBabyInfoModal() {
  document.getElementById('modal-name').value   = babyInfo.name;
  document.getElementById('modal-birth').value  = babyInfo.birth;
  document.getElementById('modal-weight').value = babyInfo.weight;
  document.getElementById('baby-info-modal').classList.add('open');
}
function closeBabyInfoModal() {
  document.getElementById('baby-info-modal').classList.remove('open');
}
function saveBabyInfo() {
  const name   = document.getElementById('modal-name').value.trim();
  const birth  = document.getElementById('modal-birth').value;
  const weight = parseFloat(document.getElementById('modal-weight').value);
  if (!name) { showToast('이름을 입력해주세요'); return; }
  if (!birth) { showToast('생년월일을 입력해주세요'); return; }
  if (!weight || weight < 1 || weight > 30) { showToast('올바른 체중을 입력해주세요'); return; }

  babyInfo = { name, birth, weight };
  save('babyInfo', babyInfo);

  /* 기록 페이지 체중 자동 업데이트 */
  const weightInput = document.getElementById('inp-weight');
  if (weightInput) weightInput.value = weight;
  calcFormula();

  closeBabyInfoModal();
  renderSettings();
  renderHome();
  showToast('✅ 아기 정보가 저장됐어요!');
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   12. 설정 페이지 렌더링
━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function renderSettings() {
  /* 아기 정보 표시 */
  const el_name   = document.getElementById('setting-baby-name');
  const el_birth  = document.getElementById('setting-baby-birth');
  const el_weight = document.getElementById('setting-baby-weight');
  if (el_name)   el_name.textContent   = babyInfo.name;
  if (el_birth)  el_birth.textContent  = babyInfo.birth.replace(/-/g, '.') || '-';
  if (el_weight) el_weight.textContent = babyInfo.weight + ' kg';

  /* 수유 간격 표시 */
  const el_interval = document.getElementById('setting-interval-val');
  if (el_interval) el_interval.textContent = feedIntervalHours + '시간';

  /* 알림 토글 상태 */
  const toggle = document.getElementById('notif-toggle');
  if (toggle) {
    if (notifPermission === 'granted') {
      toggle.classList.add('on');
    } else {
      toggle.classList.remove('on');
    }
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   13. 시계 & 토스트
━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function updateClock() {
  const el = document.getElementById('current-time');
  if (!el) return;
  const now = new Date();
  el.textContent = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   14. 앱 초기화
━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
document.addEventListener('DOMContentLoaded', () => {
  /* 기록 페이지 체중 초기값 → babyInfo에서 */
  const weightInput = document.getElementById('inp-weight');
  if (weightInput) weightInput.value = babyInfo.weight;

  calcFormula();
  renderHome();
  renderHistory();
  renderAlbum();
  renderSettings();
  updateClock();

  setInterval(updateNextFeedDisplay, 1000);
  setInterval(updateClock, 30000);

  /* 라이트박스 바깥 클릭 닫기 */
  document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') closeLightbox();
  });

  /* 모달 바깥 클릭 닫기 */
  document.getElementById('baby-info-modal').addEventListener('click', (e) => {
    if (e.target.id === 'baby-info-modal') closeBabyInfoModal();
  });
});