// Backend tiruan untuk MODE DEMO.
// Meniru bagian Supabase yang dipakai app.js (auth, query tabel, rpc, fungsi AI),
// tetapi semua data hanya disimpan di peramban (localStorage). Tidak ada server.
// Narasi "AI" di mode demo dibuat dari templat sederhana, BUKAN dari Claude.
(function () {
  'use strict';

  const KEY = 'raporpaud-demo-v2';
  const SKEY = 'raporpaud-demo-session';

  const uuid = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const nowISO = () => new Date().toISOString();

  // ---------------------------------------------------------------
  // Penyimpanan (localStorage, dengan cadangan di memori)
  // ---------------------------------------------------------------
  let memSession = null;
  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* abaikan */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (_) { /* abaikan */ } }

  // ---------------------------------------------------------------
  // Data contoh
  // ---------------------------------------------------------------
  function seed() {
    const admin = uuid(), guru = uuid(), kB = uuid(), kA = uuid();
    // Semua data siswa di bawah ini fiktif (NIK, HP, dan alamat hanya contoh).
    let n = 0;
    const mk = (kelas_id, angkatan, nama, panggilan, jk, lahir, ayah, ibu, pAyah, pIbu, extra) => {
      n += 1;
      const nn = String(n).padStart(2, '0');
      return {
        id: uuid(), kelas_id,
        nipd: (angkatan.slice(0, 4)) + String(n).padStart(3, '0'),
        nama, panggilan, jenis_kelamin: jk, angkatan,
        nik: '3372' + String(n).padStart(12, '0'),
        nisn: null, agama: 'Islam', tempat_lahir: 'Surakarta', tanggal_lahir: lahir,
        anak_ke: 1, dari_bersaudara: 2, foto: null,
        nama_ayah: ayah, nama_ibu: ibu, pekerjaan_ayah: pAyah, pekerjaan_ibu: pIbu,
        hp_ortu: '08120000' + nn + '00',
        alamat: 'Jl. Melati No. ' + (n + 3) + ', Kel. Contoh',
        kecamatan: 'Banjarsari', jenis_kota: 'Kota', kota: 'Surakarta', provinsi: 'Jawa Tengah', kode_pos: '57139',
        aktif: true, created_at: nowISO(), ...(extra || {}),
      };
    };
    const alya = mk(kB, '2025/2026', 'Alya Putri Rahmawati', 'Alya', 'P', '2020-09-14', 'Rahmat Hidayat, S.H.', 'Rina Wulandari, S.Pd.', 'Wiraswasta', 'Guru', { anak_ke: 2, dari_bersaudara: 3 });
    const siswa = [
      alya,
      mk(kB, '2025/2026', 'Bima Aditya Pratama', 'Bima', 'L', '2020-11-02', 'Agus Pratama', 'Sri Handayani', 'Karyawan swasta', 'Ibu rumah tangga'),
      mk(kB, '2025/2026', 'Citra Lestari', 'Citra', 'P', '2021-01-21', 'Dedi Setiawan', 'Maya Anggraini', 'Pedagang', 'Pedagang', { agama: 'Kristen' }),
      mk(kB, '2025/2026', 'Dafa Rizky Maulana', 'Dafa', 'L', '2020-07-30', 'Eko Prasetyo', 'Lilis Suryani', 'PNS', 'Perawat'),
      mk(kB, '2025/2026', 'Elok Safira Nuraini', 'Elok', 'P', '2021-03-09', 'Fajar Nugroho', 'Nur Aini', 'Petani', 'Ibu rumah tangga'),
      mk(kB, '2025/2026', 'Farel Ramadhan', 'Farel', 'L', '2020-12-18', 'Hari Wibowo', 'Yuni Astuti', 'Sopir', 'Penjahit'),
      mk(kA, '2026/2027', 'Gisel Anindya Putri', 'Gisel', 'P', '2021-10-05', 'Imam Santoso', 'Dewi Lestari', 'Dokter', 'Apoteker', { agama: 'Katolik' }),
      mk(kA, '2026/2027', 'Hanif Fadhilah', 'Hanif', 'L', '2021-08-27', 'Joko Susilo', 'Fitri Handayani', 'Wiraswasta', 'Guru'),
      mk(kA, '2026/2027', 'Ines Kirana', 'Ines', 'P', '2022-02-11', 'Kadek Arta', 'Ayu Wulandari', 'Karyawan swasta', 'Karyawan swasta', { agama: 'Hindu' }),
      mk(kA, '2026/2027', 'Jaya Saputra', 'Jaya', 'L', '2022-04-16', 'Lukman Hakim', 'Mega Puspita', 'Teknisi', 'Ibu rumah tangga'),
    ];

    const rapor = [
      {
        id: uuid(), siswa_id: alya.id, tahun_ajaran: '2025/2026', semester: 2, kelas_nama: 'Kelompok A1', kelompok: 'Kelompok A (4-5 tahun)',
        status: 'final', tanggal_rapor: '2026-06-20', berat_badan: 15.8, tinggi_badan: 104, lingkar_kepala: 50,
        sakit: 2, izin: 1, alpa: 0,
        pengamatan: {
          agama: { level: 'berkembang', catatan: 'Mulai hafal doa sebelum makan dan belajar.' },
          jati_diri: { level: 'berkembang', catatan: 'Mau berpisah dengan ibu di gerbang, mulai bermain bersama teman.' },
          literasi: { level: 'berkembang', catatan: 'Senang mendengarkan cerita, mulai mengenal huruf awal namanya.' },
        },
        narasi: {
          agama: 'Alya mulai hafal doa sebelum makan dan belajar serta mengikuti kegiatan berdoa dengan tertib. Ia sedang berlatih mengucapkan salam dan terima kasih tanpa diingatkan, dan guru terus membiasakannya setiap hari.',
          jati_diri: 'Alya sudah mau berpisah dengan ibunya di gerbang dan mulai bermain bersama teman sekelas. Ia sedang berlatih menyampaikan keinginan dengan kata-kata saat berebut mainan, dengan pendampingan guru.',
          literasi: 'Alya senang mendengarkan cerita dan mulai mengenal huruf awal namanya. Ia antusias menggambar dan mewarnai, dan akan dilatih mengenal lebih banyak huruf melalui permainan kartu.',
        },
        refleksi_guru: 'Alya anak yang ceria dan mudah beradaptasi. Terus dukung kebiasaan bercerita di rumah.',
        created_at: nowISO(), updated_at: nowISO(),
      },
      {
        id: uuid(), siswa_id: alya.id, tahun_ajaran: '2026/2027', semester: 1, kelas_nama: 'Kelompok B1', kelompok: 'Kelompok B (5-6 tahun)',
        status: 'draft', tanggal_rapor: '2026-12-18', berat_badan: 17.4, tinggi_badan: 109, lingkar_kepala: 51,
        sakit: 1, izin: 0, alpa: 0,
        pengamatan: {
          agama: { level: 'berkembang', catatan: 'Rajin berdoa, mengingatkan teman berdoa sebelum makan, mengucap salam, terima kasih, dan maaf tanpa diingatkan, berbagi bekal. Masih belajar sabar menunggu giliran.' },
          jati_diri: { level: 'berkembang', catatan: 'Percaya diri bercerita di depan kelas, memakai sepatu dan merapikan alat makan sendiri, mau bergantian main balok. Kadang perlu bantuan guru saat berbeda pendapat dengan teman.' },
          literasi: { level: 'sangat', catatan: 'Dapat menceritakan kembali cerita dengan runtut, mengenal huruf awal nama teman, menulis namanya sendiri, berhitung sampai 20, antusias percobaan air dan warna, membuat kolase dari bahan bekas.' },
        },
        narasi: {
          agama: 'Pada semester ini Alya semakin terbiasa memulai kegiatan dengan berdoa dan sering mengingatkan teman untuk membaca doa sebelum makan. Ia mengucapkan salam, terima kasih, dan maaf dengan lancar tanpa perlu diingatkan, serta mau berbagi bekal dengan teman yang membutuhkan. Alya sedang berlatih sabar menunggu giliran saat kegiatan berkelompok, dan dengan dukungan guru ia mulai dapat menenangkan diri lebih cepat. Pembiasaan ini akan terus dilanjutkan di sekolah dan dapat diperkuat di rumah lewat doa bersama keluarga.',
          jati_diri: 'Alya tampil percaya diri saat memperkenalkan diri dan menceritakan kegiatannya di depan kelas. Ia mampu memakai sepatu, merapikan alat makan, dan menyiapkan tasnya sendiri. Dalam permainan balok, Alya mau bergantian dan menyampaikan keinginannya dengan kata-kata, meski kadang masih memerlukan bantuan guru ketika berbeda pendapat dengan teman. Ke depan, Alya akan dilatih mengelola rasa kecewa melalui kegiatan bermain peran bersama teman.',
          literasi: 'Alya senang mendengarkan cerita dan dapat menceritakannya kembali dengan urutan yang cukup runtut. Ia mengenal huruf awal nama teman-temannya dan mulai menuliskan namanya sendiri. Dalam kegiatan berhitung, Alya dapat menghitung benda hingga 20. Ia antusias mencoba percobaan air dan warna serta membuat karya kolase dari bahan bekas. Orang tua dapat membantu dengan membacakan buku cerita bersama sebelum tidur.',
        },
        refleksi_guru: 'Alya berkembang sangat baik dan semakin mandiri. Terima kasih atas dukungan Ayah dan Ibu di rumah.',
        created_at: nowISO(), updated_at: nowISO(),
      },
    ];

    return {
      profiles: [
        { id: admin, nama: 'Sari Wulandari, S.Pd.', nip: '198801012015042001', email: 'admin@demo.sch', role: 'admin', aktif: true, created_at: '2026-01-01T00:00:00Z' },
        { id: guru, nama: 'Dewi Anggraini, S.Pd.', nip: null, email: 'guru@demo.sch', role: 'guru', aktif: true, created_at: '2026-01-02T00:00:00Z' },
      ],
      sekolah: [{ id: 1, nama: 'TK Harapan Bangsa (Demo)', npsn: '12345678', alamat: 'Jl. Contoh No. 1', kota: 'Surakarta', kepala_sekolah: 'Hendra Kusuma, S.Pd.', nip_kepala: '197505102000121001' }],
      kelas: [
        { id: kB, nama: 'Kelompok B1', kelompok: 'Kelompok B (5-6 tahun)', tahun_ajaran: '2026/2027', guru_id: admin, created_at: nowISO() },
        { id: kA, nama: 'Kelompok A1', kelompok: 'Kelompok A (4-5 tahun)', tahun_ajaran: '2026/2027', guru_id: guru, created_at: nowISO() },
      ],
      siswa,
      rapor,
    };
  }

  let DB = null;
  function loadDB() {
    if (DB) return DB;
    const raw = lsGet(KEY);
    if (raw) {
      try { DB = JSON.parse(raw); } catch (_) { DB = null; }
    }
    if (!DB || !DB.profiles) { DB = seed(); saveDB(); }
    return DB;
  }
  function saveDB() { lsSet(KEY, JSON.stringify(DB)); }

  // ---------------------------------------------------------------
  // Sesi login demo
  // ---------------------------------------------------------------
  const getSessionId = () => lsGet(SKEY) || memSession;
  function setSessionId(id) { memSession = id; lsSet(SKEY, id); }
  function clearSessionId() { memSession = null; lsDel(SKEY); }
  const listeners = [];
  function sessionOf(p) { return p ? { user: { id: p.id, email: p.email } } : null; }
  function currentProfile() {
    const id = getSessionId();
    return id ? loadDB().profiles.find((p) => p.id === id) || null : null;
  }
  function notify(event) {
    const s = sessionOf(currentProfile());
    listeners.forEach((cb) => { try { cb(event, s); } catch (_) { /* abaikan */ } });
  }

  // ---------------------------------------------------------------
  // Aturan akses (meniru RLS di schema.sql)
  // ---------------------------------------------------------------
  const isAdminP = (p) => !!(p && p.aktif && p.role === 'admin');
  function canKelas(kid, me) {
    if (!me || !me.aktif) return false;
    if (isAdminP(me)) return true;
    const k = loadDB().kelas.find((x) => x.id === kid);
    return !!k && k.guru_id === me.id;
  }
  function visible(table, row, me) {
    if (!me) return false;
    switch (table) {
      case 'profiles': return row.id === me.id || isAdminP(me);
      case 'sekolah': return !!me.aktif;
      case 'kelas': return canKelas(row.id, me);
      case 'siswa': return canKelas(row.kelas_id, me);
      case 'rapor': {
        const s = loadDB().siswa.find((x) => x.id === row.siswa_id);
        return !!s && canKelas(s.kelas_id, me);
      }
      default: return false;
    }
  }
  const adminOnlyWrite = { profiles: ['update'], sekolah: ['update'], kelas: ['insert', 'update', 'delete'] };
  function canWrite(table, op, me) {
    const need = adminOnlyWrite[table];
    if (need && need.includes(op) && !isAdminP(me)) return false;
    return !!(me && me.aktif);
  }
  const denied = () => ({ data: null, error: { code: '42501', message: 'Anda tidak memiliki izin untuk tindakan ini.' } });

  // ---------------------------------------------------------------
  // Query builder meniru gaya supabase-js
  // ---------------------------------------------------------------
  function project(table, row, cols, me) {
    const db = loadDB();
    const embeds = [];
    const base = String(cols || '*').replace(/(\w+)\((\*|count)\)/g, (_, name, what) => {
      embeds.push([name, what]);
      return '';
    });
    const list = base.split(',').map((c) => c.trim()).filter(Boolean);
    let out;
    if (list.includes('*') || list.length === 0) out = clone(row);
    else { out = {}; list.forEach((c) => { out[c] = clone(row[c] === undefined ? null : row[c]); }); }
    embeds.forEach(([name, what]) => {
      if (table === 'siswa' && name === 'kelas') {
        const k = db.kelas.find((x) => x.id === row.kelas_id);
        out.kelas = k ? clone(k) : null;
      } else if (table === 'kelas' && name === 'siswa' && what === 'count') {
        out.siswa = [{ count: db.siswa.filter((s) => s.kelas_id === row.id && visible('siswa', s, me)).length }];
      }
    });
    return out;
  }

  function sortRows(rows, orders) {
    const cmp = (a, b, asc) => {
      if (a === b) return 0;
      if (a === null || a === undefined) return 1;
      if (b === null || b === undefined) return -1;
      const r = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'id');
      return asc ? r : -r;
    };
    return rows.sort((x, y) => {
      for (const o of orders) {
        const r = cmp(x[o.c], y[o.c], o.asc);
        if (r !== 0) return r;
      }
      return 0;
    });
  }

  function withDefaults(table, p) {
    const row = { ...p };
    if (!row.id && table !== 'sekolah' && table !== 'profiles') row.id = uuid();
    if (!row.created_at) row.created_at = nowISO();
    if (table === 'siswa' && row.aktif === undefined) row.aktif = true;
    if (table === 'rapor') {
      if (!row.status) row.status = 'draft';
      ['sakit', 'izin', 'alpa'].forEach((k) => { if (row[k] === undefined) row[k] = 0; });
      if (!row.pengamatan) row.pengamatan = {};
      if (!row.narasi) row.narasi = {};
      row.updated_at = nowISO();
    }
    return row;
  }

  function checkInsert(table, row, me) {
    const db = loadDB();
    if (table === 'siswa') {
      if (!row.nama || !row.kelas_id) return { code: '23502', message: 'Nama dan kelas wajib diisi.' };
      if (!db.kelas.some((k) => k.id === row.kelas_id)) return { code: '23503', message: 'Kelas tidak ditemukan.' };
      if (!canKelas(row.kelas_id, me)) return { code: '42501', message: 'Anda tidak memiliki izin untuk tindakan ini.' };
    }
    if (table === 'kelas' && !row.nama) return { code: '23502', message: 'Nama kelas wajib diisi.' };
    if (table === 'rapor') {
      const s = db.siswa.find((x) => x.id === row.siswa_id);
      if (!s) return { code: '23503', message: 'Siswa tidak ditemukan.' };
      if (!canKelas(s.kelas_id, me)) return { code: '42501', message: 'Anda tidak memiliki izin untuk tindakan ini.' };
      if (db.rapor.some((r) => r.siswa_id === row.siswa_id && r.tahun_ajaran === row.tahun_ajaran && r.semester === row.semester)) {
        return { code: '23505', message: 'Rapor untuk periode ini sudah ada.' };
      }
    }
    return null;
  }

  function exec(q) {
    const db = loadDB();
    const me = currentProfile();
    const rows = db[q.table];
    if (!rows) return { data: null, error: { message: 'Tabel tidak dikenal: ' + q.table } };
    if (!me) return denied();
    const match = (r) => visible(q.table, r, me) && q.filters.every((f) => f(r));

    const finish = (list) => {
      if (q.single) {
        return list.length === 1 ? { data: list[0], error: null }
          : { data: null, error: { code: 'PGRST116', message: 'Data tidak ditemukan atau Anda tidak memiliki akses.' } };
      }
      if (q.maybe) return { data: list[0] || null, error: null };
      return { data: list, error: null };
    };
    const wantsData = q.op === 'select' || q.returning;

    if (q.op === 'select') {
      const out = sortRows(rows.filter(match), q.orders).map((r) => project(q.table, r, q.cols, me));
      return finish(out);
    }

    if (!canWrite(q.table, q.op === 'upsert' ? 'insert' : q.op, me)) return denied();

    if (q.op === 'insert') {
      const list = Array.isArray(q.payload) ? q.payload : [q.payload];
      const made = [];
      for (const p of list) {
        const row = withDefaults(q.table, p);
        const err = checkInsert(q.table, row, me);
        if (err) return { data: null, error: err };
        made.push(row);
      }
      rows.push(...made);
      saveDB();
      return wantsData ? finish(made.map(clone)) : { data: null, error: null };
    }

    if (q.op === 'update') {
      const hit = rows.filter(match);
      hit.forEach((r) => {
        Object.assign(r, q.payload);
        if (q.table === 'rapor') r.updated_at = nowISO();
      });
      saveDB();
      return wantsData ? finish(hit.map(clone)) : { data: null, error: null };
    }

    if (q.op === 'upsert') {
      const keys = String((q.opts && q.opts.onConflict) || 'id').split(',').map((k) => k.trim());
      const list = Array.isArray(q.payload) ? q.payload : [q.payload];
      const out = [];
      for (const p of list) {
        const existing = rows.find((r) => keys.every((k) => r[k] === p[k]));
        if (existing) {
          if (!visible(q.table, existing, me)) return denied();
          Object.assign(existing, p);
          if (q.table === 'rapor') existing.updated_at = nowISO();
          out.push(clone(existing));
        } else {
          const row = withDefaults(q.table, p);
          const err = checkInsert(q.table, row, me);
          if (err) return { data: null, error: err };
          rows.push(row);
          out.push(clone(row));
        }
      }
      saveDB();
      return wantsData ? finish(out) : { data: null, error: null };
    }

    if (q.op === 'delete') {
      const hit = rows.filter(match);
      if (q.table === 'kelas') {
        for (const k of hit) {
          if (db.siswa.some((s) => s.kelas_id === k.id)) {
            return { data: null, error: { code: '23503', message: 'Kelas masih berisi siswa.' } };
          }
        }
      }
      const ids = new Set(hit.map((r) => r.id));
      db[q.table] = rows.filter((r) => !ids.has(r.id));
      // meniru "on delete cascade": rapor ikut terhapus bersama siswanya
      if (q.table === 'siswa') db.rapor = db.rapor.filter((r) => !ids.has(r.siswa_id));
      saveDB();
      return { data: null, error: null };
    }

    return { data: null, error: { message: 'Operasi tidak didukung.' } };
  }

  function builder(table) {
    const q = { table, op: 'select', cols: '*', filters: [], orders: [], single: false, maybe: false, payload: null, opts: {}, returning: false };
    const api = {
      select(cols) { if (q.op === 'select') q.cols = cols || '*'; else q.returning = true; return api; },
      insert(p) { q.op = 'insert'; q.payload = p; return api; },
      update(p) { q.op = 'update'; q.payload = p; return api; },
      upsert(p, o) { q.op = 'upsert'; q.payload = p; q.opts = o || {}; return api; },
      delete() { q.op = 'delete'; return api; },
      eq(c, v) { q.filters.push((r) => r[c] === v); return api; },
      in(c, arr) { q.filters.push((r) => arr.includes(r[c])); return api; },
      order(c, o) { q.orders.push({ c, asc: !(o && o.ascending === false) }); return api; },
      single() { q.single = true; return api; },
      maybeSingle() { q.maybe = true; return api; },
      then(res, rej) { return Promise.resolve().then(() => exec(q)).then(res, rej); },
    };
    return api;
  }

  // ---------------------------------------------------------------
  // Narasi simulasi (templat sederhana, BUKAN AI)
  // ---------------------------------------------------------------
  const NAMA_ELEMEN = {
    agama: 'Nilai Agama dan Budi Pekerti',
    jati_diri: 'Jati Diri',
    literasi: 'Dasar-dasar Literasi, Matematika, Sains, Teknologi, Rekayasa, dan Seni',
  };
  const FRASE_LEVEL = {
    mulai: 'masih mulai bertumbuh dan memerlukan pendampingan',
    berkembang: 'berkembang sesuai harapan',
    sangat: 'berkembang sangat baik dan dapat menjadi contoh bagi teman',
  };
  function narasiSimulasi(body) {
    const p = String(body.panggilan || 'Ananda').trim();
    const out = {};
    (body.elemen || []).forEach((e) => {
      if (!NAMA_ELEMEN[e.key]) return;
      let cat = String(e.catatan || '').replace(/\s+/g, ' ').trim();
      if (!cat) return;
      cat = cat.charAt(0).toUpperCase() + cat.slice(1);
      if (!/[.!?]$/.test(cat)) cat += '.';
      const level = FRASE_LEVEL[e.level] || 'menunjukkan kemajuan yang baik';
      out[e.key] =
        `Pada semester ini ${p} ${level} dalam elemen ${NAMA_ELEMEN[e.key]}. ${cat} ` +
        `Guru akan terus mendampingi dan memberi kesempatan agar ${p} semakin percaya diri dan konsisten. ` +
        'Dukungan orang tua di rumah akan sangat membantu kelanjutan perkembangan ini.';
    });
    return out;
  }

  // ---------------------------------------------------------------
  // Klien tiruan
  // ---------------------------------------------------------------
  const client = {
    auth: {
      async getSession() {
        return { data: { session: sessionOf(currentProfile()) }, error: null };
      },
      onAuthStateChange(cb) {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async signInWithPassword({ email, password }) {
        const id = String(email || '').trim().toLowerCase();
        const mail = id.includes('@') ? id : id + '@demo.sch';
        const p = loadDB().profiles.find((x) => x.email === mail);
        if (!p || password !== 'demo') {
          return { data: null, error: { message: 'Username atau password salah. Pada mode demo gunakan admin / demo atau guru / demo.' } };
        }
        setSessionId(p.id);
        notify('SIGNED_IN');
        return { data: { session: sessionOf(p) }, error: null };
      },
      async signUp() {
        return { data: null, error: { message: 'Pendaftaran dinonaktifkan pada mode demo.' } };
      },
      async signOut() {
        clearSessionId();
        notify('SIGNED_OUT');
        return { error: null };
      },
    },
    from: (table) => { loadDB(); return builder(table); },
    async rpc(name, args) {
      const me = currentProfile();
      if (name === 'update_profil_saya' && me) {
        if (args.p_nama && args.p_nama.trim()) me.nama = args.p_nama.trim();
        me.nip = (args.p_nip || '').trim() || null;
        saveDB();
        return { data: null, error: null };
      }
      return { data: null, error: { message: 'Fungsi tidak dikenal.' } };
    },
    functions: {
      async invoke(name, opts) {
        if (name !== 'generate-narasi') return { data: null, error: new Error('Fungsi tidak dikenal.') };
        await new Promise((r) => setTimeout(r, 1000));
        const narasi = narasiSimulasi((opts && opts.body) || {});
        if (!Object.keys(narasi).length) return { data: { error: 'Catatan pengamatan masih kosong.' }, error: null };
        return { data: { narasi, demo: true }, error: null };
      },
    },
  };

  window.DemoBackend = {
    create() { loadDB(); return client; },
    reset() {
      lsDel(KEY);
      clearSessionId();
      DB = null;
      loadDB();
      notify('SIGNED_OUT');
    },
  };
})();
