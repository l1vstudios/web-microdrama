# DRADO AI — Director Studio

Workspace percakapan untuk skill **drado-agent** di Hermes. UI mengikuti alur Drado: ide satu kalimat → casting Auto / Custom / Campuran → master karakter, lokasi, properti dan suara → Nano Banana Pro IMAGE + Omni Flash VIDEO. Output asli Markdown dan blok prompt tetap utuh serta dapat disalin atau diekspor.

## Menjalankan

Dua terminal:

```sh
# Terminal 1, dari folder morai
npm run backend

# Terminal 2
npm install
npm run dev
```

Buka **http://127.0.0.1:5173**. Backend berjalan di **http://127.0.0.1:8788** (loopback); port 8787 tetap tersedia untuk Caveman proxy. Vite meneruskan `/api` ke backend. Instal dependensi backend dengan `cd ../morai-backend && bun install` bila diperlukan.

Dashboard wajib login. Akun sementara: username **admin**, password **admin**. Login diperiksa backend, sesi memakai cookie HttpOnly, dan tombol keluar tersedia di bagian workspace sidebar. Sesi berlaku tujuh hari secara default. Drado memakai satu akun admin dengan workspace bersama, tanpa memerlukan akun atau migrasi Postgres. Restart backend manual setelah memperbarui kode autentikasi.

Drado menggunakan Hermes lokal, skill `~/.hermes/skills/drado-agent`, provider `nous` dan model `openai/gpt-5.5` sesuai alur referensi. Autentikasi Nous menggunakan akun Hermes yang sudah terhubung. Pengaturan global Hermes tidak diubah. Pengaturan opsional di `morai-backend/.env`:

```dotenv
PORT=8788
DRADO_PROVIDER=nous
DRADO_MODEL=openai/gpt-5.5
DRADO_TIMEOUT_MS=600000
DRADO_CAVEMAN=1
# DRADO_ADMIN_USERNAME=admin
# DRADO_ADMIN_PASSWORD=admin
# DRADO_SESSION_DAYS=7
# HERMES_BIN=/absolute/path/to/hermes
# DRADO_SKILL_PATH=/absolute/path/to/drado-agent/SKILL.md
# DRADO_STORAGE_DIR=/absolute/path/to/storage/drado
# CAVEMAN_ENGINE_BIN=/absolute/path/to/caveman-engine
# DRADO_CAVEMAN_SKILL_PATH=/absolute/path/to/caveman/SKILL.md
```

Caveman aktif secara default: jawaban percakapan lebih ringkas, tanpa mengurangi kelengkapan prompt produksi. Backend juga mencoba pengemasan riwayat TOON secara lokal, memeriksa hasil dekodenya, dan menggunakan JSON asli bila hasil tidak lebih kecil atau engine gagal. Percakapan tersimpan serta request generate image/video tetap utuh. Restart backend manual untuk menerapkan perubahan. Ukuran byte yang tercatat di log bukan pengukuran token atau tagihan provider.

Panel **Gemini usage** di sidebar menampilkan jumlah generasi image/video, estimasi biaya per jenis, serta total dalam USD. Buka **Riwayat penggunaan** untuk melihat 50 generasi terbaru, model, waktu, proyek, status, biaya, dan tautan hasil. Klik nominal biaya untuk melihat token usage dan tarif yang dipakai. Estimasi memakai usage dari respons API dan [tarif Standard Google](https://ai.google.dev/gemini-api/docs/pricing), belum termasuk pajak, diskon, dan kredit akun. Riwayat tanpa usage lengkap ditandai **Belum tercatat** dan tidak dianggap gratis. Total hanya menjumlahkan generasi yang dapat dihitung; jumlah yang belum terhitung ditampilkan terpisah. Catatan biaya tetap tersimpan setelah proyek dihapus; tautan hasil proyek yang dihapus dinonaktifkan.

Untuk backend lain, atur `MORAI_API_TARGET=http://127.0.0.1:PORT` ketika menjalankan Vite. Server produksi sebaiknya meneruskan `/api` ke backend pada origin yang sama agar cookie login dan file media bekerja bersama. `VITE_API_URL` dapat dipakai untuk backend pada site yang sama; cookie menggunakan SameSite=Lax. Untuk HTTPS melalui reverse proxy, atur `DRADO_COOKIE_SECURE=1` pada backend.

## Penggunaan

- Dropdown **Lighting** di samping rasio menyediakan **Drama · Natural Cinematic Photorealistic**, **Outdoor · Cinematic Photorealistic**, **Horror · Cinematic Photorealistic**, **Fantasy · Cinematic Illustration**, **Anime · 2D Cinematic**, serta **Auto · Sesuai adegan**. Proyek baru default Drama; proyek lama mengikuti Auto. Pilihan tersimpan per proyek di backend dan berlaku pada setiap prompt/revisi berikutnya untuk Hermes maupun Gemini. IMAGE/storyboard wajib memuat `NATURAL FACIAL LIGHTING`; VIDEO memuat `FACIAL LIGHT CONTINUITY` yang sesuai sumber visual. Drama memuat skill cinematic lighting dan natural window light bila tersedia; Outdoor/Horror memakai cinematic lighting. Master karakter tetap memakai pencahayaan netral. Fantasy/Anime menerapkan `VISUAL STYLE LOCK` pada karakter, face/outfit anchor, lokasi, properti, image/storyboard, dan `STYLE CONTINUITY LOCK` pada video. Fantasy memakai ilustrasi painterly sinematik; Anime memakai desain 2D, line art dan cel shading. Kedua preset ini mengesampingkan default live-action dan tidak memuat skill lighting fotorealistik. Pergantian dari master lama menghasilkan varian bergaya baru yang perlu dibuat/disetujui sebelum I2V. Mengganti preset tidak mengubah media yang sudah dibuat.
- Dropdown **Engine** di header menyediakan pilihan terpisah **Script & prompt** serta **Image & master asset**: **ChatGPT via Hermes** atau **Gemini via API**. Pilihan proyek tersimpan di backend; pilihan terakhir juga menjadi default proyek baru di browser. Proyek lama memakai script Hermes dan image Gemini sampai diubah. Penggantian engine menunggu proses script/media selesai, dan berlaku pada generasi berikutnya.
- Script Gemini memakai API key Google di backend dengan isi skill Drado, referensi storyboard/T2V, dan Caveman sebagai instruksi. Jalurnya memakai [Gemini generateContent](https://ai.google.dev/api/generate-content), tanpa menjalankan tool Hermes. Model mengikuti `DRADO_GEMINI_SCRIPT_MODEL`, fallback `GOOGLE_TEXT_MODEL` / `GEMINI_TEXT_MODEL`. Script Hermes mengikuti provider/model Hermes yang sudah dikonfigurasi.
- Image ChatGPT memakai plugin native **openai-codex** milik Hermes dan login ChatGPT Hermes. Jika belum login, jalankan `hermes auth add openai-codex` secara manual. Tidak ada pengalihan diam-diam ke Gemini. Referensi master tetap dikirim; hasil disimpan di library yang sama dan bisa menjadi keyframe video Omni. Jika rasio hasil native berbeda, gambar dipotong dari tengah agar sesuai rasio pilihan. Biaya OAuth yang tidak dilaporkan plugin ditampilkan **Belum tercatat**; panel Gemini usage hanya menghitung jalur Gemini.
- Pencarian **Cari proyek** tampil sebagai card berbingkai di sidebar. Panel **Skill Hermes** memakai tinggi tetap, placeholder statis saat pemuatan awal, dan mempertahankan isi yang sudah dimuat ketika dibuka kembali.
- Tombol **Proyek baru** memiliki plus di kanan yang berputar halus saat hover. Tombol **Skill Hermes** di header membuka tab **Kemampuan Drado**: casting, master asset, lighting, kamera/DOF, blocking/eyeline, akting, dialog/voice, continuity, QA, prompt image/video, dan storyboard/T2V bila referensinya tersedia. Tab **Skill & referensi** menampilkan pemuatan otomatis, riwayat jawaban terakhir, referensi T2V internal, dan ketersediaan skill pendukung lighting/rack focus. Melihat daftar tidak memanggil model atau menambah skill ke request secara otomatis.
- Tulis ide cerita atau pilih salah satu contoh. `Tanya Drado` mengikuti menu casting alami skill. `Auto` langsung meminta produksi; `Custom`/`Campuran` dapat dilengkapi deskripsi karakter melalui teks bebas.
- **Storyboard** pada baris casting memakai mode Storyboard + T2V di skill Hermes `drado-agent`. Pilih jumlah episode (1–100), lalu ketik judul; cast/wardrobe dan master disusun otomatis, 80 detik per episode (8 shot × 10 detik). Hermes membuat arc seluruh seri, cliffhanger dan opening bridge antar-episode, storyboard 5 panel per clip, lalu prompt Omni T2V dengan continuity reference. Mode tersimpan di proyek dan berlaku untuk kelanjutan/retry. Referensi storyboard dimuat langsung ke Hermes (juga tersedia untuk engine script Gemini); jika file referensi hilang, request menampilkan kesalahan.
- Lanjutkan dengan jawaban casting, persetujuan master, revisi, atau permintaan shot. Setiap permintaan menyertakan seluruh riwayat proyek, tanpa memangkas prompt diam-diam.
- Permintaan **catatan produksi** diarahkan ke tabel **Shot / Aset · Aspek · Catatan produksi · Status**, termasuk lighting, kamera, blocking, dialog, continuity, dan QA sesuai kebutuhan. Klik saran **Buat catatan produksi dalam tabel** untuk mengisi permintaan. Aturan format berlaku pada kedua engine script dan jawaban berikutnya; prompt image/video tetap berupa blok prompt lengkap. Tabel catatan langsung ditampilkan meski panjang, sementara catatan teks pendukung tetap bisa dilipat.
- Prompt menggunakan nama aset Flow yang stabil. Pilih chip `@ASSET` di Flow; teks yang ditempel belum otomatis terhubung ke aset.
- Tombol salin tersedia untuk setiap blok kode dan seluruh jawaban. Menu proyek menyediakan ubah nama, ekspor Markdown, dan hapus dengan konfirmasi.
- Output produksi tampil sebagai tabel per shot dengan adegan, durasi, waktu, dan aksi prompt. Klik baris atau **Buka** untuk melihat detail, atau tombol **Prompt** pada kolom **Nano Banana Pro** / **Omni Flash** untuk membuka tab yang sesuai. Masing-masing prompt dapat disalin. Output lama dengan heading shot yang sesuai juga langsung terbaca sebagai tabel.
- Tombol **Hapus tabel** di samping **Shot produksi** menghapus seluruh shot beserta prompt dalam satu tabel setelah konfirmasi. Perubahan tersimpan di proyek dan berlaku pada ekspor serta konteks chat berikutnya. Bagian lain dari jawaban tetap tersimpan. Jika jawaban hanya berisi tabel tersebut, ditampilkan catatan bahwa tabel sudah dihapus.
- Tombol **Hapus pesan** tersedia pada pesan Anda dan jawaban Drado, termasuk pesan yang hanya berisi judul atau catatan revisi. Konfirmasi lalu pesan dihapus dari proyek, ekspor, serta konteks request berikutnya. Hasil generasi yang terhubung ke pesan tersebut ikut dihapus dari library dan tidak dapat dibuka melalui URL media; ledger biaya tetap disimpan. Penghapusan menunggu script/media selesai dan menolak pesan yang sudah berubah.
- Tab **Dialog** pada detail shot menampilkan ucapan dari prompt video per pembicara. Edit lalu **Simpan dialog** untuk mengganti ucapan pada prompt tersimpan. Salinan ucapan yang sama di shot tersebut ikut diperbarui; format prompt, identitas, dan voice lock dipertahankan. Perubahan langsung tersedia untuk salin, ekspor, library, chat selanjutnya, dan generate berikutnya. Tidak ada request model untuk menyimpan edit. Simpan setelah chat/generasi selesai; edit dengan sumber yang sudah berubah ditolak untuk mencegah penimpaan perubahan.
- Kontrol generate menyediakan rasio **9:16 / 16:9** serta resolusi video **720p / 1080p**. Pilihan tersimpan di browser per proyek, pesan, dan target aset, serta dipakai bersama antara tab image/video dan library. Master tetap mendukung rasio persegi. Video memakai keyframe yang sesuai rasio pilihan; buat gambar dengan rasio tersebut terlebih dahulu. Resolusi pilihan dikirim ke Omni dan dicatat pada hasil serta riwayat biaya.
- **Resolusi gambar** memakai **HD · 1K** untuk semua image shot/storyboard dan master asset. Pilihan lama Auto/2K dinormalisasi ke 1K pada generasi baru. Gemini dikirim `imageSize: 1K`; Hermes meminta sisi terpanjang 1024 piksel sesuai rasio pilihan. Resolusi video tetap terpisah.
- Proses berjalan di backend; berpindah proyek atau memuat ulang halaman tidak menghapus pekerjaan. Proses bisa dihentikan dan pesan gagal bisa dicoba ulang.
- Master karakter, lokasi, dan properti juga tampil dalam tabel. Buka **Prompt & generate** untuk master image / face anchor / outfit anchor.
- Parser juga menerima judul produksi berbentuk teks biasa atau bold, seperti `ASSET NAME FOR FLOW: CHAR_SARI_01`, `NANO BANANA PRO — FACE ANCHOR`, dan `S01 — ...`, tanpa mewajibkan awalan `#`. Master, anchor, dan shot tetap masuk tabel serta library pada jawaban yang sudah tersimpan. Blok prompt dan offset sumber dipertahankan untuk salin, edit dialog, dan hapus tabel; penyebutan ID di dalam prompt/referensi tidak dijadikan master baru. Prompt master tanpa fence dapat dibaca bila memiliki label master/anchor yang jelas.
- Panel kanan **Asset Library** menampilkan daftar thumbnail master karakter (termasuk face/outfit anchor), lokasi, properti, storyboard shot, dan video. Hasil terbaru muncul setelah generate; klik thumbnail untuk preview dan unduh. Tersedia pencarian serta indikator belum dibuat / generating / gagal. Library mengikuti proyek aktif.
- **Generate Image** mengikuti pilihan engine image proyek: Gemini API (`gemini-3-pro-image`, Nano Banana Pro) atau ChatGPT Image via plugin Hermes (`gpt-image-2-medium` secara default). **Generate Video** memanggil Omni Flash (`gemini-omni-1.1-flash`) melalui Interactions API dengan gambar shot sebagai start frame. Hasil tersimpan di backend, tampil di dialog, dan dapat diunduh.
- API key tetap di backend, dibaca dari `GOOGLE_AI_STUDIO_API_KEY`, `GEMINI_API_KEY`, atau `GOOGLE_API_KEY` yang sudah tersedia. Override model dengan `DRADO_IMAGE_MODEL` dan `DRADO_VIDEO_MODEL`. Tidak ada tombol yang membuka situs eksternal.
- Generate master yang dirujuk terlebih dahulu sebelum membuat image shot. Hasil master yang sesuai ID akan dikirim sebagai referensi gambar; teks `@ASSET` saja tidak dianggap sebagai file gambar.
- Script dan image memiliki pilihan engine terpisah. Video tetap memakai API Google Omni Flash.

Hasil generasi disimpan di `morai-backend/storage/drado/generated/` dan metadata pada `generated.sqlite`. Percakapan disimpan di SQLite `morai-backend/storage/drado/sessions.sqlite`, terpisah dari proyek/Postgres lama. Draf belum terkirim disimpan per proyek di browser. Proyek lama tidak dihapus atau dikonversi otomatis. Sumber UI sebelumnya tersedia di `legacy/`.

## Validasi

```sh
npm run build
npm test
cd ../morai-backend
bun run typecheck
bun test drado.test.ts
```

Mode Storyboard mengunci tiap clip tepat **10 detik / 5 panel × 2 detik**, dengan peta beat konflik, dialog terjadwal, reaksi dan continuity handoff yang sama pada storyboard dan Omni. Shot pertama setiap episode wajib **ESTABLISHING** aktif (wide/medium-wide) dengan konflik sejak awal dan dialog dimulai maksimal detik pertama. Hermes memeriksa rencana teks sebelum menjawab; ini bukan validasi hasil visual.
