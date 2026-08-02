# Handover eksekusi untuk Codex

Ditulis 2026-08-02 (Sesi 14) oleh Claude sebagai orchestrator, lalu diperbarui
sampai Sesi 17. Stage 1 di bawah dipertahankan sebagai execution record; status
aktif selalu mengikuti override terbaru dan `roadmap.md`.

> **Override BK — Session 16 (2026-08-02):** Stage 1 T1–T5 sudah selesai dan
> tersimpan dalam lima commit. BK kemudian secara eksplisit menunda Stage 2
> playtest dan memerintahkan maju langsung dengan PixelLab. Karena keputusan
> product owner ini lebih baru, label “Stage 3 DIBLOKIR” di bawah adalah riwayat
> keputusan lama, bukan blocker aktif. PixelLab Stage 3A (cyan base + idle +
> clean cast, pink palette derivative, runtime loader, procedural fallback)
> dikerjakan pada Session 16. T6–T7 tetap utang sebelum balancing/public beta.
> State terbaru ada di `roadmap.md` §5–6 dan entri teratas `changelog.md`.

> **Update BK — Session 17 (2026-08-02):** preview gua yang masih tampil di
> roadmap bukan arah aktif. Codex membuat tiga pass environment PixelLab dan
> menerima `pixellab-pilot/environment/dream-island-arena.png` sebagai
> art-direction reference open-sky. V1 (cave-like aperture) dan V3 (edit tanpa
> perubahan material) ditolak tetapi dipertahankan untuk provenance. Jangan
> wire platform hasil generasi ke collision: lebarnya tidak cocok dengan arena
> config. Runtime `drawIsland`/`drawCrystals` tetap mengikuti shared config.

> **Update BK — Session 18 (2026-08-03):** repository aktif ada di
> `https://github.com/nyo95/cozychaos` dan production deployment di
> `https://cozychaos.vercel.app`. Frontend Vite memakai WebSocket same-origin
> `/ws`; local server dan Vercel sama-sama memakai factory
> `server/src/app.ts`. Production smoke test dua socket melewati Draw → Cast →
> Reveal → Resolve dengan reveal/frame identik. Limitation aktif: RoomManager
> masih in-memory per Function instance; sebelum traffic horizontal, pindahkan
> room state/pub-sub ke shared store. Test suite sekarang 195.

---

## Ringkasan situasi

Kode dalam kondisi sehat: **195 test hijau**, typecheck/build bersih, audit 0.
Recovery repo dan sinkronisasi dokumen sudah selesai; cave preview juga sudah
diganti pada Sesi 17. Utang aktif adalah human combat validation, physics
library spike, hosted deployment, dan batch animasi setelah pilot diterima.

### Sumber kebenaran, terurut

| Prioritas | Dokumen | Status |
|---|---|---|
| 1 | `DESIGN-RUNE-BODY-COMBAT.md` | **Benar.** Kontrak combat aktif, ditulis ulang Sesi 12. |
| 2 | `shared/src/config/` + kode | **Benar.** 195 test menegakkannya. |
| 3 | `PRD-AMENDMENTS.md` | Berlaku, menang atas PRD saat konflik. |
| 4 | `PRD.md` | Berlaku kecuali §15 (lihat T4). |
| 5 | `roadmap.md` | **Current through Session 17.** |
| 6 | `README.md` | **Current through Session 17.** |
| 7 | `ASSET-PROVENANCE.md` + manifests | **Current through Session 17.** |

---

## Stage 1 — Perbaiki peta (complete; historical execution record)

Tidak ada satu pun task di stage ini yang menyentuh logika gameplay. Kalau ada
test yang berubah hasilnya di stage ini, berarti kamu salah mengerjakan.

### T1 — Koreksi `roadmap.md` ke state kode sebenarnya

**File:** `roadmap.md` saja.

Klaim yang salah, dengan bukti:

| Lokasi | Klaim di roadmap | Kenyataan |
|---|---|---|
| §1 | "The server assigns alternating roles: one `ATTACK`, one `COUNTER`" | Role dihapus Sesi 12. `grep -rn "ATTACK\|COUNTER" shared/src server/src client/src --include=*.ts` → nol hasil non-test. `shared/src/match/roles.ts` sekarang tombstone berisi `export {}`. |
| §1 | "Attack matter carries damage energy. Counter matter gains return damage only by intercepting" | Tabrakan sekarang simetris dan dibobot massa lawan. Lihat `DESIGN-RUNE-BODY-COMBAT.md` §"The launch math" dan aturan produk 5. |
| §1, §3 | "Ward from reserved Ink" | Ward dihapus total Sesi 12. Sisa kemunculan kata "Ward" di kode hanya nama spell family `Bubble Ward` — hal berbeda. |
| §1, §3, §7 Stage D | "cave", "cozy cave arena", "stalactite/stalagmite reflectors" | Arena sekarang **floating dream island + dream sky**, sesuai PRD §1 dan §12. Lihat `client/src/rendering/matchScene.ts` (`drawSky`, `drawCrystals`) dan komentar di `arena.ts:58`. |
| §3 | "176 tests green" | 191 test hijau per 2026-08-02. Verifikasi ulang, jangan salin angka ini mentah. |
| §2 | "Keep the simulation as a side-view 2D plane…" | **Ini benar, pertahankan.** Lihat T4 untuk penguatannya. |

Yang harus dilakukan:

1. Tulis ulang §1 supaya mendeskripsikan kontrak Ink→massa→kecepatan→jangkauan,
   bukan role. Sumber salinnya `DESIGN-RUNE-BODY-COMBAT.md` §"Product rules",
   jangan mengarang ulang.
2. Ganti seluruh referensi arena gua jadi floating dream island.
3. Perbarui §3 dari hasil `npm test` yang kamu jalankan sendiri.
4. Tambahkan baris di kepala dokumen: `Sumber kebenaran combat adalah
   DESIGN-RUNE-BODY-COMBAT.md. Kalau dokumen ini berkonflik dengannya, dokumen
   ini yang salah.`

**Acceptance:** `grep -niE "attack role|counter role|\bward\b|cave" roadmap.md`
tidak menghasilkan klaim mekanik yang aktif. Referensi historis boleh, tapi
harus ditandai eksplisit sebagai "removed in Session 12".

### T2 — Koreksi `README.md`

**File:** `README.md` saja.

Empat klaim salah di paragraf "Current stage" dan blok perintah:

- "alternate Attack/Counter roles" → hapus, ganti dengan kontrak Ink.
- "unused Ink becomes partial Ward" → hapus. Ink yang tidak dipakai tidak jadi
  apa pun sekarang.
- "seeded indestructible cave reflectors" → floating dream island crystals.
- "`npm test # 176 tests`" → angka aktual.

Juga baris di tabel Documents: `DESIGN-RUNE-BODY-COMBAT.md` dideskripsikan
sebagai "**Current combat contract:** roles, particle/bond math…". Hapus kata
"roles".

**Acceptance:** README dapat dibaca orang baru tanpa menemukan satu pun mekanik
yang tidak ada di kode.

### T3 — Tandai art kit sebagai obsolete secara tema (JANGAN hapus filenya)

**File:** `ASSET-PROVENANCE.md`, `client/public/assets/generated/manifest.json`.

Empat PNG di `client/public/assets/generated/` dibuat untuk **arena gua**, yang
sudah tidak ada. `cozy-cave-arena.png` dan `cave-reflectors-sheet.png` tidak
lagi cocok dengan arena yang di-render. Dua wizard cutout mungkin masih dipakai
ulang — palet dan proporsinya tidak terikat gua.

Yang harus dilakukan:

1. Di `ASSET-PROVENANCE.md`, ubah `Status:` jadi:
   `Arena dan reflector sheet OBSOLETE sejak Sesi 12 (arena pindah ke floating
   dream island). Wizard cutout masih kandidat. Tidak ada yang ter-wire ke
   renderer.`
2. Tambah kolom `status` per baris di tabel: `obsolete-theme` / `candidate`.
3. Di `manifest.json`, ubah `"style": "cozy-hand-painted-cave"` jadi
   `"cozy-hand-painted-dream-sky"`, dan tambahkan `"status"` per aset.

**Jangan** menghapus PNG-nya dan **jangan** generate pengganti di task ini.
Regenerasi art adalah Stage 3, dan Stage 3 diblokir oleh playtest.

**Acceptance:** tidak ada pembaca yang bisa menyimpulkan bahwa `cozy-cave-arena.png`
adalah background yang akan dipakai.

### T4 — Amandemen PRD §15: lepas kunci Three.js

**File:** `PRD-AMENDMENTS.md` (tambah entri baru; jangan edit `PRD.md` langsung,
ikuti pola yang sudah ada di repo).

PRD §15 masih menulis `Client: Vite + TypeScript + Three.js`. Implementasi
berjalan di Canvas 2D sejak Sesi 0, dengan alasan yang benar dan tercatat, dan
sekarang membawa 191 test.

Constraint yang tidak ditegakkan ini adalah jebakan: suatu saat seseorang —
manusia atau agent — akan membacanya sebagai izin masuk 3D, lalu membuang
seluruh renderer 2D yang sudah teruji.

Isi amandemen:

> **A-xx — PRD §15 renderer.** "Three.js" diganti "renderer Canvas 2D berlapis".
> 3D/isometric runtime di luar scope MVP. Alasannya bukan biaya implementasi
> (itu bisa dibayar), melainkan dua hal yang mengikat produk:
>
> 1. **Isometric membatalkan janji inti.** PRD §1: "Setiap coretan menjadi
>    sihir." Stroke adalah kurva 2D di layar. Di dunia isometric engine harus
>    memutuskan stroke itu hidup di bidang mana; apa pun pilihannya, itu
>    interpretasi, bukan literal. Materi sihir berhenti jadi persis apa yang
>    digambar.
> 2. **Isometric merusak keterbacaan balistik.** PRD §3 menargetkan pemain
>    Gunbound. Arc + wind + pantulan hanya adil kalau jarak dibaca di satu
>    bidang. Kedalaman tersembunyi membuat meleset terasa curang, bukan lucu —
>    melanggar pilar §4.2.
>
> 3D tetap sah sebagai **pipeline aset** (render sprite 2D dari sumber 3D),
> bukan sebagai renderer runtime. Lihat Stage 3.

**Acceptance:** entri masuk `PRD-AMENDMENTS.md` dengan nomor yang mengikuti
urutan yang sudah ada.

### T5 — Commit tujuh sesi yang menggantung

Commit terakhir adalah `aea444a` (Sesi 7). Sesi 8–13 seluruhnya belum
di-commit: `server/`, `shared/src/sim/`, `shared/src/protocol/`,
`client/src/net/`, `matchScene.ts`, `matchGame.ts`, `runeBody.ts`, dan seluruh
art kit hidup sebagai untracked/modified.

Ini risiko terbesar di repo saat ini dan sama sekali tidak berhubungan dengan
game design: satu perintah yang salah menghapus enam sesi kerja.

Langkah:

1. `npm test && npm run typecheck && npm run build && npm audit` — semua harus
   lulus **sebelum** commit. Kalau ada yang gagal, berhenti dan lapor; jangan
   commit sambil "nanti diperbaiki".
2. Periksa `client/public/assets/generated/*.png` benar-benar ingin masuk git
   (4 PNG besar). Kalau ya, commit; kalau ragu, tanya BK dulu — ini keputusan
   yang mahal untuk dibatalkan.
3. Commit dalam kelompok yang bisa dibaca, bukan satu commit raksasa:
   - `shared/src/sim/` + `protocol/` + `runeBody.ts` + config → simulasi & kontrak
   - `server/` → authoritative room server
   - `client/src/net/` + `matchGame.ts` + rendering → client multiplayer
   - art kit + `ASSET-PROVENANCE.md` → aset
   - dokumen (`roadmap.md`, `README.md`, `changelog.md`, amandemen) → docs
4. `.git/index.lock` sempat tidak bisa dihapus dari sandbox; kalau kamu kena
   error yang sama, jalankan git dari shell BK, bukan dari mount.

**Acceptance:** `git status --short` bersih, dan `git log --oneline | head -6`
menunjukkan riwayat yang bisa dibaca.

---

## Stage 2 — Playtest (blocker produk, bukan blocker kode)

Diblokir oleh: Stage 1 selesai.

Ini satu-satunya hal yang menghalangi keputusan art, dan tidak ada baris kode
yang bisa menggantikannya. Tercatat di `changelog.md` bagian "Batas handover"
sejak Sesi 2 dan **masih belum dijalankan setelah sebelas sesi**.

PRD §20 dan `roadmap.md` §7 sama-sama memperingatkan hal yang persis sama:
jangan produksi kosmetik sebelum combat divalidasi manusia. Sesi 12 dan 13
justru menghasilkan art kit. Stage 2 mengembalikan urutannya.

### T6 — Instrumentasi playtest

**File:** `client/src/ui/matchGame.ts` (dan file telemetri baru kalau perlu).
**Jangan sentuh** `shared/src/sim/`, `shared/src/spells/`, `server/`.

Catat per Turn ke JSON yang bisa di-export dari UI:

- Ink yang dikomit, massa hasil, kecepatan luncur, jangkauan prediksi;
- apakah rune mendarat di lawan, di crystal, di tanah, atau keluar arena;
- Wobble delta;
- waktu dari mulai Draw sampai Cast selesai;
- keluarga classifier (telemetri saja — classifier tidak memutuskan apa pun);
- seed Round dan layout obstacle.

**Acceptance:** satu tombol export menghasilkan JSON yang valid; tidak ada
angka yang dihitung ulang di client (semua diambil dari snapshot server).

### T7 — Protokol playtest 10+ penguji

**File:** dokumen baru `PLAYTEST-PROTOCOL.md`. Tidak ada kode.

Yang harus diukur — ini pertanyaan Sesi 12, bukan pertanyaan Stage 0 yang lama:

1. Apakah penguji **menemukan sendiri** bahwa Ink banyak = tembok, Ink sedikit =
   peluru? Ini pengganti langsung exit criteria lama "empat keluarga spell",
   yang sudah tidak relevan karena classifier tidak lagi memutuskan apa pun.
2. Berapa Turn sampai penguji sengaja memakai rune berat sebagai perisai?
3. Apakah pantulan (`deflected`) terbaca sebagai kemenangan, atau sebagai
   kejadian acak?
4. Berapa Turn rata-rata sampai satu KO? PRD §4.4 menargetkan match 3–5 menit.
   Sesi 12 mengukur 20 Turn sebelum `knockbackLift` — verifikasi sekarang
   berapa.
5. Berapa persen ronde memicu keluhan "gambarku tidak terbaca"? Target PRD §19
   di bawah 10%.

Untuk tiap poin, tulis: cara mengukur, ambang lulus, dan apa yang berubah kalau
gagal. Metrik tanpa konsekuensi bukan metrik.

**Acceptance:** BK bisa menjalankan sesi playtest dari dokumen ini tanpa
bertanya apa pun.

---

## Stage 3 — Art (DIBLOKIR)

Diblokir oleh: Stage 2 lulus. **Jangan mulai lebih awal.** Ini bukan birokrasi —
Sesi 12 dan 13 sudah menghasilkan satu set art yang mati dalam hitungan jam
karena arena berubah. Itu persis biaya yang gate ini cegah.

Saat gate terbuka, arah yang direkomendasikan **bukan** pilot PixelLab seperti
di `roadmap.md` §6, melainkan **pipeline 3D→2D**:

- model atau generate karakter sekali di 3D (tooling Blender tersedia di sesi
  Claude), lalu render turnaround + frame animasi jadi sprite sheet 2D;
- ini menyerang langsung failure mode utama yang ditulis roadmap §6 sendiri:
  drift topi/jubah/palet antar frame. Sumber 3D nol-drift secara konstruksi;
- pivot bottom-centre jadi eksak, bukan hasil tebakan;
- 3D tidak pernah masuk runtime. Yang masuk build hanya PNG.

Alternatif generator 2D kalau rute ini ditolak: PixelLab (pixel-art, skeleton
animation), Ludo (multi-gaya termasuk hand-painted, ekspor atlas), AutoSprite,
Sprite-AI. Catatan skeptis yang harus dibawa ke keputusan: kit yang ada
sekarang **painterly**, bukan pixel art. Generator pixel-art bukan upgrade dari
kit itu — itu pivot gaya, dan `roadmap.md` §2 benar melarang mencampur keduanya
dalam satu build.

Keputusan Stage 3 milik BK, bukan Codex dan bukan Claude.

---

## Aturan yang berlaku sepanjang handover ini

1. **Jangan refactor `shared/src/spells/`.** Tiga kali dalam dua sesi,
   perubahan yang tampak menyederhanakan merusak satu keluarga spell secara
   diam-diam. Kalau terpaksa, jalankan `fairness.test.ts` dan
   `classifier.test.ts` lebih dulu dan sesudah.
2. **Jangan hapus tombstone.** `shared/src/match/roles.ts` sengaja disimpan
   berisi `export {}` supaya pembaca berikutnya tidak menemukan ulang mekanik
   yang sudah dibuang. Ini bukan file mati yang lupa dihapus.
3. **Setiap sesi menulis entri ke `changelog.md`.** Changelog ini
   **reverse-chronological** — entri baru masuk di **atas**, tepat setelah
   header, bukan di akhir file. Nomor sesi berikutnya adalah **15**; nomor 12
   terpakai dua kali (Codex dan Claude), jangan tambah tabrakan baru.
4. **Catat alasan, bukan cuma perubahan.** Nilai changelog repo ini ada di
   kolom "mengapa" — beberapa ambang di `shared/src/spells/` kontra-intuitif
   justru karena versi intuitifnya sudah dicoba dan gagal.
5. **Skeptis terhadap dokumen, termasuk dokumen ini.** Kalau kode dan dokumen
   berkonflik, kode dan test yang menang, lalu dokumennya diperbaiki dan
   dicatat. Drift yang memicu handover ini terjadi karena tidak ada yang
   melakukan pemeriksaan itu selama dua sesi.
