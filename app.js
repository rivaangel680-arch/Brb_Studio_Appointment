/* ============ BRB Studio Admin — front-end (vanilla JS). Data comes from api.php (MySQL via ../config.php) ============ */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtDate = (s, long) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: long ? 'long' : 'short', day: 'numeric', year: 'numeric' }); };
const fmtTime = t => { if (!t || t.startsWith('00:00')) return ''; const [h, m] = t.slice(0, 5).split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`; };
const fullName = r => `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.username;
const money = n => '₱' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 });
const empty = (icon, text) => `<div class="card empty"><i class="fa-solid ${icon}"></i>${text}</div>`;
// Same rule as picPath() in the PHP pages: external URLs stay, local files live in the project root
const picPath = p => { p = p || 'uploads/profile_default.png'; return /^(https?:)?\/\//.test(p) ? p : '../' + p.replace(/^\/+/, ''); };
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------- API helper ---------- */
async function api(action, { params, body, form } = {}) {
  const init = { credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' } };
  if (form) { init.method = 'POST'; init.body = form; }
  else if (body) { init.method = 'POST'; init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  const res = await fetch('api.php?action=' + action + (params ? '&' + new URLSearchParams(params) : ''), init);
  if (res.status === 401) { location.href = '../index.html'; throw new Error('Not logged in.'); }   // same target as requireLogin()
  let data; try { data = await res.json(); } catch { data = { error: 'Server error. Is api.php running with PHP?' }; }
  if (!res.ok) { const e = new Error(data.error || (data.errors || []).join(' ') || 'Request failed.'); e.errors = data.errors; throw e; }
  return data;
}

/* ---------- Messages ---------- */
function flash(msg) { const el = $('#flash'); if (!el) return; $('#errBox') && ($('#errBox').hidden = true); el.innerHTML = msg; el.hidden = false; }
function showErr(e) {
  const list = e.errors || [e.message || String(e)], el = $('#errBox');
  if (el) { $('#flash') && ($('#flash').hidden = true); el.innerHTML = list.map(x => `<p>• ${esc(x)}</p>`).join(''); el.hidden = false; } else alert(list.join('\n'));
}
const run = fn => async (...a) => { try { await fn(...a); } catch (e) { if (e.message !== 'Not logged in.') showErr(e); } };

/* ---------- Sidebar (name, photo, unread badge) ---------- */
let me = {};
async function loadMe() {
  me = await api('me');
  $('#adminName').textContent = me.username; $('#adminPic').src = picPath(me.profile_pic);
  const b = $('#unreadBadge'); if (b) { b.textContent = me.unread; b.hidden = !me.unread; }
}

/* ---------- Page loaders: each fills #list (or the page's own area) from the API ---------- */
const pages = {
  clients: run(async () => {
    const rows = await api('clients', { params: { q: $('[data-filter]').value.trim() } });
    $('#list').innerHTML = !rows.length ? empty('fa-users', 'No clients found.') :
      `<p class="muted mb">${rows.length} client${rows.length === 1 ? '' : 's'}</p><div class="card table-wrap"><table>
      <tr><th>Client</th><th>Contact</th><th>Joined</th><th>Appointments</th><th>Status</th><th></th></tr>${rows.map(c => {
        const on = c.status === 'Active'; return `<tr><td><div class="row"><img class="avatar" src="${esc(picPath(c.profile_pic))}" alt="">
        <div><b>${esc(fullName(c))}</b><p class="muted small">@${esc(c.username)}</p></div></div></td>
        <td>${esc(c.email)}<p class="muted small">${esc(c.contact_number || 'No number')}</p></td><td>${fmtDate(c.created_at)}</td>
        <td class="center">${+c.total_appointments}</td><td><span class="pill ${c.status}">${c.status}</span></td>
        <td><button class="btn btn-sm ${on ? 'btn-red' : 'btn-green'}" data-act="toggle-client" data-id="${c.id}" data-on="${on}">${on ? 'Deactivate' : 'Activate'}</button></td></tr>`; }).join('')}</table></div>`;
  }),

  services: run(async () => {
    const rows = await api('services'); window._services = rows;
    $('#list').innerHTML = !rows.length ? empty('fa-scissors', 'No services yet. Click “Create Service” to add one.') : `<div class="svc-grid">${rows.map(s => `
      <div class="card svc-card ${s.status === 'Inactive' ? 'inactive' : ''}">
        ${s.image ? `<img class="photo" src="${esc(picPath(s.image))}" alt="${esc(s.name)}">` : '<div class="photo"><i class="fa-solid fa-image"></i></div>'}
        <div class="body">
          <div class="row between" style="align-items:flex-start;flex-wrap:nowrap"><h2 style="font-size:22px;margin:0">${esc(s.name)}</h2><span class="pill ${s.status}">${s.status}</span></div>
          <p class="muted small" style="margin:4px 0 10px">${s.category} • ${s.duration_minutes} min • ${+s.bookings} booking${+s.bookings === 1 ? '' : 's'}</p>
          <p style="font-size:24px;font-weight:600">${money(s.price)}</p>
          ${s.description ? `<p class="muted small" style="margin-top:8px">${esc(s.description)}</p>` : ''}
        </div>
        <div class="actions"><button class="btn btn-outline btn-sm" data-act="edit-service" data-id="${s.id}"><i class="fa-solid fa-pen"></i> Edit</button>
          <button class="btn btn-red btn-sm" data-act="delete-service" data-id="${s.id}"><i class="fa-solid fa-trash"></i> Delete</button></div>
      </div>`).join('')}</div>`;
  }),

  charts: run(async () => {
    const d = await api('charts'), now = new Date(), labels = [], vals = [];
    for (let i = 11; i >= 0; i--) { const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(m.toLocaleString('en-US', { month: 'short' })); vals.push(+(d.monthly[`${m.getFullYear()}-${pad(m.getMonth() + 1)}`] || 0)); }
    new Chart($('#lineChart'), { type: 'line', data: { labels, datasets: [{ data: vals, borderColor: '#000', backgroundColor: 'rgba(0,0,0,.05)', fill: true, tension: .4, pointBackgroundColor: '#000', pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 5 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } }, x: { grid: { display: false } } } } });
    new Chart($('#pieChart'), { type: 'doughnut', data: { labels: d.services.map(s => s.name), datasets: [{ data: d.services.map(s => +s.count), backgroundColor: ['#4B0082', '#F97316', '#EF4444', '#8B5CF6', '#EC4899', '#10B981', '#3B82F6'], borderWidth: 2, borderColor: '#fff' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
    const total = d.services.reduce((n, s) => n + +s.count, 0), col = ['#facc15', '#d1d5db', '#d97706'];
    $('#top3').innerHTML = !d.services.length ? '<p class="muted center">No data yet.</p>' : d.services.slice(0, 3).map((s, i) => `<div class="row mb">
      <div class="rank" style="background:${col[i]}">${i + 1}</div><div><b>${esc(s.name)}</b><p class="muted small">${s.count} bookings (${(s.count / total * 100).toFixed(1)}%)</p></div></div>`).join('');
  }),

  appointments: run(async () => {
    const rows = await api('appointments_pending'); window._appts = rows;
    $('#list').innerHTML = !rows.length ? empty('fa-calendar-check', 'No pending appointment requests.') : `<div class="stack">${rows.map(a => `
      <div class="card row between"><div style="flex:1;min-width:240px"><div class="row"><h2 style="margin:0">${esc(a.service_name)}</h2><span class="pill Pending">Pending</span></div>
        <p class="muted small"><b>Client:</b> ${esc(fullName(a))} — ${esc(a.email)}</p>
        <p class="muted small"><b>Date:</b> ${fmtDate(a.appointment_date, 1)} ${fmtTime(a.appointment_time) ? 'at ' + fmtTime(a.appointment_time) : '(time to be set by BRB)'} · ${esc(a.booking_type || '')}</p>
        ${a.notes ? `<p class="muted small" style="white-space:pre-wrap"><b>Note:</b> ${esc(a.notes)}</p>` : ''}</div>
        <div class="row"><button class="btn btn-black" data-act="approve" data-id="${a.id}"><i class="fa-solid fa-check"></i> Approve</button>
        <button class="btn btn-outline" data-act="reschedule" data-id="${a.id}"><i class="fa-solid fa-clock"></i> Reschedule</button>
        <button class="btn btn-outline" data-act="cancel" data-id="${a.id}"><i class="fa-solid fa-xmark"></i> Cancel</button></div></div>`).join('')}</div>`;
  }),

  calendar: run(async () => {
    const d = await api('calendar', { params: { month: calM + 1, year: calY } });
    $('#calTitle').textContent = `${MONTHS[calM]} ${calY}`;
    $('#monthSelect').innerHTML = MONTHS.map((m, i) => `<option value="${i}" ${i === calM ? 'selected' : ''}>${m}</option>`).join('');
    const first = new Date(calY, calM, 1).getDay(), days = new Date(calY, calM + 1, 0).getDate();
    let h = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x => `<div class="dow">${x}</div>`).join('') + '<div class="day blank"></div>'.repeat(first);
    for (let n = 1; n <= days; n++) {
      const ds = `${calY}-${pad(calM + 1)}-${pad(n)}`, off = d.off[ds];
      h += `<div class="day ${off ? 'off' : ''} ${ds === todayStr() ? 'today' : ''}"><b>${n}</b>` +
        (off ? `<div style="color:#dc2626">${esc(off)}</div><button class="muted" style="background:none;border:0;cursor:pointer" data-act="remove-off" data-id="${ds}">Remove</button>` : '') +
        (d.events[ds] || []).map(a => `<div class="chip" title="${esc(a.c)}">${fmtTime(a.t)} — ${esc(a.s)}</div>`).join('') + '</div>';
    }
    $('#cal').innerHTML = h;
  }),

  records: run(async () => {
    const rows = await api('records', { params: { q: $('[data-filter]').value.trim() } });
    $('#list').innerHTML = !rows.length ? empty('fa-folder-open', 'No records found.') : `<div class="card table-wrap"><table>
      <tr><th>Client</th><th>Service</th><th>Date & Time</th><th>Status</th></tr>${rows.map(r => `<tr><td><b>${esc(fullName(r))}</b><p class="muted small">${esc(r.email)}</p></td>
      <td>${esc(r.service_name)}</td><td>${fmtDate(r.appointment_date)} <span class="muted small">${fmtTime(r.appointment_time)}</span></td>
      <td><span class="pill ${r.status}">${r.status}</span></td></tr>`).join('')}</table></div>`;
  }),

  attendance: run(async () => {
    const rows = await api('attendance', { params: { q: $('[data-filter]').value.trim(), date: $('#dateFilter').value } });
    $('#list').innerHTML = !rows.length ? empty('fa-clipboard-check', 'No attendance records found.') :
      `<p class="muted mb">${rows.length} record${rows.length === 1 ? '' : 's'}</p><div class="card table-wrap"><table>
      <tr><th>Client</th><th>Service</th><th>Date & Time</th><th>Marked By</th></tr>${rows.map(a => `<tr><td><b>${esc(a.client_name)}</b><p class="muted small">${esc(a.email)}</p></td>
      <td>${esc(a.service_name)}</td><td>${fmtDate(a.attendance_date)} <span class="muted small">${fmtTime(a.attendance_date.slice(11))}</span></td>
      <td class="muted">${a.marked_by_name ? '@' + esc(a.marked_by_name) : '—'}</td></tr>`).join('')}</table></div>`;
  }),

  reports: run(async () => {
    const rows = await api('feedback');
    $('#list').innerHTML = !rows.length ? empty('fa-star', 'No feedback received yet.') : rows.map(f => `<div class="card"><div class="row between">
      <div><b>${esc(fullName(f))}</b><p class="muted small">${fmtDate(f.created_at, 1)} — ${fmtTime(f.created_at.slice(11))}</p></div>
      <div class="stars">${[1,2,3,4,5].map(i => `<i class="fa-solid fa-star ${i <= f.rating ? 'on' : ''}"></i>`).join('')}</div></div>
      <p style="border-top:1px solid #e5e7eb;margin-top:14px;padding-top:14px">${esc(f.comment)}</p></div>`).join('');
    const p = $('#unreadPill'); if (me.unread) { p.textContent = me.unread + ' Unread'; p.hidden = false; }
  }),

  messages: run(async () => {
    const rows = await api('messages');
    $('#list').innerHTML = !rows.length ? empty('fa-inbox', 'No messages yet.') : rows.map(m => `<div class="card msg ${+m.is_read ? '' : 'unread'}"><div class="row between">
      <div><b style="font-size:22px">${esc(m.subject)}</b><p class="muted small"><b>From:</b> ${esc(m.name)} (${esc(m.email)}) — @${esc(m.username)}</p>
      <p class="muted small"><i class="fa-solid fa-clock"></i> ${fmtDate(m.created_at, 1)} ${fmtTime(m.created_at.slice(11))}</p></div>
      <div class="row small">${+m.is_read ? '<span class="muted"><i class="fa-solid fa-check-double"></i> Read</span>' : `<a style="color:#2563eb;cursor:pointer" data-act="mark-read" data-id="${m.id}"><i class="fa-solid fa-check"></i> Mark Read</a>`}
      <a style="color:#ef4444;cursor:pointer" data-act="delete-msg" data-id="${m.id}"><i class="fa-solid fa-trash"></i> Delete</a></div></div>
      <p class="body">${esc(m.message)}</p></div>`).join('');
  }),

  profile: () => { $('#profileName').textContent = me.username; $('#profilePic').src = picPath(me.profile_pic); $('#credsForm').username.value = me.username; },
  edit_profile: () => { $('#preview').src = picPath(me.profile_pic); $('#credsForm').username.value = me.username; },
};
const page = document.body.dataset.page;
const reload = () => pages[page]?.();

/* ---------- Calendar state ---------- */
let calM = new Date().getMonth(), calY = new Date().getFullYear(), resId = null;
const MONTHS = [...Array(12)].map((_, i) => new Date(2000, i).toLocaleString('en-US', { month: 'long' }));

/* ---------- Click actions (all POST to api.php, then reload the list) ---------- */
const act = (action, body, msg, done) => run(async () => { await api(action, { body }); if (msg) flash(msg); await (done || reload)(); if (action.startsWith('msg_')) loadMe(); })();
const actions = {
  'toggle-client': b => confirm(`${b.dataset.on === 'true' ? 'Deactivate' : 'Activate'} this client account?`) && act('client_toggle', { id: b.dataset.id }, 'Client status updated.'),
  'new-service': () => openSvcForm(),
  'edit-service': b => openSvcForm(window._services.find(x => x.id == b.dataset.id)),
  'cancel-edit': () => closeSvcForm(),
  'delete-service': b => confirm('Delete this service?') && act('service_delete', { id: b.dataset.id }, 'Service deleted.'),
  approve: b => act('appt_approve', { id: b.dataset.id }, 'Appointment approved.'),
  cancel: b => confirm('Cancel this appointment?') && act('appt_cancel', { id: b.dataset.id }, 'Appointment cancelled.'),
  reschedule: b => { const a = window._appts.find(x => x.id == b.dataset.id), f = $('#rescheduleForm'); resId = a.id;
    f.date.min = todayStr(); f.date.value = a.appointment_date; f.time.value = (a.appointment_time || '').slice(0, 5); f.reason.value = '';
    $('#modal').classList.add('active'); },
  'close-modal': () => $('#modal').classList.remove('active'),
  'prev-month': () => { if (--calM < 0) { calM = 11; calY--; } reload(); },
  'next-month': () => { if (++calM > 11) { calM = 0; calY++; } reload(); },
  'this-month': () => { calM = new Date().getMonth(); calY = new Date().getFullYear(); reload(); },
  'remove-off': b => act('off_remove', { date: b.dataset.id }),
  'all-dates': () => { $('#dateFilter').value = ''; reload(); },
  'mark-read': b => act('msg_read', { id: b.dataset.id }),
  'delete-msg': b => confirm('Delete this message?') && act('msg_delete', { id: b.dataset.id }),
};
// The service form stays hidden until "Create Service" (or Edit) is clicked
function setSvcPreview(path) { const p = $('#svcPreview'); if (path) { p.src = picPath(path); p.hidden = false; } else { p.removeAttribute('src'); p.hidden = true; } }
function openSvcForm(svc) {
  const f = $('#svcForm'); f.reset();
  ['id', 'name', 'description', 'price', 'duration_minutes', 'category', 'status'].forEach(k => f.elements[k].value = svc ? (svc[k] ?? '') : '');
  if (!svc) { f.elements.category.value = 'Solo'; f.elements.status.value = 'Active'; }
  setSvcPreview(svc?.image);
  $('#svcFormTitle').textContent = svc ? 'Edit service' : 'Create service';
  f.hidden = false; $('#svcOverlay').hidden = false; f.elements.name.focus();
}
function closeSvcForm() { const f = $('#svcForm'); f.reset(); f.elements.id.value = ''; setSvcPreview(null); f.hidden = true; $('#svcOverlay').hidden = true; }
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (t) actions[t.dataset.act]?.(t);
  if (e.target.id === 'modal') actions['close-modal']();
});

/* ---------- Forms & inputs ---------- */
const on = (id, fn) => { const f = $(id); if (f) f.addEventListener('submit', e => { e.preventDefault(); run(() => fn(f))(); }); };
on('#svcForm', async f => { if (f.elements.image.files[0]?.size > 10 * 1024 * 1024) throw new Error('The picture must be 10 MB or smaller.');
  await api('service_save', { form: new FormData(f) }); closeSvcForm(); flash('Service saved.'); await reload(); });
on('#rescheduleForm', async f => {
  if (!f.date.value || f.date.value < todayStr() || !f.time.value) { actions['close-modal'](); return showErr(new Error('Invalid new date or time. Choose today or a future date and a valid time.')); }
  await api('appt_reschedule', { body: { id: resId, date: f.date.value, time: f.time.value, reason: f.reason.value } });
  actions['close-modal'](); flash('New schedule sent to the client. It stays <b>Rescheduled</b> until the client agrees or picks another date.'); await reload();
});
on('#offForm', async f => { await api('off_add', { body: { date: f.date.value, reason: f.reason.value } }); f.reset(); await reload(); });
on('#credsForm', async f => {
  const r = await api('profile_save', { body: { username: f.username.value, password: f.password.value, password2: f.password2.value } });
  if (page === 'edit_profile') location.href = 'admin_profile.html';
  else { f.password.value = f.password2.value = ''; await loadMe(); pages.profile(); flash('Profile updated successfully!'); }
});
on('#uploadForm', async f => {
  const file = f.profile_pic.files[0]; if (!file) throw new Error('Please choose a picture first.');
  if (file.size > 10 * 1024 * 1024) throw new Error('The picture must be 10 MB or smaller.');
  await api('profile_pic', { form: new FormData(f) }); location.href = 'admin_profile.html';
});
document.addEventListener('input', e => { if (e.target.matches('[data-filter], #dateFilter')) debouncedReload(); });
const debouncedReload = debounce(() => reload());
document.addEventListener('change', e => {
  if (e.target.id === 'monthSelect') { calM = +e.target.value; reload(); }
  if (e.target.name === 'profile_pic' && e.target.files[0]) $('#preview').src = URL.createObjectURL(e.target.files[0]);
});

/* ---------- Start ---------- */
(async () => {
  try { await loadMe(); } catch (e) { return; }
  if ($('#dateFilter')) $('#dateFilter').value = todayStr();   // attendance defaults to today, like the PHP page
  reload();
})();

// Show a preview as soon as a service photo is chosen
document.addEventListener('change', e => {
  if (e.target.name === 'image' && e.target.files[0] && $('#svcPreview')) { $('#svcPreview').src = URL.createObjectURL(e.target.files[0]); $('#svcPreview').hidden = false; }
});

// Esc closes the side box
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#svcForm') && !$('#svcForm').hidden) closeSvcForm(); });