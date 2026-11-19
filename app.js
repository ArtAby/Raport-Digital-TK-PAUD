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

  const state = { user: null, profile: null, sekolah: null, periode: null, token: 0, dirty: false, tampilNonaktif: false };

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
    state.periode = null;
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
    if (!state.user) return renderAuth('masuk');
    if (!state.profile) return renderSimple('Profil tidak ditemukan', 'Akun ini belum memiliki profil. Coba keluar lalu masuk kembali, atau hubungi admin.');
    if (!state.profile.aktif) return renderPending();

    const parts = location.hash.replace(/^#\/?/, '').split('/').map((p) => decodeURIComponent(p));
    const [page, a, b, c] = parts;
    try {
      if (!page) await viewBeranda(my);
      else if (page === 'kelas') await viewKelas(my, a);
      else if (page === 'rapor') await viewRapor(my, a, b, c);
      else if (page === 'riwayat') await viewRiwayat(my, a);
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
    $app.innerHTML = html`
      ${DEMO ? html`<div class="demo-banner no-print">Mode demo: data hanya tersimpan di peramban ini dan narasi AI disimulasikan.
        <button class="link" id="btnResetDemo">Reset data demo</button></div>` : ''}
      <header class="topbar no-print">
        <a class="brand" href="#/">Rapor PAUD <small>${s && s.nama ? s.nama : ''}</small></a>
        <nav>
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

  function renderAuth(mode) {
    if (DEMO) {
      $app.innerHTML = html`
        <div class="auth-wrap"><div class="card auth">
          <h1>Rapor Digital PAUD</h1>
          <p class="muted">Kurikulum Merdeka &middot; Fase Fondasi</p>
          <div class="demo-note">Ini <strong>versi demo</strong>. Tidak perlu daftar. Pilih peran di bawah untuk mencoba.
            Data contoh bersifat fiktif dan hanya tersimpan di peramban Anda.</div>
          <button class="btn primary block" data-demo="admin@demo.sch">Masuk sebagai Admin (Bu Sari)</button>
          <button class="btn block" data-demo="guru@demo.sch">Masuk sebagai Guru (Bu Dewi)</button>
          <p class="muted small" style="margin-top:1rem">Admin melihat semua kelas dan menu Admin. Guru hanya melihat kelasnya sendiri.</p>
        </div></div>`.__raw;
      document.querySelectorAll('[data-demo]').forEach((b) => {
        b.onclick = () => sb.auth.signInWithPassword({ email: b.dataset.demo, password: 'demo' });
      });
      return;
    }
    $app.innerHTML = html`
      <div class="auth-wrap"><div class="card auth">
        <h1>Rapor Digital PAUD</h1>
        <p class="muted">Kurikulum Merdeka &middot; Fase Fondasi</p>
        <div class="tabs">
          <button type="button" data-m="masuk" class="${mode === 'masuk' ? 'on' : ''}">Masuk</button>
          <button type="button" data-m="daftar" class="${mode === 'daftar' ? 'on' : ''}">Daftar</button>
        </div>
        <form id="fAuth">
          ${mode === 'daftar' ? html`<label>Nama lengkap<input name="nama" required autocomplete="name"></label>` : ''}
          <label>Email<input type="email" name="email" required autocomplete="username"></label>
          <label>Kata sandi<input type="password" name="password" required minlength="8" autocomplete="${mode === 'daftar' ? 'new-password' : 'current-password'}"></label>
          <button class="btn primary block">${mode === 'daftar' ? 'Daftar' : 'Masuk'}</button>
        </form>
        ${mode === 'daftar' ? html`<p class="muted small">Akun baru perlu diaktifkan admin sekolah. Pendaftar pertama otomatis menjadi admin.</p>` : ''}
      </div></div>`.__raw;

    document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => renderAuth(b.dataset.m)));
    const form = document.getElementById('fAuth');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      setBusy(form, true);
      try {
        if (mode === 'daftar') {
          const { data, error } = await sb.auth.signUp({
            email: f.email.trim(),
            password: f.password,
            options: { data: { nama: f.nama.trim() } },
          });
          if (error) throw error;
          if (!data.session) toast('Pendaftaran berhasil. Cek email untuk konfirmasi, lalu masuk.', 'ok');
        } else {
          const { error } = await sb.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
          if (error) throw error;
        }
      } catch (err) {
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

    renderShell(html`
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
    const { data: semuaKelas } = await sb.from('kelas').select('id,nama').order('nama');
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
          <button class="btn primary" id="btnTambah">Tambah siswa</button>
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
                <td><strong>${s.nama}</strong>${s.aktif ? '' : html` <span class="pill nonaktif">nonaktif</span>`}</td>
                <td>${s.jenis_kelamin || '-'}</td>
                <td>${usiaTeks(s.tanggal_lahir) || '-'}</td>
                <td><span class="pill ${st}">${st === 'none' ? 'Belum dibuat' : st === 'draft' ? 'Draf' : 'Final'}</span></td>
                <td class="actions">
                  <a class="btn small primary" href="${rhref('rapor', s.id, ta, sem)}">${r ? 'Buka rapor' : 'Isi rapor'}</a>
                  <a class="btn small" href="${rhref('riwayat', s.id)}">Riwayat</a>
                  <button class="btn small" data-edit="${s.id}">Ubah</button>
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
    document.getElementById('btnTambah').onclick = () => dialogSiswa(semuaKelas, null, kelas.id, route);
    document.getElementById('btnImpor').onclick = () => dialogImpor(kelas, route);
    document.querySelectorAll('[data-edit]').forEach((b) => {
      b.onclick = () => dialogSiswa(semuaKelas, siswa.find((s) => s.id === b.dataset.edit), kelas.id, route);
    });
  }

  function dialogSiswa(kelasList, siswa, kelasDefault, after) {
    const s = siswa || { aktif: true };
    openDialog(
      siswa ? 'Ubah data siswa' : 'Tambah siswa',
      html`
        <div class="form-grid">
          <label class="span2">Nama lengkap<input name="nama" required value="${s.nama || ''}"></label>
          <label>Nama panggilan<input name="panggilan" value="${s.panggilan || ''}"></label>
          <label>Jenis kelamin
            <select name="jenis_kelamin">
              <option value="">-</option>
              <option value="L" ${sel(s.jenis_kelamin, 'L')}>Laki-laki</option>
              <option value="P" ${sel(s.jenis_kelamin, 'P')}>Perempuan</option>
            </select></label>
          <label>Tempat lahir<input name="tempat_lahir" value="${s.tempat_lahir || ''}"></label>
          <label>Tanggal lahir<input type="date" name="tanggal_lahir" value="${s.tanggal_lahir || ''}"></label>
          <label>NIS<input name="nis" value="${s.nis || ''}"></label>
          <label>NISN<input name="nisn" value="${s.nisn || ''}"></label>
          <label class="span2">Nama orang tua / wali<input name="nama_ortu" value="${s.nama_ortu || ''}"></label>
          <label class="span2">Alamat<input name="alamat" value="${s.alamat || ''}"></label>
          <label>Kelas
            <select name="kelas_id">${kelasList.map((k) => html`<option value="${k.id}" ${sel(k.id, s.kelas_id || kelasDefault)}>${k.nama}</option>`)}</select></label>
          <label>Status
            <select name="aktif"><option value="1" ${sel(s.aktif, true)}>Aktif</option><option value="0" ${sel(s.aktif, false)}>Nonaktif (lulus/pindah)</option></select></label>
        </div>`,
      async (f) => {
        const row = {
          nama: f.nama.trim(),
          panggilan: f.panggilan.trim() || null,
          jenis_kelamin: f.jenis_kelamin || null,
          tempat_lahir: f.tempat_lahir.trim() || null,
          tanggal_lahir: f.tanggal_lahir || null,
          nis: f.nis.trim() || null,
          nisn: f.nisn.trim() || null,
          nama_ortu: f.nama_ortu.trim() || null,
          alamat: f.alamat.trim() || null,
          kelas_id: f.kelas_id,
          aktif: f.aktif === '1',
        };
        const q = siswa ? sb.from('siswa').update(row).eq('id', siswa.id) : sb.from('siswa').insert(row);
        const { error } = await q;
        if (error) throw error;
        toast('Data siswa tersimpan', 'ok');
        after();
      }
    );
  }

  function dialogImpor(kelas, after) {
    openDialog(
      'Impor daftar nama siswa',
      html`<label>Satu nama per baris<textarea name="daftar" rows="10" required></textarea></label>
           <p class="muted small">Ke kelas: ${kelas.nama}. Jenis kelamin, tanggal lahir, dan data lain dilengkapi lewat tombol Ubah.</p>`,
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
        <div class="actions"><a class="btn" href="${rhref('riwayat', siswa.id)}">Riwayat</a></div>
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
  // Riwayat per siswa
  // ===================================================================
  async function viewRiwayat(my, sid) {
    const [rs, rr] = await Promise.all([
      sb.from('siswa').select('*, kelas(*)').eq('id', sid).single(),
      sb.from('rapor').select('*').eq('siswa_id', sid).order('tahun_ajaran', { ascending: false }).order('semester', { ascending: false }),
    ]);
    if (rs.error) throw rs.error;
    if (rr.error) throw rr.error;
    if (my !== state.token) return;
    const siswa = rs.data;
    const per = state.periode || defaultPeriode(siswa.kelas);

    renderShell(html`
      <div class="crumbs"><a href="#/kelas/${siswa.kelas_id}">${siswa.kelas ? siswa.kelas.nama : 'Kelas'}</a> &rsaquo; Riwayat</div>
      <div class="page-head">
        <div><h2>${siswa.nama}</h2><div class="muted">Riwayat rapor per semester</div></div>
        <a class="btn primary" href="${rhref('rapor', siswa.id, per.ta, per.sem)}">Isi rapor ${per.ta} / sem ${per.sem}</a>
      </div>
      <div class="card table-wrap" style="padding:0">
        ${rr.data.length ? html`
        <table>
          <thead><tr><th>Periode</th><th>Kelas</th><th>Status</th><th>BB (kg)</th><th>TB (cm)</th><th>LK (cm)</th><th>Hadir tidak penuh</th><th></th></tr></thead>
          <tbody>${rr.data.map((r) => html`<tr>
            <td><strong>${r.tahun_ajaran}</strong> &middot; Sem ${r.semester}</td>
            <td>${r.kelas_nama || '-'}</td>
            <td><span class="pill ${r.status}">${r.status === 'final' ? 'Final' : 'Draf'}</span></td>
            <td>${r.berat_badan ?? '-'}</td><td>${r.tinggi_badan ?? '-'}</td><td>${r.lingkar_kepala ?? '-'}</td>
            <td>S ${r.sakit} &middot; I ${r.izin} &middot; A ${r.alpa}</td>
            <td class="actions">
              <a class="btn small" href="${rhref('rapor', siswa.id, r.tahun_ajaran, r.semester)}">Buka</a>
              <a class="btn small" href="${rhref('cetak', siswa.id, r.tahun_ajaran, r.semester)}">Cetak</a>
            </td></tr>`)}</tbody>
        </table>` : html`<p style="padding:1rem">Belum ada rapor untuk siswa ini.</p>`}
      </div>`);
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
          <tr><td>NIS / NISN</td><td>:</td><td>${siswa.nis || '-'} / ${siswa.nisn || '-'}</td></tr>
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
          <div>Orang Tua / Wali<div class="ruang"></div><div class="nama">${siswa.nama_ortu || '................................'}</div></div>
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
