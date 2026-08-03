# Changelog

Format: satu entri per sesi kerja. Ditulis oleh orchestrator (Claude) untuk
handoff ke codex. Setiap entri mencatat apa yang berubah, **mengapa**, dan apa
yang belum dikerjakan.

---

## 2026-08-03 — Sesi 23: playable — M-01, M-02, M-03, M-06, T-01, T-03, T-04

**Pelaksana:** Claude, takeover penuh atas permintaan BK: bangun sampai playable
dan benar secara logic, rapikan tampilan, testplay, lalu commit.

### M-02 — angin berhenti memutuskan Round sebelum ada yang menggambar

Ini blocker terbesar dan perbaikannya mengubah desain, bukan hanya angka.

Angin dulu adalah dorongan horizontal global, jadi angin ke kanan membantu
siapa pun yang melempar ke kanan. Permainan cermin menghasilkan KO sepihak 0.0
vs 41.3 Wobble — tidak ada keterampilan yang menjawab "anginnya lagi tidak
berpihak padamu".

Sekarang angin adalah **medan radial**: meniup keluar dari pusat arena, atau
menarik ke dalam, dengan ramp `clamp(x / centreSpanX, -1, 1)` sepanjang 0.35
unit. Fungsi itu **ganjil** terhadap x, jadi mencerminkan dunia membalik
gayanya secara eksak — dan itulah yang membuat permainan cermin menghasilkan
hasil cermin. Satu medan koheren di satu dunia bersama; tidak ada fisika
per-pemain, tidak ada yang bisa desync. Pulau menarik napas masuk atau keluar.

Diverifikasi lewat properti yang lebih kuat daripada "permainan cermin" buatan
tangan: **mirror equivariance** — cerminkan seluruh dunia, tukar kursi, dan
setiap hasil harus ikut tercermin dan tertukar. Skenario ujinya sengaja timpang
(stroke berbeda, aim berbeda, kristal asimetris) supaya tidak lulus secara
trivial.

| | Sebelum | Sesudah |
|---|---|---|
| Wobble sepihak, permainan cermin | 41.3 | **0.000000** |
| Angin masih terasa? | — | spread 17.6 Wobble antar setting |

Terkunci di `shared/src/sim/windFairness.test.ts`. Probe:
`.audit/probe-wind-fairness.mjs`.

### M-01 — Turn cap

`scoring.turnCapPerRound: 20`. Round berakhir setelah 20 Turn walau tanpa KO,
Star ke pemain dengan Wobble lebih rendah; seri persis tidak memberi Star dan
langsung Round baru (yang me-reseed angin dan kristal).

20, bukan yang lebih ketat: pengukuran Sesi 22 menunjukkan permainan bervariasi
selesai di ~12 Turn. Cap ini dirancang tidak pernah terasa oleh orang yang
benar-benar berusaha mengenai lawannya, dan hanya menangkap kasus saling
menghindar yang memang tidak punya jalan keluar lain.

### M-03 — submit grace + ack

`strokeLimits.submitGraceMs` akhirnya dibaca: stroke yang dilepas di frame
terakhir Draw tidak lagi kalah oleh latensinya sendiri. Grace dibatasi oleh
fase berikutnya, jadi tidak mungkin nyasar ke Turn lain.

Dan client berhenti berbohong. `AckMessage` baru; "Rune locked" sekarang hanya
muncul setelah server mengakui. Ditolak karena telat → "Too late — that rune
missed the Draw window", bukan diam-diam hilang sampai Reveal.

### M-06 — Wobble decay, dengan konstanta yang diperbaiki

`decayPerSecond: 1.5` tidak pernah dibaca, dan memang tidak bisa: satu Turn ~21
detik, jadi decay per-detik akan membuang 31.5 Wobble antar-Turn sementara
pukulan solid hanya menambah ~24. Setiap pukulan terhapus sebelum yang
berikutnya mendarat, dan KO — satu-satunya kondisi kalah — jadi tak terjangkau.

Diganti `decayPerTurn: 4`, sekitar seperenam pukulan solid.

### T-01 — rasio arena akhirnya terkunci

`canvas { aspect-ratio: var(--arena-aspect) }` di semua breakpoint, nilainya
di-inject dari `CONFIG.camera.arenaAspectRatio` di `main.ts` sehingga tidak ada
angka gameplay yang ditulis di stylesheet. Semua aturan yang bertabrakan
dicabut (`16/9`, `aspect-ratio: auto`, `height: 100dvh`, `height: 100%`);
`.arena-wrap` sekarang `display: grid; place-items: center` sehingga sisa ruang
jadi letterbox, bukan peregangan.

Disparitas Ink vertikal HP-vs-desktop: **3.85× → 1.00×**.

Ditambah guard test `client/src/ui/arenaRatio.test.ts`. Jujur soal batasnya: ia
membaca stylesheet sebagai teks, bukan mengukur kotak yang dirender. Ia ada
karena T-01 sudah pernah terjadi sekali — amandemen ditulis, konstanta
ditambahkan, dan stylesheet tetap mengirim `16/9`. Grep-level guard akan
menangkap persis itu.

### T-03 / T-04

Pip Wobble sekarang terisi kontinu lewat `--fill` per pip (Wobble 34 dan 66
tidak lagi tampil identik), bentuk tiga pip dipertahankan untuk PRD §12. Ambang
label angin diturunkan dari `CONFIG.wind.accelerationLevels`, bukan literal
`0.22`/`0.35`. Copy angin ikut berubah semantiknya: "pushing out" / "drawing
in", bukan "wind right" — mekanik kiri/kanan itu sudah tidak ada.

### Testplay

`server/src/testplay.test.ts` — satu match penuh lewat `Room` asli, protokol
asli, jam palsu. Bukan unit test: dua pemain bergabung, bergerak saat Setup,
menggambar tiap Turn, membidik, dan server yang menyelesaikan.

```
MATCH: 12 turns, 3 rounds, 233s, stars 3-0, winner slot 0
  round 1 decided on turn 0 — KO slot 1 · stars 1-0
  round 2 decided on turn 0 — KO slot 1 & 0 · stars 2-0
  round 3 decided on turn 4 — KO slot 1 · stars 3-0
```

233 detik ≈ 3.9 menit — tepat di target PRD §5 (3–5 menit). Semua input
di-ack, tidak ada yang ditolak, dan match deterministik dari seed yang sama.
Ditambah cek keseimbangan lintas 8 seed: slot 0 tidak selalu menang.

Alasan test ini ada: **setiap cacat di AUDIT-MECHANICS-S19 lolos suite unit.**
M-01 dan M-02 hanya terlihat kalau satu match dimainkan sampai selesai.

### Verifikasi

238 test lulus (184 shared+server, 54 client). `tsc --build --force` bersih.
`npm run build` bersih — keduanya dijalankan di salinan sandbox karena mount
Windows menolak `unlink`/symlink; sumbernya identik (rsync dua arah).

### Yang tidak bisa kukerjakan, dan sebaiknya kamu tahu

**Screenshot browser tidak ada.** Chromium headless butuh `libXdamage.so.1`
dan sandbox ini tanpa root. Jadi tidak ada satu pun bukti visual di sesi ini —
rasio 2:3 terverifikasi lewat CSS dan konstanta, bukan lewat piksel. Yang perlu
dilihat mata manusia: keterbacaan HUD saat benar-benar dipakai, dotted Aim
guide, dan framing wizard selama kamera easing.

**Animasi jalan belum ada.** Wizard berpindah saat Setup tapi masih memakai
frame idle. Butuh sheet `walk` — keputusan aset.

**M-05 hosting masih menggantung.** `maxDuration: 300` di `vercel.json` masih
lebih pendek daripada match 233 detik ditambah lobby, dan room state masih di
memory satu instance.

---

## 2026-08-03 — Sesi 22: M-04 movement held-direction

**Pelaksana:** Claude. Keputusan BK: kerjakan M-04 sambil menunggu ekstensi
Chrome untuk playtest. Model input held-direction sesuai A-08.

### Yang dibangun

**`shared/src/sim/setup.ts` — integrator gerak Setup.** Sengaja terpisah dari
`stepWorld`: tidak ada partikel, bond, atau obstacle selama Setup, dan
menyatukannya berarti dua fase berbagi tuning yang hanya dibutuhkan salah satu.
Isinya minimal — gravitasi, satu impuls lompat, kontak tanah, batas pulau.

**Protokol `MoveMessage` + `SetupFrameMessage`.** Client mengirim *intent*
(arah −1/0/1 dan jump), server yang mengintegrasikan dan menyiarkan posisi
authoritative. Client tidak pernah memprediksi posisinya sendiri, jadi tidak ada
yang perlu direkonsiliasi. Biaya latency-nya jujur dan terbatas: koneksi lambat
kehilangan satu round trip di saat tekan/lepas, bukan sebagian dari kecepatan
(~6.7% dari Setup 3000 ms pada RTT 200 ms). Arah divalidasi sebagai enum, bukan
angka — menerima float bebas berarti client bisa berjalan secepat yang ia mau.

**`client/src/input/moveControls.ts` + `.css`** mengisi `#setup-controls-slot`
yang Codex sediakan inert. Tiga target ≥44×44 px, plus keyboard desktop.
Emit-on-change, dengan `releaseAll()` di blur, visibilitychange, pointercancel,
dan lostpointercapture — empat cara sebuah tekanan berakhir tanpa `up` yang
bersih.

CSS-nya diletakkan di file sendiri, **bukan** di `styles.css`, karena file itu
milik Codex (§1) dan sedang ada perubahan yang belum di-commit. Memindahkannya
ke `styles.css` nanti murni mekanis.

### Dua cacat yang ditemukan oleh test, bukan oleh pembacaan

**Clamp delta membuang gerakan.** Versi pertama membatasi delta ke 0.1 detik
supaya tick yang menumpuk tidak membuat wizard teleport. Itu memang mencegah
teleport — tapi diam-diam membuang sisanya: pemain menahan kanan selama 3 detik
dan server hanya memindahkannya 0.055 unit. Diganti sub-stepping tetap 1/120
detik, jadi room yang tick 30 Hz dan room yang bangun dari suspend dengan satu
delta 3 detik sampai ke posisi yang **sama**. Ada test yang membandingkan
keduanya.

**Separation tidak sengaja menciptakan mekanik dorong.** Versi pertama membagi
overlap rata ke dua badan. Karena satu Setup cukup panjang untuk menyeberangi
arena (`maxSetupTravel()` = 1.65 unit terhadap jarak 1.10), pemain yang menahan
satu arah bisa mendorong lawan yang diam sampai ke tepi pulau, setiap Turn,
tanpa counterplay — mekanik yang tidak pernah ada di PRD. Diganti: tiap badan
dikembalikan sebanding dengan seberapa jauh **ia sendiri** bergerak. Yang diam
tidak tergeser sama sekali; yang saling berjalan mendekat dikembalikan sama
besar, jadi mirror-fairness tetap utuh.

### Pengukuran ulang M-01 dengan positioning aktif

`.audit/probe-stall-m04.mjs`, 25 seed per sel, Turn cap 30. Policy `still`
mereproduksi kondisi Sesi 19 (tanpa positioning).

| Skenario | Policy | Stall | Rata-rata Turn |
|---|---|---|---|
| mid-Ink trade | still | 17/25 (68%) | 8.0 |
| mid-Ink trade | retreat | **24/25 (96%)** | 11.0 |
| mid-Ink trade | wander | **1/25 (4%)** | 11.6 |
| dart vs wall | still | 2/25 | 11.8 |
| dart vs wall | retreat | 9/25 | 11.9 |
| dart vs wall | wander | 1/25 | 11.9 |

**Hipotesis Sesi 19 benar sebagian, dan salah di bagian yang penting.** Gerak
memang meruntuhkan stall pada permainan yang bervariasi: 68% → 4%. Tapi gerak
juga menciptakan stall yang *lebih buruk* daripada tidak ada gerak sama sekali
kalau kedua pemain mundur — 96%, karena tidak ada yang pernah terjangkau. Mundur
adalah insting defensif yang paling wajar, jadi ini bukan policy sintetis.

**Kesimpulan untuk M-01: Turn cap tetap wajib.** Tapi boleh longgar — permainan
yang tidak saling menghindar selesai di ~12 Turn, jadi cap di sekitar 20 tidak
akan pernah terasa oleh pemain yang bermain normal.

Baris `both max wall` belum selesai dihitung saat sesi ditutup (tiap sel
menjalankan 25 × 30 Resolve penuh); jalankan ulang probe untuk melengkapinya.

### Verifikasi

179 test lulus (shared, server, `client/src/input`). Suite client penuh lulus
terpisah (43). `npm run typecheck` dan `npm run build` tetap tidak bisa
dijalankan dari sandbox ini — jalankan di mesin asli sebelum commit.

### Handback ke Codex

`HANDBACK-CODEX-S22.md` ditulis di akhir sesi: T-01 (rasio 2:3, dengan daftar
baris CSS yang bertabrakan), T-03 (pip Wobble fraksional), T-04 (ambang angin
dari config), plus dua pekerjaan baru dari M-04 — animasi jalan saat Setup, dan
keputusan apakah `moveControls.css` dilebur ke `styles.css`.

Keputusan BK: Codex membereskan T-01 lebih dulu; playtest dijalankan sekali di
atas layout yang rasionya sudah benar, bukan dua kali di atas dua layout.

Ekstensi Claude in Chrome tetap tidak tersambung sepanjang sesi meski sudah
terpasang dan side panel-nya login — kemungkinan besar karena jembatannya
terikat saat aplikasi desktop start, sementara ekstensinya dipasang di tengah
sesi.

### Belum dikerjakan

Wizard belum dianimasikan berjalan; `setupFrame` menggerakkan posisi, tapi
pemilihan animasi walk/idle ada di renderer (milik Codex). Skew kemenangan pada
policy `wander` (17/7 lalu 6/18, arah berbalik antar-skenario) konsisten dengan
bias angin M-02, bukan bias slot — belum diverifikasi terpisah.

---

## 2026-08-03 — Sesi 21: pemeriksaan UI pasca-handoff Codex

**Pelaksana:** Claude. BK menyerahkan playtest dua tab 430×932 di room UG8M.
Laporan lengkap: `PLAYTEST-REPORT-S21.md`.

### Yang tidak jadi dikerjakan

**Playtest interaktif gagal dijalankan** — ekstensi Claude in Chrome tidak
terhubung, jadi kedua tab tidak bisa digerakkan. Empat butir fokus BK (rasa
Draw, dotted Aim guide, keterbacaan HUD/Ink saat dipakai, framing wizard selama
kamera easing) **belum diperiksa**. Sesi ini menjadi pemeriksaan statis dan
numerik terhadap kontrak.

### Temuan

| ID | Severity | Temuan |
|---|---|---|
| T-01 | Blocker | A-09 tidak diimplementasikan. `camera.arenaAspectRatio` tidak dirujuk di client; `styles.css:368` masih `16/9` dan `:817` `aspect-ratio: auto` + `height: 100%`. Disparitas Ink vertikal HP-vs-desktop **3.85×** — lebih buruk dari 2.89× sebelum kalibrasi, karena `min-height`/`max-height` yang dulu membatasi sudah dicabut. |
| T-02 | Serius (diperbaiki) | Laporan Codex soal wizard kanan terpotong **benar**, dan verifikasi A-09-ku salah. |
| T-03 | Sedang | Pip Wobble masih diskret 3 langkah (`data-level` + `:nth-child`). `--wobble` disetel di `matchGame.ts:494` tapi tidak pernah dipakai CSS — kode mati. Wobble 34 dan 66 tampil identik. |
| T-04 | Sedang | Ambang label angin (`0.22`, `0.35`) di-hardcode di `matchPresentation.ts:23`, bukan diturunkan dari `CONFIG.wind.accelerationLevels`. Melanggar §3.5; akan salah diam-diam saat M-02 mengubah level angin. |

### Koreksi atas pekerjaanku sendiri (T-02)

A-09 memverifikasi visibilitas lawan dengan `player.radius` — badan fisika.
Renderer menggambar dua hal yang lebih lebar. Diukur di
`.audit/probe-framing2.mjs`, memakai bounding box alpha sprite yang diukur
langsung dengan PIL (bukan ukuran quad 176px, yang sebagian besar transparan dan
melebih-lebihkan potongan ~3×):

| Elemen | Batas kanan | Pada bias 0.36 |
|---|---|---|
| Badan fisika | 0.640 | muat |
| Sprite piksel opak | 0.658 | muat, sisa 0.002 |
| Cincin Wobble | 0.677 | **terpotong 0.017** |

Cincin Wobble adalah satu-satunya readout kondisi kalah di dunia. Headroom juga
**negatif**, sementara posisi terbawa antar-Turn, jadi lawan yang terdorong ke
kanan hilang dari frame.

### Perubahan

`shared/src/config/index.ts`: `camera.drawCenterBias` **0.36 → 0.45**. Headroom
menjadi +0.073 unit; wizard lokal tetap muat. Melebarkan `drawHalfWidth` juga
bisa, tapi memaksa `costPerUnitLength` bergerak (0.90 → 41.9) dan mengubah
ekonomi Ink — bias tidak.

Baru: `.audit/probe-framing2.mjs`, `PLAYTEST-REPORT-S21.md`.

Tidak menyentuh `client/src/styles.css` dan file milik Codex lainnya (§1);
T-01, T-03, T-04 dikembalikan ke Codex dengan CSS dan lokasi yang konkret.

### Verifikasi

198 test lulus setelah perubahan bias. `npm run typecheck` dan `npm run build`
tetap tidak bisa dijalankan dari sandbox ini (symlink `@cozy/*` `EIO`, `vite
build` `EPERM`); BK melaporkan build berhasil di mesin asli.

### Belum dikerjakan

M-01 sampai M-08 belum disentuh. Sesuai §6, penilaian "seru"/"adil" belum sah
sampai M-01 dan M-02 selesai — yang boleh dinilai sekarang hanya presentasi.

---

## 2026-08-03 — Sesi 20: kunci rasio arena & kalibrasi kamera–Ink portrait

**Pelaksana:** Claude (orchestrator). BK menegaskan arah redesign menyeluruh
dengan Codex sebagai pelaksana visual/UI dan Claude sebagai pemoles logic.
Sesi ini mengerjakan blocker §2 `PLAN-S19-MOCKUP-PARITY.md` supaya Codex bisa
mengunci ukuran canvas tanpa membangun di atas ekonomi Ink yang salah.

### Cacat yang ditemukan

Codex sudah mengirim layout portrait sebelum kalibrasi §2 selesai (perubahan
belum di-commit di `client/index.html`, `client/src/styles.css`,
`client/src/ui/matchGame.ts`). Implementasinya membiarkan tinggi canvas
mengambil sisa layar: `calc(100dvh - 9.75rem)` di HP, `aspect-ratio: 16/9` di
desktop.

`createViewport` menurunkan `scale` dari lebar canvas saja, jadi rasio canvas
menentukan berapa banyak arena yang terlihat vertikal — dan karena Ink ditagih
per satuan panjang busur di ruang arena (A-04), rasio canvas juga menentukan
harga gestur vertikal. Diukur lewat probe baru `.audit/probe-framing.mjs`:

| Device | Sapuan setinggi layar |
|---|---|
| Desktop 16:9 | 42.5 Ink |
| iPhone 14 Pro portrait | 122.9 Ink (**2.89×**) |
| 390×844 portrait | 123.9 Ink (**2.92×**) |

Dua pemain pada HP dan desktop membayar harga berbeda untuk rune berbentuk sama
dan melihat jumlah arena berbeda untuk membidik. Ini bertentangan dengan A-03
dan PRD §15.

Cacat kedua, tidak terkait portrait dan **sudah ada sejak build landscape**:
tepi kanan frame Draw berhenti di x = 0.60 sementara sisi jauh lawan ada di
`spawnX + radius` = 0.64. Lawan terpotong 0.04 unit, padahal komentar di
`viewport.ts` menyatakan framing Draw sengaja dibias supaya lawan tetap
terlihat.

### Koreksi atas rencanaku sendiri di §2

Rencana §2 menyuruh menurunkan ulang `ink.costPerUnitLength` dari
`drawHalfWidth` baru memakai rumus `26 × fullHalfWidth / drawHalfWidth`. Rumus
itu keliru — ia menyeret `fullHalfWidth` ke dalam persamaan ekonomi Ink,
padahal tidak ada yang menggambar pada kamera Full.

Invariant yang benar: `2 · drawHalfWidth · costPerUnitLength = 75.5 Ink` untuk
sapuan selebar canvas. Konsekuensinya `drawHalfWidth` dan `costPerUnitLength`
**tidak perlu diubah sama sekali**, dan me-reframe kamera Full untuk portrait
adalah presentasi murni. Komentar di config sudah ditulis ulang menyatakan
invariant ini langsung, bukan sebagai turunan dari kamera yang tidak dipakai.

### Perubahan

`shared/src/config/types.ts` dan `shared/src/config/index.ts`:

| Konstanta | Lama | Baru |
|---|---|---|
| `camera.arenaAspectRatio` | (tidak ada) | `2/3`, berlaku untuk semua device |
| `camera.fullHalfWidth` | 1.45 | 1.15 |
| `camera.drawCenterBias` | 0.30 | 0.36 |
| `camera.drawHalfWidth` | 0.85 | 0.85 (tetap) |
| `ink.costPerUnitLength` | 44.4 | 44.4 (tetap) |

Rasio 2:3 dipilih setelah mengukur lima kandidat. 3:4 ditolak karena kill floor
−1.4 jatuh persis di tepi frame — knock-out akan resolve di luar layar. 9:16 dan
9:19.5 menambah langit kosong tanpa gameplay dan menyusutkan kolom desktop.

Baru: `PRD-AMENDMENTS.md` A-08 (platform MVP bergeser ke portrait mobile-first,
held-direction movement, `castMs` tetap 2000) dan A-09 (rasio arena terkunci
sebagai constraint keadilan). Keduanya menimpa PRD §3 dan §19.

`PLAN-S19-MOCKUP-PARITY.md` §2 ditandai selesai; §5 diperbarui dengan tiga
keputusan BK yang sudah terkunci plus instruksi CSS konkret untuk Codex; §6
definition of done ditambah empat kriteria baru.

### Keputusan BK sesi ini

- **Rasio arena dikunci lintas device**, letterbox di sisanya. Biayanya:
  desktop 1280×720 mendapat kolom arena 480×720, tidak full-bleed seperti
  mockup. Diterima sadar.
- **Movement held-direction** (kiri/kanan + satu lompat), bukan
  tap-to-position. Codex menyediakan container tiga tombol sentuh.
- **`phases.castMs` tetap 2000.** `AIM 03.8` di mockup adalah art direction;
  menaikkannya membawa Turn ke ~22.8 detik, melewati batas PRD §19.

### Verifikasi

198 test lulus (139 shared, 59 client+server) setelah perubahan konstanta;
`fairness.test.ts` dan `classifier.test.ts` tidak regresi. Crossover
offence/defence terverifikasi lewat `predictLaunch()` tetap persis di Ink 40
(reach 1.10 = jarak antar-wizard 1.10), dan fraksi lebar layar yang membeli
Ink 40 tetap 0.530 — identik dengan build landscape.

`npm run typecheck` dan `npm run build` **tidak bisa diverifikasi di lingkungan
ini**: symlink workspace `node_modules/@cozy/*` tidak terbaca lewat mount
(`EIO`), sehingga semua import `@cozy/shared` gagal resolve, dan `vite build`
berhenti di `EPERM: unlink client/dist/...`. Keduanya artefak lingkungan, bukan
kode. **Codex atau BK perlu menjalankan keduanya di mesin asli sebelum
commit.**

### Belum dikerjakan

M-01 sampai M-08 belum disentuh. Keputusan hosting (M-05) masih menggantung dan
merupakan satu-satunya butir §5 yang belum dijawab; ia tidak memblokir Codex.
Anisotropi Ink horizontal-vs-vertikal (1.50× di portrait 2:3, turun dari 1.78×
di landscape) dicatat sebagai konsekuensi yang diterima, belum diuji terhadap
pemain.

---

## 2026-08-03 — Sesi 19: audit cacat mekanik & logic pasca-deploy

**Pelaksana:** Claude (orchestrator). BK meminta pemeriksaan cacat mekanik dan
logic setelah build pertama dideploy ke Vercel. Tidak ada kode gameplay yang
diubah dalam sesi ini — sesi ini murni pengukuran.

### Cara audit dilakukan

Suite yang ada (195 test) lulus dan tetap lulus, jadi pembacaan kode saja tidak
cukup untuk membedakan "benar" dari "tidak pernah diuji". Tiga skrip probe
ditambahkan di `.audit/` yang menjalankan `runResolve` + state machine secara
headless untuk puluhan seed, dan mengukur: panjang match, tingkat stalemate,
simetri hasil antar-slot, dan pengaruh angin pada permainan yang identik.

### Temuan

Laporan lengkap dengan bukti angka dan `file:line`: `AUDIT-MECHANICS-S19.md`.

| ID | Severity | Cacat |
|---|---|---|
| M-01 | Blocker | Match bisa tidak pernah selesai. 26/60 seed masuk siklus state deterministik pada permainan mid-Ink yang wajar; 15/20 pada permainan bertahan penuh. Round hanya berakhir lewat KO, environment di-seed per Round, dan Wobble ter-cap — jadi Turn yang berulang akan berulang selamanya. |
| M-02 | Blocker | Angin memutuskan Round sebelum ada yang menggambar. Dengan permainan cermin sempurna, angin 0.28 dan 0.42 (2 dari 4 level) menghasilkan KO sepihak: 0.0 vs 41.3 Wobble. Kontrol tanpa angin mirror eksak, jadi simulatornya sendiri tidak bias. |
| M-03 | Serius | `strokeLimits.submitGraceMs` tidak pernah dibaca. Stroke/Cast yang tiba setelah batas fase dibuang diam-diam, sementara client menampilkan "Rune locked". Latency menentukan hasil Turn — bertentangan langsung dengan A-03 dan PRD §15. |
| M-04 | Serius | Movement tidak diimplementasikan sama sekali: tidak ada pesan protokol, `canMove()` dan `movement.speed/jumpImpulse` mati. Setup 3 detik kosong. A-03 membayar penguncian movement di Resolve dengan janji positioning di Setup yang belum ada. |
| M-05 | Serius | `vercel.json maxDuration: 300` lebih pendek dari target durasi match; jam fase adalah `setInterval` di function yang boleh disuspend; Resolve dihitung sinkron dalam satu tick. Ditambah room state per-instance yang sudah dicatat Sesi 18. |
| M-06 | Sedang | `wobble.decayPerSecond: 1.5` mati. Diukur: Wobble 50 keluar 50.00 setelah satu Resolve. Mekanisme comeback yang didokumentasikan tidak ada. |
| M-07 | Sedang | Lawan disconnect saat Draw mengunci pemain yang masih online (gate client butuh 2 connected), tapi server hanya menjeda di Setup. Satu Turn hangus untuk keduanya. |
| M-08 | Rendah | `MatchState.players[].wobble/.ink` tidak pernah diperbarui (kebenaran ada di `Room.wobble`); seluruh blok `CONFIG.combat` mati; `aim.maxCastRadius` mati sejak pivot rune-body tanpa amandemen A-05; cabang sudden-death di `findWinner` tidak terjangkau. |

### Yang diverifikasi benar

Simulator tidak bias slot (mirror test tanpa angin: `-0.7954 / +0.7954`, Wobble
identik 3 desimal). A-02 benar di semua jalur skor. `repairStroke` +
`parseClientMessage` menutup cheat geometri. Kurva Ink → massa → jangkauan
monoton dengan crossover di Ink 40 seperti didokumentasikan. Dart mengalahkan
wall 13/20, jadi bertahan bukan strategi dominan melawan lawan yang menyerang.

### Rekomendasi urutan kerja

M-04 dulu (kembalikan lever pemain), lalu ukur ulang stall rate — M-01
kemungkinan sebagian disebabkan oleh hilangnya positioning. Lalu M-02 dengan
mirror-fairness sebagai invariant baru di `DESIGN-RUNE-BODY-COMBAT.md`, lalu
M-01 Turn cap sebagai safety valve, lalu M-03.

### Keputusan arah setelah audit

BK menunjukkan mockup target (pixel-art portrait, HUD lengkap) dan menetapkan
pembagian kerja: Codex mengerjakan presentasi sampai parity dengan mockup,
Claude memoles logic setelahnya. Tiga keputusan diambil:

- **Portrait mobile-first.** Bertentangan dengan PRD §3 yang mengunci MVP ke
  desktop + mouse; perlu amandemen. Konsekuensi mekanik: `ink.costPerUnitLength`
  dikalibrasi terhadap `camera.drawHalfWidth`, dan A-04 mengunci canvas gambar
  sebagai jendela 1:1 ke arena — rasio layar baru menggeser ekonomi Ink dan
  crossover offence/defence di Ink 40 kalau tidak dikalibrasi ulang bersama.
- **Trajectory preview jalur parsial** (memudar setelah ~40%), bukan panah arah
  saja (PRD §14) dan bukan jalur penuh. PRD §14 perlu diamandemen. Syarat:
  preview dihitung dari integrator yang sama dengan Resolve dan melengkung
  mengikuti angin — preview lurus di dunia berangin lebih buruk daripada tidak
  ada preview.
- **Urutan perbaikan logic:** M-04 movement dulu, lalu ukur ulang stall rate
  M-01, baru M-02, M-01, M-03.

Rencana kerja dan pembagian kepemilikan file: `PLAN-S19-MOCKUP-PARITY.md`.

Catatan tambahan dari pembacaan mockup: mockup menghilangkan gauge angin
(`matchGame.ts:372`) dan cincin Wobble (`matchScene.ts:515`). Keduanya
menopang mekanik — angin adalah variabel paling menentukan di Round (M-02),
Wobble adalah satu-satunya penggerak kondisi kalah — jadi keduanya wajib punya
tempat di desain baru. Timer mockup `AIM 03.8` juga tidak cocok dengan
`phases.castMs: 2000`; kalau 3.8 detik yang diinginkan itu perubahan config,
bukan renderer, dan menambah ~1.8 detik ke Turn yang sudah 21 detik terhadap
batas PRD 22 detik.

### Belum dikerjakan

Tidak ada perbaikan yang diterapkan. Renderer, input, dan pipeline aset tidak
diaudit di sesi ini kecuali di titik yang menyentuh mekanik (`canDraw`,
`canCast`, submit path). Kalibrasi kamera–Ink portrait belum dikerjakan dan
**memblokir** Codex mengunci ukuran canvas arena.

---

## 2026-08-03 — Sesi 18: publish GitHub dan deploy multiplayer ke Vercel

**Pelaksana:** Codex. BK meminta seluruh repo dipublish ke
`nyo95/cozychaos` dan game dideploy di Vercel. Repository remote awalnya kosong,
jadi riwayat lokal dipush langsung sebagai bootstrap `master`.

### GitHub

- Remote `origin` ditambahkan ke `https://github.com/nyo95/cozychaos.git`.
- Seluruh riwayat sampai commit art Session 17 dipush ke `master`.
- GitHub CLI tidak tersedia; karena remote kosong dan scope bersih, publish
  dilakukan dengan authenticated `git push`, tanpa PR bootstrap yang tidak
  memiliki base branch.
- Vercel project melaporkan repository tersebut sudah terhubung untuk build
  Git berikutnya.

### Vercel adaptation

- `server/src/app.ts` mengekstrak HTTP + WebSocket transport tanpa bind port.
  `server/src/index.ts` tetap entrypoint lokal port 8787, sedangkan
  `api/ws.ts` mengekspor server yang sama ke Vercel WebSocket Public Beta.
- Client HTTPS sekarang otomatis memakai same-origin `wss://<host>/ws`; HTTP
  development tetap memakai port 8787. Empat regression test mengunci routing
  explicit URL, production, LAN, dan custom dev port.
- `vercel.json` membangun Vite ke `client/dist`, me-rewrite `/ws` ke Function,
  mengaktifkan Fluid compute, dan menempatkan Function di `sin1`.
- Cloud build pertama menemukan workspace bundling bug: Function tidak membawa
  source `@cozy/shared`. Import production server dipindah ke relative shared
  source path agar Vercel men-trace protocol, config, dan simulation code.

### Production

- URL: `https://cozychaos.vercel.app`
- HTTP root: 200, frontend Vite tersaji.
- Endpoint `/ws`: 426 untuk request HTTP biasa dan berhasil upgrade menjadi
  WebSocket untuk client game.
- Smoke test dua socket membuat/join room yang sama, melewati Draw dan Cast,
  mengirim dua rune, lalu menerima Reveal serta frame Resolve yang byte-identik
  dengan 22 partikel.

### Verifikasi dan batas aktif

| Cek | Hasil |
|---|---|
| `npm test` | **195 passed** (15 file) |
| `npm run typecheck` | bersih, termasuk `api/ws.ts` |
| `npm run build` | shared + client + server berhasil |
| Vercel cloud build | bersih, audit install 0 vulnerability |
| Production WebSocket | dua client, same room/reveal/frame |

Room masih berada di memory satu warm Function instance. Demo traffic sudah
terbukti bekerja, tetapi horizontal scaling belum durable: dua socket dapat
mendarat di instance berbeda. Sebelum public traffic, pindahkan room state dan
pub/sub ke shared Redis/store; jangan mengklaim deployment ini production-scale.

## 2026-08-02 — Sesi 17: ganti preview gua dengan arena PixelLab open-sky

**Pelaksana:** Codex. BK menunjukkan bahwa `roadmap.md` masih menampilkan
`cozy-cave-arena.png` sebagai gambar arena walaupun file itu sudah ditandai
`obsolete-theme`. Label metadata saja tidak cukup: secara visual pembaca tetap
menganggap gua sebagai arah aktif.

### Perubahan

- Tiga pass PixelLab Pixflux 400×224 dibuat untuk arena side-view pixel-art.
- V1 ditolak karena dark aperture di tepi kembali terbaca sebagai gua dan
  platform terlalu kecil.
- V2 diterima sebagai art-direction reference: open indigo-magenta dream sky,
  palet selaras dengan wizard PixelLab, dan area lintasan spell tetap tenang.
- V3 mencoba memperlebar platform melalui init-image revision, tetapi tidak
  menghasilkan perubahan material dan ditolak.
- `roadmap.md` sekarang menampilkan V2 sebagai preview utama, menyimpan ketiga
  hasil generation trail, dan tidak lagi menampilkan cave arena/reflector
  lama sebagai preview aktif.
- Manifest PixelLab naik ke v2 dengan environment contract, seed, status, dan
  alasan accept/reject. Provenance serta handover diperbarui agar Claude tidak
  menghidupkan kembali aset gua.

### Batas integrasi

Arena PixelLab belum menjadi collision background. Model tidak memenuhi target
lebar platform 82% secara presisi; memakainya langsung akan membuat permukaan
yang terlihat berbeda dari geometri server. Runtime `drawIsland` dan
`drawCrystals` tetap mengikuti shared config. Aset baru adalah target palet dan
komposisi, bukan sumber physics.

### Biaya dan keamanan

- 3 generation tambahan dipakai; 23 dari 40 trial generation tersisa.
- Token hanya dipakai saat request dan tidak ditulis ke source, dokumentasi,
  manifest, environment, atau git.

### Verifikasi

| Cek | Hasil |
|---|---|
| Asset QA | ketiga PNG opaque, 400×224; accepted/rejected path valid |
| JSON manifest | parse bersih; obsolete arena menunjuk replacement baru |
| `npm test` | **191 passed** (14 file) |
| `npm run typecheck` | bersih |
| `npm run build` | shared + client + server berhasil |
| `npm audit` | 0 vulnerability |
| Credential scan | tidak ada token/API credential di tracked text |

## 2026-08-02 — Sesi 16: PixelLab pilot di-generate dan masuk runtime

**Pelaksana:** Codex. BK secara eksplisit meminta melewati gate playtest dan
maju langsung dengan PixelLab. Override ini dicatat di `roadmap.md` dan
`HANDOVER-CODEX.md`; T6–T7 tetap utang sebelum balancing/public beta, tetapi
tidak lagi memblokir character-art pilot.

### Output PixelLab

- API resmi PixelLab v2 dipakai langsung; token tidak ditulis ke repo,
  environment, manifest, changelog, atau source.
- Base character: cyan side-view pixel wizard, delapan source rotation pada
  canvas 176×176 (requested character size 96×96), tanpa staff/projectile.
- Idle: 6 frame, bottom pivot identik dan centre drift 0.5 source pixel.
- Cast v1: **ditolak**, karena frame tengah membakar dua arc cyan ke karakter.
  Image-asset workflow memaksa inspeksi visual sebelum integrasi; tanpa gate
  ini, efek yang seharusnya procedural akan masuk sebagai pixel permanen.
- Cast clean v2: 8 frame body-motion-only, tanpa spell effect; bottom drift 1
  source pixel dan forward-motion centre drift 6 source pixel.
- Pink team dibuat sebagai deterministic local palette derivative dari frame
  cyan. Pose/pivot identik dan tidak menghabiskan stochastic generation kedua.
- Total terpakai: 14 dari 40 trial generations; 26 tersisa setelah generation.

### Runtime integration

- Empat packed sheet hidup di
  `client/public/assets/pixellab-pilot/runtime/`; raw base/idle/cast accepted dan
  rejected tetap disimpan sebagai provenance.
- `wizardSprites.ts` melakukan lazy preload/decode, nearest-neighbour frame
  selection, idle looping, dan satu cast sequence yang dipetakan ke progress
  phase Cast 2 detik.
- Slot cyan memakai east-facing frame; slot pink memakai palette derivative
  yang di-mirror sehingga keduanya selalu menghadap rival.
- Pivot sprite hanya presentation data. Server snapshot masih memiliki posisi,
  collision radius, Wobble, dan score. Sheet belum siap/404 → procedural wizard,
  bukan karakter hilang.

### Verifikasi

| Cek | Hasil |
|---|---|
| `npm test` | **191 passed** (14 file) |
| `npm run typecheck` | bersih |
| `npm run build` | shared + client + server berhasil |
| Browser desktop, dua client | cyan/pink tampil, saling menghadap, pivot di island, tidak ada console warning/error |
| Browser 390×844 | cast pose tampil, `scrollWidth = innerWidth = 390`, tidak ada overflow atau console error |
| Credential scan | tidak ada token/API credential di tracked text |

### Keputusan yang belum otomatis dibuat

PixelLab sekarang dipilih untuk **character presentation**, bukan untuk fixed
spell sprites. Literal rune matter, fragments, wind, reflector collision, dan
damage tetap procedural. Hit/KO adalah batch berikutnya setelah BK menerima
idle/cast pada ukuran game sebenarnya.

## 2026-08-02 — Sesi 15: Pulihkan repo dan sinkronkan kontrak produk

**Pelaksana:** Codex. Stage 1 T1–T5 dari `HANDOVER-CODEX.md` dieksekusi.
Tidak ada logic gameplay baru dalam sesi ini; perubahan dokumen mengoreksi peta
terhadap kode yang sudah dibangun pada Sesi 8–13, lalu seluruh pekerjaan yang
masih menggantung dipreservasi dalam commit terpisah.

### Perubahan

- `roadmap.md` ditulis ulang dari kontrak aktif: tidak ada role; Ink membeli
  massa; fixed launch energy mengubah massa menjadi speed dan reach; tabrakan
  rune simetris serta dibobot massa; arena aktif adalah floating dream island.
- `README.md` tidak lagi menjanjikan Attack/Counter, Ward dari sisa Ink, arena
  gua, atau jumlah test lama. Instruksi menjalankan dua client + authoritative
  server dipertahankan.
- Arena dan reflector ImageGen lama ditandai `obsolete-theme` di
  `ASSET-PROVENANCE.md` dan manifest. Dua wizard tetap `candidate`; tidak ada
  aset yang di-wire ke renderer. Empat PNG dipertahankan di git sebagai
  provenance atas keputusan eksplisit BK.
- Amandemen A-07 mengganti kunci Three.js pada PRD §15 menjadi renderer Canvas
  2D berlapis untuk MVP. 3D tetap diperbolehkan sebagai pipeline aset → sprite
  2D, bukan runtime physics.
- Pekerjaan Sesi 8–13 dipisahkan ke lima kelompok riwayat: shared
  sim/protocol, authoritative server, multiplayer client, art/provenance, dan
  dokumentasi. Tujuannya agar rollback/review tidak membutuhkan satu commit
  raksasa.

### Mengapa

`roadmap.md` dan `README.md` dibangun dari state paralel yang sudah usang:
keduanya mendeskripsikan mekanik yang dihapus pada Sesi 12. Pada saat yang sama,
server, simulation, protocol, client multiplayer, dan aset belum pernah masuk
commit sejak Sesi 7. Risiko utamanya bukan bug baru, melainkan kehilangan tujuh
sesi kerja dan Claude mengambil keputusan berikutnya dari peta yang salah.

### PixelLab dan keamanan token

PixelLab tidak dipanggil dan tidak ada credit yang dipakai. Token yang ditempel
di chat tidak disalin ke file, environment, git, atau output. Karena sudah
terekspos di percakapan, token itu harus dirotasi sebelum Stage 3. Art generation
tetap diblokir sampai playtest Stage 2 lulus.

### Verifikasi pre-commit

| Cek | Hasil |
|---|---|
| `npm test` | **189 passed** (13 file) |
| `npm run typecheck` | bersih |
| `npm run build` | shared + client + server berhasil |
| `npm audit` | **0 vulnerabilities** |
| grep roadmap untuk mekanik stale | hanya dua nama file aset obsolete yang memuat kata tema lama |

### Berikutnya

Stage 2 T6–T7: export telemetri authoritative per Turn dan protokol playtest
untuk 10+ manusia. Keputusan 3D→2D versus PixelLab versus painterly fallback
baru dibuka setelah combat manusia memvalidasi trade-off Ink.

## 2026-08-02 — Sesi 14: Audit drift dokumen, arah kamera dikunci 2D, handover Codex

**Pelaksana:** Claude (orchestrator). **Tidak ada perubahan kode.** Yang berubah
hanya dokumen; `npm test` dijalankan sebagai pengukuran, bukan sebagai
perbaikan.

Sesi ini menjawab pertanyaan BK: 3D isometric atau tetap 2D, dan apakah ada
generator sprite 2D. Menjawabnya butuh membaca `roadmap.md` — dan di situ
masalah sebenarnya muncul.

### Keputusan: tetap 2D side-view. Isometric/3D runtime ditolak.

Sepakat dengan kesimpulan `roadmap.md` §2, tapi **tidak dengan alasannya.**
Codex beralasan biaya implementasi (proyeksi kamera, depth sorting, mesh
collision). Itu alasan paling lemah yang tersedia — biaya bisa dibayar. Dua
alasan yang benar-benar mengikat ada di PRD:

1. **Isometric membatalkan janji inti.** PRD §1: "Setiap coretan menjadi
   sihir." Stroke adalah kurva 2D di layar. Di dunia isometric, engine harus
   memutuskan stroke itu hidup di bidang mana — apa pun pilihannya, itu
   interpretasi, bukan literal. Materi sihir berhenti jadi persis apa yang
   digambar pemain.
2. **Isometric merusak keterbacaan balistik.** PRD §3 menargetkan pemain
   Gunbound. Arc + wind + pantulan crystal hanya adil kalau jarak dibaca di
   satu bidang. Kedalaman tersembunyi membuat meleset terasa curang, bukan
   lucu — melanggar pilar §4.2.

3D tetap sah sebagai **pipeline aset** (render sprite 2D dari sumber 3D), bukan
sebagai renderer runtime.

### Temuan: dokumen handoff mendeskripsikan mekanik yang sudah dihapus

Ini temuan utama sesi ini, dan lebih penting dari pertanyaan art-nya.

`roadmap.md` ditulis Codex di Sesi 13 sebagai "shared handoff untuk user,
Claude, dan Codex". Isinya mendeskripsikan sistem yang dihapus di Sesi 12:

| Klaim | Bukti bahwa itu salah |
|---|---|
| "server assigns alternating roles: one ATTACK, one COUNTER" | `grep -rn "ATTACK\|COUNTER"` ke `shared/ server/ client/` non-test → nol hasil. `shared/src/match/roles.ts` tinggal tombstone `export {}`. |
| "Ward from reserved Ink" | Ward dihapus total. Sisa kata "Ward" hanya nama spell family `Bubble Ward` — hal berbeda. |
| "cozy cave arena", "stalactite reflectors" | Arena sudah floating dream island + dream sky sejak Sesi 12. Lihat `matchScene.ts#drawSky`/`drawCrystals`. |
| "176 tests green" | 189 hijau, diukur ulang sesi ini. |

Efek berantainya: seluruh art kit ImageGen dari Sesi 12 (`cozy-cave-arena.png`,
`cave-reflectors-sheet.png`) bertema arena yang sudah mati, dan
`manifest.json` masih menulis `"style": "cozy-hand-painted-cave"`. `README.md`
juga masih menjanjikan "alternate Attack/Counter roles" dan "unused Ink becomes
partial Ward" ke pembaca baru.

**Penyebabnya bukan kecerobohan Codex.** Sesi 12 berjalan dua kali secara
paralel — Codex menghasilkan art kit sementara Claude membongkar role dan
arena. Codex menulis roadmap dari state yang dibacanya, dan state itu sudah
usang saat tintanya kering. Yang hilang adalah langkah verifikasi dokumen
terhadap kode sebelum handoff. Itu sekarang jadi aturan tetap di
`HANDOVER-CODEX.md`.

**Yang justru dikerjakan dengan benar:** `DESIGN-RUNE-BODY-COMBAT.md` menandai
dirinya sendiri sebagai pengganti versi role, dan `roles.ts` disimpan sebagai
tombstone dengan alasan tertulis. Dua hal itu yang membuat drift ini bisa
dideteksi sama sekali.

### Temuan kedua: tujuh sesi belum di-commit

Commit terakhir `aea444a` = Sesi 7. Sesi 8–13 seluruhnya menggantung sebagai
modified/untracked: `server/`, `shared/src/sim/`, `shared/src/protocol/`,
`client/src/net/`, `matchScene.ts`, `matchGame.ts`, `runeBody.ts`, art kit.
Risiko terbesar di repo saat ini, dan tidak berhubungan dengan game design sama
sekali.

### Temuan ketiga: PRD §15 masih mengunci Three.js

Implementasi jalan di Canvas 2D sejak Sesi 0 dengan alasan yang benar dan
tercatat, dan sekarang membawa 189 test. Constraint yang tidak ditegakkan itu
jebakan — cepat atau lambat ada yang membacanya sebagai izin masuk 3D lalu
membuang renderer yang sudah teruji. Amandemen dijadwalkan sebagai T4.

### Survei generator sprite 2D (belum dievaluasi, bukan rekomendasi)

PixelLab (pixel-art spesialis, skeleton animation, cap 512×512), Ludo (30+ gaya
termasuk hand-painted, ekspor atlas), AutoSprite (animation-first via video
pipeline), Sprite-AI (16–128 px + atlas JSON). Catatan skeptis: kit yang ada
sekarang painterly, bukan pixel art. Generator pixel-art bukan upgrade dari kit
itu — itu pivot gaya, dan `roadmap.md` §2 benar melarang mencampur keduanya.

### Deliverable

`HANDOVER-CODEX.md` — dokumen eksekusi berurutan untuk Codex. Stage 1 (perbaiki
peta: T1–T5) memblokir Stage 2 (playtest: T6–T7), yang memblokir Stage 3 (art).
Tiap task menyebut file yang boleh disentuh, langkah konkret, dan acceptance
criteria. Menggantikan `roadmap.md` §8.

### Verifikasi

| Cek | Hasil |
|---|---|
| `npm test` | **189 passed** (13 file) |
| `grep` role/Ward ke kode non-test | nol hasil — mengonfirmasi roadmap stale |
| `git log` vs `git status` | commit terakhir Sesi 7; 21 modified, 12 untracked |

**Belum diverifikasi:** typecheck, build, dan audit tidak dijalankan sesi ini —
sengaja, karena tidak ada kode yang berubah. Codex wajib menjalankan keempatnya
di T5 sebelum commit.

### Catatan proses

Entri Sesi 14 versi awal sempat ditulis di **akhir** file. Changelog ini
reverse-chronological; entri sudah dipindahkan ke atas. Nomor sesi 12 terpakai
dua kali (Codex dan Claude) — dibiarkan apa adanya karena riwayat, tapi sesi
berikutnya adalah 15.

## 2026-08-02 — Sesi 13: PixelLab pilot plan dan consolidated roadmap

**Pelaksana:** Codex.

- PixelLab dicari di tool sesi dan belum terpasang; token juga belum tersedia
  di environment. Tidak ada credit PixelLab yang dipakai atau hasil palsu yang
  diklaim.
- `roadmap.md` dibuat sebagai handoff tunggal untuk user/Claude/Codex. Dokumen
  merangkum product intent, keputusan 2D physics + 2.5D art, implementasi saat
  ini, seluruh ImageGen output, status integrasi, dan risiko.
- Pilot PixelLab dibatasi ke satu cyan wizard dengan idle + cast sebelum
  membuat semua state/team. Acceptance criteria mengunci pivot, silhouette,
  palette, loop, transparency, dan readability pada 48/80 px.
- Jalur MCP resmi, aturan token, prompt animation, staging integrasi, serta
  ownership boundary dicatat agar Claude dapat menentukan pelaksana berikutnya.

## 2026-08-02 — Sesi 12: Representative multiplayer art kit

**Pelaksana:** Codex dengan built-in OpenAI ImageGen.

- Menghasilkan background cave arena 1672×941 tanpa karakter/obstacle agar
  random layout tetap dimiliki server.
- Menghasilkan dua character cutout 1254×1254: wizard cyan menghadap kanan dan
  wizard pink menghadap kiri.
- Menghasilkan reflector sheet 1672×941 berisi enam stalaktit/stalagmit dalam
  tiga proporsi visual. Ini hanya skin; triangle config tetap collider resmi.
- Tiga asset cutout diproses dari chroma-key menjadi PNG ARGB menggunakan soft
  matte + despill, lalu diperiksa secara visual tanpa fringe hijau.
- Semua output disimpan di `client/public/assets/generated`, dilengkapi
  `manifest.json`. Prompt, provenance, dan guardrail integrasi dicatat di
  `ASSET-PROVENANCE.md`.
- Aset belum dipasang ke renderer pada sesi ini; canvas renderer lama sengaja
  dipertahankan sampai readability mobile dan mapping triangle diuji.

## 2026-08-02 — Sesi 12: Role dihapus, Ink jadi dial serang/tahan, arena dream sky

**Pelaksana:** Claude (orchestrator), atas keputusan produk BK.

Sesi ini menjawab tujuh poin feedback BK. Yang terbesar: **attack dan counter
dihapus seluruhnya.** Keluhan "sihir menyerang dan bertahan tidak ada bedanya"
bukan bug tuning — dua role memang dibangun oleh fungsi yang sama, dibidik oleh
clamp yang sama, dan hanya berbeda dua angka.

### Temuan sebelum menulis kode

Dibaca dulu sesuai instruksi proyek nomor 3. Lima temuan, tiga di antaranya
belum pernah tercatat di sesi mana pun:

1. **Role tidak pernah terasa.** `buildRuneBody()` satu fungsi untuk dua role.
   Role hanya mengubah `attackLaunchSpeed 1.35` vs `counterLaunchSpeed 0.82`
   dan spawn offset. Lebih parah, `clampAimToOpponent()` dipanggil untuk kedua
   role — pemain bertahan **dipaksa** membidik ke lawan. Itu jawaban untuk
   poin 7: arah defense-nya memang salah secara logika.
2. **"Pantulan" tidak ada di fisika, hanya pembukuan.** Di
   `exchangeSpellEnergy()`, `attackLoss = min(attack.energy, collisionEnergy)`
   — sekali kena counter, partikel serangan kehilangan seluruh energinya lalu
   mati karena `powerless`. Tabrakan **menghapus** serangan, bukan
   memantulkannya. Energinya muncul sebagai `counterCharge`, angka abstrak
   tanpa arah.
3. **Bug dimensi di damage.** `impact = min(available, max(0.08, speed*mass)) *
   20`. `available` adalah energi, `speed*mass` adalah momentum — dua satuan
   berbeda di-`min` bersama, lalu dikali 20. Akibatnya `spent` selalu ≈ 10×
   energi partikel, jadi `playerHitEnergyCost` tidak pernah berfungsi, dan
   `minimumPlayerImpactEnergy: 0.08` membuat partikel nyaris diam tetap memberi
   Wobble +20.8 (20% dari bar). Ini sumber rasa "acak".
4. **Ward dekoratif.** Ward maksimum 1.8, tapi `ward -= rawImpact*0.36` dengan
   rawImpact skala-20 menghabiskannya dalam satu hit.
5. **Arena menyimpang dari PRD.** PRD §1 menulis "pulau mimpi terapung", pilar
   §4.2 "Cozy chaos". Yang dibangun: gua abu-abu dengan segitiga `#555978`.
   Duri itu jelek bukan karena kurang detail — temanya sendiri sudah drift.

### Keputusan BK

- Role dihapus, semua menyerang; sihir saling menghancurkan saat bertabrakan.
- Serang-vs-tahan ditentukan **Ink → massa → kecepatan → jangkauan**.
- Ward dihapus total.
- Arena kembali ke cozy dream sky.
- Kamera zoom saat Draw/Cast, pull-back saat Resolve.

### Mekanik baru

Kontrak lengkap ditulis ulang di `DESIGN-RUNE-BODY-COMBAT.md`. Inti:

`v = sqrt(2 × launchEnergy / mass)` dengan launchEnergy konstan, sehingga
`jangkauan ∝ 1/massa`. Crossover ada di Ink 40 (jarak antar penyihir 1.1):

| Ink | massa | v | jangkauan | jadi |
|---|---|---|---|---|
| ≤25 | 0.27 | 1.40 | 1.79 | peluru |
| 40 | 0.44 | 1.09 | 1.10 | tepat sampai |
| 70 | 0.77 | 0.83 | 0.63 | layar |
| 100 | 1.10 | 0.69 | 0.44 | tembok di kaki sendiri |

Tabrakan simetris, dibobot **massa lawan**: dart 0.27 melawan tembok 1.10
menyerap 80% kerusakan, tembok menyerap 20%. Itu satu baris yang membuat rune
berat berfungsi sebagai perisai tanpa mekanik perisai apa pun.

Materi yang sudah memantul (`deflected`) boleh mengenai pemiliknya sendiri.
Materi segar tidak pernah bisa. Jadi "pantulan" sekarang benar-benar terjadi,
terlihat (rim oranye di renderer), dan menguntungkan.

### Temuan saat implementasi — yang membuat sesi ini panjang

Empat masalah baru muncul hanya karena diukur, bukan diasumsikan:

1. **Materi rune tidak punya collision dengan tanah.** Tembok berat jatuh
   menembus pulau lalu mati di bawah kill floor. Perisai yang tenggelam tidak
   memblokir apa pun — jadi separuh desain sebenarnya tidak ada. Ditambah
   `collideParticlesWithGround()`.
2. **Partikel yang diam kehilangan energi tiap frame.** Gravity memberi `vy`
   negatif kecil setiap step, jadi setiap step dihitung sebagai benturan dan
   memotong 6% energi. Tembok kehilangan 99% muatannya dalam dua detik hanya
   dengan berdiam. Ditambah `groundRestingSpeed`.
3. **Floor massa per-partikel justru meratakan kurva.** `minimumMass × count`
   dengan `count` yang ikut naik seiring Ink adalah suku linear-terhadap-Ink
   kedua. Diubah jadi floor absolut. Nilainya disapu: 0.012 memberi rentang 10x
   tapi rune teringan terbang 4x lebar arena sehingga tidak ada window bidik
   yang masuk akal; 0.27 memberi ~1.6x jarak lawan dan window yang bisa
   dimainkan.
4. **Koridor gua bisa mengunci match.** Band lama (stalagmit ≤0.42, stalaktit
   ≥0.58) menyisakan celah 0.16. Diukur pada seed 8: tembakan datar terblokir
   total sepanjang satu Round — dan karena Round hanya berakhir oleh KO, layout
   tidak pernah di-regenerate. Match tidak bisa maju sama sekali. Band diubah
   ke 0.36 / 0.82, ceiling 1.02 → 1.3 (juga lebih cocok untuk arena langit).

Dan yang paling penting untuk feel:

5. **Knockback harus melempar, bukan mendorong.** Setelah `playerImpactScale:
   20` dihapus, impuls jadi momentum nyata — tapi `groundFriction: 3.2/s`
   menghabiskannya dalam 0.2 detik. Diukur: satu hit solid menggeser penyihir
   **0.03 unit** dan satu KO butuh **20 Turn** — empat kali panjang match yang
   diminta PRD §4.4. Ditambah `knockbackLift: 0.9` (setiap benturan juga
   melempar ke atas, di mana drag 0.4/s bukan 1.4/s) dan friction diturunkan ke
   1.4. Sekarang KO terjadi dalam ~8 Turn dengan skrip naif; pemain yang
   menyesuaikan Ink dan sudut akan lebih cepat.

### Angka yang diganti

| Lama | Baru | Alasan |
|---|---|---|
| `attackLaunchSpeed/counterLaunchSpeed` | `aim.launchEnergy 0.263` | kecepatan dari massa |
| `minimumMass 0.035` (per partikel) | `0.27` (absolut) | floor per-partikel meratakan kurva |
| `maxAngleFromOpponent 1.22` (70°) | `1.45` (83°) | lob curam = cast bertahan |
| `playerImpactScale 20` | `impactTransfer 2.6` | energi vs momentum |
| `minimumPlayerImpactEnergy 0.08` | dihapus | serempetan tidak lagi 20% Wobble |
| `wobble.gainPerImpulse 13` | `46` | impuls sekarang momentum nyata |
| `player.groundFriction 3.2` | `1.4` + `knockbackLift 0.9` | KO tidak terjangkau |
| `ink.costPerUnitLength 26` | `44.4` | dikalibrasi ke zoom Draw |
| `particleRestitution 0.36` | `0.52` | pantulan harus terasa |
| ward, counterCharge, CastRole | dihapus | |

### UI, aset, kamera

- `matchScene.ts` ditulis ulang penuh: langit senja bergradien yang **terikat
  ke koordinat arena** (jadi tidak menggeser saat kamera zoom), pita aurora,
  bintang berkedip, pulau-pulau jauh berparalaks, awan yang hanyut mengikuti
  angin, pulau dengan strata batu, rumput bergoyang, bunga, dan sulur
  menggantung. Duri abu-abu jadi kristal berfaset dengan glow. Semua prosedural
  dan deterministik — tidak ada file aset, tidak ada `Math.random`; sebaran
  dekorasi memakai hash dari index, jadi kedua client melihat hal yang sama.
- `effects.ts` baru: percikan saat materi hancur (dipicu dari perbandingan dua
  snapshot, jadi presentasi murni dan tidak bisa desync) plus mote ambient.
- Penyihir digambar ulang: lebih bulat, bermata, bertongkat dengan ujung
  bercahaya, idle bob, bayangan kontak, dan cincin Wobble.
- Kamera baru di `viewport.ts`: `targetFrame()` + `easeFrame()` dengan easing
  `1 - e^(-k·dt)` yang independen frame rate. Konstanta kamera diletakkan di
  **shared** CONFIG, bukan renderer, karena zoom Draw mengubah berapa Ink yang
  dibeli satu sapuan jari — `ink.costPerUnitLength` dikalibrasi terhadapnya.
- Portrait: dua kartu pemain (≈5rem) diganti satu baris `scoreline`, readout
  rune di-overlay di atas canvas, dan canvas mengambil
  `calc(100dvh - 11.5rem)`. Sekitar 4.5rem tinggi dikembalikan ke arena.
- Readout mengganti "Ward reserve" dengan `nodes · mass · speed` plus badge
  **Shield / Screen / Strike**, dihitung dari `predictLaunch()` yang sama
  dipakai simulasi. Ini pengganti sifat 8 (informed commitment) setelah Ward
  hilang: pemain harus bisa tahu, sebelum commit, apakah runenya menyeberang
  atau jatuh di kakinya sendiri.

### Verifikasi

- **189 test hijau** pada 13 file (naik dari 176), typecheck bersih, build
  produksi bersih (120 kB JS / 37 kB gzip).
- Test baru mengunci dial: rune berat lebih lambat, jangkauan monoton turun
  terhadap Ink, crossover ada di dalam rentang Ink yang bisa dimainkan,
  `predictLaunch` cocok dengan body yang benar-benar disimulasikan, rune berat
  kehilangan fraksi lebih kecil, materi segar tidak bisa kena pemiliknya,
  materi terpantul ditandai, dan menggambar nol tidak memberi pertahanan.
- Test kamera mengunci round-trip eksak dan uniformitas dua sumbu **pada level
  zoom apa pun**, framing per pemain, pull-back bersama sejak Reveal, dan
  easing yang sama di 60 Hz maupun 120 Hz.

### Test yang saya ubah premisnya — dicatat jujur

Tiga test lama gagal bukan karena kode salah, tapi karena premisnya mati:

1. `mapping.test` mengukur budget Ink terhadap jarak arena penuh. Dengan kamera
   Draw yang zoom, itu diam-diam jadi makin ketat setiap kali kamera dirapatkan.
   Sekarang diukur terhadap frame Draw.
2. `world.test` "heavy shrugs off light" membandingkan frame terakhir — di mana
   kedua sisi sudah nol. Test itu **lulus secara vakum** sebelumnya. Sekarang
   diukur pada frame terakhir di mana kedua sisi masih ada.
3. `room.test` "eventually declares a winner" mengirim sapuan 80 titik — yang
   sekarang justru cast terberat, terlambat, dan terpendek di game — dengan
   sudut tetap ke target yang terus terdorong, menembus terrain. Membuat skrip
   tetap menang 3 kali berarti men-tuning game agar sesuai test. Test dipecah
   di sambungan yang seharusnya sejak awal: fisika membuktikan bisa menghasilkan
   Star (dengan pembidikan balistik memakai `predictLaunch` yang sama), logika
   winner sudah diuji terpisah di `match/state.test.ts` dan test forfeit.

### Debt dan risiko yang sengaja dicatat

- **Belum ada playtest manusia atas angka baru.** `impactTransfer`,
  `knockbackLift`, `launchEnergy`, dan `minimumMass` semuanya disapu terhadap
  simulasi, bukan terhadap manusia. Ini tetap wajib.
- **Kristal masih bisa memblokir tembakan datar untuk satu Round penuh.**
  Koridor sudah dilebarkan sehingga match tidak lagi deadlock, tapi jawabannya
  tetap "lob melewatinya", dan belum ada apa pun di UI yang mengajarkan itu.
  Kandidat perbaikan: garis prediksi lintasan opsional, atau regenerasi layout
  per Turn alih-alih per Round.
- **`kind: 'stalactite' | 'stalagmite'` masih dipakai di protokol** meski
  sekarang dirender sebagai kristal langit. Rename adalah churn protokol; ditunda.
- `arena.ts` (renderer Spell Lab Stage 0) hanya dipetakan ulang ke nama palet
  baru, belum ikut dipoles.
- Interpolasi antar-snapshot, simulasi lag, audio, movement Setup, deployment
  internet, dan physics-library spike tetap belum selesai.
- `match/roles.ts` sengaja ditinggal sebagai tombstone berisi penjelasan, bukan
  dihapus, supaya pembaca berikutnya tidak menemukan ulang mekanik yang sama.

### Catatan untuk Codex

Kalau kamu menyentuh `runeBody.ts` atau `world.ts`, jalankan `world.test.ts`
lebih dulu. Blok `describe('Ink is the offence/defence dial')` adalah keseluruhan
desain game ini dalam empat test — kalau salah satunya merah, game-nya sudah
kembali jadi "dua pemain melempar benda yang sama".

Dan satu pola yang terulang dari review Sesi 8: **test yang mengukur di titik
paling nyaman bisa lulus secara vakum.** Test "heavy shrugs off light" hari ini
membandingkan nol dengan nol dan lulus. Kalau sebuah sifat disebut penting,
testnya harus menyerang kasus tersulit, dan harus dicek bahwa ia benar-benar
bisa gagal.

---

## 2026-08-02 — Sesi 11: Full obstacle collision, seeded layouts, dan mobile UX

**Pelaksana:** Codex, melanjutkan feedback visual dan gameplay user.

### Bug arena yang diperbaiki

- Penyebab spell melewati stalaktit/stalagmit ditemukan: visual menggambar
  segitiga penuh, tetapi physics hanya memakai lingkaran kecil di ujungnya.
- Collider sekarang benar-benar circle-vs-triangle pada ketiga face melalui
  pure math di `shared/src/sim/collision.ts`. Posisi dikoreksi keluar dari face
  lalu velocity direfleksikan memakai restitution dari config.
- Ditambah swept collision untuk kasus partikel cepat yang masuk dan keluar
  dari satu obstacle di antara dua fixed timestep. Tembakan tidak lagi bisa
  tunnelling menembus segitiga.
- Player memakai collision path segitiga yang sama. Obstacles tidak memiliki
  HP, integrity, atau state mutable: selalu statis, tidak dapat hancur, dan
  hanya memantulkan. Energy/integrity yang berkurang adalah milik spell.

### Randomisasi authoritative

- Daftar obstacle hardcoded diganti generator data-driven di
  `CONFIG.hazards.generation`: count, x-range, jitter, width, height, ceiling,
  dan spawn clearance seluruhnya dapat dituning tanpa mengubah rumus.
- Layout dipilih dari seeded PRNG per Round. Seed/Round sama menghasilkan
  layout identik; Round atau match berbeda menghasilkan layout baru.
- Layout sekarang bagian dari `RoomView`, `ResolveInput`, `World`, dan
  `Snapshot`. Renderer tidak lagi membaca obstacle statis sendiri, sehingga
  kedua client selalu melihat geometry yang dipakai server untuk collision.

### UI/UX portrait

- Arena mobile dinaikkan menjadi `clamp(22.5rem, 54dvh, 30rem)`; pada viewport
  390×844 ukurannya 367×456 px, dibanding sekitar 277 px pada screenshot awal.
- Ditambah flow `Draw → Aim → Clash` dengan phase aktif, label Round/Turn,
  warna role Attack/Counter, dan badge gabungan wind + jumlah reflector.
- Hint diberi backdrop agar terbaca di cave, obstacle diberi outline/facet agar
  seluruh face terbaca solid, dan rune readout mobile sekarang wrap alih-alih
  terpotong.
- Pengukuran browser 390×844: `scrollWidth=390`, `scrollHeight=844`, readout
  selesai di y=761; tidak ada overflow dan console dua client bersih.

### Verifikasi

- 176 test hijau pada 13 file, termasuk full-face collision jauh dari tip,
  reflection, anti-tunnelling, obstacle immutability, seeded variation, dan
  layout yang tetap sama di seluruh snapshot Resolve.
- Typecheck dan production build bersih.
- Dua browser nyata masuk room yang sama dan melihat role serta environment
  yang sama; layout portrait diuji pada override 390×844.

### Meta/debt

- Restitution dan energy loss masih angka vertical-slice dan tetap wajib
  human playtest. Semua knob-nya sudah terpisah di `CONFIG.hazards`.
- Swept test saat ini menjamin crossing pusat partikel; circle-face overlap
  menangani grazing pada fixed timestep normal. Physics-library spike masih
  debt sebelum production.

## 2026-08-02 — Sesi 10: Rune-body combat, roles, Cast, wind, dan cave hazards

**Pelaksana:** Codex, berdasarkan keputusan produk user setelah Sesi 9.

Combat lama yang mengubah motif menjadi projectile/field generik diganti oleh
literal rune-body. Coretan apa pun—termasuk nama—sekarang menjadi rangkaian
partikel dan bond yang benar-benar ikut physics. Classifier masih dipakai untuk
telemetry/Ink canonical, tetapi tidak bisa lagi membuat bentuk “tidak berguna”.

### Flow dan role

- Turn sekarang `Setup → Draw → Cast → Reveal → Resolve → Score` dan tetap 21
  detik maksimum.
- Server menugaskan tepat satu `ATTACK` dan satu `COUNTER`; role bertukar setiap
  Turn dan tampil jelas di kedua HUD.
- Cast adalah drag kedua selama dua detik. Hanya arah yang dibaca; panjang drag
  dan pointer speed tidak memberi power. Aim tetap dalam cone menuju lawan.
- UI `Light / E / Push` dan nama motif di match dihapus. Readout hanya
  menampilkan particle count, committed Ink, dan Ward reserve.

### Rune-body dan konservasi

- `shared/src/spells/runeBody.ts` adalah pure builder: stroke di-resample menjadi
  6–28 partikel, diskalakan, diputar ke arah Cast, lalu diberi massa, energi,
  integrity, dan bond.
- Persilangan menambah cross-bond yang lebih kuat. Bond juga capsule collider,
  bukan sekadar garis renderer, sehingga loop/tulisan benar-benar menahan
  serpihan lawan.
- Collision dapat memutus bond tetapi tidak menghapus partikel. Fragmen tetap
  dipengaruhi gravity, wind, obstacle, dan dapat memberi Wobble selama masih
  memiliki energi.
- Attack energy yang hilang saat mengenai Counter adalah satu-satunya sumber
  `counterCharge`. Charge dibatasi Ink Counter dan efisiensi return; Counter
  tanpa benturan Attack dikunci test agar menghasilkan nol damage.
- Total particle energy + counterCharge tidak boleh naik. Fragmentasi membagi
  budget, tidak menggandakan damage.
- Reserved Ink menjadi Ward parsial. Ward tidak boleh 100% meniadakan hit,
  supaya strategi “tidak menggambar” tidak menghasilkan invulnerability.

### Mini-Gunbound environment

- Wind dipilih seeded per Round, terlihat sebelum Draw, dan memengaruhi semua
  partikel sebagai acceleration.
- Cave memiliki stalaktit/stalagmit dari config bersama. Triangle dirender dari
  data yang sama; tip collider memantulkan spell, merusak energy/integrity, dan
  dapat menambah impact pemain.
- Seluruh angka meta dipindah ke `CONFIG.aim`, `wind`, `hazards`, dan `runeBody`.
  Rumus dan tuning map ditulis di `DESIGN-RUNE-BODY-COMBAT.md`.

### Verifikasi

- Room browser nyata `4TLY`: role Attack/Counter konsisten di dua client dan
  terbukti bertukar pada Turn berikutnya; keduanya melihat wind yang sama.
- Dua pemain menggambar zigzag/loop, melakukan gesture Cast tanpa tombol, lalu
  menerima Reveal yang sama: 19-particle Attack melawan 16-particle Counter.
- Resolve visual menunjukkan dua rune-body bertabrakan, bond/partikel terpisah,
  counter-charge aura, cave collider, dan Ward. Console kedua client bersih.
- 169 test hijau pada 12 file, typecheck/build bersih, audit 0.

### Risiko dan debt yang sengaja dicatat

- Physics masih handwritten vertical-slice. `playerImpactScale: 20` sengaja
  agresif agar KO tetap reachable dan **wajib** dituning lewat human playtest,
  bukan dianggap angka production.
- Maksimum 28 node per rune dan circle/capsule approximation adalah budget MVP,
  bukan soft-body final.
- Viewport override browser pada sesi ini tidak benar-benar berpindah ke 390px,
  jadi perubahan HUD baru belum diklaim terverifikasi pada device asli. CSS
  responsive/safe-area dari Sesi 9 tetap ada; real iPhone test masih wajib.
- Interpolation, lag simulation, audio/VFX, movement Setup, deployment internet,
  dan physics-library spike masih belum selesai.

## 2026-08-02 — Sesi 9: Minimal multiplayer playable

**Pelaksana:** Claude (sim/protocol/server awal), Codex (client completion,
production audit, browser verification)

Vertical slice online sekarang bisa dimainkan end-to-end. Dua pemain membuat
atau masuk room lewat kode empat karakter, menggambar bersamaan, melihat Reveal
yang sama, menerima snapshot physics dari server, mendapat Star saat KO, lalu
lanjut sampai winner/rematch. Client hanya mengirim stroke; phase, pembacaan
spell, physics, dan score tetap server-authoritative.

### Yang ditambahkan

1. `shared/src/sim`: fixed-timestep deterministic simulation dengan seeded
   randomness, Wobble carry-over, projectiles/fields, KO, dan snapshots.
2. `shared/src/protocol`: schema pesan runtime untuk join, submit, Reveal,
   snapshots, score, reconnect, dan rematch.
3. `server`: room manager, authoritative phase loop, WebSocket adapter, room
   code, reconnect token, dan test dua client headless/no-desync.
4. `client`: lobby create/join, session reconnect, phase/timer/HUD, wild-spell
   capture dan preview, renderer snapshot, score/winner/rematch, serta layout
   responsive dengan safe-area dan touch input untuk iPhone.
5. Root `npm run play` menjalankan client dan server bersama; build root sekarang
   juga membangun server.

### Bug produksi yang ditemukan Codex saat melanjutkan

1. Room dimulai dengan timestamp `0`, lalu tick produksi memakai epoch
   `Date.now()`. Akibatnya Setup langsung terlewati. Semua join/start/rematch
   sekarang memakai clock yang sama dan dikunci test regresi.
2. Kode room salah sebelumnya diam-diam bisa membuat room baru yang tidak dapat
   dimasuki lawan. Join berkode sekarang hanya mencari room existing dan
   mengembalikan `room not found`.
3. Room kosong langsung dihapus saat socket putus, sehingga reconnect token
   sebenarnya tidak pernah berguna. Seat/room sekarang ditahan selama window
   30 detik dan baru direap setelahnya. Socket-close lama tidak bisa memutus
   socket pengganti; match berhenti di Setup pada batas Turn, dan lewat 30 detik
   memberi kemenangan pada lawan sesuai A-06.
4. Input hostile hanya dibatasi jumlah point; koordinat ekstrem dan arc length
   belum direpair meskipun kontrak mengklaim sebaliknya. Server kini clamp
   koordinat dan truncate path sebelum classifier/sim, dengan test `1e308` yang
   memastikan semua frame tetap finite.
5. Token reconnect memakai `Math.random()`, bertentangan dengan aturan repo dan
   buruk untuk credential. Sekarang memakai `crypto.randomUUID()`; randomness
   gameplay tetap seeded dan terpisah.
6. Reset UI winner bisa terpicu pada initial room, dan force internal Indonesia
   bocor ke UI Inggris. Kondisi reset diperketat; label kini Light/Medium/Heavy.

### Verifikasi nyata

- Dua browser riil bergabung ke room `B9MM` sebagai Codex dan Claude.
- Keduanya menggambar zigzag berlawanan secara simultan dan menerima Reveal
  simetris: Medium E/W dengan Push + tiga Ricochet.
- Resolve menghasilkan Star yang identik di kedua client dan match berlanjut.
- Reload satu browser berhasil reclaim seat, nama, room, dan score lewat token.
- Viewport iPhone 390×844 diperiksa visual; HUD, arena, Ink, dan readout tetap
  terbaca tanpa error/warning console.
- 164 test hijau, typecheck/build bersih, audit dependency 0.

### Sengaja belum disebut selesai

Physics saat ini handwritten untuk vertical slice, bukan keputusan production;
spike library di PRD masih wajib. Movement Setup, deployment internet,
interpolation/lag simulation, audio/VFX polish,
dan playtest manusia pada device asli juga belum ada. Jadi ini **minimal
multiplayer playable**, bukan game selesai.

## 2026-08-02 — Sesi 8: Review Claude atas V2 + fix property-8

**Pelaksana:** Claude (review + fix), Codex (implementasi sesi 7)

Verifikasi independen atas sesi 7: 139 test lulus, typecheck dan build bersih,
audit 0. Kontrak dihormati — `composeStroke` hanya memakai pembacaan canonical,
strength dibatasi satu budget dari ink, tiap motif punya cap. Bagus.

**Tapi sifat 8 — sifat paling penting di kontrak — dilanggar, dan test codex
melewatkannya.** Test codex hanya menguji stabilitas pada garis lurus (satu
motif, force stabil secara konstruksi). Saya probe pada zigzag: **force band
berganti 18 dari 40 kali** di bawah tremor kecil. Itu persis kegagalan
"commitment jadi lempar koin" yang sifat 8 ada untuk mencegahnya.

Akar masalah: motif, ink, dan total strength semuanya stabil (jitter ~1%).
Satu-satunya masalah, `forceMediumFraction: 0.36` duduk **tepat** di tempat
zigzag mendarat secara alami (0.357–0.362). Bucket boundary keras apa pun akan
punya bentuk yang duduk di atasnya.

Perbaikan dua bagian:

1. **Force sekarang dihitung dari committed-Ink, bukan dari total strength.**
   Committed Ink = `inkCost(arcLength)`, deterministik dan stabil, dan untuk
   stroke apa pun yang terbaca ia sebanding dengan strength — jadi tetap
   "kekuatan kasar", hanya diukur dari kuantitas yang stabil. Recipe wisp-only
   tetap dipatok Light berapa pun ink-nya, karena strength aktualnya memang
   dibatasi rendah. Ini **amandemen kontrak §6** yang saya buat sebagai design
   owner; alasannya ditulis di kode dan di kontrak.
2. **Batas band dipindah ke celah antar-cluster, bukan di atasnya.** Diukur:
   bentuk Light mendarat ≤0.36, Medium 0.51–0.61, Heavy ≥0.73. Batas baru 0.44
   dan 0.67 duduk di celah; tiap fixture ≥0.05 dari batas, ~10x margin atas
   jitter.

**Test diperkuat:** sifat 8 sekarang menguji zigzag, circle, line+loop,
loop+tail, dan spiral — masing-masing 40 percobaan bertremor. Ini test yang
seharusnya ada dari awal; garis lurus tidak akan pernah menangkap cacat ini.
Setelah fix, nol flip pada kelima bentuk. Total 140 test.

**Catatan proses untuk Codex:** kerjaanmu bagus dan verifikasinya jujur, tapi
tiga hal berulang tiap sesi. (a) Kerjaan ditinggal tidak ter-commit — aku
commit untukmu lagi. (b) Test sifat kritis hanya menutupi kasus termudah;
kalau sebuah sifat disebut "paling penting" di kontrak, testnya harus menyerang
kasus tersulit, bukan yang paling nyaman lulus. (c) Deviasi yang kamu catat di
changelog bagus — teruskan itu.

---

## 2026-08-02 — Sesi 7: Spell Lab V2 wild composition

**Pelaksana:** Codex

**Kontrak:** `DESIGN-SPELL-COMPOSITION.md` §10 butir 1–5.

Vertical slice V2 selesai: satu stroke sekarang menjadi beberapa motif berurutan,
dikomposisi menjadi recipe dengan konservasi Ink, ditampilkan sebagai preview
kasar, dan dicatat sebagai telemetry lokal yang dapat diekspor.

### 1. Segmentasi motif

Ditambahkan `shared/src/spells/motifs.ts` dengan primitive internal `thrust`,
`loop`, `spiral`, `bounce`, `unstable`, dan `wisp`. Perpotongan sendiri menjadi
sumber utama loop span; sisa stroke menjadi open run dengan thrust dan bounce.
Jumlah hasil dibatasi `maxMotifs: 5`.

Fixture kontrak sekarang mencakup garis, garis→gelung, gelung→ekor, zigzag,
zigzag→spiral, spiral murni, pentagram padat, dan titik kecil.

### 2. Recipe dan konservasi Ink

Ditambahkan `shared/src/spells/composition.ts`. `composeStroke()` selalu memakai
pembacaan canonical Standard sehingga Standard dan High menghasilkan recipe
identik angka per angka. Kekuatan komponen berbagi satu budget yang dibatasi
`inkCommitted × strengthPerInk`; menambah motif tidak menciptakan kekuatan
gratis. Aktivasi mengikuti posisi motif di sepanjang stroke.

Preview hanya memuat arah 8 penjuru, force band tiga tingkat, ikon urutan motif,
serta Ink committed/reserved. Label force dihitung dari kekuatan aktual, bukan
sekadar Ink yang dibakar.

### 3. Telemetry wajib

Ditambahkan `StrokeTelemetry` dan export JSON berversi. Semua field kontrak
dicatat saat commit: session, index, motif, pembagian Ink, summary, draw time,
point count, dan assist.

Export juga menyimpan **raw captured points**. Ini tambahan sengaja terhadap
schema kontrak: tanpa titik asli, motif yang gagal terdeteksi tidak dapat
diputar ulang atau digunakan untuk retuning; telemetry hanya akan menyimpan
opini algoritma, bukan gambar pemain.

Tidak ada upload otomatis. Data tetap lokal sampai tombol export ditekan.

### 4. Spell Lab V2 UI

Panel `Discovered 0/4`, nama Arc Bolt/Bubble Ward/Vortex/Prism Shard, confidence,
dan parameter trajectory detail dihapus dari UI. Canvas hanya menunjukkan
arah kasar dan bobot; detail pantulan/collision tetap menjadi chaos saat
Resolve. Sidebar menampilkan ikon motif, Ink commitment, Ward Reserve, jumlah
stroke sesi, dan tombol export.

### Deviasi dan bug yang ditemukan saat implementasi

1. **Spiral murni tidak self-intersect.** Kontrak sekaligus mensyaratkan
   self-intersection dan fixture spiral dua putaran. Implementasi memakai
   self-intersection sebagai aturan utama, dengan fallback winding + radial
   trend khusus spiral yang tidak memiliki perpotongan.
2. **Gelung manual tidak selalu berpotongan tepat.** Browser test menunjukkan
   smoothing dapat memisahkan seam beberapa piksel. Near-intersection tolerance
   berbasis jarak antar-sample ditambahkan. Hanya intersection matematis yang
   boleh memicu `unstable`, sehingga toleransi seam tidak mengubah loop biasa
   menjadi chaos.
3. **Wisp sempat mendapat seluruh strength budget.** Bobot relatif tidak cukup
   ketika Wisp menjadi satu-satunya komponen. Semua motif sekarang memiliki cap
   data-driven; Wisp tetap lemah walau pemain membakar 100 Ink, dan preview
   melaporkannya sebagai Light, bukan Heavy.

### Kontrak test dan verifikasi

| Cek | Hasil |
|---|---|
| Deteksi 8 fixture motif | lulus |
| Sifat 1–8 (monotonisitas hingga stability) | lulus |
| Fairness Standard vs High recipe | identik |
| Telemetry + JSON + raw replay points | lulus |
| `npm test` | **139 passed** dalam 9 file |
| `npm run typecheck` | bersih |
| `npm run build` | bersih |
| `npm audit` | **0 vulnerabilities** |
| Browser: manual thrust→loop | 2 ikon berurutan, arah East |
| Browser: Wisp + full Ink | Light, 100 committed, 0 reserved |
| Browser: export | enabled setelah commit, tanpa console error |

### Keputusan yang masih milik Claude

Draw Assist sengaja menghasilkan recipe yang identik sesuai sifat 6. Akibatnya,
toggle Assist tidak memiliki efek yang terlihat pada V2 saat ini. Claude perlu
memutuskan apakah toggle dihapus sampai ada fungsi non-physics yang nyata, atau
kontrak fairness direvisi agar assist boleh mengubah deteksi motif tanpa
mengubah parameter fisik dari motif yang sama.

Butir §10 berikutnya belum dikerjakan: revisi PRD oleh Claude, Network Risk
Spike, dan physics-library spike. Physics Toy/Ward Reserve aktual juga belum ada.

---

## 2026-08-02 — Sesi 6: Arah dikunci pemilik produk + kontrak komposisi

**Pelaksana:** Claude

BK meng-override tiga butir keputusan sesi 5. Arah final: **coretan liar, bukan
empat jenis coretan**, dengan ink sebagai keputusan menyerang-versus-bertahan.

Kontrak implementasi lengkap ada di **`DESIGN-SPELL-COMPOSITION.md`**.
`DECISION-WILD-SPELLS.md` diberi tanda superseded dan §11 mencatat butir mana
yang gugur beserta alasannya.

### Empat butir arah yang dikunci

1. Coretan liar; tidak ada bentuk "benar" yang harus ditemukan.
2. Ink yang dipakai menyerang adalah ink yang tidak bisa dipakai bertahan.
3. Pemain tahu kasarnya, kaget detailnya.
4. Empat keluarga jadi primitive internal; pemain tidak pernah melihat namanya.

### Argumen saya yang gugur — dicatat jujur

**Playtest-first gugur paling telak.** Saya berargumen "uji premisnya sebelum
pivot", tapi premis itu milik proposal. BK tidak mengajukan hipotesis; ia
menyatakan game apa yang ingin ia buat. Memvalidasi versi lama tidak berguna
kalau pemiliknya tidak akan membangunnya apa pun hasilnya.

**"Dominan + modifier" gugur** karena menjawab pertanyaan yang salah. Saya
mengoptimalkan keterbacaan dan testability; BK mengoptimalkan kebebasan
menggambar. Untuk produk bertagline *"Expect Chaos"* dengan pilar berjudul
*"Cozy chaos"*, prioritas BK lebih setia pada PRD daripada prioritas saya.

**Mempertahankan nama keluarga gugur.** Selama pemain melihat "Arc Bolt", ia
akan berusaha membuat Arc Bolt — perburuan simbol yang justru ingin dibunuh.

### Yang bertahan, dan justru menguat

Masalah **informed commitment**: keputusan ink hanya bermakna kalau pemain bisa
memperkirakan apa yang ia beli. Kedua pemain sudah menggambar rahasia dan
serentak (§6.2), jadi serangan lawan tidak diketahui; kalau hasil coretan
sendiri juga tidak diketahui, commit jadi lempar koin — persis risiko §20
*"Physics terasa acak → kekalahan tidak adil"*.

Ini melahirkan butir arah 3 dan **sifat 8 di kontrak test**: `summary.heading`
dan `summary.force` wajib stabil terhadap tremor kecil meskipun detail
komponennya berubah. Itu memberi gigi pada "chaos di detail, bukan di kategori",
dan mencapai tujuan keterbacaan saya tanpa memaksakan pemenang tunggal.

Ward Reserve tetap milik Physics Toy — Spell Lab tidak punya lawan, jadi
trade-off-nya tidak bisa dirasakan di sana. V2 hanya wajib menampilkan pembagian
ink. Network Risk Spike tetap paralel sekarang.

**Kompensasi atas batalnya playtest:** telemetry jadi syarat wajib V2, bukan
follow-up. Orang pertama yang memakai V2 menghasilkan data yang tadinya diminta
dari sesi observasi.

**Tidak ada kode gameplay yang diubah sesi ini.** 119 test tetap hijau.

---

## 2026-08-02 — Sesi 5: Keputusan lead atas proposal pivot

**Pelaksana:** Claude (main lead)

Keputusan lengkap ada di **`DECISION-WILD-SPELLS.md`**. Ringkas:

**REVISED.** Diagnosis proposal benar dan buktinya ada di kode sendiri — panel
"Discovered 0/4" yang saya bangun adalah checklist berburu simbol, dan PRD §4.1
sudah melarang "menu terselubung". Celah janji juga nyata: garis dengan loop di
ujung saat ini jadi salah satu saja, separuh gambar dibuang, padahal §1
menjanjikan setiap coretan jadi sihir.

Tiga revisi terhadap proposal:

1. **Komposisi jadi dominan + modifier, bukan hybrid bebas.** Satu keluarga
   dominan menentukan perilaku besar; motif sekunder jadi modifier. Ini
   pembacaan harfiah kalimat proposal sendiri — "fungsi besarnya harus dapat
   diprediksi" — dan menjaga readability (§20), menjaga 119 test tetap valid,
   serta bersifat superset sehingga bisa dikirim bertahap.
2. **Ward Reserve pindah dari Spell Lab ke Physics Toy.** Itu mekanik match,
   bukan mekanik menggambar; Spell Lab tidak punya lawan sehingga trade-off
   menyerang-vs-bertahan tidak bisa dirasakan di sana.
3. **Network Risk Spike dinaikkan ke sekarang, paralel.** Multiplayer 0% dan
   desync adalah risiko utama §20. Spike ini independen penuh dari perdebatan
   spell.

Satu penolakan: **urutan pelaksanaannya.** Premis proposal belum diuji satu
manusia pun. Playtest 10 orang menguji premis itu langsung dan murah — apa pun
hasilnya membuat Spell Lab V2 lebih baik. Biaya pivot juga rendah karena
classifier sudah menghitung semua bukti yang dibutuhkan komposisi
(`scoreFamilies()` sudah mengembalikan skor kontinu lima keluarga dan kita
membuang empat), jadi tidak ada tekanan untuk memutuskan tanpa bukti.

Urutan: playtest + network spike + physics spike + telemetry **sekarang
paralel**; revisi PRD dan Spell Lab V2 **sesudah** playtest; Ward Reserve
sesudah Physics Toy ada.

---

## 2026-08-02 — Sesi 4: Proposal product pivot untuk keputusan lead

Ideator mengklarifikasi bahwa fantasy utamanya bukan memilih satu dari empat
jenis coretan, melainkan membuat coretan liar yang menjadi perilaku fisika, serta
menggunakan satu pool Ink untuk trade-off menyerang versus bertahan.

Proposal lengkap ditulis di `DESIGN-PROPOSAL-WILD-SPELLS.md`. Empat keluarga
diusulkan berubah menjadi primitive/motif yang dapat digabung, bukan empat spell
yang saling eksklusif. Sisa Ink setelah Draw diusulkan menjadi Ward Reserve
otomatis agar defense tidak bergantung pada input real-time atau latency.

Dokumen juga mencatat progres realistis (MVP sekitar 8–12%, multiplayer 0%),
dampak terhadap kode yang sudah ada, serta roadmap Spell Lab V2 → Physics Toy →
Network Risk Spike → Local Match → Online 1v1 → Presentation.

**Tidak ada gameplay yang diubah pada sesi ini.** Proposal sengaja berstatus
pending. Claude sebagai main lead diminta menerima, merevisi, atau menolaknya,
lalu menentukan apakah revisi PRD dan Spell Lab V2 menjadi pekerjaan Claude,
Codex, atau dibagi dengan implementer/reviewer terpisah.

---

## 2026-08-02 — Sesi 3: Lifecycle pointer dan status Stage 0

**Pelaksana:** Codex

**Status Stage 0:** technical prototype bersih, **belum** tervalidasi. Gate yang
tersisa tetap playtest cohort manusia.

Sesi ini menindaklanjuti tiga gap dari audit commit `89f1e35`.

### 1. Stroke sekarang hanya di-commit satu kali

Sebelumnya stroke yang menghabiskan tinta di-commit langsung dari
`onStrokeMove`, lalu di-commit lagi ketika event `pointerup` menyusul. Commit
kedua menaikkan `strokeIndex` dua kali dan bisa meroll ulang variance untuk
gesture yang sama; instrumentasi playtest yang dipasang di jalur ini juga akan
mencatat satu gesture sebagai dua stroke.

`SpellLab` sekarang memiliki guard per-stroke dan satu fungsi `commitStroke()`
yang idempotent. Auto-stop karena tinta dan release biasa memakai jalur commit
yang sama, sehingga side effect hanya terjadi sekali.

### 2. Posisi `pointerup` menjadi endpoint sebenarnya

`attachPointerStream` sejak awal sudah menyediakan koordinat release melalui
sample `onEnd`, tetapi `SpellLab` membuang sample tersebut. Sekarang posisi itu
diteruskan ke capture sebelum klasifikasi final. Ini menjaga arah bidik untuk
gesture pendek/touch yang release-nya merupakan sample paling baru.

Ditambahkan `client/src/input/pointer.test.ts` untuk mengunci bahwa koordinat
release diteruskan utuh dan satu pointer tidak menghasilkan dua event akhir.

### 3. UI tidak lagi mengklaim satu sesi membuktikan Stage 0

Copy awal dan copy setelah menemukan 4/4 sekarang menyebut hasil tersebut
sebagai keberhasilan **sesi individual** dan tetap menyatakan bahwa validasi
cohort diperlukan. Menemukan empat keluarga membuktikan classifier dapat
dijangkau, bukan bahwa target PRD ≥90% penguji sudah tercapai.

### 4. Rentang Node disamakan dengan toolchain

`engines.node` pada `package.json` dan `package-lock.json` diubah dari `>=20`
menjadi `^20.19.0 || >=22.12.0`, sesuai persyaratan Vite 8. Dengan demikian
Node 20 lama tidak lagi dinyatakan kompatibel secara keliru.

### Verifikasi sesi 3

| Cek | Hasil |
|---|---|
| `npm ci --ignore-scripts` | bersih dari lockfile |
| `npm audit` | **0 vulnerabilities** |
| `npm test` | **119 passed** dalam 7 file |
| `npm run typecheck` | bersih |
| `npm run build` | bersih |
| Browser: auto-stop tinta | `Out of ink`, satu hasil final, tanpa console error |
| Browser: status cohort | copy baru tampil sebelum dan sesudah sesi |

**Belum dikerjakan:** export JSON untuk instrumentasi playtest, playtest cohort
10+ manusia, physics-library spike, dan asset provenance register. Stage 1 tetap
belum dimulai.

---

## 2026-08-02 — Sesi 2: Perbaikan hasil review

**Status Stage 0:** technical prototype disetujui, **belum** tervalidasi
sebagai Stage 0. Yang menghalangi sekarang hanya playtest manusia.

Review menemukan 5 temuan. Nomor 1–4 diperbaiki di sesi ini; nomor 5 butuh
manusia dan tidak bisa dikerjakan di sini.

### Temuan 1 — Draw Assist mengubah physics (blocker fairness)

**Benar, dan lebih parah dari yang dilaporkan.**

Reviewer mengukur input identik menghasilkan 4 vs 1 pantulan dan knockback
1,73 vs 1,37. Angkanya cocok persis dengan `1.25 + 4×0.12` dan `1.25 + 1×0.12`
— penyebabnya spell dibangun dari feature hasil pipeline ber-assist, sehingga
smoothing dan toleransi yang melebar mengubah jumlah sudut terdeteksi.

Perbaikan: `Classification` sekarang membawa dua pembacaan. `features` adalah
pembacaan ber-assist yang dipakai untuk **memutuskan keluarga**, dan
`canonical` adalah pembacaan Standard yang dipakai untuk **semua parameter
gameplay** — aim, radius, massa, spin, bounces, knockback, variance, dan speed.
Assist boleh menentukan gambar itu Loop atau Wisp; assist tidak boleh
menentukan seberapa kuat Loop itu.

**Saat menulis test regresinya, ditemukan bug yang jauh lebih serius:
High assist membuat recognition lebih buruk, bukan lebih baik.** Diukur pada 60
lingkaran bertremor: Standard mengenali 60, High mengenali **0**. Zigzag bersih
tiga sudut terbaca Arc Bolt. Dua penyebab:

1. `cornerAngleMin * toleranceScale` menaikkan ambang sudut ke 100°, di atas
   90° milik zigzag biasa. Semua band toleransi lain melebar dengan dikalikan
   karena mengukur "seberapa jauh gambar boleh meleset"; yang ini kebalikannya
   — ambang lebih tinggi berarti lebih sedikit sudut terdeteksi.
2. `spiralTurningMin / toleranceScale` menurunkan plafon ramp spiral ke 7,24
   sementara lantainya 7,23. Ramp selebar 0,01 radian: setiap lingkaran yang
   sedikit overdraw langsung mendapat `multiRevolution` penuh, yang menolkan
   skor Loop.

Prinsip yang sekarang dipegang dan ditulis di kode: **toleransi hanya melebarkan
band yang mengukur ketidaksempurnaan, tidak pernah menggeser batas antar
keluarga.** Ambang sudut dan ambang spiral keduanya batas antar keluarga, jadi
tidak diskalakan sama sekali. Assist bekerja lewat smoothing dan lewat band
closure, straightness, serta radial consistency.

`smoothingPasses` untuk High diturunkan 3 → 2: diukur lintas level tremor,
pass ketiga membulatkan sudut zigzag asli lebih banyak daripada keuntungan yang
diberikannya di tempat lain.

Setelah perbaikan, pada tremor berat (noise 0.18) High assist mengenali 59/60
lingkaran vs 47/60 pada Standard — arah yang seharusnya.

Test baru `shared/src/spells/fairness.test.ts` mengunci keduanya: physics
identik lintas setting, **dan** recognition High tidak pernah lebih rendah dari
Standard. Yang kedua adalah cek yang hilang di sesi 1 — sesi 1 menguji assist
tidak menambah *power*, tapi tidak pernah menguji assist benar-benar
*membantu*, sehingga kegagalan total itu lolos tanpa terdeteksi.

### Temuan 2 — Checkout tidak reproducible

Benar. `package-lock.json` sekarang di-commit. `npm audit` melaporkan 5
kerentanan (1 critical, 1 high, 3 moderate), semuanya berasal dari rantai
esbuild → vite → vitest. Toolchain di-upgrade ke vite 8 dan vitest 4;
`npm audit` sekarang **0 vulnerabilities**.

TypeScript sengaja ditahan di 5.9 dan tidak dinaikkan ke 7.x — itu rewrite
compiler yang baru, dan menaikkannya di sesi perbaikan fairness adalah risiko
yang tidak perlu. Catat sebagai keputusan, bukan kelalaian.

### Temuan 3 — `maxPoints: 512` tidak pernah ditegakkan

Benar, dan ada dua lapis yang perlu diperbaiki:

- `decimate()` baru di `shared/src/spells/geometry.ts`, dipanggil di awal
  `extractFeatures`, sehingga batas PRD §15 ditegakkan identik di client dan
  server dan tidak bisa dilupakan pemanggil.
- `StrokeCapture` membuang sample yang lebih rapat dari `minSampleSpacing`, dan
  menipiskan diri (buang selang-seling, gandakan spacing) saat mencapai
  `maxPoints`. Spacing saja tidak cukup: spacing membatasi kerapatan tapi bukan
  panjang, dan sapuan panjang tetap tembus ke 1400 titik saat diuji.
- Klasifikasi live tidak lagi jalan per pointer sample. `onStrokeMove` hanya
  menandai preview basi; render loop mengklasifikasi sekali per frame.

Saat menulis testnya ditemukan satu bug lagi: membuang sample sub-spacing juga
**membuang titik akhir stroke yang sebenarnya**. Titik akhir ikut menentukan
arah bidik, jadi setiap stroke arahnya bergeser sedikit. `end()` sekarang
menambahkan fragmen terakhir sebelum menutup.

### Temuan 4 — Stroke kecil tidak jadi Wisp

Benar. UI memakai satu jalur untuk live preview dan untuk stroke yang dilepas,
jadi ambang "belum cukup titik" milik preview ikut menelan hasil akhir dan
tampilan diam-diam kembali ke "Draw something". Sekarang `evaluate()` punya
mode `commit`: stroke yang dilepas **selalu** menghasilkan spell, termasuk satu
ketukan yang jadi Arcane Wisp. Hanya live preview yang boleh kosong.

### Temuan 5 — Exit criteria butuh cohort manusia

Setuju sepenuhnya, dan tidak dikerjakan di sini. Menemukan 4/4 dalam satu sesi
membuktikan keempat keluarga terjangkau, bukan bahwa 90% penguji bisa
mencapainya. Butuh minimal 10 penguji dan pencatatan hasil.

### Verifikasi sesi 2

| Cek | Hasil |
|---|---|
| `npm ci` dari lockfile | bersih |
| `npm audit` | **0 vulnerabilities** |
| `npm test` | **117 passed** (naik dari 93) |
| `npm run typecheck` | bersih |
| `npm run build` | bersih |
| Assist: physics identik | dikunci test, 9 bentuk |
| Assist: recognition tidak turun | dikunci test, 4 level tremor × 4 keluarga × 60 seed |

Belum diverifikasi: rendering canvas dan interaksi pointer di browser asli —
sama seperti sesi 1, butuh manusia.

---

## 2026-08-02 — Sesi 1: Audit PRD + Stage 0 (Spell Lab)

**Orchestrator:** Claude
**Titik awal:** repo kosong, hanya `PRD.md`
**Titik akhir:** Stage 0 selesai dan dapat dimainkan, 93 test hijau

### 1. Audit PRD — 6 cacat ditemukan

Sesuai instruksi proyek nomor 3 (bersikap skeptis), PRD dibaca penuh sebelum
menulis kode. Enam masalah ditemukan; semuanya didokumentasikan lengkap beserta
resolusinya di **`PRD-AMENDMENTS.md`**. Ringkas:

| ID | Severity | Masalah | Resolusi |
|---|---|---|---|
| A-01 | Kritis | Kata "ronde" dipakai untuk dua konsep. Dibaca harfiah, Wobble reset tiap ~20 detik sehingga tidak pernah menumpuk dan knock-out mustahil — match tidak bisa selesai | Terminologi dipisah: **Turn** (siklus fase) vs **Round** (segmen ber-Star). Wobble reset per Round, ink per Turn |
| A-02 | Kritis | Double-KO pada 2–2 menghasilkan 3–3; first-to-3 tidak punya aturan seri | Star ditahan, masuk **Sudden Death** dengan jendela double-KO lebih sempit |
| A-03 | Serius | §9 mengizinkan gerak saat Resolve, membatalkan klaim §15 bahwa latency tidak menentukan dan replay cukup dari seed + 2 stroke | Movement dikunci ke fase Setup saja |
| A-04 | Gap | "Arah stroke menentukan arah cast" tanpa definisi pemetaan canvas → arena | **Canvas = overlay 1:1 di atas arena**. Gambar ke kanan-atas, spell ke kanan-atas |
| A-05 | Gap | Loop dan Spiral tertutup — "arah stroke utama" tidak bermakna secara matematis | Spawn per topologi: terbuka dari caster, tertutup di **centroid** (di-clamp ke `maxCastRadius`, bukan ditolak) |
| A-06 | Minor | Reconnect ada di success metrics tapi tidak di scope §17 | Ditambahkan ke scope wajib dengan cakupan minimal |

Keputusan A-03, A-04, A-05 dikonfirmasi ke pemilik produk sebelum implementasi.
A-01 dan A-02 punya satu-satunya resolusi yang konsisten secara internal, jadi
diterapkan langsung.

### 2. Yang dibangun

Monorepo npm workspaces, TypeScript strict penuh (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `verbatimModuleSyntax`). Struktur mengikuti batas
modul PRD §21.

```
shared/src/
  config/      types.ts, index.ts, spells.ts    — semua tuning value sebagai data
  spells/      geometry.ts, features.ts,         — pipeline stroke, pure function
               classifier.ts, mapping.ts
  match/       state.ts, random.ts               — state machine + seeded PRNG
client/src/
  input/       pointer.ts                        — mouse/pen/touch via Pointer Events
  drawing/     strokeCapture.ts                  — capture + enforcement ink meter
  rendering/   viewport.ts, arena.ts, palette.ts — canvas 2D
  ui/          spellLab.ts                       — layar Stage 0
```

**Nol magic number di kode gameplay.** Setiap nilai yang bisa di-tuning hidup di
`shared/src/config`. Menambah spell keluarga keenam = menambah satu entri data,
tanpa menyentuh classifier atau match loop (PRD §21).

**Classifier bukan decision tree.** Setiap keluarga mendapat skor kontinu dari
bukti geometris yang saling independen, lalu skor tertinggi menang. Alasannya
ada di PRD §20 sendiri: decision tree membuat gambar yang meleset satu derajat
dari ambang berpindah keluarga sepenuhnya — persis "recognition terasa seperti
ujian" yang jadi risiko nomor satu. Dengan skor, hasil menurun mulus dan yang
kalah tipis adalah near-miss, bukan jawaban salah.

### 3. Bug yang ditemukan test — dan diperbaiki

Test suite dibangun **sebelum** classifier dinyatakan selesai, dan langsung
menangkap enam bug nyata. Akurasi dataset naik 48% → 100%. Semuanya bug asli,
bukan test yang salah:

1. **Turning diukur antar-sampel berdekatan.** Tremor sub-milimeter membalik
   arah antara dua sampel bertetangga dan menyumbang hampir π radian, sehingga
   garis lurus yang sedikit goyah terukur lebih melengkung daripada lingkaran.
   Sekarang diukur lintas window.
2. **Winding dan radius ratio tidak dijaga.** Untuk garis lurus, centroid jatuh
   *di atas* stroke, jadi titik-titik menyapu dari satu sisi ke sisi lain dan
   melaporkan setengah revolusi winding plus radius ratio 8× — murni artefak.
   Ditambahkan metrik `enclosure` sebagai gate.
3. **`pathClosure` window terlalu lebar.** Mencari 60% path membuat setiap
   stroke terbuka terlihat setengah tertutup (titik terdekat pada garis lurus
   adalah titik di 60%, hanya 40% panjang jauhnya). Diperketat ke 25%.
4. **Circularity salah untuk lingkaran overdraw.** Circularity membagi dengan
   kuadrat perimeter; lingkaran yang digambar lewat sepertiga putaran melihat
   perimeternya tumbuh sementara luasnya tidak, dan circularity-nya runtuh
   walau bentuknya masih lingkaran sempurna. Overdraw adalah yang tangan
   manusia lakukan, jadi ukuran roundness harus buta terhadapnya — diganti
   **radial consistency** (std dev radius / mean).
5. **Seam wraparound memalsukan sudut.** Cincin yang tidak menutup rapat
   melaporkan dua sudut yang tidak pernah digambar dan jadi Prism Shard.
   Wraparound sekarang hanya aktif saat endpoint benar-benar bertemu.
6. **Corner detection tidak monotonik.** Filter baseline-relatif membuat zigzag
   9 sudut melaporkan **nol** sudut (jadi Arc Bolt) sementara 11 sudut
   melaporkan sebelas. Filter dibuang; kasus spiral yang jadi alasannya
   ditangani di tempat yang benar — keluarga Vortex tidak melihat sudut sama
   sekali.

Selain itu ditemukan **satu exploit**: ink dihitung dari panjang stroke, jadi
sentakan mouse 3 piksel membeli Arc Bolt kekuatan penuh dengan biaya nyaris nol
dan membuat Ink Meter — sistem yang seharusnya membatasi ukuran spell — tidak
relevan. Ditambahkan `strokeLimits.minSize`; gambar di bawah ambang jadi Arcane
Wisp.

**`cornerAngleMin` di-tuning dengan sweep, bukan ditebak.** Satu-satunya failure
mode yang tersisa adalah garis goyah terbaca Prism Shard. Disapu lintas level
tremor: 50° salah baca 10% garis goyah, 69° nol sampai tremor berat, 74° mulai
kehilangan zigzag asli. Dipilih 69°. Salah ke arah Arc Bolt juga kesalahan yang
lebih baik — garis salah baca tetap terbang ke arah yang dibidik, sementara
Prism Shard salah baca memantul ke tempat yang tidak diinginkan.

### 4. Verifikasi

| Cek | Hasil |
|---|---|
| `npm test` | **93 passed** (73 shared, 20 client) |
| `npm run typecheck` | bersih, strict penuh |
| `npm run build` | bersih, 24 kB JS gzip 9 kB |
| Dev server | semua modul di-transform dan disajikan 200 |
| Akurasi classifier | 100% pada dataset bersih dan bertremor sedang; 92.5% pada tremor berat |
| ID HTML vs query TS | 13/13 cocok |

**Belum diverifikasi:** rendering canvas dan interaksi pointer sesungguhnya —
keduanya butuh browser asli, tidak bisa dicek headless. Perlu dijalankan manual
sekali (`npm run dev`) sebelum Stage 0 dinyatakan lulus.

### 5. Catatan keputusan teknis

- **Canvas 2D, bukan Three.js, untuk Stage 0.** PRD §15 mengunci Three.js untuk
  client game, tapi Stage 0 hanya butuh satu layar gambar. Memperkenalkan scene
  graph 3D, kamera, dan pipeline aset sebelum sistem menggambar terbukti akan
  membalik stage gate yang PRD §20 ada untuk menegakkannya. Renderer diisolasi
  di `client/src/rendering/`, jadi Three.js masuk di Stage 1 tanpa menyentuh
  classifier.
- **Belum ada physics library.** PRD §15 mewajibkan spike kecil sebelum memilih.
  Belum dilakukan — Stage 1.
- **`server/` masih kosong.** Sengaja: Stage 0 offline penuh.
- **Folder donor tidak diakses.** `D:\Projects\DreamyExpedition` dan
  `D:\Projects\three` tidak ter-mount di sesi ini, jadi tidak ada aset yang
  di-port. Asset provenance register (PRD §16) belum dibuat karena belum ada
  aset. Wajib ada sebelum aset pertama masuk build.

### 6. Untuk codex — pekerjaan berikutnya (sesi 1; lihat handover di bawah)

Urutan mengikuti stage gate PRD §18. **Jangan lompat ke Stage 1 sebelum Stage 0
diuji ke manusia** — itu justru risiko yang PRD §20 baris terakhir peringatkan.

1. **Jalankan Stage 0 ke penguji.** Exit criteria: ≥90% penguji menghasilkan
   empat keluarga spell tanpa bantuan developer. Tracker discovery di panel
   kanan sudah mengukur ini secara langsung — cukup lihat layarnya.
2. **Spike physics library** (PRD §15 mewajibkan). Kandidat: Rapier2D (Rust/WASM,
   deterministik, fixed timestep) vs planck.js (port Box2D, JS murni). Kriteria:
   determinisme lintas mesin, ukuran bundle, kemudahan jalan di Node untuk
   server authoritative.
3. **Stage 1 — Physics Toy.** Satu karakter, satu dummy, empat spell, props,
   Wobble, knock-out. `shared/src/match/state.ts` sudah menyediakan Wobble dan
   scoring; yang kurang adalah simulasi.

Kalau ada yang terasa aneh di `shared/src/spells/`, baca komentarnya dulu — tiap
ambang di sana punya alasan yang ditulis, dan beberapa di antaranya
kontra-intuitif justru karena versi intuitifnya sudah dicoba dan gagal.

---

## Batas handover ke codex

Ditulis 2026-08-02 setelah sesi 2. Ini jawaban atas pertanyaan "sampai tahap
mana bisa di-handover".

### Sudah selesai dan tidak perlu disentuh codex

`shared/` sudah lengkap untuk Stage 0 dan sudah dipakai sebagai fondasi Stage 1.
Classifier, mapping, config, dan state machine punya 117 test dan setiap ambang
punya alasan tertulis. **Jangan refactor bagian ini tanpa menjalankan
`fairness.test.ts` dan `classifier.test.ts` lebih dulu** — tiga kali di dua sesi
ini, perubahan yang terlihat menyederhanakan justru merusak satu keluarga spell
secara diam-diam.

### Blocker yang bukan pekerjaan kode

**Playtest 10+ penguji manusia.** Ini satu-satunya yang menghalangi Stage 0
dinyatakan lulus, dan tidak ada baris kode yang bisa menggantikannya. Tracker
discovery di panel kanan sudah mengukur exit criteria secara langsung. Yang
perlu dicatat per penguji: berapa lama sampai cast pertama, keluarga mana yang
ditemukan, keluarga mana yang macet, dan berapa ronde yang memicu keluhan
"gambar saya tidak terbaca" (target PRD §19: di bawah 10%).

Jalankan ini **sebelum** menyentuh Stage 1. Kalau ternyata 30% penguji tidak
bisa membuat Spiral, itu mengubah desain classifier — dan kalau Stage 1 sudah
dibangun di atasnya, perubahan itu jadi jauh lebih mahal.

### Titik handover yang bersih untuk codex

Tiga pekerjaan berikut independen satu sama lain dan tidak menyentuh file yang
sama, jadi aman dikerjakan paralel atau diserahkan penuh:

1. **Spike physics library** (PRD §15 mewajibkan spike sebelum memilih).
   Deliverable: dokumen pendek + demo kecil, bukan integrasi. Kriteria:
   determinisme lintas mesin dengan fixed timestep, jalan di Node untuk server
   authoritative, ukuran bundle. Kandidat: Rapier2D (Rust/WASM) vs planck.js.
   **Tidak menyentuh file mana pun yang ada sekarang.**

2. **Instrumentasi playtest.** Catat hasil tiap stroke ke JSON yang bisa
   di-export dari Spell Lab: keluarga, confidence, waktu, apakah jatuh ke Wisp.
   Ini yang mengubah playtest dari kesan jadi angka. Menyentuh
   `client/src/ui/spellLab.ts` saja.

3. **Asset provenance register** (PRD §16). Belum ada karena belum ada aset,
   tapi wajib ada **sebelum** aset pertama masuk build. Folder donor
   `D:\Projects\DreamyExpedition` dan `D:\Projects\three` belum pernah diakses
   di kedua sesi ini. Murni dokumen.

### Yang sebaiknya belum diserahkan

**Stage 1 (Physics Toy) belum siap di-handover.** Bukan karena sulit, tapi
karena bentuknya masih tergantung dua hal yang belum ada: hasil spike physics
dan hasil playtest. Menyerahkannya sekarang berarti codex menebak keduanya.

Kalau spike selesai dan playtest lulus, Stage 1 jadi handover yang bersih:
`shared/src/match/state.ts` sudah menyediakan Wobble, scoring, dan fase; yang
kurang tinggal simulasi dan integrasinya.
