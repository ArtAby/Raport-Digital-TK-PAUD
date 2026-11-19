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

## Yang perlu diketahui saat mendemokan

- **Tidak perlu login sungguhan.** Ada dua tombol masuk: Admin (melihat semua kelas dan menu Admin) dan Guru (hanya melihat kelasnya sendiri).
- **Data contoh fiktif** (10 siswa, 2 kelas, 2 rapor untuk Alya). Rapor Alya semester ini sudah terisi lengkap, cocok untuk ditunjukkan di layar *Cetak*.
- **Data tersimpan di peramban masing-masing.** Perubahan satu guru tidak terlihat guru lain, dan hilang jika data situs dibersihkan. Tombol **Reset data demo** di bagian atas mengembalikan ke kondisi awal.
- **Narasi "AI" di demo hanya templat sederhana**, bukan Claude. Aplikasi akan menampilkan pemberitahuan itu setiap kali tombolnya ditekan. Hasil yang sebenarnya jauh lebih alami, jadi sebaiknya sampaikan ini saat presentasi.
- **Jangan memasukkan data anak sungguhan** ke demo. Demo tidak punya login atau perlindungan akun.
- Untuk mencoba tanpa GitHub, cukup klik dua kali `index.html` di komputer.
