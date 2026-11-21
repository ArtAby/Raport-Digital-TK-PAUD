# Memasang demo di GitHub Pages

Hasil akhirnya: satu alamat seperti `https://namaakun.github.io/rapor-paud-demo/` yang bisa dibuka guru dari HP atau laptop, tanpa daftar dan tanpa instalasi.

## Langkah (sekitar 5 menit)

1. Masuk (atau daftar) di https://github.com.
2. Klik **+** di kanan atas, pilih **New repository**. Beri nama, misalnya `rapor-paud-demo`, pilih **Public**, lalu **Create repository**.
3. Di halaman repo, klik **uploading an existing file**. Ekstrak zip ini, lalu seret **semua isi folder** (`index.html`, `app.js`, `style.css`, `demo-backend.js`, `config.js`, dan `.nojekyll`) ke halaman itu. Klik **Commit changes**.
   Pastikan `index.html` berada di akar repo, bukan di dalam subfolder.
   Jika `.nojekyll` tidak ikut terunggah karena berawalan titik, tidak masalah. Demo tetap berjalan.
4. Buka **Settings → Pages**. Pada **Build and deployment**, pilih **Deploy from a branch**, branch **main**, folder **/ (root)**, lalu **Save**.
5. Tunggu 1 sampai 2 menit, segarkan halaman Pages itu, dan alamat situsnya akan muncul di bagian atas. Bagikan alamat tersebut.

## Jika pilihan branch `main` tidak muncul

- Repo masih kosong: selesaikan langkah 3 (commit file) dulu, baru buka Settings → Pages.
- Repo masih Private: ubah ke Public di **Settings → General → Danger Zone → Change visibility**.
- Nama branch bukan `main`: cek di tab **Code**, lalu pilih nama yang sama di Pages.

## Yang perlu diketahui saat mendemokan

- **Halaman login dibedakan sejak awal.** Pilih tab **Admin** atau **Guru** di kartu login (tampilan dan warna berubah). Akun demo: `admin` / `demo` dan `guru` / `demo`, atau klik **Isi otomatis**. Admin melihat semua kelas dan menu Admin; Guru hanya melihat kelasnya sendiri. Akun Admin tidak bisa masuk lewat tab Guru, begitu juga sebaliknya. Tahun ajaran dan semester yang dipilih saat login menjadi periode awal.
- **Buku Induk Anak:** klik nama siswa di daftar kelas untuk membuka halaman biodata (data anak, orang tua, tempat tinggal, foto) dengan tombol Tambah, Edit, Hapus, dan Tutup. Tab *Data per tahun* menampilkan riwayat rapor. Coba Edit lalu Pilih foto untuk menunjukkan unggah foto.
- **Data contoh fiktif** (10 siswa, 2 kelas, 2 rapor untuk Alya). Rapor Alya semester ini sudah terisi lengkap, cocok untuk ditunjukkan di layar *Cetak*.
- **Data tersimpan di peramban masing-masing.** Perubahan satu guru tidak terlihat guru lain, dan hilang jika data situs dibersihkan. Tombol **Reset data demo** di bagian atas mengembalikan ke kondisi awal.
- **Narasi "AI" di demo hanya templat sederhana**, bukan Claude. Aplikasi akan menampilkan pemberitahuan itu setiap kali tombolnya ditekan. Hasil yang sebenarnya jauh lebih alami, jadi sebaiknya sampaikan ini saat presentasi.
- **Jangan memasukkan data anak sungguhan** (nama, NIK, foto) ke demo. Demo tidak punya login atau perlindungan akun.
- Untuk mencoba tanpa GitHub, cukup klik dua kali `index.html` di komputer.
