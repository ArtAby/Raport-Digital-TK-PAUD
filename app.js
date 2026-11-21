(() => {
  'use strict';

  // ===================================================================
  // Pengaturan awal
  // ===================================================================
  const cfg = window.APP_CONFIG || {};
  const $app = document.getElementById('app');
  const $dlg = document.getElementById('dlg');
  const $toast = document.getElementById('toast');

  // MODE DEMO: tanpa server, data tersimpan di peramban (lihat demo-backend.js)
  const DEMO = !!cfg.DEMO;

  if (!DEMO && (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || String(cfg.SUPABASE_URL).startsWith('ISI_'))) {
    $app.innerHTML =
      '<div class="auth-wrap"><div class="card auth"><h2>Konfigurasi belum diisi</h2>' +
      '<p>Buka <code>config.js</code>, lalu isi <code>SUPABASE_URL</code> dan <code>SUPABASE_ANON_KEY</code> ' +
      'dari Supabase Dashboard (Project Settings &rarr; API).</p></div></div>';
    return;
  }
  if (DEMO && !window.DemoBackend) {
    $app.innerHTML = '<div class="auth-wrap"><div class="card auth err">File demo-backend.js tidak ditemukan.</div></div>';
    return;
  }
  if (!DEMO && !window.supabase) {
    $app.innerHTML = '<div class="auth-wrap"><div class="card auth err">Pustaka Supabase gagal dimuat. Periksa koneksi internet.</div></div>';
    return;
  }

  const sb = DEMO ? window.DemoBackend.create() : window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // Tiga elemen Capaian Pembelajaran PAUD (Kurikulum Merdeka, Fase Fondasi)
  const ELEMEN = [
    {
      key: 'agama',
      nama: 'Nilai Agama dan Budi Pekerti',
      hint: 'Ibadah dan doa, sopan santun, rasa syukur, kasih sayang pada teman dan lingkungan, kebersihan.',
    },
    {
      key: 'jati_diri',
      nama: 'Jati Diri',
      hint: 'Mengenal diri, mengelola emosi, bermain dan bekerja sama, kemandirian, motorik, kesehatan dan keselamatan.',
    },
    {
      key: 'literasi',
      nama: 'Dasar-dasar Literasi, Matematika, Sains, Teknologi, Rekayasa, dan Seni',
      hint: 'Berbahasa dan bercerita, mengenal huruf dan bilangan, rasa ingin tahu, mencoba dan membuat, berkarya seni.',
    },
  ];
  const LEVEL = [
    ['', '(opsional) pilih tingkat'],
    ['mulai', 'Mulai Berkembang'],
    ['berkembang', 'Berkembang Sesuai Harapan'],
    ['sangat', 'Sangat Berkembang'],
  ];

  const state = { user: null, profile: null, sekolah: null, periode: null, token: 0, dirty: false, tampilNonaktif: false, portal: null, pilih: 'admin', loginPeriode: null };

  // ===================================================================
  // Util: templating aman (semua nilai di-escape kecuali html`...` bersarang)
  // ===================================================================
  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const isRaw = (v) => v && typeof v === 'object' && v.__raw !== undefined;
  const unwrap = (v) => (isRaw(v) ? v.__raw : esc(v));
  function html(strings, ...vals) {
    let out = '';
    strings.forEach((s, i) => {
      out += s;
      if (i < vals.length) {
        const v = vals[i];
        out += Array.isArray(v) ? v.map(unwrap).join('') : unwrap(v);
      }
    });
    return { __raw: out };
  }
  const sel = (a, b) => (a === b ? 'selected' : '');

  function toast(msg, type = '') {
    $toast.textContent = msg;
    $toast.className = 'show ' + type;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => ($toast.className = ''), 3500);
  }

  function setBusy(root, busy) {
    root.querySelectorAll('button').forEach((b) => (b.disabled = busy));
  }

  function errMsg(err) {
    if (!err) return 'Terjadi kesalahan.';
    if (err.code === '23503') return 'Data ini masih dipakai data lain (mis. kelas masih berisi siswa).';
    if (err.code === '23505') return 'Data dengan kombinasi tersebut sudah ada.';
    if (err.code === '42501') return 'Anda tidak memiliki izin untuk tindakan ini.';
    return err.message || String(err);
  }

  function tglID(d) {
    if (!d) return '';
    const dt = new Date(String(d).slice(0, 10) + 'T00:00:00');
    return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function usiaTeks(lahir, ref) {
    if (!lahir) return '';
    const b = new Date(String(lahir).slice(0, 10) + 'T00:00:00');
    const r = ref ? new Date(String(ref).slice(0, 10) + 'T00:00:00') : new Date();
    let bulan = (r.getFullYear() - b.getFullYear()) * 12 + (r.getMonth() - b.getMonth());
    if (r.getDate() < b.getDate()) bulan -= 1;
    if (bulan < 0) return '';
    const th = Math.floor(bulan / 12);
    const bl = bulan % 12;
    return `${th} tahun ${bl} bulan`;
  }

  function defaultPeriode(kelas) {
    const now = new Date();
    const m = now.getMonth() + 1;
    const y = now.getFullYear();
    const sem = m >= 7 ? 1 : 2;
    const autoTa = m >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
    return { ta: (kelas && kelas.tahun_ajaran) || autoTa, sem };
  }

  const rhref = (kind, sid, ta, sem) =>
    ta !== undefined
      ? `#/${kind}/${sid}/${encodeURIComponent(ta)}/${sem}`
      : `#/${kind}/${sid}`;

  const isAdmin = () => !!(state.profile && state.profile.aktif && state.profile.role === 'admin');

  // ===================================================================
  // Dialog
  // ===================================================================
  function openDialog(title, body, onSubmit, submitText = 'Simpan') {
    $dlg.innerHTML = html`
      <form id="dlgForm">
        <h3>${title}</h3>
        <div class="dlg-body">${body}</div>
        <div class="dlg-actions">
          <button type="button" class="btn ghost" data-close>Batal</button>
          <button type="submit" class="btn primary">${submitText}</button>
        </div>
      </form>`.__raw;
    const form = document.getElementById('dlgForm');
    form.querySelector('[data-close]').onclick = () => $dlg.close();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      setBusy(form, true);
      try {
        await onSubmit(f);
        $dlg.close();
      } catch (err) {
        toast(errMsg(err), 'err');
      } finally {
        setBusy(form, false);
      }
    };
    $dlg.showModal();
  }

  // ===================================================================
  // Sesi & routing
  // ===================================================================
  async function loadProfile() {
    const { data, error } = await sb.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
    if (error) throw error;
    state.profile = data;
    state.sekolah = null;
    if (data && data.aktif) {
      const r = await sb.from('sekolah').select('*').eq('id', 1).maybeSingle();
      state.sekolah = r.data || null;
    }
  }

  async function setSession(session) {
    state.user = session ? session.user : null;
    state.profile = null;
    state.periode = session && state.loginPeriode ? state.loginPeriode : null;
    state.loginPeriode = null;
    if (state.user) {
      try {
        await loadProfile();
      } catch (err) {
        toast(errMsg(err), 'err');
      }
    }
    route();
  }

  async function route() {
    const my = ++state.token;
    state.dirty = false;
    document.body.classList.remove('bg-buku');
    if (!state.user) {
      document.body.removeAttribute('data-portal');
      return renderAuth(state.pilih || 'admin');
    }
    if (!state.profile) return renderSimple('Profil tidak ditemukan', 'Akun ini belum memiliki profil. Coba keluar lalu masuk kembali, atau hubungi admin.');
    if (!state.profile.aktif) return renderPending();

    // Pemisahan Admin / Guru: jenis akun harus sesuai tab yang dipilih di halaman masuk
    const peran = isAdmin() ? 'admin' : 'guru';
    if (state.portal && state.portal !== peran) {
      state.pilih = peran;
      state.portal = null;
      toast(peran === 'admin'
        ? 'Akun ini terdaftar sebagai Admin. Silakan masuk melalui tab Admin.'
        : 'Akun ini terdaftar sebagai Guru. Silakan masuk melalui tab Guru.', 'err');
      sb.auth.signOut();
      return;
    }
    state.portal = peran;
    state.pilih = peran;

    const parts = location.hash.replace(/^#\/?/, '').split('/').map((p) => decodeURIComponent(p));
    const [page, a, b, c] = parts;
    try {
      if (!page) await viewBeranda(my);
      else if (page === 'kelas') await viewKelas(my, a);
      else if (page === 'rapor') await viewRapor(my, a, b, c);
      else if (page === 'siswa') await viewSiswa(my, a, b);
      else if (page === 'riwayat') await viewSiswa(my, a, 'tahun');
      else if (page === 'cetak') await viewCetak(my, a, b, c);
      else if (page === 'admin' && isAdmin()) await viewAdmin(my);
      else location.hash = '#/';
    } catch (err) {
      if (my === state.token) renderShell(html`<div class="card err">Terjadi kesalahan: ${errMsg(err)}</div>`);
    }
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ===================================================================
  // Kerangka halaman
  // ===================================================================
  function renderShell(content) {
    const s = state.sekolah;
    document.body.dataset.portal = isAdmin() ? 'admin' : 'guru';
    $app.innerHTML = html`
      ${DEMO ? html`<div class="demo-banner no-print">Mode demo: data hanya tersimpan di peramban ini dan narasi AI disimulasikan.
        <button class="link" id="btnResetDemo">Reset data demo</button></div>` : ''}
      <header class="topbar no-print">
        <a class="brand" href="#/">${raw(logoSvg())}<span>Rapor Digital PAUD<small>${s && s.nama ? s.nama : ''}</small></span></a>
        <nav>
          <span class="role-badge">${isAdmin() ? 'Admin' : 'Guru'}</span>
          <a href="#/">Beranda</a>
          ${isAdmin() ? html`<a href="#/admin">Admin</a>` : ''}
          <button class="link" id="btnProfil" title="Ubah profil">${state.profile.nama || state.user.email}</button>
          <button class="link" id="btnKeluar">Keluar</button>
        </nav>
      </header>
      <main class="container">${content}</main>`.__raw;
    document.getElementById('btnKeluar').onclick = () => sb.auth.signOut();
    document.getElementById('btnProfil').onclick = dialogProfil;
    if (DEMO) {
      document.getElementById('btnResetDemo').onclick = () => {
        if (confirm('Kembalikan semua data demo ke kondisi awal?')) window.DemoBackend.reset();
      };
    }
  }

  function renderSimple(judul, teks) {
    $app.innerHTML = html`
      <div class="auth-wrap"><div class="card auth">
        <h2>${judul}</h2><p>${teks}</p>
        <button class="btn" id="btnKeluar2">Keluar</button>
      </div></div>`.__raw;
    document.getElementById('btnKeluar2').onclick = () => sb.auth.signOut();
  }

  function renderPending() {
    $app.innerHTML = html`
      <div class="auth-wrap"><div class="card auth">
        <h2>Menunggu persetujuan admin</h2>
        <p>Akun <strong>${state.user.email}</strong> sudah terdaftar, tetapi belum diaktifkan. Hubungi admin sekolah, lalu muat ulang halaman ini.</p>
        <div class="inline">
          <button class="btn primary" id="btnCek">Periksa lagi</button>
          <button class="btn" id="btnKeluar2">Keluar</button>
        </div>
      </div></div>`.__raw;
    document.getElementById('btnKeluar2').onclick = () => sb.auth.signOut();
    document.getElementById('btnCek').onclick = async () => {
      await loadProfile();
      route();
    };
  }

  // ===================================================================
  // Halaman masuk: tampilan Admin dan Guru dibedakan sejak awal
  // ===================================================================
  const UI = {
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    school: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>',
    teacher: '<rect x="2" y="3" width="20" height="13" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="16" x2="12" y2="21"/>',
  };
  const svgi = (n, s = 20) =>
    `<svg class="ui" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UI[n]}</svg>`;

  const logoSvg = () =>
    '<svg class="logo" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#fff" stroke="var(--a, #1b6b3a)" stroke-width="2.5"/>' +
    '<path d="M11 31c4.2-2.2 8.4-2 13 1 4.6-3 8.8-3.2 13-1V19c-4.2-2.2-8.4-2-13 1-4.6-3-8.8-3.2-13-1z" fill="var(--a, #1b6b3a)"/>' +
    '<path d="M24 20v12" stroke="#fff" stroke-width="1.6"/>' +
    '<path d="M24 17c0-4.6 3.2-7 7-7 0 4.4-2.6 7-7 7z" fill="var(--g, #c9992b)"/></svg>';

  const PORTAL = {
    admin: {
      nama: 'Administrator',
      tab: 'Admin',
      tag: 'Panel Administrator',
      h1a: 'Pusat Kendali',
      h1b: 'Rapor Digital PAUD',
      sub: 'Kelola data sekolah, kelas, wali kelas, dan hak akses pengguna dalam satu panel yang rapi dan aman.',
      lead: 'Khusus pengelola sekolah. Masuk untuk mengatur seluruh kelas, siswa, dan akun guru.',
      chips: [
        ['school', 'Data Sekolah', 'Profil lembaga dan kepala sekolah'],
        ['users', 'Kelas & Wali', 'Atur kelas dan wali kelas'],
        ['sliders', 'Hak Akses', 'Aktifkan dan kelola akun guru'],
        ['book', 'Semua Siswa', 'Buku induk seluruh kelas'],
      ],
      user: 'admin',
      lupa: 'Hubungi pengelola sistem untuk mengatur ulang kata sandi Admin.',
    },
    guru: {
      nama: 'Guru / Wali Kelas',
      tab: 'Guru',
      tag: 'Ruang Guru',
      h1a: 'Rapor Digital PAUD',
      h1b: 'yang Menyenangkan',
      sub: 'Catat perkembangan anak, susun narasi capaian, dan cetak rapor kelas Anda dengan mudah.',
      lead: 'Masuk untuk mengisi rapor dan mengelola buku induk anak di kelas yang Anda ampu.',
      chips: [
        ['file', 'Rapor Digital', 'Isi rapor tiap semester'],
        ['book', 'Buku Induk Anak', 'Biodata dan riwayat anak'],
        ['spark', 'Narasi Capaian', 'Bantuan menyusun narasi'],
        ['printer', 'Cetak Rapor', 'Siap cetak ukuran A4'],
      ],
      user: 'guru',
      lupa: 'Hubungi admin sekolah untuk mengatur ulang kata sandi Anda.',
    },
  };

  function ilustrasi() {
    const bunga = [[60, 428], [130, 444], [215, 430], [395, 438], [540, 446], [700, 440], [845, 432], [880, 448], [300, 450]]
      .map(([x, y]) => `<g transform="translate(${x} ${y})"><circle r="5" cy="-7" fill="#fff"/><circle r="5" cx="7" fill="#fff"/><circle r="5" cy="7" fill="#fff"/><circle r="5" cx="-7" fill="#fff"/><circle r="4" fill="#f2c63d"/></g>`)
      .join('');
    return `
    <svg class="hero-art" viewBox="0 0 900 460" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <circle cx="110" cy="96" r="46" fill="#fff6c9" opacity=".75"/>
      <g fill="#fff" opacity=".9"><ellipse cx="190" cy="64" rx="54" ry="15"/><ellipse cx="226" cy="52" rx="34" ry="15"/><ellipse cx="640" cy="44" rx="62" ry="16"/><ellipse cx="682" cy="31" rx="36" ry="14"/></g>
      <path d="M770 98l72-30-30 58-16-18z" fill="#fff" stroke="var(--a)" stroke-width="2" stroke-linejoin="round"/>
      <path d="M0 300C120 232 240 252 360 290c110 35 200-40 340-30 90 6 150 30 200 20V460H0z" fill="var(--h1)"/>
      <path d="M0 352c140-52 260-22 400-2s280-40 500-10V460H0z" fill="var(--h2)"/>
      <g transform="translate(470 150)">
        <rect x="20" y="90" width="260" height="140" rx="8" fill="#fbf4e2"/>
        <polygon points="0,98 150,42 300,98" fill="var(--roof)"/>
        <rect x="0" y="94" width="300" height="10" rx="4" fill="var(--roofd)"/>
        <rect x="108" y="22" width="84" height="76" rx="6" fill="#fffaf0"/>
        <polygon points="98,26 150,-8 202,26" fill="var(--roofd)"/>
        <circle cx="150" cy="52" r="15" fill="#bfe3f2" stroke="#fff" stroke-width="3"/>
        <line x1="150" y1="-8" x2="150" y2="-42" stroke="var(--deep)" stroke-width="2.5"/>
        <polygon points="150,-42 184,-31 150,-20" fill="var(--g)"/>
        <rect x="100" y="108" width="100" height="26" rx="6" fill="var(--deep)"/>
        <text x="150" y="127" text-anchor="middle" font-family="Poppins, system-ui, sans-serif" font-size="14" font-weight="700" letter-spacing="3" fill="#fff">PAUD</text>
        <g fill="#bfe3f2" stroke="#fff" stroke-width="3"><rect x="44" y="150" width="30" height="42" rx="6"/><rect x="84" y="150" width="30" height="42" rx="6"/><rect x="186" y="150" width="30" height="42" rx="6"/><rect x="226" y="150" width="30" height="42" rx="6"/></g>
        <path d="M128 230v-48a22 22 0 0 1 44 0v48z" fill="var(--deep)"/>
        <rect x="116" y="228" width="68" height="9" rx="3" fill="#e8dcc0"/>
      </g>
      <g fill="var(--tree)"><rect x="414" y="318" width="12" height="66" fill="#8a6a45"/><circle cx="420" cy="300" r="36"/><circle cx="394" cy="318" r="24"/><circle cx="446" cy="320" r="24"/>
        <rect x="809" y="318" width="12" height="66" fill="#8a6a45"/><circle cx="815" cy="300" r="36"/><circle cx="789" cy="318" r="24"/><circle cx="841" cy="320" r="24"/></g>
      <path d="M0 404c140-22 300 8 460-6s300 12 440 0V460H0z" fill="var(--h3)"/>
      <path d="M604 384h34c4 36 66 54 150 76H480c92-22 120-40 124-76z" fill="#efe3bd"/>
      ${bunga}
      <g>
        <rect x="318" y="398" width="9" height="24" rx="3" fill="#2f5d3a"/><rect x="330" y="398" width="9" height="24" rx="3" fill="#2f5d3a"/>
        <rect x="314" y="364" width="30" height="40" rx="11" fill="#fff"/>
        <circle cx="329" cy="346" r="17" fill="#f1c9a1"/>
        <path d="M312 344a17 17 0 0 1 34 0q-17-9-34 0z" fill="#2b2b2b"/>
        <rect x="362" y="400" width="9" height="22" rx="3" fill="#f1c9a1"/><rect x="374" y="400" width="9" height="22" rx="3" fill="#f1c9a1"/>
        <path d="M356 368h30l9 36h-48z" fill="#f2a65a"/>
        <circle cx="371" cy="350" r="16" fill="#f1c9a1"/>
        <path d="M354 350a17 17 0 0 1 34 0q-17-9-34 0z" fill="#3b2a22"/>
        <circle cx="357" cy="338" r="6" fill="#3b2a22"/><circle cx="385" cy="338" r="6" fill="#3b2a22"/>
        <path d="M344 380l12 2" stroke="#f1c9a1" stroke-width="6" stroke-linecap="round"/>
        <path d="M333 300l22-8 22 8v26l-22-8-22 8z" fill="#fff" stroke="var(--a)" stroke-width="2" stroke-linejoin="round"/>
        <line x1="355" y1="292" x2="355" y2="318" stroke="var(--a)" stroke-width="2"/>
      </g>
    </svg>`;
  }

  function renderAuth(portal = 'admin', mode = 'masuk') {
    let cur = portal === 'guru' ? 'guru' : 'admin';
    state.pilih = cur;
    const per = defaultPeriode();
    const y0 = Number(per.ta.slice(0, 4));
    const taOpsi = [y0 - 1, y0, y0 + 1].map((y) => `${y}/${y + 1}`);
    const daftar = mode === 'daftar';

    $app.innerHTML = `
      <div class="login" id="login" data-portal="${cur}">
        <section class="hero">
          <div class="hero-brand">${logoSvg()}<div><b>Rapor Digital</b><span>PAUD &middot; Kurikulum Merdeka</span></div></div>
          <div class="hero-text fade" id="heroText">
            <span class="hero-tag" id="heroTag"></span>
            <h1 id="heroH1"></h1>
            <p id="heroSub"></p>
          </div>
          <div class="chips fade" id="chips"></div>
          ${ilustrasi()}
        </section>

        <section class="panel">
          <div class="login-card">
            <div class="role-switch" id="roleSwitch" data-on="${cur}" role="tablist" aria-label="Pilih jenis akun">
              <span class="thumb"></span>
              <button type="button" role="tab" data-pt="admin">${svgi('shield', 18)}<span>Admin</span></button>
              <button type="button" role="tab" data-pt="guru">${svgi('teacher', 18)}<span>Guru</span></button>
            </div>
            <p class="eyebrow">Rapor Digital PAUD</p>
            <h2 id="cardTitle"></h2>
            <p class="lead" id="cardLead"></p>

            <form id="fAuth" autocomplete="on">
              ${daftar ? `<div class="ig"><span class="ig-ic">${svgi('user', 18)}</span><input name="nama" placeholder="Nama lengkap" required autocomplete="name"></div>` : ''}
              <div class="ig"><span class="ig-ic">${svgi('user', 18)}</span><input name="username" id="inUser" placeholder="${DEMO ? 'Username' : 'Email'}" required autocomplete="username" ${DEMO ? '' : 'type="email"'}></div>
              <div class="ig"><span class="ig-ic">${svgi('lock', 18)}</span><input name="password" id="inPass" type="password" placeholder="Password" required ${daftar ? 'minlength="8"' : ''} autocomplete="${daftar ? 'new-password' : 'current-password'}"><button type="button" class="ig-eye" id="btnEye" aria-label="Tampilkan password">${svgi('eye', 18)}</button></div>
              <div class="ig"><span class="ig-ic">${svgi('calendar', 18)}</span><select name="ta" aria-label="Tahun ajaran">${taOpsi.map((t) => `<option value="${t}" ${t === per.ta ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
              <div class="ig"><span class="ig-ic">${svgi('clock', 18)}</span><select name="sem" aria-label="Semester"><option value="1" ${per.sem === 1 ? 'selected' : ''}>Ganjil</option><option value="2" ${per.sem === 2 ? 'selected' : ''}>Genap</option></select></div>
              <div class="login-act">
                <button class="btn-login" id="btnMasuk">${daftar ? 'Daftar' : 'Login'}</button>
                <button type="button" class="link-btn" id="btnLupa">Lupa password?</button>
              </div>
            </form>

            ${DEMO ? `<div class="demo" id="demoBox"><span>Mode demo &middot; akun contoh: <code id="demoCred"></code></span><button type="button" class="link-btn" id="btnIsi">Isi otomatis</button></div>` : ''}
            ${!DEMO ? `<p class="switch-mode">${daftar ? 'Sudah punya akun?' : 'Belum punya akun?'} <button type="button" class="link-btn" id="btnMode">${daftar ? 'Masuk' : 'Daftar'}</button></p>
            ${daftar ? '<p class="note">Akun baru perlu diaktifkan admin sekolah. Pendaftar pertama otomatis menjadi admin.</p>' : ''}` : ''}
            <p class="note">Gunakan akun yang diberikan sekolah. Data anak bersifat rahasia dan hanya untuk keperluan pendidikan.</p>
            <p class="ver">Rapor Digital PAUD &middot; Fase Fondasi${DEMO ? ' &middot; Versi Demo' : ''}</p>
          </div>
        </section>
      </div>`;

    const q = (id) => document.getElementById(id);
    const root = q('login');
    const refade = (...els) => els.forEach((el) => { el.classList.remove('fade'); void el.offsetWidth; el.classList.add('fade'); });

    function paint(first) {
      const P = PORTAL[cur];
      state.pilih = cur;
      root.dataset.portal = cur;
      q('roleSwitch').dataset.on = cur;
      root.querySelectorAll('[data-pt]').forEach((b) => {
        const on = b.dataset.pt === cur;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      q('heroTag').textContent = P.tag;
      q('heroH1').innerHTML = `${P.h1a}<br><em>${P.h1b}</em>`;
      q('heroSub').textContent = P.sub;
      q('chips').innerHTML = P.chips
        .map(([ic, t, d]) => `<div class="chip"><span class="chip-ic">${svgi(ic, 24)}</span><b>${t}</b><small>${d}</small></div>`)
        .join('');
      q('cardTitle').innerHTML = `Masuk sebagai <b>${P.nama}</b>`;
      q('cardLead').textContent = P.lead;
      if (!daftar) q('btnMasuk').textContent = 'Login';
      if (DEMO) q('demoCred').textContent = `${P.user} / demo`;
      if (!first) refade(q('heroText'), q('chips'));
    }
    paint(true);

    root.querySelectorAll('[data-pt]').forEach((b) => {
      b.onclick = () => { cur = b.dataset.pt; paint(false); };
    });
    q('btnEye').onclick = () => {
      const p = q('inPass');
      const show = p.type === 'password';
      p.type = show ? 'text' : 'password';
      q('btnEye').innerHTML = svgi(show ? 'eyeoff' : 'eye', 18);
      q('btnEye').setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
    };
    q('btnLupa').onclick = () => toast(PORTAL[cur].lupa);
    if (DEMO) {
      q('btnIsi').onclick = () => {
        q('inUser').value = PORTAL[cur].user;
        q('inPass').value = 'demo';
        q('btnMasuk').focus();
      };
    } else {
      q('btnMode').onclick = () => renderAuth(cur, daftar ? 'masuk' : 'daftar');
    }

    const form = q('fAuth');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      state.portal = cur;
      state.loginPeriode = { ta: f.ta, sem: Number(f.sem) };
      setBusy(form, true);
      try {
        if (daftar) {
          const { data, error } = await sb.auth.signUp({
            email: f.username.trim(),
            password: f.password,
            options: { data: { nama: f.nama.trim() } },
          });
          if (error) throw error;
          if (!data.session) toast('Pendaftaran berhasil. Cek email untuk konfirmasi, lalu masuk.', 'ok');
        } else {
          const { error } = await sb.auth.signInWithPassword({ email: f.username.trim(), password: f.password });
          if (error) throw error;
        }
      } catch (err) {
        state.portal = null;
        state.loginPeriode = null;
        toast(errMsg(err), 'err');
      } finally {
        setBusy(form, false);
      }
    };
  }

  function dialogProfil() {
    const p = state.profile;
    openDialog(
      'Profil saya',
      html`
        <label>Nama lengkap (beserta gelar)<input name="nama" required value="${p.nama}"></label>
        <label style="margin-top:.8rem">NIP / NUPTK (tampil di rapor, boleh kosong)<input name="nip" value="${p.nip || ''}"></label>`,
      async (f) => {
        const { error } = await sb.rpc('update_profil_saya', { p_nama: f.nama, p_nip: f.nip });
        if (error) throw error;
        await loadProfile();
        toast('Profil diperbarui', 'ok');
        route();
      }
    );
  }

  // ===================================================================
  // Beranda: daftar kelas
  // ===================================================================
  async function getGuruMap() {
    if (isAdmin()) {
      const { data, error } = await sb.from('profiles').select('id,nama,email');
      if (error) throw error;
      return Object.fromEntries(data.map((g) => [g.id, g.nama || g.email]));
    }
    return { [state.user.id]: state.profile.nama };
  }

  async function viewBeranda(my) {
    const { data: kelas, error } = await sb.from('kelas').select('*, siswa(count)').order('nama');
    if (error) throw error;
    const guru = await getGuruMap();
    if (my !== state.token) return;

    const totalSiswa = kelas.reduce((n, k) => n + (k.siswa && k.siswa[0] ? k.siswa[0].count : 0), 0);
    const per = state.periode || defaultPeriode();

    renderShell(html`
      <section class="welcome">
        <div>
          <span class="welcome-tag">${isAdmin() ? 'Panel Administrator' : 'Ruang Guru'}</span>
          <h2>Selamat datang, ${state.profile.nama || state.user.email}</h2>
          <p>${isAdmin()
            ? 'Anda melihat seluruh kelas dan dapat mengelola data sekolah, kelas, serta akun guru.'
            : 'Anda hanya melihat kelas yang Anda ampu. Pilih kelas untuk mengisi rapor dan buku induk anak.'}</p>
        </div>
        <div class="stats">
          <div class="stat"><b>${kelas.length}</b><span>${isAdmin() ? 'Kelas' : 'Kelas saya'}</span></div>
          <div class="stat"><b>${totalSiswa}</b><span>Siswa</span></div>
          <div class="stat"><b>${per.sem === 1 ? 'Ganjil' : 'Genap'}</b><span>${per.ta}</span></div>
        </div>
      </section>
      <div class="page-head"><h2>Kelas</h2>
        ${isAdmin() ? html`<a class="btn" href="#/admin">Kelola kelas</a>` : ''}
      </div>
      ${kelas.length
        ? html`<div class="grid">${kelas.map((k) => html`
            <a class="card kelas" href="#/kelas/${k.id}">
              <h3>${k.nama}</h3>
              <div class="muted">${k.kelompok || ''}</div>
              <div class="muted small">Tahun ajaran ${k.tahun_ajaran || '-'}</div>
              <div class="muted small">Wali kelas: ${guru[k.guru_id] || '-'}</div>
              <div style="margin-top:.5rem"><strong>${k.siswa && k.siswa[0] ? k.siswa[0].count : 0}</strong> siswa</div>
            </a>`)}</div>`
        : html`<div class="card"><p>${isAdmin()
            ? 'Belum ada kelas. Buat kelas pertama di menu Admin.'
            : 'Belum ada kelas untuk Anda. Minta admin sekolah menetapkan Anda sebagai wali kelas.'}</p></div>`}
    `);
  }

  // ===================================================================
  // Halaman kelas: daftar siswa
  // ===================================================================
  async function viewKelas(my, kid) {
    const { data: kelas, error: e1 } = await sb.from('kelas').select('*').eq('id', kid).single();
    if (e1) throw e1;
    if (!state.periode) state.periode = defaultPeriode(kelas);
    const { ta, sem } = state.periode;

    const { data: siswa, error: e2 } = await sb.from('siswa').select('*').eq('kelas_id', kid).order('nama');
    if (e2) throw e2;

    let raporMap = {};
    if (siswa.length) {
      const { data: rap, error: e3 } = await sb
        .from('rapor').select('id,siswa_id,status')
        .eq('tahun_ajaran', ta).eq('semester', sem)
        .in('siswa_id', siswa.map((s) => s.id));
      if (e3) throw e3;
      raporMap = Object.fromEntries(rap.map((r) => [r.siswa_id, r]));
    }
    if (my !== state.token) return;

    const tampil = siswa.filter((s) => s.aktif || state.tampilNonaktif);
    const jmlAktif = siswa.filter((s) => s.aktif).length;
    const jmlFinal = siswa.filter((s) => s.aktif && raporMap[s.id] && raporMap[s.id].status === 'final').length;

    renderShell(html`
      <div class="crumbs"><a href="#/">Kelas</a> &rsaquo; ${kelas.nama}</div>
      <div class="page-head">
        <div><h2>${kelas.nama}</h2><div class="muted">${kelas.kelompok || ''} &middot; ${jmlAktif} siswa aktif &middot; ${jmlFinal} rapor final pada periode ini</div></div>
        <div class="actions">
          <button class="btn" id="btnImpor">Impor nama</button>
          <a class="btn primary" href="#/siswa/baru/${kelas.id}">Tambah siswa</a>
        </div>
      </div>

      <div class="card">
        <div class="inline">
          <label>Tahun ajaran<input id="ta" value="${ta}" placeholder="2026/2027"></label>
          <label>Semester<select id="sem"><option value="1" ${sel(sem, 1)}>1 (Ganjil)</option><option value="2" ${sel(sem, 2)}>2 (Genap)</option></select></label>
          <button class="btn" id="btnTerapkan">Terapkan</button>
          <label style="font-weight:400;min-width:auto"><input type="checkbox" id="chkNon" style="display:inline;width:auto;margin-right:.35rem" ${state.tampilNonaktif ? 'checked' : ''}>Tampilkan siswa nonaktif</label>
        </div>
      </div>

      <div class="card table-wrap" style="padding:0">
        ${tampil.length ? html`
        <table>
          <thead><tr><th>No</th><th>Nama</th><th>L/P</th><th>Usia</th><th>Rapor ${ta} / sem ${sem}</th><th></th></tr></thead>
          <tbody>
            ${tampil.map((s, i) => {
              const r = raporMap[s.id];
              const st = r ? r.status : 'none';
              return html`<tr>
                <td>${i + 1}</td>
                <td><a class="nama-link" href="#/siswa/${s.id}"><strong>${s.nama}</strong></a>${s.aktif ? '' : html` <span class="pill nonaktif">nonaktif</span>`}</td>
                <td>${s.jenis_kelamin || '-'}</td>
                <td>${usiaTeks(s.tanggal_lahir) || '-'}</td>
                <td><span class="pill ${st}">${st === 'none' ? 'Belum dibuat' : st === 'draft' ? 'Draf' : 'Final'}</span></td>
                <td class="actions">
                  <a class="btn small primary" href="${rhref('rapor', s.id, ta, sem)}">${r ? 'Buka rapor' : 'Isi rapor'}</a>
                  <a class="btn small" href="#/siswa/${s.id}">Biodata</a>
                </td>
              </tr>`;
            })}
          </tbody>
        </table>` : html`<p style="padding:1rem">Belum ada siswa. Klik <strong>Tambah siswa</strong> atau <strong>Impor nama</strong>.</p>`}
      </div>
    `);

    document.getElementById('btnTerapkan').onclick = () => {
      const t = document.getElementById('ta').value.trim();
      if (!/^\d{4}\/\d{4}$/.test(t)) return toast('Format tahun ajaran: 2026/2027', 'err');
      state.periode = { ta: t, sem: Number(document.getElementById('sem').value) };
      route();
    };
    document.getElementById('chkNon').onchange = (e) => {
      state.tampilNonaktif = e.target.checked;
      route();
    };
    document.getElementById('btnImpor').onclick = () => dialogImpor(kelas, route);
  }

  // ===================================================================
  // Buku Induk Anak: biodata siswa + riwayat rapor per tahun
  // ===================================================================
  const AGAMA = ['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu', 'Kepercayaan'];
  const PROVINSI = [
    'Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau', 'Kepulauan Riau', 'Jambi', 'Sumatera Selatan',
    'Kepulauan Bangka Belitung', 'Bengkulu', 'Lampung', 'DKI Jakarta', 'Jawa Barat', 'Banten', 'Jawa Tengah',
    'DI Yogyakarta', 'Jawa Timur', 'Bali', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur', 'Kalimantan Barat',
    'Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara', 'Sulawesi Utara',
    'Gorontalo', 'Sulawesi Tengah', 'Sulawesi Barat', 'Sulawesi Selatan', 'Sulawesi Tenggara', 'Maluku',
    'Maluku Utara', 'Papua', 'Papua Barat', 'Papua Barat Daya', 'Papua Selatan', 'Papua Tengah', 'Papua Pegunungan',
  ];

  const raw = (s) => ({ __raw: s });
  const IKON = {
    tambah: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    hapus: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    tutup: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    simpan: '<polyline points="20 6 9 17 4 12"/>',
    batal: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  };
  const ikon = (n) => raw(`<svg class="ikon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IKON[n]}</svg>`);

  const fotoOk = (f) => typeof f === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(f);

  function inisial(nama) {
    const p = String(nama || '?').trim().split(/\s+/).slice(0, 2);
    return p.map((x) => x.charAt(0).toUpperCase()).join('') || '?';
  }

  // Perkecil foto menjadi 300x400 JPEG agar ringan disimpan (sekitar 20-40 KB)
  function perkecilFoto(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('File harus berupa gambar.'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const W = 300;
        const H = 400;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const ctx = c.getContext('2d');
        const skala = Math.max(W / img.width, H / img.height);
        const w = img.width * skala;
        const h = img.height * skala;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(img, (W - w) / 2, (H - h) * 0.2, w, h); // condong ke bagian atas (wajah)
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Gambar tidak dapat dibaca.'));
      };
      img.src = url;
    });
  }

  async function viewSiswa(my, sid, extra) {
    const baru = sid === 'baru';
    const tab = !baru && extra === 'tahun' ? 'tahun' : 'biodata';

    const kl = await sb.from('kelas').select('id,nama,tahun_ajaran,kelompok').order('nama');
    if (kl.error) throw kl.error;
    const kelasList = kl.data;

    let siswa;
    let riwayat = [];
    if (baru) {
      const kelas = kelasList.find((k) => k.id === extra) || kelasList[0];
      if (!kelas) throw new Error('Belum ada kelas. Buat kelas terlebih dahulu.');
      siswa = { aktif: true, kelas_id: kelas.id, angkatan: kelas.tahun_ajaran || '', jenis_kota: 'Kota', kelas };
    } else {
      const [rs, rr] = await Promise.all([
        sb.from('siswa').select('*, kelas(*)').eq('id', sid).single(),
        tab === 'tahun'
          ? sb.from('rapor').select('*').eq('siswa_id', sid).order('tahun_ajaran', { ascending: false }).order('semester', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (rs.error) throw rs.error;
      if (rr.error) throw rr.error;
      siswa = rs.data;
      riwayat = rr.data;
    }
    if (my !== state.token) return;

    const kelasId = siswa.kelas_id;
    const kelasNama = (kelasList.find((k) => k.id === kelasId) || {}).nama || 'Kelas';

    const tabLink = (nama, href, aktif) =>
      aktif ? html`<span class="tab on" aria-current="page">${nama}</span>`
        : href ? html`<a class="tab" href="${href}">${nama}</a>`
          : html`<span class="tab off" title="Simpan siswa terlebih dahulu">${nama}</span>`;

    renderShell(html`
      <div class="crumbs no-print"><a href="#/kelas/${kelasId}">${kelasNama}</a> &rsaquo; ${baru ? 'Siswa baru' : siswa.nama}</div>
      <section class="buku">
        <div class="buku-banner"><h2>BUKU INDUK ANAK</h2></div>
        <div class="buku-body" id="bukuBody"></div>
      </section>`);
    document.body.classList.add('bg-buku');
    const body = document.getElementById('bukuBody');

    // ------------------------------------------------------------
    // Tab: Data per tahun
    // ------------------------------------------------------------
    if (tab === 'tahun') {
      const per = state.periode || defaultPeriode(siswa.kelas);
      body.innerHTML = html`
        <div class="page-head">
          <div><h3 style="margin:0">${siswa.nama}</h3><div class="muted small">Riwayat rapor per semester</div></div>
          <a class="btn primary" href="${rhref('rapor', siswa.id, per.ta, per.sem)}">Isi rapor ${per.ta} / sem ${per.sem}</a>
        </div>
        <div class="table-wrap bukutabel">
          ${riwayat.length ? html`
          <table>
            <thead><tr><th>Periode</th><th>Kelas</th><th>Status</th><th>BB (kg)</th><th>TB (cm)</th><th>LK (cm)</th><th>Tidak hadir</th><th></th></tr></thead>
            <tbody>${riwayat.map((r) => html`<tr>
              <td><strong>${r.tahun_ajaran}</strong> &middot; Sem ${r.semester}</td>
              <td>${r.kelas_nama || '-'}</td>
              <td><span class="pill ${r.status}">${r.status === 'final' ? 'Final' : 'Draf'}</span></td>
              <td>${r.berat_badan ?? '-'}</td><td>${r.tinggi_badan ?? '-'}</td><td>${r.lingkar_kepala ?? '-'}</td>
              <td>S ${r.sakit} &middot; I ${r.izin} &middot; A ${r.alpa}</td>
              <td class="actions">
                <a class="btn small" href="${rhref('rapor', siswa.id, r.tahun_ajaran, r.semester)}">Buka</a>
                <a class="btn small" href="${rhref('cetak', siswa.id, r.tahun_ajaran, r.semester)}">Cetak</a>
              </td></tr>`)}</tbody>
          </table>` : html`<p style="padding:1rem;margin:0">Belum ada rapor untuk siswa ini.</p>`}
        </div>
        <div class="aksi satu"><a class="btn-aksi" href="#/kelas/${kelasId}">${ikon('tutup')}<span>TUTUP</span></a></div>`.__raw;
      return;
    }

    // ------------------------------------------------------------
    // Tab: Biodata anak
    // ------------------------------------------------------------
    const salin = (s) => {
      const c = { ...s };
      delete c.kelas;
      return c;
    };
    let cur = salin(siswa);
    let editing = baru;

    const dis = () => (editing ? '' : 'disabled');
    const inp = (name, attrs = '') => raw(`<input id="f-${name}" name="${name}" value="${esc(cur[name])}" ${dis()} ${attrs}>`);
    const pilih = (name, pasangan) => raw(
      `<select id="f-${name}" name="${name}" ${dis()}><option value=""></option>` +
      pasangan.map(([v, t]) => `<option value="${esc(v)}" ${String(cur[name] ?? '') === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('') +
      '</select>'
    );
    const baris = (label, name, kontrol) => html`<div class="frow"><label for="f-${name}">${label}</label>${kontrol}</div>`;

    const fotoBox = () => html`
      <div class="foto-box">
        ${fotoOk(cur.foto)
          ? raw(`<img class="foto" src="${esc(cur.foto)}" alt="Foto ${esc(cur.panggilan || cur.nama)}">`)
          : html`<div class="foto foto-ph" aria-hidden="true">${inisial(cur.panggilan || cur.nama)}</div>`}
        ${editing ? html`<div class="foto-aksi">
          <label class="btn small">Pilih foto<input type="file" id="fFoto" accept="image/*" hidden></label>
          ${fotoOk(cur.foto) ? html`<button type="button" class="btn small danger" id="btnFotoHapus">Hapus</button>` : ''}
        </div>` : ''}
      </div>`;

    function sinkron() {
      const form = document.getElementById('fBio');
      if (!form) return;
      const f = Object.fromEntries(new FormData(form));
      Object.keys(f).forEach((k) => {
        cur[k] = k === 'aktif' ? f[k] === '1' : f[k];
      });
    }

    function render() {
      body.className = 'buku-body ' + (editing ? 'ubah' : 'lihat');
      const statusSel = `<select id="f-aktif" name="aktif" ${dis()}>` +
        `<option value="1" ${cur.aktif ? 'selected' : ''}>Aktif</option>` +
        `<option value="0" ${cur.aktif ? '' : 'selected'}>Nonaktif (lulus/pindah)</option></select>`;

      body.innerHTML = html`
        <form id="fBio" autocomplete="off" novalidate>
          <div class="buku-grid">
            <fieldset class="grup">
              <legend>DATA ANAK</legend>
              <div class="anak-top">
                ${fotoBox()}
                <div class="anak-fields">
                  ${baris('NIPD', 'nipd', inp('nipd'))}
                  ${baris('Nama', 'panggilan', inp('panggilan', 'placeholder="Nama panggilan"'))}
                  ${baris('Jenis Kel.', 'jenis_kelamin', pilih('jenis_kelamin', [['L', 'Laki-laki'], ['P', 'Perempuan']]))}
                  ${baris('Angkatan', 'angkatan', inp('angkatan', 'placeholder="2026/2027" maxlength="9"'))}
                </div>
              </div>
              ${baris('NIK / No. KTP', 'nik', inp('nik', 'inputmode="numeric" maxlength="16"'))}
              ${baris('NISN', 'nisn', inp('nisn', 'inputmode="numeric" maxlength="10"'))}
              ${baris('Nama Lengkap', 'nama', inp('nama', 'aria-required="true"'))}
              ${baris('Agama', 'agama', pilih('agama', AGAMA.map((a) => [a, a])))}
              ${baris('Tempat Lahir', 'tempat_lahir', inp('tempat_lahir'))}
              ${baris('Tanggal Lahir', 'tanggal_lahir', inp('tanggal_lahir', 'type="date"'))}
              <div class="frow"><label for="f-anak_ke">Anak Ke-</label>
                <div class="pair">${inp('anak_ke', 'inputmode="numeric" maxlength="2"')}<span>Dari</span>${inp('dari_bersaudara', 'inputmode="numeric" maxlength="2" aria-label="Dari berapa bersaudara"')}</div>
              </div>
            </fieldset>

            <div class="kolom-kanan">
              <fieldset class="grup">
                <legend>DATA ORANG TUA</legend>
                ${baris('Nama Ayah', 'nama_ayah', inp('nama_ayah'))}
                ${baris('Nama Ibu', 'nama_ibu', inp('nama_ibu'))}
                ${baris('Pekerjaan Ayah', 'pekerjaan_ayah', inp('pekerjaan_ayah'))}
                ${baris('Pekerjaan Ibu', 'pekerjaan_ibu', inp('pekerjaan_ibu'))}
                ${baris('HP Orang Tua', 'hp_ortu', inp('hp_ortu', 'type="tel" inputmode="tel" maxlength="20"'))}
              </fieldset>
              <fieldset class="grup">
                <legend>DATA TEMPAT TINGGAL</legend>
                ${baris('Alamat Rumah', 'alamat', inp('alamat'))}
                ${baris('Kecamatan', 'kecamatan', inp('kecamatan'))}
                <div class="frow">${pilih('jenis_kota', [['Kota', 'Kota'], ['Kabupaten', 'Kabupaten']])}${inp('kota', 'aria-label="Nama kota atau kabupaten"')}</div>
                ${baris('Provinsi', 'provinsi', pilih('provinsi', PROVINSI.map((p) => [p, p])))}
                ${baris('Kode Pos', 'kode_pos', inp('kode_pos', 'inputmode="numeric" maxlength="5"'))}
              </fieldset>
              <fieldset class="grup">
                <legend>DATA KELAS</legend>
                ${baris('Kelas', 'kelas_id', pilih('kelas_id', kelasList.map((k) => [k.id, k.nama])))}
                ${baris('Status', 'aktif', raw(statusSel))}
              </fieldset>
            </div>
          </div>
        </form>
        <div class="aksi ${editing ? 'dua' : ''}">
          ${editing ? html`
            <button type="button" class="btn-aksi" id="btnSimpan">${ikon('simpan')}<span>SIMPAN</span></button>
            <button type="button" class="btn-aksi" id="btnBatal">${ikon('batal')}<span>BATAL</span></button>`
            : html`
            <a class="btn-aksi" href="#/siswa/baru/${kelasId}">${ikon('tambah')}<span>TAMBAH</span></a>
            <button type="button" class="btn-aksi" id="btnEdit">${ikon('edit')}<span>EDIT</span></button>
            <button type="button" class="btn-aksi" id="btnHapus">${ikon('hapus')}<span>HAPUS</span></button>
            <a class="btn-aksi" href="#/kelas/${kelasId}">${ikon('tutup')}<span>TUTUP</span></a>`}
        </div>`.__raw;
      bind();
    }

    async function simpan() {
      sinkron();
      const t = (k) => String(cur[k] ?? '').trim();
      const nul = (k) => t(k) || null;
      const angka = (k) => (t(k) ? Number(t(k)) : null);
      const ke = angka('anak_ke');
      const dari = angka('dari_bersaudara');
      const salah = (v) => v !== null && !(Number.isInteger(v) && v > 0 && v < 100);

      if (!t('nama')) return toast('Nama lengkap wajib diisi.', 'err');
      if (!cur.kelas_id) return toast('Pilih kelas terlebih dahulu.', 'err');
      if (t('nik') && !/^\d{16}$/.test(t('nik'))) return toast('NIK harus 16 digit angka.', 'err');
      if (t('nisn') && !/^\d{10}$/.test(t('nisn'))) return toast('NISN harus 10 digit angka.', 'err');
      if (t('kode_pos') && !/^\d{5}$/.test(t('kode_pos'))) return toast('Kode pos harus 5 digit angka.', 'err');
      if (t('angkatan') && !/^\d{4}\/\d{4}$/.test(t('angkatan'))) return toast('Format angkatan: 2026/2027.', 'err');
      if (t('hp_ortu') && !/^[0-9+\-\s()]{6,20}$/.test(t('hp_ortu'))) return toast('Nomor HP hanya boleh berisi angka.', 'err');
      if (salah(ke) || salah(dari)) return toast('Anak ke- dan jumlah bersaudara harus berupa angka.', 'err');
      if (ke !== null && dari !== null && ke > dari) return toast('Anak ke- tidak boleh lebih besar dari jumlah bersaudara.', 'err');

      const row = {
        kelas_id: cur.kelas_id,
        nipd: nul('nipd'),
        nama: t('nama'),
        panggilan: nul('panggilan'),
        jenis_kelamin: cur.jenis_kelamin || null,
        angkatan: nul('angkatan'),
        nik: nul('nik'),
        nisn: nul('nisn'),
        agama: nul('agama'),
        tempat_lahir: nul('tempat_lahir'),
        tanggal_lahir: cur.tanggal_lahir || null,
        anak_ke: ke,
        dari_bersaudara: dari,
        foto: fotoOk(cur.foto) ? cur.foto : null,
        nama_ayah: nul('nama_ayah'),
        nama_ibu: nul('nama_ibu'),
        pekerjaan_ayah: nul('pekerjaan_ayah'),
        pekerjaan_ibu: nul('pekerjaan_ibu'),
        hp_ortu: nul('hp_ortu'),
        alamat: nul('alamat'),
        kecamatan: nul('kecamatan'),
        jenis_kota: nul('jenis_kota'),
        kota: nul('kota'),
        provinsi: nul('provinsi'),
        kode_pos: nul('kode_pos'),
        aktif: !!cur.aktif,
      };

      const bar = document.querySelector('.aksi');
      setBusy(bar, true);
      try {
        if (baru) {
          const { data, error } = await sb.from('siswa').insert(row).select('id').single();
          if (error) throw error;
          state.dirty = false;
          toast('Siswa ditambahkan', 'ok');
          location.hash = `#/siswa/${data.id}`;
        } else {
          const { error } = await sb.from('siswa').update(row).eq('id', siswa.id);
          if (error) throw error;
          state.dirty = false;
          toast('Biodata tersimpan', 'ok');
          await route(); // muat ulang data terbaru
        }
      } catch (err) {
        toast(errMsg(err), 'err');
        setBusy(bar, false);
      }
    }

    async function hapus() {
      const pesan = `Hapus siswa "${siswa.nama}"?\n\nSemua rapor siswa ini ikut terhapus dan tidak dapat dikembalikan. ` +
        'Jika siswa hanya pindah atau lulus, lebih aman ubah Status menjadi Nonaktif lewat tombol Edit.';
      if (!confirm(pesan)) return;
      const { error } = await sb.from('siswa').delete().eq('id', siswa.id);
      if (error) return toast(errMsg(error), 'err');
      toast('Siswa dihapus', 'ok');
      location.hash = `#/kelas/${kelasId}`;
    }

    function bind() {
      const q = (id) => document.getElementById(id);
      if (q('btnEdit')) q('btnEdit').onclick = () => { editing = true; render(); const n = q('f-nama'); if (n) n.focus(); };
      if (q('btnBatal')) {
        q('btnBatal').onclick = () => {
          if (baru) { location.hash = `#/kelas/${kelasId}`; return; }
          state.dirty = false;
          cur = salin(siswa);
          editing = false;
          render();
        };
      }
      if (q('btnSimpan')) q('btnSimpan').onclick = simpan;
      if (q('btnHapus')) q('btnHapus').onclick = hapus;
      if (q('fFoto')) {
        q('fFoto').onchange = async (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          try {
            const url = await perkecilFoto(file);
            sinkron();
            cur.foto = url;
            state.dirty = true;
            render();
          } catch (err) {
            toast(errMsg(err), 'err');
          }
        };
      }
      if (q('btnFotoHapus')) q('btnFotoHapus').onclick = () => { sinkron(); cur.foto = null; state.dirty = true; render(); };
      const form = q('fBio');
      form.addEventListener('input', () => { if (editing) state.dirty = true; });
      form.addEventListener('submit', (e) => { e.preventDefault(); if (editing) simpan(); });
    }

    render();
    if (baru) {
      const n = document.getElementById('f-nama');
      if (n) n.focus();
    }
  }

  function dialogImpor(kelas, after) {
    openDialog(
      'Impor daftar nama siswa',
      html`<label>Satu nama per baris<textarea name="daftar" rows="10" required></textarea></label>
           <p class="muted small">Ke kelas: ${kelas.nama}. Jenis kelamin, tanggal lahir, dan data lain dilengkapi lewat halaman Biodata (klik nama siswa).</p>`,
      async (f) => {
        const names = f.daftar.split('\n').map((x) => x.trim()).filter(Boolean);
        if (!names.length) throw new Error('Daftar masih kosong.');
        const { error } = await sb.from('siswa').insert(names.map((nama) => ({ nama, kelas_id: kelas.id })));
        if (error) throw error;
        toast(`${names.length} siswa ditambahkan`, 'ok');
        after();
      },
      'Impor'
    );
  }

  // ===================================================================
  // Editor rapor
  // ===================================================================
  async function viewRapor(my, sid, ta, semStr) {
    const sem = Number(semStr);
    if (!sid || !ta || (sem !== 1 && sem !== 2)) {
      location.hash = '#/';
      return;
    }
    const [rs, rr] = await Promise.all([
      sb.from('siswa').select('*, kelas(*)').eq('id', sid).single(),
      sb.from('rapor').select('*').eq('siswa_id', sid).eq('tahun_ajaran', ta).eq('semester', sem).maybeSingle(),
    ]);
    if (rs.error) throw rs.error;
    if (rr.error) throw rr.error;
    if (my !== state.token) return;

    const siswa = rs.data;
    const rap = rr.data;
    const peng = (rap && rap.pengamatan) || {};
    const nar = (rap && rap.narasi) || {};
    const status = rap ? rap.status : 'none';
    const tglDefault = (rap && rap.tanggal_rapor) || new Date().toISOString().slice(0, 10);

    renderShell(html`
      <div class="crumbs"><a href="#/kelas/${siswa.kelas_id}">${siswa.kelas ? siswa.kelas.nama : 'Kelas'}</a> &rsaquo; Rapor</div>
      <div class="page-head">
        <div>
          <h2>${siswa.nama}</h2>
          <div class="muted">Tahun ajaran ${ta} &middot; Semester ${sem} &middot; ${usiaTeks(siswa.tanggal_lahir, tglDefault) || 'usia belum diisi'}
            <span class="pill ${status}">${status === 'none' ? 'Belum dibuat' : status === 'draft' ? 'Draf' : 'Final'}</span></div>
        </div>
        <div class="actions"><a class="btn" href="#/siswa/${siswa.id}">Biodata</a><a class="btn" href="${rhref('riwayat', siswa.id)}">Riwayat</a></div>
      </div>

      <div class="card">
        <h3>Data umum</h3>
        <div class="form-grid cols3">
          <label>Tanggal rapor<input type="date" id="tgl" value="${tglDefault}"></label>
          <label>Berat badan (kg)<input id="bb" inputmode="decimal" value="${rap && rap.berat_badan != null ? rap.berat_badan : ''}"></label>
          <label>Tinggi badan (cm)<input id="tb" inputmode="decimal" value="${rap && rap.tinggi_badan != null ? rap.tinggi_badan : ''}"></label>
          <label>Lingkar kepala (cm)<input id="lk" inputmode="decimal" value="${rap && rap.lingkar_kepala != null ? rap.lingkar_kepala : ''}"></label>
          <label>Sakit (hari)<input type="number" min="0" id="sakit" value="${rap ? rap.sakit : 0}"></label>
          <label>Izin (hari)<input type="number" min="0" id="izin" value="${rap ? rap.izin : 0}"></label>
          <label>Tanpa keterangan (hari)<input type="number" min="0" id="alpa" value="${rap ? rap.alpa : 0}"></label>
        </div>
      </div>

      ${ELEMEN.map((el) => html`
        <div class="card elemen">
          <h3>${el.nama}</h3>
          <p class="hint">${el.hint}</p>
          <div class="row">
            <label>Tingkat capaian
              <select id="lv-${el.key}">${LEVEL.map(([v, t]) => html`<option value="${v}" ${sel(v, (peng[el.key] && peng[el.key].level) || '')}>${t}</option>`)}</select>
            </label>
            <label>Catatan pengamatan guru (kegiatan, perilaku, kemajuan yang Anda amati)
              <textarea id="cat-${el.key}" rows="4" placeholder="Contoh: Sering mengingatkan teman membaca doa sebelum makan; sudah mau berbagi mainan saat bermain balok...">${(peng[el.key] && peng[el.key].catatan) || ''}</textarea>
            </label>
          </div>
          <div class="narasi-head">
            <label for="nar-${el.key}">Narasi rapor</label>
            <button class="btn small" data-gen="${el.key}">Buat narasi dengan AI</button>
          </div>
          <textarea id="nar-${el.key}" rows="6" placeholder="Narasi akan muncul di sini dan dapat Anda sunting.">${nar[el.key] || ''}</textarea>
        </div>`)}

      <div class="card">
        <h3>Refleksi guru</h3>
        <textarea id="refleksi" rows="4" placeholder="Catatan tambahan, harapan, atau saran untuk orang tua.">${(rap && rap.refleksi_guru) || ''}</textarea>
      </div>

      <div class="savebar no-print">
        <button class="btn" id="btnAllAI">Buat semua narasi dengan AI</button>
        <button class="btn" id="btnDraft">Simpan draf</button>
        <button class="btn primary" id="btnFinal">Simpan &amp; tandai final</button>
        <button class="btn" id="btnCetak">Simpan &amp; cetak</button>
      </div>
    `);

    // ---- helpers form ----
    const val = (id) => document.getElementById(id).value;
    const num = (id) => {
      const v = val(id).trim().replace(',', '.');
      if (v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const int = (id) => Math.max(0, parseInt(val(id) || '0', 10) || 0);

    function collect() {
      const pengamatan = {};
      const narasi = {};
      ELEMEN.forEach((el) => {
        pengamatan[el.key] = { level: val('lv-' + el.key), catatan: val('cat-' + el.key).trim() };
        narasi[el.key] = val('nar-' + el.key).trim();
      });
      return {
        tgl: val('tgl'), bb: num('bb'), tb: num('tb'), lk: num('lk'),
        sakit: int('sakit'), izin: int('izin'), alpa: int('alpa'),
        pengamatan, narasi, refleksi: val('refleksi').trim(),
      };
    }

    async function simpan(statusBaru) {
      const f = collect();
      const payload = {
        siswa_id: siswa.id,
        tahun_ajaran: ta,
        semester: sem,
        kelas_nama: siswa.kelas ? siswa.kelas.nama : null,
        kelompok: siswa.kelas ? siswa.kelas.kelompok : null,
        status: statusBaru,
        tanggal_rapor: f.tgl || null,
        berat_badan: f.bb, tinggi_badan: f.tb, lingkar_kepala: f.lk,
        sakit: f.sakit, izin: f.izin, alpa: f.alpa,
        pengamatan: f.pengamatan, narasi: f.narasi, refleksi_guru: f.refleksi || null,
      };
      const { error } = await sb.from('rapor').upsert(payload, { onConflict: 'siswa_id,tahun_ajaran,semester' });
      if (error) throw error;
      state.dirty = false;
    }

    async function aksiSimpan(statusBaru, lanjut) {
      if (statusBaru === 'final') {
        const kosong = ELEMEN.filter((el) => !val('nar-' + el.key).trim());
        if (kosong.length && !confirm(`Narasi untuk ${kosong.length} elemen masih kosong. Tetap tandai final?`)) return;
      }
      const bar = document.querySelector('.savebar');
      setBusy(bar, true);
      try {
        await simpan(statusBaru);
        toast(statusBaru === 'final' ? 'Rapor ditandai final' : 'Draf tersimpan', 'ok');
        lanjut();
      } catch (err) {
        toast(errMsg(err), 'err');
      } finally {
        setBusy(bar, false);
      }
    }

    async function buatNarasi(keys) {
      const f = collect();
      const elemen = keys
        .map((k) => ({ key: k, level: f.pengamatan[k].level, catatan: f.pengamatan[k].catatan }))
        .filter((x) => x.catatan);
      if (!elemen.length) return toast('Isi catatan pengamatan terlebih dahulu.', 'err');
      if (elemen.some((x) => f.narasi[x.key]) && !confirm('Narasi yang sudah ada akan diganti. Lanjutkan?')) return;

      const panggilan = (siswa.panggilan || siswa.nama.split(' ')[0]).trim();
      const tombol = document.querySelectorAll('[data-gen], #btnAllAI');
      tombol.forEach((b) => (b.disabled = true));
      toast('AI sedang menulis narasi…');
      try {
        const { data, error } = await sb.functions.invoke('generate-narasi', {
          body: {
            panggilan,
            jenis_kelamin: siswa.jenis_kelamin,
            usia: usiaTeks(siswa.tanggal_lahir, f.tgl),
            semester: sem,
            elemen,
          },
        });
        if (error) {
          let msg = error.message;
          try {
            const j = await error.context.json();
            if (j && j.error) msg = j.error;
          } catch (_) { /* abaikan */ }
          throw new Error(msg);
        }
        if (data && data.error) throw new Error(data.error);
        const hasil = (data && data.narasi) || {};
        Object.keys(hasil).forEach((k) => {
          const el = document.getElementById('nar-' + k);
          if (el) el.value = hasil[k];
        });
        state.dirty = true;
        toast(
          DEMO
            ? 'Mode demo: narasi ini dari templat sederhana. Versi terpasang memakai Claude dan hasilnya lebih alami.'
            : 'Narasi dibuat. Periksa dan sunting bila perlu, lalu simpan.',
          'ok'
        );
      } catch (err) {
        toast(errMsg(err), 'err');
      } finally {
        tombol.forEach((b) => (b.disabled = false));
      }
    }

    document.querySelectorAll('[data-gen]').forEach((b) => (b.onclick = () => buatNarasi([b.dataset.gen])));
    document.getElementById('btnAllAI').onclick = () => buatNarasi(ELEMEN.map((e) => e.key));
    document.getElementById('btnDraft').onclick = () => aksiSimpan('draft', route);
    document.getElementById('btnFinal').onclick = () => aksiSimpan('final', route);
    document.getElementById('btnCetak').onclick = () =>
      aksiSimpan(status === 'final' ? 'final' : 'draft', () => (location.hash = rhref('cetak', siswa.id, ta, sem)));

    const container = document.querySelector('.container');
    container.addEventListener('input', () => (state.dirty = true));
  }

  // ===================================================================
  // Pratinjau & cetak
  // ===================================================================
  async function viewCetak(my, sid, ta, semStr) {
    const sem = Number(semStr);
    const [rs, rr] = await Promise.all([
      sb.from('siswa').select('*, kelas(*)').eq('id', sid).single(),
      sb.from('rapor').select('*').eq('siswa_id', sid).eq('tahun_ajaran', ta).eq('semester', sem).maybeSingle(),
    ]);
    if (rs.error) throw rs.error;
    if (rr.error) throw rr.error;
    const siswa = rs.data;
    const r = rr.data;
    if (!r) {
      if (my === state.token) renderShell(html`<div class="card"><p>Rapor untuk periode ini belum dibuat. <a href="${rhref('rapor', sid, ta, sem)}">Isi rapor</a></p></div>`);
      return;
    }
    let wali = null;
    if (siswa.kelas && siswa.kelas.guru_id) {
      const w = await sb.from('profiles').select('nama,nip').eq('id', siswa.kelas.guru_id).maybeSingle();
      wali = w.data;
    }
    if (my !== state.token) return;

    const s = state.sekolah || {};
    const nar = r.narasi || {};
    const kelasNama = r.kelas_nama || (siswa.kelas && siswa.kelas.nama) || '';
    const kelompok = r.kelompok || (siswa.kelas && siswa.kelas.kelompok) || '';

    $app.innerHTML = html`
      <div class="toolbar no-print">
        <a class="btn" href="${rhref('rapor', sid, ta, sem)}">&larr; Kembali ke editor</a>
        <div>
          ${r.status === 'draft' ? html`<span class="pill draft" style="margin-right:.5rem">Draf</span>` : ''}
          <button class="btn primary" id="btnPrint">Cetak / Simpan PDF</button>
        </div>
      </div>
      <article class="sheet">
        <div class="kop">
          <h1>${s.nama || 'Nama Sekolah'}</h1>
          ${s.npsn ? html`<p>NPSN: ${s.npsn}</p>` : ''}
          <p>${s.alamat || ''}</p>
        </div>
        <h2 class="judul">Laporan Perkembangan Anak</h2>
        <p class="sub">Kurikulum Merdeka &middot; Fase Fondasi</p>

        <table class="ident">
          <tr><td>Nama anak</td><td>:</td><td><strong>${siswa.nama}</strong></td></tr>
          <tr><td>NIPD / NISN</td><td>:</td><td>${siswa.nipd || '-'} / ${siswa.nisn || '-'}</td></tr>
          <tr><td>Kelompok / Kelas</td><td>:</td><td>${[kelompok, kelasNama].filter(Boolean).join(' / ') || '-'}</td></tr>
          <tr><td>Usia</td><td>:</td><td>${usiaTeks(siswa.tanggal_lahir, r.tanggal_rapor) || '-'}</td></tr>
          <tr><td>Tahun ajaran / Semester</td><td>:</td><td>${r.tahun_ajaran} / ${r.semester} (${r.semester === 1 ? 'Ganjil' : 'Genap'})</td></tr>
        </table>

        <h3 class="bagian">A. Capaian Perkembangan</h3>
        ${ELEMEN.map((el) => html`
          <div class="elemen-box">
            <div class="jdl">${el.nama}</div>
            <div class="isi">${nar[el.key] || '-'}</div>
          </div>`)}

        <h3 class="bagian">B. Pertumbuhan Fisik</h3>
        <table class="grid2">
          <tr><th>Berat badan</th><th>Tinggi badan</th><th>Lingkar kepala</th></tr>
          <tr><td>${r.berat_badan != null ? r.berat_badan + ' kg' : '-'}</td><td>${r.tinggi_badan != null ? r.tinggi_badan + ' cm' : '-'}</td><td>${r.lingkar_kepala != null ? r.lingkar_kepala + ' cm' : '-'}</td></tr>
        </table>

        <h3 class="bagian">C. Kehadiran</h3>
        <table class="grid2">
          <tr><th>Sakit</th><th>Izin</th><th>Tanpa keterangan</th></tr>
          <tr><td>${r.sakit} hari</td><td>${r.izin} hari</td><td>${r.alpa} hari</td></tr>
        </table>

        <h3 class="bagian">D. Refleksi Guru</h3>
        <div class="kotak">${r.refleksi_guru || ''}</div>

        <h3 class="bagian">E. Tanggapan Orang Tua / Wali</h3>
        <div class="kotak" style="min-height:26mm"></div>

        <div class="tempat">${s.kota ? s.kota + ', ' : ''}${tglID(r.tanggal_rapor)}</div>
        <div class="ttd">
          <div>Orang Tua / Wali<div class="ruang"></div><div class="nama">${siswa.nama_ibu || siswa.nama_ayah || '................................'}</div></div>
          <div>Wali Kelas<div class="ruang"></div><div class="nama">${(wali && wali.nama) || '................................'}</div>${wali && wali.nip ? html`<div>NIP. ${wali.nip}</div>` : ''}</div>
          <div>Kepala Sekolah<div class="ruang"></div><div class="nama">${s.kepala_sekolah || '................................'}</div>${s.nip_kepala ? html`<div>NIP. ${s.nip_kepala}</div>` : ''}</div>
        </div>
      </article>`.__raw;
    document.getElementById('btnPrint').onclick = () => window.print();
  }

  // ===================================================================
  // Admin
  // ===================================================================
  async function viewAdmin(my) {
    const [sk, gr, kl] = await Promise.all([
      sb.from('sekolah').select('*').eq('id', 1).single(),
      sb.from('profiles').select('*').order('created_at'),
      sb.from('kelas').select('*, siswa(count)').order('nama'),
    ]);
    for (const r of [sk, gr, kl]) if (r.error) throw r.error;
    if (my !== state.token) return;

    const s = sk.data;
    const guru = gr.data;
    const guruNama = Object.fromEntries(guru.map((g) => [g.id, g.nama || g.email]));

    renderShell(html`
      <div class="page-head"><h2>Administrasi</h2></div>

      <div class="card">
        <h3>Data sekolah</h3>
        <form id="fSekolah">
          <div class="form-grid">
            <label class="span2">Nama sekolah / lembaga<input name="nama" required value="${s.nama || ''}"></label>
            <label>NPSN<input name="npsn" value="${s.npsn || ''}"></label>
            <label>Kota (untuk tempat tanda tangan)<input name="kota" value="${s.kota || ''}"></label>
            <label class="span2">Alamat<input name="alamat" value="${s.alamat || ''}"></label>
            <label>Kepala sekolah<input name="kepala_sekolah" value="${s.kepala_sekolah || ''}"></label>
            <label>NIP kepala sekolah<input name="nip_kepala" value="${s.nip_kepala || ''}"></label>
          </div>
          <div style="margin-top:.8rem"><button class="btn primary">Simpan data sekolah</button></div>
        </form>
      </div>

      <div class="card" style="padding:0">
        <div class="page-head" style="padding:1rem 1.1rem 0"><h3>Kelas</h3><button class="btn primary small" id="btnKelasBaru">Tambah kelas</button></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Nama</th><th>Kelompok</th><th>Tahun ajaran</th><th>Wali kelas</th><th>Siswa</th><th></th></tr></thead>
          <tbody>${kl.data.length ? kl.data.map((k) => html`<tr>
            <td><strong>${k.nama}</strong></td><td>${k.kelompok || '-'}</td><td>${k.tahun_ajaran || '-'}</td>
            <td>${guruNama[k.guru_id] || '-'}</td><td>${k.siswa && k.siswa[0] ? k.siswa[0].count : 0}</td>
            <td class="actions">
              <button class="btn small" data-kedit="${k.id}">Ubah</button>
              <button class="btn small danger" data-khapus="${k.id}">Hapus</button>
            </td></tr>`) : html`<tr><td colspan="6">Belum ada kelas.</td></tr>`}</tbody>
        </table></div>
      </div>

      <div class="card" style="padding:0">
        <div style="padding:1rem 1.1rem 0"><h3>Pengguna</h3><p class="muted small">Akun baru muncul di sini dengan status nonaktif. Aktifkan agar guru dapat masuk.</p></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Nama</th><th>Email</th><th>Peran</th><th>Status</th><th></th></tr></thead>
          <tbody>${guru.map((g) => {
            const diri = g.id === state.user.id;
            return html`<tr>
              <td><strong>${g.nama || '-'}</strong>${diri ? html` <span class="muted small">(Anda)</span>` : ''}</td>
              <td>${g.email}</td>
              <td>${g.role === 'admin' ? 'Admin' : 'Guru'}</td>
              <td><span class="pill ${g.aktif ? 'final' : 'nonaktif'}">${g.aktif ? 'Aktif' : 'Nonaktif'}</span></td>
              <td class="actions">
                <button class="btn small" data-aktif="${g.id}" ${diri ? 'disabled' : ''}>${g.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                <button class="btn small" data-role="${g.id}" ${diri ? 'disabled' : ''}>${g.role === 'admin' ? 'Jadikan guru' : 'Jadikan admin'}</button>
              </td></tr>`;
          })}</tbody>
        </table></div>
      </div>
    `);

    document.getElementById('fSekolah').onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const row = {};
      Object.keys(f).forEach((k) => (row[k] = f[k].trim() || null));
      row.nama = row.nama || '';
      const { error } = await sb.from('sekolah').update(row).eq('id', 1);
      if (error) return toast(errMsg(error), 'err');
      state.sekolah = { ...state.sekolah, ...row };
      toast('Data sekolah tersimpan', 'ok');
    };

    const dialogKelas = (k) => {
      const kk = k || {};
      openDialog(
        k ? 'Ubah kelas' : 'Tambah kelas',
        html`<div class="form-grid">
          <label class="span2">Nama kelas<input name="nama" required value="${kk.nama || ''}" placeholder="Kelompok B1"></label>
          <label>Kelompok / usia<input name="kelompok" value="${kk.kelompok || ''}" placeholder="Kelompok B (5-6 tahun)"></label>
          <label>Tahun ajaran<input name="tahun_ajaran" value="${kk.tahun_ajaran || defaultPeriode().ta}" pattern="\\d{4}/\\d{4}" placeholder="2026/2027"></label>
          <label class="span2">Wali kelas
            <select name="guru_id"><option value="">(belum ditetapkan)</option>
              ${guru.filter((g) => g.aktif).map((g) => html`<option value="${g.id}" ${sel(g.id, kk.guru_id)}>${g.nama || g.email}</option>`)}
            </select></label>
        </div>`,
        async (f) => {
          const row = { nama: f.nama.trim(), kelompok: f.kelompok.trim() || null, tahun_ajaran: f.tahun_ajaran.trim() || null, guru_id: f.guru_id || null };
          const { error } = await (k ? sb.from('kelas').update(row).eq('id', k.id) : sb.from('kelas').insert(row));
          if (error) throw error;
          toast('Kelas tersimpan', 'ok');
          route();
        }
      );
    };

    document.getElementById('btnKelasBaru').onclick = () => dialogKelas(null);
    document.querySelectorAll('[data-kedit]').forEach((b) => (b.onclick = () => dialogKelas(kl.data.find((k) => k.id === b.dataset.kedit))));
    document.querySelectorAll('[data-khapus]').forEach((b) => {
      b.onclick = async () => {
        const k = kl.data.find((x) => x.id === b.dataset.khapus);
        if (!confirm(`Hapus kelas "${k.nama}"? Kelas yang masih berisi siswa tidak dapat dihapus.`)) return;
        const { error } = await sb.from('kelas').delete().eq('id', k.id);
        if (error) return toast(errMsg(error), 'err');
        toast('Kelas dihapus', 'ok');
        route();
      };
    });
    document.querySelectorAll('[data-aktif]').forEach((b) => {
      b.onclick = async () => {
        const g = guru.find((x) => x.id === b.dataset.aktif);
        const { error } = await sb.from('profiles').update({ aktif: !g.aktif }).eq('id', g.id);
        if (error) return toast(errMsg(error), 'err');
        route();
      };
    });
    document.querySelectorAll('[data-role]').forEach((b) => {
      b.onclick = async () => {
        const g = guru.find((x) => x.id === b.dataset.role);
        const role = g.role === 'admin' ? 'guru' : 'admin';
        if (!confirm(`Ubah peran ${g.nama || g.email} menjadi ${role}?`)) return;
        const { error } = await sb.from('profiles').update({ role }).eq('id', g.id);
        if (error) return toast(errMsg(error), 'err');
        route();
      };
    });
  }

  // ===================================================================
  // Mulai
  // ===================================================================
  (async function boot() {
    const { data } = await sb.auth.getSession();
    await setSession(data.session);
    sb.auth.onAuthStateChange((_event, session) => {
      const uid = session ? session.user.id : null;
      if (uid !== (state.user ? state.user.id : null)) setTimeout(() => setSession(session), 0);
    });
  })();
})();
