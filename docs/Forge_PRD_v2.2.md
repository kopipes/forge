# FORGE — Mobile Coding & VPS Ops Companion
## Product Requirements Document (PRD) v2.2 — Supporting App, Fast-to-Ship, Multi-Provider

**Status:** Draft implementasi — supersedes v2.1 (koreksi: engine coding harus multi-model/multi-provider dari awal, bukan terkunci ke Claude Agent SDK — lihat Section 4.2)
**Positioning:** Ini **supporting app**, bukan produk utama. Prioritas #1 adalah cepat jadi dan bisa dipakai, bukan arsitektur sempurna.
**Primary platform:** Web + PWA (mobile-first)

---

## 1. Perubahan dari v2.0

v2.0 sudah benar soal "pakai Claude Agent SDK, jangan bikin agent sendiri". Tapi v2.0 masih menganggap Forge sebagai produk yang dibangun bertahap (5 milestone, isolasi container penuh dari awal, dsb). Berdasarkan klarifikasi Anda, dua hal berubah:

1. **Cakupan use case bertambah** — bukan cuma "coding assistant", tapi juga "VPS ops companion" (cek health, cek proses, systemd, cron).
2. **Filosofi kecepatan berubah total.** Ini alat bantu (supporting app), bukan produk yang Anda jual/andalkan sepenuhnya. Maka:
   - **Tidak perlu** isolasi container penuh di awal — VPS ini milik Anda sendiri, single-user, risikonya Anda yang tanggung sendiri. Isolasi ketat itu penting kalau multi-tenant atau untrusted user; di sini tidak.
   - **Tidak perlu** state machine rumit, review independen, benchmark, dsb.
   - Target: **bisa dipakai dalam hitungan hari**, bukan bulan. Kalau nanti terasa kurang, baru diperkuat — dan penguatan itu **boleh dikerjakan santai dari desktop**, karena versi cepatnya sudah bisa dipakai duluan.

Prinsip: **"Good enough & jalan sekarang" > "Sempurna tapi belum jadi-jadi".**

**Koreksi penting dari v2.1:** v2.1 keliru mengambil kesimpulan "pakai Claude Agent SDK" berarti Forge terkunci ke satu vendor model. Itu salah arah — requirement multi-model/multi-provider **sudah eksplisit sejak PRD v1** (provider registry, OpenAI-compatible adapter, switch model saat stuck) dan tetap berlaku. Yang benar: **loop tool-use itu sendiri (kirim pesan+tool → eksekusi → kirim hasil balik → ulangi) adalah pola standar yang mudah dibangun sendiri secara provider-agnostic** — bukan bagian riset yang mahal seperti reasoning strategy atau context-compaction canggih. Jadi Forge membangun loop tipis miliknya sendiri (mirip cara OpenCode bekerja), bukan menyewa satu SDK milik satu vendor. Lihat Section 4.2 revisi.

---

## 2. Use Case yang Harus Didukung

Ini definisi ruang lingkup dari Anda langsung — semua fitur di PRD ini harus melayani salah satu dari daftar ini:

1. **Bikin app baru dari HP** — mulai dari small/simple app untuk kebutuhan cepat, sampai app medium/full yang nanti di-refine lagi di desktop.
2. **Perbaiki error** di app yang sedang dibangun (termasuk app yang dikerjakan/dilanjutkan dari desktop) — lanjut fix dari HP.
3. **Tambah fitur-fitur kecil** ke app yang sedang berjalan/dibangun.
4. **Cek kesehatan VPS** — CPU, RAM, disk, uptime, load, dsb.
5. **Cek fungsi/proses yang jalan di VPS** — service apa saja aktif, port apa yang listen, proses mana yang jalan.
6. **Hal-hal seputar app development & operasional server** — systemd (status/restart/enable/disable service), cron (lihat/tambah/edit jadwal), log service, restart aplikasi, dsb.

Poin 1–3 = **Coding Companion** (mirip v2.0, disederhanakan). Poin 4–6 = **VPS Ops Companion** (fitur baru).

---

## 3. Visi Singkat

> Buka dari HP, pilih project atau pilih "VPS Ops", kasih instruksi biasa ("bikin script backup", "kenapa service X mati", "tambah field ini di form", "jadwalkan cron jam 2 pagi"), Forge kerjakan lewat coding-agent loop miliknya sendiri — bisa pakai Claude, GPT, Gemini, atau model lain sesuai pilihan Anda — di server yang sama tempat app-app Anda jalan, kasih lihat hasilnya, dan Anda approve/commit/deploy langsung dari situ. Kalau butuh pengerjaan lebih dalam/rapi, lanjutkan nanti dari desktop — Forge tidak menghalangi itu, karena semuanya berbasis Git yang sama.

---

## 4. Keputusan Arsitektur — Disederhanakan untuk Kecepatan

### 4.1 Platform
- Web app + PWA, mobile-first. Sama seperti v2.0.

### 4.2 Coding & Ops engine — provider-agnostic, dibangun sendiri (loop-nya, bukan reasoning-nya)

**Prinsip:** Forge membangun **agent loop tipis miliknya sendiri**, bukan menyewa satu SDK yang terikat ke satu vendor model. Ini beda dengan "membangun native coding-agent runtime" ala PRD v1 lama yang mahal — yang mahal itu reasoning strategy, risk classification, benchmark, context-compaction canggih. Loop tool-use dasarnya sendiri itu murah dan sudah jadi pola umum:

```
kirim: [system prompt + instruksi user + daftar tool yang boleh dipakai] ke model
→ model balas: teks biasa, atau permintaan panggil tool tertentu (nama tool + argumen)
→ Forge eksekusi tool itu (read_file, apply_patch, run_command, git_*, dst) di dalam workspace
→ hasil eksekusi dikirim balik ke model sebagai "tool result"
→ ulangi sampai model bilang selesai, atau verifikasi (test/build) lolos
```

Loop ini sama untuk semua provider — yang beda cuma format request/response-nya. Maka Forge butuh **lapisan adapter per-provider** supaya loop di atas jalan sama persis apapun model di baliknya:

- **Provider adapter** menerjemahkan (a) daftar tool + riwayat percakapan Forge → format request khusus provider tsb, dan (b) response provider tsb → format tool-call/teks yang dipahami loop Forge secara seragam.
- Provider yang didukung sejak V1 (semua sudah mendukung tool-calling secara native, jadi tidak butuh trik tambahan):
  - **Anthropic (Claude)** — lewat Messages API + tool use.
  - **OpenAI-compatible** (mencakup OpenAI langsung, dan banyak provider lain yang ikut format OpenAI seperti Groq, DeepSeek, xAI, dst) — satu adapter ini otomatis membuka banyak provider sekaligus.
  - **Google Gemini** — lewat Gemini API function calling.
- Provider baru = tambah satu adapter kecil, tanpa mengubah loop inti ataupun tool-tool yang sudah ada (file edit, bash, git, dsb tetap sama).

**Kenapa ini bukan "reinvent yang berat":**
- Tool-tool yang dieksekusi (baca file, apply_patch, run_command, git status/diff/commit) itu kode biasa yang Forge memang harus tulis sendiri apapun pendekatannya (SDK manapun tetap butuh Forge yang menyediakan implementasi tool untuk workspace kustom Forge).
- Yang benar-benar dihindari adalah membangun **reasoning tambahan di atas model** (strategi berpikir custom, task-contract formal, sistem skor risiko, benchmark parity) — itu tidak dibangun. Model yang dipilih (Claude/GPT/Gemini) yang melakukan reasoning-nya sendiri; Forge cuma menyediakan tool dan menjalankan loop kirim-eksekusi-kirim balik.

**Pemilihan & pergantian model:**
- Per-project (atau bahkan per-task), Anda pilih provider+model yang dipakai dari UI — mis. "pakai Claude Opus untuk refactor besar ini", "pakai GPT untuk yang cepat/murah ini", "task ini stuck, coba ganti ke model lain".
- Default model per-project bisa diset sekali, dengan opsi ganti kapan saja per-sesi.
- Tidak perlu routing otomatis berbasis AI (yang menentukan sendiri "task ini cocok model apa") di V1 — itu **manual dulu**, cukup dropdown pilih model. Auto-routing masuk Phase 2 kalau memang terasa perlu.

**Dua konteks kerja, satu loop yang sama:**
- **Project context**: tool dibatasi ke dalam satu folder project (`repo_tree`, `read_file`, `apply_patch`, `run_command` dengan `cwd` di project itu, git tools).
- **VPS Ops context**: tool yang lebih luas tapi tetap terdaftar eksplisit (`systemctl_status`, `systemctl_restart`, `journalctl_tail`, `crontab_list`, `crontab_edit`, `ps_list`, `disk_usage`, `mem_usage`, dst) — **bukan** shell bebas tanpa batas.

### 4.3 Isolasi workspace — DISEDERHANAKAN (ini yang paling berubah)
- **V1: tidak pakai container per-project.** Project-project cukup berupa folder biasa di VPS (mis. `/srv/apps/<project-name>`), yang memang sudah/akan Anda kelola di VPS yang sama.
- Alasan: container isolation penuh itu pekerjaan infrastruktur yang signifikan (image build, volume management, resource limit, lifecycle state machine) — dan untuk single-user di VPS milik sendiri, manfaat keamanannya tidak sebanding dengan waktu yang dihabiskan sebelum Forge bisa dipakai sama sekali.
- **Safety net pengganti** (murah dibangun, cukup efektif untuk kebutuhan Anda):
  - Setiap command yang dijalankan agent dicatat (project, command, waktu, exit code, output) — bisa diaudit.
  - Command dijalankan dengan `cwd` dikunci ke folder project (agent tidak boleh `cd` keluar dari situ untuk operasi file/git — untuk VPS Ops context, tool memang sengaja dikasih akses lebih luas tapi lewat daftar tool eksplisit, bukan shell bebas).
  - Daftar path terlarang (mis. `/etc`, kunci SSH, folder project lain) untuk operasi tulis dari **project context**.
  - Konfirmasi wajib sebelum operasi destruktif (`rm -rf`, `git reset --hard`, `systemctl stop` pada service kritikal, dsb) — user approve lewat tombol di HP, bukan auto-jalan.
  - Timeout & cancel di setiap command.
- **Phase 2 (opsional, kerjakan santai di desktop nanti kalau memang terasa perlu):** container/isolation per-project bisa ditambahkan kalau jumlah project bertambah banyak atau Anda mulai khawatir satu project "nyenggol" project lain. Ini upgrade, bukan syarat untuk mulai pakai Forge.

### 4.4 Git
- Tetap source of truth, tetap ada git safety (dirty check sebelum operasi berisiko, tidak auto-commit semua edit). Ini murah dibangun dan nilainya besar — dipertahankan dari v2.0.
- **Commit yang dibuat/dikirim lewat Forge harus jelas ditandai asalnya**, supaya siapapun yang melanjutkan (Anda sendiri, dari device manapun) langsung tahu commit mana yang datang dari sesi Forge dan bisa melacak/rollback dengan tenang kalau ternyata bermasalah. Konkretnya:
  - **Trailer di commit message** (baris tambahan di akhir pesan commit, format standar git, tidak mengganggu judul commit) — mis.:
    ```
    Tambah validasi form login

    Dibuat via Forge (mobile)
    Forge-Session: <id sesi/task>
    Forge-Model: <provider/model yang dipakai, mis. claude-opus>
    ```
  - Trailer ini otomatis ditambahkan Forge di setiap commit yang dibuat lewat aplikasinya — Anda tidak perlu ketik manual.
  - Dengan format ini, `git log` biasa di desktop tetap kelihatan rapi (judul commit tetap deskriptif soal perubahannya), tapi kalau perlu, Anda bisa `git log --grep "Forge-Session"` atau lihat trailer untuk tahu persis commit mana yang lewat Forge, sesi mana, dan model apa yang mengerjakannya.
  - Kalau ternyata ada error yang muncul belakangan, Anda (dari device manapun — desktop, atau Forge lagi) bisa langsung identifikasi commit Forge yang jadi biang keladinya dari trailer ini, lalu `git revert`/rollback ke commit sebelumnya dengan yakin, tanpa harus menebak-nebak dari sekian commit mana yang "buatan AI".
- **Sync check sebelum mulai kerja (wajib, arah remote→local).** Karena Anda bisa gonta-ganti kerja antara Forge (HP) dan desktop di project yang sama, sebelum agent mulai mengerjakan instruksi baru di sebuah project, Forge harus:
  1. `git fetch` ke remote.
  2. Bandingkan HEAD workspace VPS dengan HEAD remote branch yang sama.
  3. Kalau workspace ketinggalan (remote punya commit yang belum ada di workspace) — mis. karena Anda baru saja push dari desktop — Forge **berhenti dan kasih tahu** ("workspace ini ketinggalan N commit dari remote, mau pull dulu?") sebelum agent menyentuh file apapun. Tidak boleh langsung kerja di atas kode yang basi.
  4. Kalau workspace dan remote sinkron (atau workspace lebih maju / ada perubahan lokal yang belum di-push), agent boleh lanjut seperti biasa.
  - Pengecekan ini ringan (fetch + compare, bukan pull otomatis) supaya tidak menambah waktu tunggu berarti, tapi mencegah skenario paling berbahaya: kerja dari HP di atas versi lama lalu push, menimpa/konflik dengan pekerjaan yang sudah ada di desktop.

### 4.5 Data & state
- SQLite cukup untuk V1 (satu file, tidak perlu setup server database terpisah — mempercepat deploy). Upgrade ke PostgreSQL adalah opsi Phase 2 kalau nanti butuh, bukan syarat awal.
- Yang disimpan: daftar project (path + git remote), riwayat chat/task per project, riwayat command & hasilnya, status verifikasi terakhir, snapshot status VPS Ops (opsional, bisa juga live-query saja tanpa disimpan).

### 4.6 Background execution
- Task tetap jalan di server walau browser ditutup — ini kebutuhan inti Anda (kerja dari HP lalu lanjut nanti). Implementasi paling cepat: jalankan sebagai proses background biasa (child process/async task) yang statusnya di-poll dari database, tidak perlu job-queue system yang berat (Celery/BullMQ dsb) di V1 kecuali Anda sudah familiar dan itu tidak menambah waktu.
- Streaming progres ke UI pakai SSE (sederhana, satu arah, cukup untuk kebutuhan ini).

### 4.7 Deployment (dari Forge, untuk app yang Anda bangun)
- Untuk V1, "deploy" cukup berarti: jalankan command yang sudah Anda tentukan per-project (mis. `./deploy.sh`, atau `systemctl restart myapp`, atau `git pull && npm run build && pm2 restart myapp`) — dikonfigurasi sekali per-project, dieksekusi dengan satu tombol dari HP, dengan log hasil terlihat.
- Guardrail rumit ala v1 lama (target registry terenkripsi, preflight formal, rollback otomatis) **dipindah ke Phase 2**. Untuk V1, cukup: tampilkan command yang akan dijalankan, minta konfirmasi, jalankan, tampilkan hasil/log.

---

## 5. VPS Ops Companion — Fitur Baru

Ini modul terpisah dari "per-project coding", akses ke level VPS itu sendiri.

### 5.1 Health check (read-only, aman, tanpa konfirmasi)
- CPU load, RAM usage, disk usage per-partition, uptime.
- Ditampilkan sebagai ringkasan di dashboard + bisa ditanya lewat chat ("kenapa disk penuh?").

### 5.2 Proses & service
- Lihat proses aktif (`ps`), service systemd (`systemctl list-units`), status detail satu service, port yang listen.
- Aksi yang butuh konfirmasi: restart/stop/start/enable/disable service.

### 5.3 Cron
- Lihat crontab (user & sistem kalau relevan).
- Tambah/edit/hapus jadwal cron — lewat chat instruksi ("tambahkan cron backup jam 2 pagi tiap hari") — agent yang menyusun baris crontab-nya, Anda approve sebelum ditulis.

### 5.4 Log
- Tail log service tertentu (`journalctl -u <service> -n 200`) atau file log app, ditampilkan ringkas di chat/UI, bukan raw dump ribuan baris.

### 5.5 Prinsip keamanan modul ini
- Semua aksi **read** (cek status, lihat log, lihat cron) langsung jalan tanpa approval — ini yang paling sering dipakai dan risikonya nol.
- Semua aksi **write/destruktif** (restart service, edit cron, stop proses) **selalu** minta konfirmasi eksplisit lewat tombol, walau instruksinya jelas dari chat.
- Tool VPS Ops adalah **daftar tetap** yang didefinisikan Forge (bukan "jalankan command shell apapun yang diminta AI") — supaya agent tidak bisa dituntun (sengaja/tidak sengaja lewat prompt injection dari konten yang dibaca) untuk menjalankan command sembarangan di VPS produksi Anda.

---

## 6. Mode Izin (Disederhanakan dari 3 jadi 2 + 1 konteks)

- **Project — read/discuss**: baca file, git status/diff/log, baca hasil test — tanpa konfirmasi.
- **Project — edit/execute**: edit file, jalankan command, git commit/push, deploy dengan command project — **dengan** konfirmasi untuk aksi destruktif atau deploy.
- **VPS Ops**: read tanpa konfirmasi, write/destruktif dengan konfirmasi (Section 5.5).

Tidak perlu state machine ASK/CODE/DEPLOY yang formal seperti v1 lama — cukup aturan "baca = langsung, tulis/destruktif/deploy = konfirmasi" yang konsisten di semua konteks.

---

## 7. UX Mobile — Ringkas

**Prinsip desain: minimalist, ala OpenCode.** Tampilan simple, tidak ramai, tanpa dekorasi berlebihan — tapi fungsionalitas di baliknya tetap lengkap. Praktiknya:
- Palet warna netral/monokrom, aksen warna secukupnya (mis. untuk status: hijau/kuning/merah), tanpa gradient/ornamen yang tidak perlu.
- Chat & output agent ditampilkan seperti terminal/log yang rapi — teks monospace untuk code/diff/command output, bukan bubble chat yang berat.
- Layout padat-informasi tapi tidak sesak: satu layar fokus ke satu tugas (project chat, atau VPS ops), bukan dashboard penuh widget.
- Interaksi lewat keyboard-friendly & tombol aksi singkat lebih diutamakan daripada animasi/transisi yang memperlambat penggunaan cepat dari HP.
- Kalau ragu antara "tambah elemen visual" vs "biarkan polos", pilih polos — fungsionalitas dan kecepatan baca lebih penting daripada estetika dekoratif.

**Home:** dua bagian — daftar Project (card: nama, branch, status git, task terakhir) dan satu card **VPS Health** (ringkasan CPU/RAM/disk/uptime, tap untuk detail proses/service/cron/log).

**Layar Project:** chat-first, tombol aksi cepat (Review Diff, Run Checks, Commit, Push, Deploy, Stop).

**Layar VPS Ops:** chat-first juga (bisa tanya bebas), plus tab pintas: Services, Cron, Processes, Logs, Health.

---

## 8. Milestone — Fast Path

Target: **Milestone 0–2 bisa dipakai harian dalam hitungan hari**, bukan minggu/bulan. Milestone 3+ dikerjakan santai kapan pun terasa perlu (boleh dari desktop, boleh nyicil).

### Milestone 0 — Bisa Login & Lihat Project (target: 1–2 hari)
- Web app + PWA shell sederhana.
- Login (password saja cukup untuk mulai; TOTP bisa menyusul).
- SQLite + skema minimal (project, session, message, task, command_log).
- Daftar project (path folder + info git dasar).

### Milestone 1 — Coding Companion Jalan (target: 4–6 hari)
- Agent loop tipis provider-agnostic (Section 4.2): kirim-eksekusi tool-kirim balik-ulangi.
- Tool inti: `repo_tree`, `read_file`, `apply_patch`, `write_file`, `run_command`, `git_status/diff/log/commit/push` — dibatasi ke `cwd` project.
- Minimal 2 provider adapter jalan di V1 (rekomendasi: Anthropic Claude + satu adapter OpenAI-compatible, karena adapter OpenAI-compatible otomatis membuka banyak provider lain sekaligus). Gemini bisa menyusul cepat karena pola adapternya sama.
- Pemilihan model per-project/per-sesi dari UI (dropdown sederhana, manual — bukan auto-routing).
- Chat UI + streaming (SSE) + background execution (browser ditutup, kerjaan lanjut).
- Git status/diff/commit/push dari UI.
- Command log + confirmation gate untuk operasi destruktif.
- **Ini sudah memenuhi use case #1–#3 (bikin app kecil, fix error, tambah fitur) — dengan model yang bisa dipilih/ganti, tidak terkunci satu vendor.**

### Milestone 2 — VPS Ops Companion Jalan (target: 2–3 hari)
- Tool read-only: health, proses, service status, cron list, log tail.
- Tool write dengan konfirmasi: restart/start/stop/enable/disable service, edit cron.
- Dashboard VPS Health di Home.
- **Ini memenuhi use case #4–#6.**

> Di titik ini (kira-kira 1–2 minggu total, bisa lebih cepat), Forge sudah **fully usable** untuk semua 6 use case Anda. Semua milestone berikut adalah *penguatan*, bukan syarat pemakaian.

### Milestone 3 — Deploy per-Project (kapan pun siap)
- Konfigurasi command deploy per-project.
- Tombol Deploy + log hasil + konfirmasi.

### Milestone 4 — Pengerasan (opsional, santai, boleh dari desktop)
- Isolasi container per-project (kalau memang terasa perlu).
- Upgrade SQLite → PostgreSQL kalau data mulai besar/butuh concurrent access lebih baik.
- Notifikasi push saat task/deploy selesai.
- TOTP/2FA kalau belum, audit log lebih rapi, rollback otomatis untuk deploy.

---

## 9. Definition of Done — V1 (Realistis)

Forge V1 dianggap **cukup dan siap dipakai** (bukan "sempurna") ketika:

1. Anda bisa dari HP: buka project, kasih instruksi, agent kerja, browser ditutup, hasil tetap ada saat dibuka lagi.
2. Anda bisa review diff & commit/push dari HP tanpa terminal.
3. Anda bisa cek kesehatan VPS, status service, cron, dan log dari HP tanpa SSH manual.
4. Aksi destruktif (baik di project maupun VPS) selalu minta konfirmasi — tidak ada kejutan.
5. Setiap commit yang dibuat lewat Forge jelas tertandai asalnya (sesi + model yang mengerjakan) lewat trailer commit message, sehingga kalau ada error yang muncul belakangan, commit penyebabnya bisa langsung dikenali dan di-rollback dari device manapun.
6. Semua ini berjalan di atas Git yang sama dengan yang Anda pakai di desktop — jadi pekerjaan dari HP bisa dilanjut/dirapikan dari desktop kapan saja, tanpa konflik.

Tidak ada syarat container isolation, benchmark kualitas, atau auto-routing model berbasis AI di V1 — itu semua eksplisit **bukan** bagian dari "selesai". Multi-provider (pilih model manual) **adalah** bagian dari "selesai" — bukan Phase 2.

---

## 10. Non-Goals V1 (Ditegaskan Ulang)

- Container isolation per-project (→ Phase 2 opsional).
- Job queue system yang berat (Celery/BullMQ/dst) — proses background sederhana cukup.
- PostgreSQL wajib — SQLite cukup untuk mulai.
- Deployment guard formal (target registry terenkripsi, rollback otomatis, preflight kompleks) — command deploy sederhana + konfirmasi cukup.
- Reasoning/orkestrasi custom di atas model (task-contract formal, risk classification, benchmark parity, auto-routing model berbasis AI) — loop tool-use sederhana + pemilihan model manual sudah cukup untuk V1.
- Multi-user, role, kolaborasi tim.
- Full code editor di browser.

---

## 11. Guardrail Anti Salah Arah (Diperbarui)

Yang tidak boleh diubah diam-diam oleh siapapun (termasuk AI coding assistant yang membangun Forge) tanpa persetujuan Anda:

1. Coding engine adalah agent loop tipis milik Forge sendiri yang **provider-agnostic** (Section 4.2) — mendukung minimal Claude + satu adapter OpenAI-compatible sejak V1, model dipilih manual per-project/sesi. Tidak boleh diam-diam disederhanakan jadi "hardcode satu vendor" (itu justru mundur dari requirement), dan tidak boleh juga diam-diam dikembangkan jadi reasoning/orkestrasi custom yang berat (task-contract formal, risk scoring, benchmark) — itu di luar scope V1.
2. Prioritas kecepatan-jadi di atas kesempurnaan arsitektur untuk V1 (Section 4.3, 4.5, 4.6, 4.7 — semua simplifikasi ini disengaja, bukan utang teknis yang lupa dibayar).
3. Git tetap source of truth, git safety (dirty check, no silent discard) tetap ada meski hal lain disederhanakan.
4. VPS Ops tool adalah daftar tetap, bukan shell bebas — dan aksi destruktif selalu perlu konfirmasi, di project maupun VPS.
5. Isolasi container, PostgreSQL, deployment guard formal adalah **Phase 2 opsional**, bukan syarat V1 — jangan biarkan agent coding "membetulkan" ini secara prematur dan menghabiskan waktu sebelum V1 jalan.

Kalau agent coding yang membangun Forge mengusulkan menambah kompleksitas di luar yang disebutkan Milestone 0–2, tahan dulu — tanyakan apakah itu benar-benar dibutuhkan untuk salah satu dari 6 use case di Section 2, atau cuma "praktik terbaik" yang menunda Forge bisa dipakai.

**Akhir dari PRD v2.2.**
