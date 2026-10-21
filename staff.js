/* ============ BRB Studio Staff — front-end (vanilla JS). Data comes from staff_api.php (MySQL via ../config.php) ============ */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtDate = (s, long) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: long ? 'long' : 'short', day: 'numeric', year: 'numeric' }); };
const timeSet = t => !!t && !t.startsWith('00:00');                      // NULL = "BRB sets the time later"
const fmtTime = t => { if (!timeSet(t)) return ''; let [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`; };
const fullName = r => `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.username;
const empty = (icon, text) => `<div class="card empty"><i class="fa-solid ${icon}"></i>${text}</div>`;
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const picPath = p => { p = p || 'uploads/profile_default.png'; return /^(https?:)?\/\//.test(p) ? p : '../' + p.replace(/^\/+/, ''); };   // same as picPath() in the PHP pages

async function api(action, { params, body, form } = {}) {
  const init = { credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' } };
  if (form) { init.method = 'POST'; init.body = form; }
  else if (body) { init.method = 'POST'; init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  const res = await fetch('staff_api.php?action=' + action + (params ? '&' + new URLSearchParams(params) : ''), init);
  if (res.status === 401) { location.href = '../index.html'; throw new Error('Not logged in.'); }
  let data; try { data = await res.json(); } catch { data = { error: 'Server error. Is staff_api.php running with PHP?' }; }
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
function flash(msg) { const f = $('#flash'); $('#errBox').hidden = true; f.textContent = msg; f.hidden = false; }
function showErr(e) { const b = $('#errBox'); if (!b) return alert(e.message); $('#flash') && ($('#flash').hidden = true); b.innerHTML = `<p>• ${esc(e.message)}</p>`; b.hidden = false; }
const run = fn => async (...a) => { try { await fn(...a); } catch (e) { if (e.message !== 'Not logged in.') showErr(e); } };

let me = {};
const page = document.body.dataset.page;
const q = () => ($('[data-filter]')?.value || '').trim();

/* ---------- Pages ---------- */
const pages = {
  dashboard: () => {},

  clients: run(async () => {
    const d = await api('clients', { params: { q: q() } });
    $('#current').innerHTML = !d.current.length ? empty('fa-calendar', 'No upcoming appointments.') : `<div class="stack">${d.current.map(a => `<div class="card row between">
      <div><p style="font-size:20px;font-weight:600">${esc(fullName(a))}</p><p class="muted small">${esc(a.email)}</p>
      <p style="margin-top:4px"><b>Service:</b> ${esc(a.service_name)}</p><p><b>Date:</b> ${fmtDate(a.appointment_date, 1)} ${fmtTime(a.appointment_time) ? 'at ' + fmtTime(a.appointment_time) : '(time to be set)'}</p></div>
      <span class="pill Approved">Approved</span></div>`).join('')}</div>`;
    $('#history').innerHTML = !d.history.length ? empty('fa-clock-rotate-left', 'No history records found.') : `<div class="card table-wrap"><table>
      <tr><th>Client</th><th>Service</th><th>Date & Time</th><th>Status</th></tr>${d.history.map(a => `<tr><td><b>${esc(fullName(a))}</b></td><td>${esc(a.service_name)}</td>
      <td>${fmtDate(a.appointment_date)} <span class="muted small">${fmtTime(a.appointment_time)}</span></td><td><span class="pill ${a.status}">${a.status}</span></td></tr>`).join('')}</table></div>`;
  }),

  calendar: run(async () => {
    const d = await api('calendar', { params: { month: calM + 1, year: calY } });
    $('#calTitle').textContent = `${MONTHS[calM]} ${calY}`;
    $('#monthSelect').innerHTML = MONTHS.map((m, i) => `<option value="${i}" ${i === calM ? 'selected' : ''}>${m}</option>`).join('');
    let h = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x => `<div class="dow">${x}</div>`).join('') + '<div class="day blank"></div>'.repeat(new Date(calY, calM, 1).getDay());
    for (let n = 1, days = new Date(calY, calM + 1, 0).getDate(); n <= days; n++) {
      const ds = `${calY}-${pad(calM + 1)}-${pad(n)}`, off = d.off.includes(ds);
      h += `<div class="day ${off ? 'off' : ''} ${ds === todayStr() ? 'today' : ''}"><b>${n}</b>${off ? '<div style="color:#dc2626">Unavailable</div>' : ''}` +
        (d.events[ds] || []).map(a => `<div class="chip" title="${esc(a.c)}">${fmtTime(a.t) ? fmtTime(a.t) + ' — ' : ''}${esc(a.s)}</div>`).join('') + '</div>';
    }
    $('#cal').innerHTML = h;
  }),

  appointments: run(async () => {
    const rows = await api('appointments');
    $('#list').innerHTML = !rows.length ? empty('fa-calendar-check', 'No approved appointments yet.') : rows.map(a => `<div class="card">
      <div class="row" style="margin-bottom:10px"><h2 style="margin:0;font-size:22px">${esc(a.service_name)}</h2><span class="pill Approved">Approved</span></div>
      <p class="muted"><i class="fa-solid fa-user"></i> ${esc(fullName(a))}</p><p class="muted"><i class="fa-solid fa-envelope"></i> ${esc(a.email)}</p>
      <p class="muted"><i class="fa-solid fa-calendar"></i> ${fmtDate(a.appointment_date, 1)} ${fmtTime(a.appointment_time) ? 'at ' + fmtTime(a.appointment_time) : '(time to be set)'}</p>
      ${a.notes ? `<p class="muted small" style="margin-top:8px;white-space:pre-wrap"><i class="fa-solid fa-note-sticky"></i> Note: ${esc(a.notes)}</p>` : ''}</div>`).join('');
  }),

  attendance: run(async () => {
    const date = $('#dateFilter').value;
    const [todo, rows] = await Promise.all([date ? api('attendance_today', { params: { date } }) : [], api('attendance', { params: { q: q(), date } })]);
    $('#markSection').hidden = !todo.length;
    if (todo.length) {
      $('#markTitle').textContent = 'Mark Attendance — ' + fmtDate(date, 1);
      $('#markList').innerHTML = todo.map(a => `<div class="row between" style="border:1px solid #e5e7eb;border-radius:8px;padding:16px">
        <div><p style="font-size:20px;font-weight:600">${esc(fullName(a))}</p><p class="muted small">Email: ${esc(a.email || 'N/A')} | Age: ${esc(a.age ?? 'N/A')}</p>
        <p class="small" style="margin-top:4px">Service: ${esc(a.service_name)} | Time: ${fmtTime(a.appointment_time) || 'To be set'}</p></div>
        <button class="btn btn-black" data-act="present" data-id="${a.id}"><i class="fa-solid fa-check"></i> Mark Present</button></div>`).join('');
    }
    $('#list').innerHTML = !rows.length ? empty('fa-clipboard-list', 'No attendance records found.') : `<div class="card table-wrap"><table>
      <tr><th>Client Name</th><th>Email</th><th>Service</th><th>Date & Time</th></tr>${rows.map(r => `<tr><td><b>${esc(r.client_name)}</b></td><td class="small">${esc(r.email)}</td>
      <td>${esc(r.service_name)}</td><td class="small">${fmtDate(r.attendance_date)} ${fmtTime(r.attendance_date.slice(11))}</td></tr>`).join('')}</table></div>`;
  }),

  reports: run(async () => {
    const rows = await api('feedback');
    $('#list').innerHTML = !rows.length ? empty('fa-star', 'No feedback received yet.') : rows.map(f => `<div class="card">
      <p style="font-size:20px;font-weight:600">${esc(fullName(f))}</p><p class="muted small">${fmtDate(f.created_at, 1)} — ${fmtTime(f.created_at.slice(11))}</p>
      <p style="border-top:1px solid #e5e7eb;margin-top:14px;padding-top:14px">${esc(f.comment)}</p>
      <div class="row" style="margin-top:12px;gap:8px"><span class="muted small">Rating:</span><span class="stars">${[1,2,3,4,5].map(i => `<i class="fa-solid fa-star ${i <= f.rating ? 'on' : ''}"></i>`).join('')}</span>
      <span class="muted small">(${f.rating} out of 5)</span></div></div>`).join('');
  }),

  profile: () => {
    $('#pPic').src = picPath(me.profile_pic); $('#pName').textContent = me.username;
    const f = $('#detailsForm'); ['first_name', 'last_name', 'username', 'email'].forEach(k => f[k].value = me[k] ?? '');
  },
};

let calM = new Date().getMonth(), calY = new Date().getFullYear();
const MONTHS = [...Array(12)].map((_, i) => new Date(2000, i).toLocaleString('en-US', { month: 'long' }));
const reload = () => pages[page]?.();

/* ---------- Actions ---------- */
const actions = {
  prev: () => { if (--calM < 0) { calM = 11; calY--; } reload(); },
  next: () => { if (++calM > 11) { calM = 0; calY++; } reload(); },
  today: () => { calM = new Date().getMonth(); calY = new Date().getFullYear(); reload(); },
  present: b => run(async () => { await api('mark_present', { body: { id: b.dataset.id } }); flash('Attendance recorded. The appointment is now Completed.'); await reload(); })(),
};
document.addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (t) actions[t.dataset.act]?.(t); });
const debounced = debounce(() => reload());
document.addEventListener('input', e => { if (e.target.matches('[data-filter], #dateFilter')) debounced(); });
document.addEventListener('change', e => { if (e.target.id === 'monthSelect') { calM = +e.target.value; reload(); } });

const on = (id, fn) => { const f = $(id); if (f) f.addEventListener('submit', e => { e.preventDefault(); run(() => fn(f))(); }); };
const reloadMe = async () => { me = await api('me'); $('#sideName').textContent = me.username; $('#sidePic').src = picPath(me.profile_pic); };
on('#detailsForm', async f => { await api('profile_update', { body: Object.fromEntries(new FormData(f)) }); await reloadMe(); pages.profile(); flash('Profile updated successfully.'); });
on('#passForm', async f => { await api('password_change', { body: Object.fromEntries(new FormData(f)) }); f.reset(); flash('Password changed successfully.'); });
on('#picForm', async f => { await api('picture', { form: new FormData(f) }); f.reset(); await reloadMe(); pages.profile(); flash('Picture updated successfully.'); });

/* ---------- Start ---------- */
(async () => {
  try { await reloadMe(); } catch (e) { return; }
  if ($('#dateFilter')) $('#dateFilter').value = todayStr();   // attendance defaults to today
  reload();
})();