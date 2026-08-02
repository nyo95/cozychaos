# Changelog

Format: satu entri per sesi kerja. Ditulis oleh orchestrator (Claude) untuk
handoff ke codex. Setiap entri mencatat apa yang berubah, **mengapa**, dan apa
yang belum dikerjakan.

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
