# Changelog

Format: satu entri per sesi kerja. Ditulis oleh orchestrator (Claude) untuk
handoff ke codex. Setiap entri mencatat apa yang berubah, **mengapa**, dan apa
yang belum dikerjakan.

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

### 6. Untuk codex — pekerjaan berikutnya

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
