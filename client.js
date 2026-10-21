/* ============ BRB Studio Client — front-end (vanilla JS). Data comes from client_api.php (MySQL via ../config.php) ============ */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayStr = () => { const d = new Date(); return ymd(d.getFullYear(), d.getMonth(), d.getDate()); };
const dateOf = s => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = (s, o) => dateOf(s).toLocaleDateString('en-US', o || { year: 'numeric', month: 'long', day: 'numeric' });
const longDate = s => fmtDate(s, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const timeSet = t => !!t && !t.startsWith('00:00');                    // NULL / 00:00 = "BRB sets the time"
const fmtTime = t => { let [h, m] = t.split(':').map(Number); const ap = h % 24 >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + (m ? ':' + pad(m) : '') + ' ' + ap; };
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const addHours = (t, hrs) => { const n = toMin(t) + hrs * 60; return pad(Math.floor(n / 60) % 24) + ':' + pad(n % 60); };
const money = (n, d = 2) => '₱' + Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const empty = (icon, text, extra = '') => `<div class="card empty"><i class="fa-solid ${icon}"></i>${text}${extra}</div>`;
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// Same helpers as profilePicUrl()/serviceImage() in the PHP pages
const DEFAULT_PIC = 'https://i.pinimg.com/originals/d9/7b/bb/d97bbb08017ac2309307f0822e63d082.jpg';
const picUrl = p => { p = (p || '').trim(); if (!p || p === 'uploads/profile_default.png') p = DEFAULT_PIC; return /^(https?:)?\/\//.test(p) ? p : '../' + p.replace(/^\/+/, ''); };
const svcImg = s => { const i = s.image || ''; if (!i) return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#e5e5e5"/><text x="200" y="255" font-family="Times New Roman,serif" font-size="28" text-anchor="middle" fill="#6b7280">${esc(s.name)}</text></svg>`);
  return /^(https?:)?\/\//.test(i) ? i : '../' + i.replace(/^\/+/, ''); };

/* ---------- API helper ---------- */
async function api(action, { params, body, form } = {}) {
  const init = { credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' } };
  if (form) { init.method = 'POST'; init.body = form; }
  else if (body) { init.method = 'POST'; init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  const res = await fetch('client_api.php?action=' + action + (params ? '&' + new URLSearchParams(params) : ''), init);
  if (res.status === 401) { location.href = '../index.html'; throw new Error('Not logged in.'); }
  let data; try { data = await res.json(); } catch { data = { error: 'Server error. Is client_api.php running with PHP?' }; }
  if (!res.ok) { const e = new Error(data.error || (data.errors || []).join(' ') || 'Request failed.'); e.errors = data.errors; e.status = res.status; throw e; }
  return data;
}
function flash(msg) { const f = $('#flash'); if (!f) return; $('#errBox') && ($('#errBox').hidden = true); f.innerHTML = msg; f.hidden = false; }
function showErr(e) {
  const list = e.errors || [e.message || String(e)], el = $('#errBox');
  if (el) { $('#flash') && ($('#flash').hidden = true); el.innerHTML = list.map(x => `<p>• ${esc(x)}</p>`).join(''); el.hidden = false; el.scrollIntoView({ block: 'center' }); } else alert(list.join('\n'));
}
const run = fn => async (...a) => { try { await fn(...a); } catch (e) { if (e.message !== 'Not logged in.') showErr(e); } };

let me = {};
const page = document.body.dataset.page, qs = new URLSearchParams(location.search);
const myName = () => `${me.first_name || ''} ${me.last_name || ''}`.trim();

/* ============================================================
   Pages
   ============================================================ */
const pages = {
  home: () => { $('#welcomeName').textContent = me.username.toUpperCase() + '!'; },

  services: run(async () => {
    const all = await api('services');
    const card = s => `<a class="service-card" href="client_appointment.html?service_id=${s.id}"><img src="${esc(svcImg(s))}" alt="${esc(s.name)}">
      <h3>${esc(s.name)}</h3><p style="font-size:22px;margin-bottom:14px">Price: ${money(s.price, 0)}</p>
      <p class="muted small" style="margin-bottom:20px;line-height:1.6">${esc(s.description || '')}</p><div class="brand-mark">BRB</div></a>`;
    const list = (id, rows, none) => $(id).innerHTML = rows.length ? rows.map(card).join('') : `<p class="muted">${none}</p>`;
    list('#packages', all.filter(s => s.category === 'Package'), 'No packages available at the moment.');
    list('#solo', all.filter(s => s.category !== 'Package'), 'No solo services available at the moment.');
  }),

  appointment: run(async () => booking.start()),
  confirm: run(async () => confirmPage()),

  finished: () => {
    const rs = qs.has('rescheduled');
    $('#fTitle').textContent = rs ? 'New Schedule Submitted!' : 'Appointment Submitted!';
    $('#fText').innerHTML = rs ? 'Thank you! Your new date and time were sent to BRB. Your appointment is now <b>Pending</b> again until BRB approves it.'
      : 'Thank you! Your appointment request is now <b>Pending</b>. BRB will review it and confirm your schedule.';
  },

  schedule: run(async () => {
    const rows = await api('appointments');
    const reason = n => { const p = (n || '').lastIndexOf('Rescheduled:'); return p < 0 ? '' : n.slice(p + 12).trim(); };
    $('#list').innerHTML = !rows.length ? empty('fa-calendar-day', 'You have no appointments yet.', '<p style="margin-top:20px"><a class="btn btn-black" href="client_services.html">Book Your First Appointment</a></p>') :
      `<div class="stack">${rows.map(a => `<div class="card"><div class="row between" style="align-items:flex-start;margin-bottom:14px"><div>
        <h2 style="font-size:22px;margin-bottom:4px">${esc(a.service_name)}</h2>
        <p class="muted"><i class="fa-solid fa-calendar"></i> ${longDate(a.appointment_date)}</p>
        ${timeSet(a.appointment_time) ? `<p class="muted"><i class="fa-solid fa-clock"></i> ${fmtTime(a.appointment_time.slice(0, 5))}</p>` : ''}</div>
        <span class="pill ${a.status}">${a.status}</span></div>
        <div><p class="muted">Price</p><p style="font-weight:600">${money(a.price)} • ${a.duration_minutes} mins</p></div>
        ${a.status === 'Pending' ? `<div class="row" style="justify-content:flex-end;border-top:1px solid #e5e7eb;margin-top:16px;padding-top:16px">
          <button class="btn btn-red" data-act="cancel" data-id="${a.id}">Cancel Appointment</button></div>` : ''}
        ${a.status === 'Rescheduled' ? `<div style="border-top:1px solid #e5e7eb;margin-top:16px;padding-top:16px">
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:16px;color:#1e3a8a">
            <p style="font-weight:600"><i class="fa-solid fa-arrows-rotate"></i> BRB Studios proposed a new schedule</p>
            <p>${longDate(a.appointment_date)}${timeSet(a.appointment_time) ? ' at ' + fmtTime(a.appointment_time.slice(0, 5)) : ''}</p>
            ${reason(a.notes) ? `<p style="font-style:italic;color:#374151">Reason: ${esc(reason(a.notes))}</p>` : ''}
            <p style="color:#374151;margin-top:8px">Do you agree with this new schedule?</p></div>
          <div class="row" style="justify-content:flex-end"><a class="btn btn-red" href="client_appointment.html?reschedule_id=${a.id}">Disagree — Choose Another Date</a>
          <button class="btn btn-black" data-act="agree" data-id="${a.id}">Agree</button></div></div>` : ''}</div>`).join('')}</div>`;
  }),

  calendar: run(async () => {
    const d = await api('calendar'); window._cal = d;
    const sel = $('#monthSelect'), y0 = new Date().getFullYear();
    for (let y = y0 - 1; y <= y0 + 1; y++) MONTHS.forEach((m, i) => sel.insertAdjacentHTML('beforeend', `<option value="${y}-${pad(i + 1)}">${m} ${y}</option>`));
    drawCal();
  }),

  contact: () => { const f = $('#contactForm'); f.name.value = myName(); f.email.value = me.email || ''; },

  report: () => {
    const stars = [...document.querySelectorAll('.star')]; window._rating = 0;
    const paint = n => stars.forEach((s, i) => s.classList.toggle('active', i < n));
    stars.forEach(s => { s.onmouseover = () => paint(+s.dataset.value); s.onmouseout = () => paint(window._rating); s.onclick = () => { window._rating = +s.dataset.value; paint(window._rating); }; });
  },

  profile: run(async () => {
    $('#pPic').src = picUrl(me.profile_pic); $('#pUser').textContent = me.username; $('#pFull').textContent = myName();
    $('#bBday').textContent = 'Birthday: ' + (me.birthday ? fmtDate(me.birthday) : 'Not set');
    $('#bAge').textContent = 'Age: ' + (me.age ?? 'Not set'); $('#bGender').textContent = 'Gender: ' + (me.gender || 'Not set');
    $('#bPhone').textContent = 'Contact: ' + (me.contact_number || 'Not set'); $('#bEmail').textContent = 'Email Address: ' + me.email;
    $('#bAddr').textContent = 'Address: ' + (me.address || 'Not set');
    if (qs.has('success')) flash('Profile updated successfully!');
    loadHistory();
  }),

  edit_profile: () => {
    const f = $('#profileForm');
    ['first_name', 'last_name', 'username', 'birthday', 'age', 'gender', 'contact_number', 'address'].forEach(k => f[k].value = me[k] ?? '');
    $('#preview').src = picUrl(me.profile_pic);
  },
};

/* ---------- Profile: appointment history ---------- */
const loadHistory = run(async () => {
  const rows = await api('history', { params: { q: $('[data-filter]').value.trim() } });
  $('#list').innerHTML = !rows.length ? empty('fa-clock-rotate-left', 'No completed appointments yet.') : rows.map(h => `<div class="card row between">
    <div><p style="font-size:22px;font-weight:600">${esc(h.service_name)}</p><p class="muted"><i class="fa-solid fa-calendar"></i> ${longDate(h.appointment_date)}</p></div>
    <span class="pill Completed">Completed</span></div>`).join('');
});

/* ---------- Calendar page ---------- */
let cur = new Date(); cur.setDate(1);
function drawCal() {
  const y = cur.getFullYear(), m = cur.getMonth(), { events, unavailable } = window._cal;
  $('#monthSelect').value = `${y}-${pad(m + 1)}`;
  let h = '<div class="day-cell blank"></div>'.repeat(new Date(y, m, 1).getDay());
  for (let d = 1, n = new Date(y, m + 1, 0).getDate(); d <= n; d++) {
    const ds = ymd(y, m, d), ev = events.filter(e => e.d === ds), off = unavailable.includes(ds);
    h += `<div class="day-cell ${off ? 'off' : ev.length ? 'event' : ''}" ${ev.length && !off ? `data-act="show-events" data-date="${ds}"` : ''}>
      <b>${d}</b>${ev.length ? `<div class="small" style="text-align:left;margin-top:4px;max-height:64px;overflow:hidden">${ev.map(e => `<div>● ${esc(e.service)}</div>`).join('')}</div>` : ''}</div>`;
  }
  $('#calendarGrid').innerHTML = h;
}

/* ============================================================
   Booking page (calendar + Solo/Group/time). All rules are re-checked by the server on submit.
   ============================================================ */
const booking = {
  async start() {
    const rid = qs.get('reschedule_id'), sid = qs.get('service_id');
    let info;
    try { info = await api('booking_info', { params: rid ? { reschedule_id: rid } : { service_id: sid || 0 } }); }
    catch (e) { return location.replace(rid ? 'client_schedule.html' : 'client_services.html'); }   // same redirects as the PHP page
    Object.assign(this, { info, svc: info.service, R: info.rules, rid, unavailable: info.unavailable, booked: info.booked, TIMES: info.solo_times, date: null, type: null });
    $('#svcImg').src = svcImg(this.svc); $('#svcName').textContent = this.svc.name; $('#svcPrice').textContent = 'Price: ' + money(this.svc.price, 0);
    $('#myInfo').innerHTML = `<p><b>Name:</b> ${esc(myName() || 'Not set')}</p><p><b>Age:</b> ${esc(me.age || 'Not set')}</p><p><b>Gender:</b> ${esc(me.gender || 'Not set')}</p><p><b>Contact:</b> ${esc(me.contact_number || 'Not set')}</p>`;
    if (rid) { $('#rsNote').hidden = false; $('#backLink').textContent = '← Back to My Schedule'; $('#backLink').href = 'client_schedule.html'; }
    $('#svcHint').textContent = this.R.isModeling ? `${this.R.max} slots per day for ${this.svc.name}` : this.R.isTimed ? `Each ${this.svc.name} session takes ${this.R.duration} hours` : '';
    $('#soloTimeSelect').onchange = () => this.onTime();
    this.draw();
  },
  range(t) { return fmtTime(t) + ' – ' + fmtTime(addHours(t, this.R.duration)); },
  // 'taken' (inside a booked session), 'overlap' (would run into one) or null if free
  block(t, taken) {
    const d = this.R.duration * 60, ts = toMin(t); let r = null;
    for (const s of taken) { const ss = toMin(s); if (ts >= ss && ts < ss + d) return 'taken'; if (ts < ss && ts + d > ss) r = 'overlap'; }
    return r;
  },
  slots(ds) {
    const i = this.booked[ds] || { total: 0, solo: 0, group: 0, solo_times: [] }, taken = i.solo_times || [], R = this.R;
    const soloLeft = this.TIMES.filter(t => !this.block(t, taken)).length;
    if (R.isModeling) { const g = Math.max(0, R.max - i.group); return { groupLeft: g, soloLeft, taken, full: g <= 0 && soloLeft <= 0 }; }
    if (R.isTimed) return { groupLeft: 0, soloLeft, taken, full: soloLeft <= 0 };
    const left = Math.max(0, R.max - i.total); return { groupLeft: left, soloLeft: 0, taken: [], full: left <= 0 };
  },
  draw() {
    const y = cur.getFullYear(), m = cur.getMonth(), today = new Date(); today.setHours(0, 0, 0, 0);
    $('#monthTitle').textContent = `${MONTHS[m].toUpperCase()} (${y})`;
    let h = '<div class="day-cell blank"></div>'.repeat(new Date(y, m, 1).getDay());
    for (let d = 1, n = new Date(y, m + 1, 0).getDate(); d <= n; d++) {
      const ds = ymd(y, m, d), s = this.slots(ds), past = new Date(y, m, d) < today, off = this.unavailable.includes(ds);
      let cls = '', txt = '', act = '';
      if (past || off) { cls = 'off'; txt = '<span class="slot-text">—</span>'; }
      else if (s.full) { cls = 'taken'; txt = '<span class="slot-text slot-full">FULLY BOOKED</span>'; }
      else {
        act = `data-act="pick-date" data-date="${ds}"`;
        const more = s.taken.length ? s.taken.slice(0, 2).map(t => this.range(t)).join(', ') + (s.taken.length > 2 ? ` +${s.taken.length - 2}` : '') : '';
        if (this.R.isModeling) txt = (s.groupLeft > 0 ? `<span class="slot-text slot-ok">${s.groupLeft} slot${s.groupLeft > 1 ? 's' : ''} left</span>` : '<span class="slot-text slot-full">Group full</span>') + (more ? `<br><span class="slot-text" style="color:#b91c1c">Solo taken: ${more}</span>` : '');
        else if (this.R.isTimed) txt = `<span class="slot-text slot-ok">${s.soloLeft} time${s.soloLeft > 1 ? 's' : ''} open</span>` + (more ? `<br><span class="slot-text" style="color:#b91c1c">Booked: ${more}</span>` : '');
      }
      h += `<div class="day-cell ${cls}" ${act}><div>${d}</div>${txt}</div>`;
    }
    $('#calendarGrid').innerHTML = h;
  },
  reset() { this.date = this.type = null; this.hideTimes(); $('#bookingTypeSection').hidden = true; },
  hideTimes() { $('#soloTimeSection').hidden = true; $('#groupTimeNote').hidden = true; $('#soloTimeSelect').value = ''; },
  pick(ds, cell) {
    document.querySelectorAll('.day-cell.selected').forEach(e => e.classList.remove('selected')); cell.classList.add('selected');
    this.date = ds; this.type = null; this.hideTimes();
    $('#bookingTypeSection').hidden = false; $('#selectedDateDisplay').textContent = 'Date: ' + longDate(ds);
    $('#stepTitle').textContent = this.R.isModeling ? 'Select Booking Type' : this.R.isTimed ? 'Select Your Time' : 'Confirm Your Date';
    $('#typeOpts').hidden = !this.R.isModeling; $('#durNote').textContent = `Each session takes ${this.R.duration} hours — those hours become unavailable to others.`;
    $('#continueBtn').disabled = true;
    if (this.R.isModeling) this.options(ds);
    else if (this.R.isTimed) { this.type = 'Solo'; this.times(); $('#soloTimeSection').hidden = false; this.onTime(); }
    else { this.type = 'Solo'; $('#continueBtn').disabled = false; }
  },
  options(ds) {
    const s = this.slots(ds);
    [['solo', s.soloLeft, `Available — pick your ${this.R.duration}-hour time (${s.soloLeft} start time${s.soloLeft > 1 ? 's' : ''} open)`, 'All solo times are taken'],
     ['group', s.groupLeft, `${s.groupLeft} slot${s.groupLeft > 1 ? 's' : ''} left — this booking uses 1`, 'No slots available']].forEach(([k, n, ok, no]) => {
      const el = $('#' + k + 'Option'); el.classList.remove('selected'); el.classList.toggle('disabled', n <= 0);
      $('#' + k + 'Status').innerHTML = n > 0 ? `<span style="color:#16a34a">${ok}</span>` : `<span style="color:#dc2626">${no}</span>`; el.dataset.ok = n > 0 ? '1' : '';
    });
  },
  times() {
    const taken = this.slots(this.date).taken, sel = $('#soloTimeSelect');
    sel.innerHTML = '<option value="">— Choose a time —</option>' + this.TIMES.map(t => { const r = this.block(t, taken);
      return `<option value="${t}" ${r ? 'disabled' : ''}>${this.range(t)}${r === 'taken' ? ' — Already taken' : r === 'overlap' ? ' — Overlaps a booking' : ''}</option>`; }).join('');
    $('#soloTakenNote').textContent = taken.length ? 'Already booked: ' + taken.map(t => this.range(t)).join(', ') : '';
  },
  onTime() { $('#continueBtn').disabled = !(this.type === 'Solo' && $('#soloTimeSelect').value); },
  chooseType(t) {
    if (!$('#' + t.toLowerCase() + 'Option').dataset.ok) return;
    this.type = t; document.querySelectorAll('.opt').forEach(e => e.classList.remove('selected')); $('#' + t.toLowerCase() + 'Option').classList.add('selected');
    if (t === 'Solo') { this.times(); $('#soloTimeSection').hidden = false; $('#groupTimeNote').hidden = true; this.onTime(); }
    else { $('#soloTimeSection').hidden = true; $('#soloTimeSelect').value = ''; $('#groupTimeNote').hidden = false; $('#continueBtn').disabled = false; }
  },
  go() {
    const needsTime = this.R.isTimed || (this.R.isModeling && this.type === 'Solo'), time = $('#soloTimeSelect').value;
    if (!this.date || !this.type || (needsTime && !time)) return;
    sessionStorage.setItem('brbBooking', JSON.stringify({ service_id: this.svc.id, reschedule_id: this.rid || null, date: this.date, booking_type: this.type, time: needsTime ? time : '' }));
    location.href = 'client_confirm.html';
  },
};

/* ---------- Confirm page ---------- */
async function confirmPage() {
  const b = JSON.parse(sessionStorage.getItem('brbBooking') || 'null');
  if (!b || !b.service_id || !b.date || !b.booking_type) return location.replace('client_services.html');
  const info = await api('booking_info', { params: b.reschedule_id ? { reschedule_id: b.reschedule_id } : { service_id: b.service_id } }), s = info.service, R = info.rules;
  window._b = b;
  $('#confTitle').textContent = b.reschedule_id ? 'Confirm Your New Schedule' : 'Confirm Your Appointment';
  $('#cSubmit').textContent = b.reschedule_id ? 'Submit New Schedule' : 'Submit Appointment';
  $('#cBack').href = 'client_appointment.html?' + (b.reschedule_id ? 'reschedule_id=' + b.reschedule_id : 'service_id=' + s.id);
  $('#cSvc').textContent = s.name; $('#cDesc').textContent = s.description || ''; $('#cPrice').textContent = `${money(s.price)} — ${s.duration_minutes} minutes`;
  $('#cDate').textContent = fmtDate(b.date);
  $('#cExtra').innerHTML = (R.isModeling ? `<p><span class="muted">Booking Type:</span> <b>${esc(b.booking_type)} Session</b></p>` : '') +
    (b.time ? `<p><span class="muted">Time:</span> <b>${fmtTime(b.time)} – ${fmtTime(addHours(b.time, R.duration))} (${R.duration} hours)</b></p>`
      : R.isModeling && b.booking_type === 'Group' ? '<p><span class="muted">Time:</span> <b>9:00 AM or 3:00 PM — BRB will set the time</b></p>' : '') +
    (b.reschedule_id ? '<p class="muted small" style="margin-top:12px">Your appointment will go back to Pending until BRB approves this new schedule.</p>' : '');
  const kv = (k, v) => `<div><p>${k}</p><p>${esc(v || 'Not set')}</p></div>`;
  $('#cInfo').innerHTML = kv('Full Name', myName()) + kv('Birthday', me.birthday && fmtDate(me.birthday)) + kv('Age', me.age) + kv('Gender', me.gender) + kv('Contact Number', me.contact_number) + kv('Email Address', me.email) + `<div style="grid-column:1/-1"><p>Address</p><p>${esc(me.address || 'Not set')}</p></div>`;
}

/* ============================================================
   Click / form handling
   ============================================================ */
const reload = () => pages[page]?.();
const act = (action, body, msg) => run(async () => { await api(action, { body }); if (msg) flash(msg); await pages[page](); })();
const actions = {
  prev: () => { cur.setMonth(cur.getMonth() - 1); page === 'appointment' ? (booking.draw(), booking.reset()) : drawCal(); },
  next: () => { cur.setMonth(cur.getMonth() + 1); page === 'appointment' ? (booking.draw(), booking.reset()) : drawCal(); },
  'pick-date': b => booking.pick(b.dataset.date, b),
  'type-solo': () => booking.chooseType('Solo'),
  'type-group': () => booking.chooseType('Group'),
  continue: () => booking.go(),
  'show-events': b => {
    const ds = b.dataset.date, ev = window._cal.events.filter(e => e.d === ds);
    $('#modalDate').textContent = longDate(ds);
    $('#modalContent').innerHTML = ev.map(e => `<div style="padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid #e5e7eb"><p style="font-weight:600;font-size:20px">${esc(e.service)}</p>${timeSet(e.t) ? `<p class="muted">${fmtTime(e.t.slice(0, 5))}</p>` : ''}</div>`).join('');
    $('#modal').classList.add('active');
  },
  'close-modal': () => $('#modal').classList.remove('active'),
  cancel: b => confirm('Are you sure you want to cancel this appointment?') && act('cancel', { id: b.dataset.id }, 'Appointment cancelled.'),
  agree: b => confirm('Agree to this new schedule?') && act('agree', { id: b.dataset.id }, 'Schedule confirmed. Your appointment is now Approved.'),
  submit: run(async () => {
    const btn = $('#cSubmit'); btn.disabled = true;
    try { const r = await api('book', { body: window._b }); sessionStorage.removeItem('brbBooking'); location.href = 'client_finished.html' + (r.rescheduled ? '?rescheduled=1' : ''); }
    catch (e) { btn.disabled = false; throw e; }
  }),
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (t && !t.classList.contains('disabled')) actions[t.dataset.act]?.(t);
  if (e.target.id === 'modal') actions['close-modal']();
});
document.addEventListener('input', e => { if (e.target.matches('[data-filter]')) debouncedHistory(); });
const debouncedHistory = debounce(() => loadHistory());
document.addEventListener('change', e => {
  if (e.target.id === 'monthSelect') { const [y, m] = e.target.value.split('-'); cur = new Date(+y, m - 1, 1); drawCal(); }
  if (e.target.name === 'profile_pic' && e.target.files[0]) $('#preview').src = URL.createObjectURL(e.target.files[0]);
});
const on = (id, fn) => { const f = $(id); if (f) f.addEventListener('submit', e => { e.preventDefault(); run(() => fn(f))(); }); };
on('#contactForm', async f => { await api('contact', { body: { name: f.name.value, email: f.email.value, subject: f.subject.value, message: f.message.value } });
  f.subject.value = f.message.value = ''; flash('Your message has been sent successfully! We will get back to you as soon as possible.'); });
on('#feedbackForm', async f => { await api('feedback', { body: { rating: window._rating, comment: f.comment.value } });
  f.reset(); window._rating = 0; document.querySelectorAll('.star').forEach(s => s.classList.remove('active')); flash('Thank you for your feedback! We appreciate your time and input.'); });
on('#profileForm', async f => {
  if (f.profile_pic.files[0]?.size > 10 * 1024 * 1024) throw new Error('The picture must be 10 MB or smaller.');
  await api('profile_save', { form: new FormData(f) }); location.href = 'client_profile.html?success=1';
});

/* ---------- Start ---------- */
(async () => {
  try { me = await api('me'); } catch (e) { return; }
  $('#sideName').textContent = me.username; $('#sidePic').src = picUrl(me.profile_pic);
  reload();
})();