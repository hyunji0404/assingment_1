'use strict';

/* ─── 기본 데이터 ─── */
const DEFAULT_BABY = { name: '하온', birth: '2026-03-07', weight: 5.8, photo: null };
const DEFAULT_LOGS = [
  { id: 1, ml: 160, ts: Date.now() - 1*3600000 },
  { id: 2, ml: 150, ts: Date.now() - 4*3600000 },
  { id: 3, ml: 155, ts: Date.now() - 7*3600000 },
  { id: 4, ml: 165, ts: Date.now() - 11*3600000 },
  { id: 5, ml: 160, ts: Date.now() - 14*3600000 },
];
const DEFAULT_PHOTOS = [
  { id: 1, src: null, day: 'D+84', date: '2026.05.30', caption: '첫 웃음' },
  { id: 2, src: null, day: 'D+78', date: '2026.05.24', caption: '목욕 시간' },
  { id: 3, src: null, day: 'D+73', date: '2026.05.19', caption: '낮잠 자는 중' },
  { id: 4, src: null, day: 'D+66', date: '2026.05.12', caption: '수유 중' },
];

function load(k, fb) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) { console.error(e); } }

let babyInfo = load('babyInfo', DEFAULT_BABY);
let feedLogs = load('feedLogs', DEFAULT_LOGS);
let photos   = load('photos', DEFAULT_PHOTOS);
let memos    = load('memos', {});
let feedIntervalHours = load('feedIntervalHours', 3);
let nextId = (feedLogs.length ? Math.max(...feedLogs.map(f=>f.id)) : 0) + 1;
let nextPhotoId = (photos.length ? Math.max(...photos.map(p=>p.id)) : 0) + 1;
let notifPermission = Notification.permission;
let notifEnabled = load('notifEnabled', false); // 사용자가 명시적으로 활성화했는지
let notifFired = false;

// 캘린더 상태
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let selectedCalDate = null;
let activeCalTab = 'feeds';

// 통합 모달 interval 임시값
let modalIntervalValue = feedIntervalHours;

/* ─── 탭 전환 ─── */
function switchTab(tab) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById('page-' + tab);
  const nav  = document.getElementById('nav-' + tab);
  if (page) page.classList.add('active');
  if (nav)  nav.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (tab === 'home')     renderHome();
  if (tab === 'history')  renderHistory();
  if (tab === 'album')    renderAlbum();
  if (tab === 'settings') renderSettings();
  if (tab === 'calendar') renderCalendar();
}
function openSettings() { switchTab('settings'); }

/* ─── 시간 포맷 헬퍼 ─── */
function fmtTs(ts) {
  const d = new Date(ts);
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h < 12 ? '오전' : '오후';
  const hh = String(h % 12 || 12).padStart(2,'0');
  const mm = String(m).padStart(2,'0');
  return { ampm, time: `${hh}:${mm}`, h, m };
}
function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function dateStr(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}
function calcAgeLabel() {
  if (!babyInfo.birth) return '신생아';
  const months = Math.floor((Date.now() - new Date(babyInfo.birth)) / (1000*60*60*24*30.44));
  return months + '개월';
}
function calcDayLabel() {
  if (!babyInfo.birth) return 'D+0';
  const days = Math.floor((Date.now() - new Date(babyInfo.birth)) / 86400000);
  return 'D+' + days;
}
function calcDayLabelAt(dateStr) {
  if (!babyInfo.birth) return 'D+?';
  // dateStr: 'YYYY.MM.DD'
  const parts = dateStr.split('.');
  if (parts.length !== 3) return 'D+?';
  const photoDate = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
  const birthDate = new Date(babyInfo.birth);
  const days = Math.floor((photoDate - birthDate) / 86400000);
  return days >= 0 ? 'D+' + days : 'D' + days;
}

/* ─── 프로필 사진 ─── */
function triggerBabyPhoto() { document.getElementById('baby-photo-input').click(); }
function onBabyPhotoChange(e) {
  const file = e.target.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = ev => {
    babyInfo.photo = ev.target.result;
    save('babyInfo', babyInfo);
    renderBabyPhoto();
    renderModalAvatarPreview();
    showToast('사진이 업데이트됐어요');
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}
function renderBabyPhoto() {
  const img = document.getElementById('baby-photo');
  const ph  = document.getElementById('avatar-placeholder');
  if (babyInfo.photo) { img.src = babyInfo.photo; img.style.display='block'; if(ph) ph.style.display='none'; }
  else { img.style.display='none'; if(ph) ph.style.display='flex'; }
}
function renderModalAvatarPreview() {
  const el = document.getElementById('modal-avatar-preview');
  if (!el) return;
  el.innerHTML = babyInfo.photo
    ? `<img src="${babyInfo.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">`
    : `<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/></svg>`;
}

/* ─── 수유 간격 슬라이더 ─── */
function onIntervalChange(val) {
  feedIntervalHours = parseFloat(val);
  save('feedIntervalHours', feedIntervalHours);
  document.getElementById('interval-display').textContent = feedIntervalHours + '시간';
  document.getElementById('home-interval').textContent = feedIntervalHours;
  const slider = document.getElementById('interval-slider');
  const fill   = document.getElementById('slider-fill');
  if (slider && fill) fill.style.width = ((val - slider.min) / (slider.max - slider.min) * 100) + '%';
  notifFired = false;
  updateNextFeedDisplay();
}

/* ─── 다음 수유 타이머 ─── */
function updateNextFeedDisplay() {
  const timerEl = document.getElementById('next-feed-timer');
  const subEl   = document.getElementById('next-sub');
  const labelEl = document.getElementById('next-label');
  if (!timerEl) return;
  if (!feedLogs.length) {
    timerEl.textContent = '--:--:--'; subEl.textContent = '수유 기록이 없어요.'; timerEl.classList.remove('urgent'); return;
  }
  const lastTs = feedLogs[0].ts;
  const nextTs = lastTs + feedIntervalHours * 3600000;
  const diffSec = Math.floor((nextTs - Date.now()) / 1000);
  if (diffSec <= 0) {
    const s = Math.abs(diffSec);
    timerEl.textContent = `${pad(Math.floor(s/3600))}:${pad(Math.floor(s%3600/60))}:${pad(s%60)}`;
    labelEl.textContent = '수유 시간 초과'; timerEl.classList.add('urgent');
    const f = feedLogs[0]; const fmt = fmtTs(f.ts);
    subEl.textContent = `마지막: ${fmt.ampm} ${fmt.time} · ${f.ml}ml`;
    if (!notifFired && notifEnabled) {
      notifFired = true;
      // 화면 알림 오버레이 표시
      showFeedAlert(babyInfo.name, feedIntervalHours);
      // 브라우저 알림 (허용된 경우)
      if (notifPermission === 'granted') {
        new Notification('수유시간입니다', { body: `${babyInfo.name}이(가) ${feedIntervalHours}시간이 지났어요.` });
      }
    }
  } else {
    timerEl.textContent = `${pad(Math.floor(diffSec/3600))}:${pad(Math.floor(diffSec%3600/60))}:${pad(diffSec%60)}`;
    labelEl.textContent = '다음 수유까지'; timerEl.classList.toggle('urgent', diffSec < 1800);
    const nd = new Date(nextTs); const nh = nd.getHours();
    subEl.textContent = `${nh<12?'오전':'오후'} ${String(nh%12||12).padStart(2,'0')}:${pad(nd.getMinutes())} 예정 · 마지막 ${feedLogs[0].ml}ml`;
    notifFired = false;
  }
}
function pad(n) { return String(n).padStart(2,'0'); }

/* ─── 수유 알림 화면 오버레이 ─── */
function showFeedAlert(name, hours) {
  const overlay = document.getElementById('feed-alert-overlay');
  const sub = document.getElementById('feed-alert-sub');
  if (sub) sub.textContent = `${name}이(가) ${hours}시간이 지났어요`;
  if (overlay) overlay.classList.add('show');
}
function closeFeedAlert() {
  const overlay = document.getElementById('feed-alert-overlay');
  if (overlay) overlay.classList.remove('show');
}

/* ─── 알림 토글 (허용/취소) ─── */
function toggleNotif() {
  if (!('Notification' in window)) {
    showToast('이 브라우저는 알림을 지원하지 않아요');
    return;
  }
  if (notifEnabled) {
    // 끄기
    notifEnabled = false;
    save('notifEnabled', false);
    notifFired = false;
    renderSettings();
    showToast('알림이 꺼졌어요');
  } else {
    // 켜기 — 권한 필요
    if (notifPermission === 'denied') {
      showToast('브라우저 설정에서 알림을 허용해주세요');
      return;
    }
    if (notifPermission === 'granted') {
      notifEnabled = true;
      save('notifEnabled', true);
      renderSettings();
      showToast('알림이 켜졌어요');
    } else {
      Notification.requestPermission().then(r => {
        notifPermission = r;
        if (r === 'granted') {
          notifEnabled = true;
          save('notifEnabled', true);
          showToast('알림이 허용됐어요');
        } else {
          showToast('알림이 거부됐어요. 브라우저 설정에서 허용해주세요.');
        }
        renderSettings();
      });
    }
  }
}

// 홈 알림 배너용 (기존 호환)
function requestNotifPermission() {
  if (!('Notification' in window)) { showToast('이 브라우저는 알림을 지원하지 않아요'); return; }
  if (notifPermission === 'granted') {
    notifEnabled = true;
    save('notifEnabled', true);
    renderHome(); renderSettings();
    showToast('알림이 활성화됐어요');
    return;
  }
  Notification.requestPermission().then(r => {
    notifPermission = r;
    if (r === 'granted') { notifEnabled = true; save('notifEnabled', true); }
    showToast(r==='granted' ? '알림이 허용됐어요' : '알림이 거부됐어요. 브라우저 설정에서 허용해주세요.');
    renderHome(); renderSettings();
  });
}

/* ─── 분유량 계산 ─── */
function calcFormula() {
  const month = parseFloat(document.getElementById('inp-month').value)||0;
  const weight = parseFloat(document.getElementById('inp-weight').value)||0;
  let rec;
  if (month<=1) rec=Math.round(weight*1000/6/8);
  else if (month<=2) rec=Math.round(weight*1000/6/7);
  else if (month<=4) rec=Math.round(weight*1000/6/6);
  else rec=Math.round(weight*1000/6/5);
  rec = Math.min(Math.max(rec,60),240);
  document.getElementById('result-ml').textContent = `${rec}ml`;
  document.getElementById('result-range').textContent = `범위: ${Math.max(rec-20,60)} ~ ${Math.min(rec+20,240)}ml`;
  document.getElementById('inp-actual').placeholder = String(rec);
}

/* ─── 기록 저장 ─── */
function saveFeed() {
  const ml = parseInt(document.getElementById('inp-actual').value);
  if (!ml || ml<1) { showToast('실제 먹은 양을 입력해주세요'); return; }
  feedLogs.unshift({ id: nextId++, ml, ts: Date.now() });
  save('feedLogs', feedLogs);
  notifFired = false;
  document.getElementById('inp-actual').value = '';
  showToast(`${ml}ml 저장됐어요`);
  setTimeout(() => switchTab('home'), 700);
}

/* ─── 홈 렌더링 ─── */
function renderHome() {
  document.getElementById('home-baby-name').textContent = babyInfo.name + '이의 수유 기록';
  document.getElementById('baby-age').textContent = calcAgeLabel();
  document.getElementById('baby-weight').textContent = babyInfo.weight + 'kg';
  renderBabyPhoto();

  const total = feedLogs.reduce((s,f)=>s+f.ml,0);
  const avg = feedLogs.length ? Math.round(total/feedLogs.length) : 0;
  document.getElementById('home-count').textContent = feedLogs.length;
  document.getElementById('home-total').textContent = total;
  document.getElementById('home-avg').textContent = avg;
  document.getElementById('home-interval').textContent = feedIntervalHours;

  const slider = document.getElementById('interval-slider');
  if (slider) {
    slider.value = feedIntervalHours;
    document.getElementById('slider-fill').style.width = ((feedIntervalHours-slider.min)/(slider.max-slider.min)*100)+'%';
  }
  document.getElementById('interval-display').textContent = feedIntervalHours + '시간';

  const banner = document.getElementById('notif-banner');
  if (banner) banner.style.display = (notifPermission==='default' && !notifEnabled) ? 'flex' : 'none';

  updateNextFeedDisplay();

  const list = document.getElementById('home-feed-list');
  const recent = feedLogs.slice(0,3);
  if (!recent.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon"></div><div class="empty-text">아직 기록이 없어요</div></div>`; return;
  }
  list.innerHTML = recent.map(f => {
    const fmt = fmtTs(f.ts);
    return `<div class="feed-item">
      <div class="feed-dot"></div>
      <div class="feed-info"><div class="feed-time">${fmt.ampm} ${fmt.time}</div><div class="feed-detail">분유 · ${calcAgeLabel()}</div></div>
      <div class="feed-amount">${f.ml}ml</div>
    </div>`;
  }).join('');
}

/* ─── 히스토리 렌더링 ─── */
function renderHistory() {
  const list = document.getElementById('history-list');
  if (!feedLogs.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon"></div><div class="empty-text">아직 기록이 없어요</div></div>`; return;
  }
  const maxMl = Math.max(...feedLogs.map(f=>f.ml));
  list.innerHTML = feedLogs.map(f => {
    const fmt = fmtTs(f.ts);
    const ds = dateStr(f.ts);
    return `<div class="history-blob-item" id="item-${f.id}">
      <div class="history-time-col">
        <div class="history-date-small">${ds}</div>
        <div class="history-time-big">${fmt.ampm}<br>${fmt.time}</div>
      </div>
      <div class="history-bar-wrap">
        <div class="history-bar-bg"><div class="history-bar" style="width:${Math.round(f.ml/maxMl*100)}%"></div></div>
      </div>
      <div class="history-ml-badge">${f.ml}<small>ml</small></div>
      <div class="history-actions">
        <button class="hist-btn-edit" onclick="openHistoryEditModal(${f.id})" title="수정">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>
          </svg>
        </button>
        <button class="hist-btn-del" onclick="confirmDeleteHistory(${f.id})" title="삭제">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/>
          </svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

function openHistoryEditModal(id) {
  const f = feedLogs.find(f => f.id === id);
  if (!f) return;
  document.getElementById('hedit-id').value = id;
  const d = new Date(f.ts);
  document.getElementById('hedit-date').value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  document.getElementById('hedit-time').value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  document.getElementById('hedit-ml').value = f.ml;
  document.getElementById('history-edit-modal').classList.add('open');
}
function closeHistoryEditModal() { document.getElementById('history-edit-modal').classList.remove('open'); }
function saveHistoryEdit() {
  const id = parseInt(document.getElementById('hedit-id').value);
  const dateVal = document.getElementById('hedit-date').value;
  const timeVal = document.getElementById('hedit-time').value;
  const ml = parseInt(document.getElementById('hedit-ml').value);
  if (!dateVal || !timeVal) { showToast('날짜와 시간을 입력해주세요'); return; }
  if (!ml || ml < 1) { showToast('올바른 수유량을 입력해주세요'); return; }
  const newTs = new Date(`${dateVal}T${timeVal}`).getTime();
  const idx = feedLogs.findIndex(f => f.id === id);
  if (idx !== -1) { feedLogs[idx].ts = newTs; feedLogs[idx].ml = ml; }
  feedLogs.sort((a,b) => b.ts - a.ts);
  save('feedLogs', feedLogs);
  closeHistoryEditModal();
  renderHistory();
  renderHome();
  showToast('기록이 수정됐어요');
}
function confirmDeleteHistory(id) {
  if (!confirm('이 기록을 삭제할까요?')) return;
  feedLogs = feedLogs.filter(f => f.id !== id);
  save('feedLogs', feedLogs);
  renderHistory();
  renderHome();
  showToast('기록이 삭제됐어요');
}
function resetData() {
  if (!confirm('모든 수유 기록을 삭제할까요?')) return;
  feedLogs = []; save('feedLogs', feedLogs);
  renderHome(); renderHistory();
  showToast('데이터가 초기화됐어요');
}

/* ─── 앨범 ─── */
function triggerPhotoUpload() { document.getElementById('photo-file-input').click(); }
function onPhotoFileSelected(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  let done = 0;
  files.forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const now = new Date();
      const nowDateStr = dateStr(now.getTime());
      const dayLabel = calcDayLabelAt(nowDateStr);
      const newPhoto = {
        id: nextPhotoId++,
        src: ev.target.result,
        day: dayLabel,
        date: nowDateStr,
        caption: file.name.replace(/\.[^/.]+$/,'')
      };
      photos.unshift(newPhoto);
      let saved = false;
      while (!saved && photos.length > 0) { try { save('photos', photos); saved=true; } catch { photos.pop(); } }
      done++;
      if (done === files.length) { renderAlbum(); showToast(`${done}장 추가됐어요`); }
    };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
}
function renderAlbum() {
  const grid = document.getElementById('album-grid');
  if (!photos.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:span 2"><div class="empty-icon"></div><div class="empty-text">사진이 없어요<br>위 버튼으로 추가해보세요</div></div>`; return;
  }
  grid.innerHTML = photos.map(p => `
    <div class="album-item" id="photo-${p.id}">
      <div class="album-thumb" onclick="openLightbox('${p.id}')">
        ${p.src
          ? `<img src="${p.src}" alt="${p.caption}" loading="lazy">`
          : `<div style="width:100%;height:100%;background:var(--bg2);display:flex;align-items:center;justify-content:center;"><svg width="36" height="36" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="var(--txt3)" stroke-width="1.5"/><circle cx="8.5" cy="8.5" r="1.5" fill="var(--txt3)"/><path d="M21 15l-5-5L5 21" stroke="var(--txt3)" stroke-width="1.5" stroke-linecap="round"/></svg></div>`
        }
        <div class="album-thumb-label">${p.day || calcDayLabelAt(p.date)}</div>
      </div>
      <button class="album-edit-btn" onclick="openPhotoEditModal(${p.id})" title="수정">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>
        </svg>
      </button>
      <button class="album-del-btn" onclick="confirmPhotoDel(${p.id})">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/>
        </svg>
      </button>
      <div class="album-meta">
        <div class="album-date">${p.date}</div>
        <div class="album-caption">${p.caption}</div>
      </div>
    </div>`).join('');
}
function confirmPhotoDel(id) {
  if (!confirm('이 사진을 삭제할까요?')) return;
  photos = photos.filter(p => p.id !== id);
  save('photos', photos);
  renderAlbum();
  showToast('사진이 삭제됐어요');
}
function openLightbox(id) {
  const p = photos.find(p => p.id == id);
  if (!p || !p.src) return;
  document.getElementById('lightbox-img').src = p.src;
  document.getElementById('lightbox').classList.add('open');
}
function closeLightbox() { document.getElementById('lightbox').classList.remove('open'); }

/* ─── 사진 정보 수정 모달 ─── */
function openPhotoEditModal(id) {
  const p = photos.find(p => p.id == id);
  if (!p) return;
  document.getElementById('pedit-id').value = id;
  // date: 'YYYY.MM.DD' → 'YYYY-MM-DD'
  const parts = p.date.split('.');
  let dateVal = '';
  if (parts.length === 3) {
    dateVal = `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
  }
  document.getElementById('pedit-date').value = dateVal;
  document.getElementById('pedit-caption').value = p.caption;
  document.getElementById('photo-edit-modal').classList.add('open');
}
function closePhotoEditModal() { document.getElementById('photo-edit-modal').classList.remove('open'); }
function savePhotoEdit() {
  const id = parseInt(document.getElementById('pedit-id').value);
  const dateVal = document.getElementById('pedit-date').value;
  const caption = document.getElementById('pedit-caption').value.trim();
  if (!dateVal) { showToast('날짜를 입력해주세요'); return; }
  const idx = photos.findIndex(p => p.id === id);
  if (idx !== -1) {
    // 'YYYY-MM-DD' → 'YYYY.MM.DD'
    const [y,m,d] = dateVal.split('-');
    const newDateStr = `${y}.${m}.${d}`;
    photos[idx].date = newDateStr;
    photos[idx].day = calcDayLabelAt(newDateStr);
    if (caption) photos[idx].caption = caption;
  }
  save('photos', photos);
  closePhotoEditModal();
  renderAlbum();
  showToast('사진 정보가 수정됐어요');
}

/* ─── 캘린더에서 사진 추가 ─── */
function triggerCalPhotoUpload() {
  if (!selectedCalDate) { showToast('날짜를 먼저 선택해주세요'); return; }
  document.getElementById('cal-photo-file-input').click();
}
function onCalPhotoFileSelected(e) {
  if (!selectedCalDate) return;
  const files = Array.from(e.target.files);
  if (!files.length) return;
  // 선택된 캘린더 날짜로 설정
  const calDateStr = `${calYear}.${pad(calMonth+1)}.${pad(selectedCalDate)}`;
  const dayLabel = calcDayLabelAt(calDateStr);
  let done = 0;
  files.forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const newPhoto = {
        id: nextPhotoId++,
        src: ev.target.result,
        day: dayLabel,
        date: calDateStr,
        caption: file.name.replace(/\.[^/.]+$/,'')
      };
      photos.unshift(newPhoto);
      let saved = false;
      while (!saved && photos.length > 0) { try { save('photos', photos); saved=true; } catch { photos.pop(); } }
      done++;
      if (done === files.length) {
        renderAlbum();
        renderCalDetail(selectedCalDate);
        renderCalendar();
        showToast(`${done}장 추가됐어요`);
      }
    };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
}

/* ─── 캘린더 ─── */
function renderCalendar() {
  const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  document.getElementById('cal-month-title').textContent = `${calYear}년 ${monthNames[calMonth]}`;

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();

  const dayMap = {};
  feedLogs.forEach(f => {
    const d = new Date(f.ts);
    if (d.getFullYear()===calYear && d.getMonth()===calMonth) {
      const day = d.getDate();
      if (!dayMap[day]) dayMap[day] = { count:0, total:0 };
      dayMap[day].count++; dayMap[day].total += f.ml;
    }
  });
  const photoDays = new Set();
  photos.forEach(p => {
    if (!p.src) return;
    const parts = p.date.split('.');
    if (parts.length===3 && parseInt(parts[0])===calYear && parseInt(parts[1])-1===calMonth) photoDays.add(parseInt(parts[2]));
  });
  const memoDays = new Set();
  Object.keys(memos).forEach(key => {
    if (!memos[key]) return;
    const [y,m,d2] = key.split('-').map(Number);
    if (y===calYear && m-1===calMonth) memoDays.add(d2);
  });

  const today = new Date();
  let html = '';
  for (let i=0; i<firstDay; i++) html += `<div class="cal-day empty"></div>`;
  for (let d=1; d<=daysInMonth; d++) {
    const isToday = today.getFullYear()===calYear && today.getMonth()===calMonth && today.getDate()===d;
    const isSel = selectedCalDate===d;
    const hasFeeds = !!dayMap[d];
    const hasPhoto = photoDays.has(d);
    const hasMemo = memoDays.has(d);
    const indicators = [
      hasFeeds ? `<span class="cal-dot cal-dot-feed"></span>` : '',
      hasPhoto ? `<span class="cal-dot cal-dot-photo"></span>` : '',
      hasMemo  ? `<span class="cal-dot cal-dot-memo"></span>` : '',
    ].join('');
    html += `<div class="cal-day${isToday?' today':''}${hasFeeds||hasPhoto||hasMemo?' has-data':''}${isSel?' selected':''}" onclick="selectCalDay(${d})">
      <div class="cal-day-num">${d}</div>
      ${hasFeeds ? `<div class="cal-day-count">${dayMap[d].count}</div>` : ''}
      <div class="cal-dots-row">${indicators}</div>
    </div>`;
  }
  document.getElementById('calendar-days').innerHTML = html;
  renderCalSummary(dayMap);
  if (selectedCalDate) renderCalDetail(selectedCalDate);
}

function selectCalDay(d) {
  selectedCalDate = d;
  renderCalendar();
  renderCalDetail(d);
}

function switchCalTab(tab) {
  activeCalTab = tab;
  ['feeds','photos','memo'].forEach(t => {
    document.getElementById('cal-tab-'+t).classList.toggle('active', t===tab);
    document.getElementById('cal-panel-'+t).style.display = t===tab ? 'block' : 'none';
  });
  if (tab === 'memo') loadMemoForDay(selectedCalDate);
}

function renderCalDetail(d) {
  const section = document.getElementById('cal-detail-section');
  const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  document.getElementById('cal-detail-title').textContent = `${calYear}년 ${monthNames[calMonth]} ${d}일`;
  section.style.display = 'block';

  const dayLogs = feedLogs.filter(f => {
    const dt = new Date(f.ts);
    return dt.getFullYear()===calYear && dt.getMonth()===calMonth && dt.getDate()===d;
  }).sort((a,b) => b.ts-a.ts);
  const list = document.getElementById('cal-detail-list');
  list.innerHTML = dayLogs.length
    ? dayLogs.map(f => { const fmt=fmtTs(f.ts); return `<div class="cal-detail-item"><div class="cal-detail-time">${fmt.ampm} ${fmt.time}</div><div class="cal-detail-ml">${f.ml}ml</div></div>`; }).join('')
    : `<div class="empty-state" style="padding:16px"><div class="empty-icon"></div><div class="empty-text">이 날의 기록이 없어요</div></div>`;

  const key = `${calYear}-${pad(calMonth+1)}-${pad(d)}`;
  const dayPhotos = photos.filter(p => {
    if (!p.src) return false;
    const parts = p.date.split('.');
    return parts.length===3 && parseInt(parts[0])===calYear && parseInt(parts[1])-1===calMonth && parseInt(parts[2])===d;
  });
  const photoGrid = document.getElementById('cal-photo-grid');
  photoGrid.innerHTML = dayPhotos.length
    ? dayPhotos.map(p => `<div class="cal-photo-item" onclick="openLightbox('${p.id}')">
        <img src="${p.src}" alt="${p.caption}">
        <div class="cal-photo-caption">${p.caption}</div>
      </div>`).join('')
    : `<div class="empty-state" style="padding:16px"><div class="empty-icon"></div><div class="empty-text">이 날의 사진이 없어요<br><small>위 버튼으로 사진을 추가하세요</small></div></div>`;

  if (activeCalTab === 'memo') loadMemoForDay(d);

  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  switchCalTab(activeCalTab);
}

function loadMemoForDay(d) {
  if (!d) return;
  const key = `${calYear}-${pad(calMonth+1)}-${pad(d)}`;
  document.getElementById('cal-memo-input').value = memos[key] || '';
}

function saveMemo() {
  if (!selectedCalDate) { showToast('날짜를 먼저 선택해주세요'); return; }
  const key = `${calYear}-${pad(calMonth+1)}-${pad(selectedCalDate)}`;
  const text = document.getElementById('cal-memo-input').value.trim();
  if (text) memos[key] = text; else delete memos[key];
  save('memos', memos);
  renderCalendar();
  showToast('메모가 저장됐어요');
}

function renderCalSummary(dayMap) {
  const logs = feedLogs.filter(f => { const d=new Date(f.ts); return d.getFullYear()===calYear && d.getMonth()===calMonth; });
  const total = logs.reduce((s,f)=>s+f.ml,0);
  document.getElementById('cal-total-feeds').textContent = logs.length;
  document.getElementById('cal-total-ml').textContent = total + 'ml';
  document.getElementById('cal-avg-ml').textContent = logs.length ? Math.round(total/logs.length)+'ml' : '0ml';
  document.getElementById('cal-active-days').textContent = Object.keys(dayMap).length + '일';
}
function changeMonth(delta) {
  calMonth += delta;
  if (calMonth<0) { calMonth=11; calYear--; }
  if (calMonth>11) { calMonth=0; calYear++; }
  selectedCalDate = null;
  activeCalTab = 'feeds';
  document.getElementById('cal-detail-section').style.display='none';
  renderCalendar();
}

/* ─── 설정 렌더 ─── */
function renderSettings() {
  document.getElementById('settings-display-name').textContent = babyInfo.name;
  document.getElementById('settings-display-birth').textContent = babyInfo.birth.replace(/-/g,'.');
  document.getElementById('settings-display-weight').textContent = babyInfo.weight + 'kg';
  const thumb = document.getElementById('settings-avatar-thumb');
  if (thumb) {
    thumb.innerHTML = babyInfo.photo
      ? `<img src="${babyInfo.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">`
      : `<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/></svg>`;
  }
  const toggle = document.getElementById('notif-toggle');
  const txt    = document.getElementById('notif-status-text');
  if (notifEnabled && notifPermission === 'granted') {
    toggle.classList.add('on');
    if (txt) txt.textContent = '알림이 활성화되어 있어요';
  } else if (notifPermission === 'denied') {
    toggle.classList.remove('on');
    if (txt) txt.textContent = '브라우저 설정에서 허용해주세요';
  } else {
    toggle.classList.remove('on');
    if (txt) txt.textContent = '수유 시간이 되면 알려드려요';
  }
}

/* ─── 통합 설정 모달 ─── */
function openUnifiedModal() {
  document.getElementById('modal-name').value = babyInfo.name;
  document.getElementById('modal-birth').value = babyInfo.birth;
  document.getElementById('modal-weight').value = babyInfo.weight;
  modalIntervalValue = feedIntervalHours;
  document.getElementById('modal-interval-display').textContent = modalIntervalValue.toFixed(1) + '시간';
  renderModalAvatarPreview();
  document.getElementById('unified-modal').classList.add('open');
}
function closeUnifiedModal() { document.getElementById('unified-modal').classList.remove('open'); }
function adjustModalInterval(d) {
  modalIntervalValue = Math.min(5, Math.max(2, modalIntervalValue+d));
  document.getElementById('modal-interval-display').textContent = modalIntervalValue.toFixed(1) + '시간';
}
function saveUnifiedInfo() {
  const name = document.getElementById('modal-name').value.trim();
  const birth = document.getElementById('modal-birth').value;
  const weight = parseFloat(document.getElementById('modal-weight').value);
  if (!name) { showToast('이름을 입력해주세요'); return; }
  if (!birth) { showToast('생년월일을 입력해주세요'); return; }
  if (!weight||weight<1||weight>30) { showToast('올바른 체중을 입력해주세요'); return; }
  babyInfo.name=name; babyInfo.birth=birth; babyInfo.weight=weight;
  save('babyInfo', babyInfo);
  feedIntervalHours = modalIntervalValue;
  save('feedIntervalHours', feedIntervalHours);
  const wi = document.getElementById('inp-weight'); if(wi) wi.value = weight;
  calcFormula();
  closeUnifiedModal();
  renderSettings(); renderHome();
  showToast('설정이 저장됐어요');
}

/* ─── 시계 & 토스트 ─── */
function updateClock() {
  const el = document.getElementById('current-time'); if(!el) return;
  const n = new Date();
  el.textContent = pad(n.getHours()) + ':' + pad(n.getMinutes());
}
function updateDate() {
  const el = document.getElementById('current-date'); if(!el) return;
  const n = new Date();
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  el.textContent = `${days[n.getDay()]}, ${months[n.getMonth()]} ${n.getDate()}`;
}
function showToast(msg) {
  const t = document.getElementById('toast'); if(!t) return;
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

/* ─── 초기화 ─── */
document.addEventListener('DOMContentLoaded', () => {
  const wi = document.getElementById('inp-weight');
  if (wi) wi.value = babyInfo.weight;
  calcFormula();
  renderHome(); renderHistory(); renderAlbum(); renderSettings();
  updateClock(); updateDate();
  setInterval(updateNextFeedDisplay, 1000);
  setInterval(updateClock, 30000);
  setInterval(updateDate, 60000);

  document.getElementById('lightbox').addEventListener('click', e => {
    if (e.target.id==='lightbox') closeLightbox();
  });
  document.getElementById('unified-modal').addEventListener('click', e => {
    if (e.target.id==='unified-modal') closeUnifiedModal();
  });
  document.getElementById('history-edit-modal').addEventListener('click', e => {
    if (e.target.id==='history-edit-modal') closeHistoryEditModal();
  });
  document.getElementById('photo-edit-modal').addEventListener('click', e => {
    if (e.target.id==='photo-edit-modal') closePhotoEditModal();
  });
});
