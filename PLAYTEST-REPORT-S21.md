# Laporan pemeriksaan UI Sesi 21

**Pelaksana:** Claude (orchestrator), 3 Agustus 2026.
**Diminta:** playtest dua tab 430×932 di room UG8M — Draw, dotted Aim guide,
keterbacaan HUD/Ink, framing wizard saat kamera bergeser.
**Kontrak yang diuji:** `PLAN-S19-MOCKUP-PARITY.md` §5–§6, `PRD-AMENDMENTS.md`
A-08/A-09, `UI-HANDOFF-CLAUDE.md`.

---

## 0. Batas laporan ini — baca dulu

**Playtest interaktif tidak jadi dilakukan.** Ekstensi Claude in Chrome tidak
terhubung, jadi aku tidak bisa menggerakkan kedua tab. Empat hal di daftar BK
karena itu **belum diperiksa sama sekali**:

- apakah coretan terasa terbaca menjadi rune;
- apakah dotted Aim guide membantu atau justru menjanjikan lintasan lurus;
- keterbacaan HUD/Ink saat benar-benar dipakai sambil menggambar;
- framing wizard **selama** kamera bergeser (easing), bukan di posisi diam.

Yang ada di bawah ini adalah pemeriksaan statis dan numerik terhadap kontrak.
Itu lebih akurat daripada mata untuk hal yang bisa diukur, dan sama sekali tidak
menggantikan hal yang harus dirasakan.

**Catatan kedua:** M-01 dan M-02 belum diperbaiki. Sesuai §6, penilaian apa pun
tentang "seru" atau "adil" dari sesi bermain saat ini tidak valid — match bisa
tidak pernah selesai dan angin masih memutuskan Round sebelum ada yang
menggambar. Yang sah dinilai sekarang hanyalah presentasi.

---

## 1. Temuan

### T-01 — Blocker: A-09 tidak diimplementasikan

`camera.arenaAspectRatio` tidak dirujuk di mana pun di `client/`. Rasio canvas
masih ditentukan CSS per-breakpoint:

| Lokasi | Aturan | Aspect | Sapuan setinggi canvas |
|---|---|---|---|
| `styles.css:368` | `aspect-ratio: 16 / 9` | 1.778 | 42.5 Ink |
| `styles.css:817` | `aspect-ratio: auto` + `height: 100dvh` @430×932 | 0.461 | 163.6 Ink |
| **Target A-09** | `2 / 3`, semua device | 0.667 | 113.2 Ink |

**Disparitas Ink vertikal HP-vs-desktop yang masih berjalan: 3.85×.** Ini
persis cacat yang A-09 ditulis untuk menghapus, dan angkanya lebih buruk
daripada 2.89× yang kuukur sebelum kalibrasi — karena `min-height: 25rem;
max-height: 48rem` yang dulu membatasi sekarang dicabut menjadi `height: 100%`.

Aku tidak menyentuh `styles.css` (milik Codex, §1). Yang dibutuhkan:

```css
/* SEMUA breakpoint, tanpa kecuali. Sumber: CONFIG.camera.arenaAspectRatio */
canvas { aspect-ratio: 2 / 3; }
```

dan mencabut `height: 100dvh` / `height: 100%` / `aspect-ratio: auto` pada
`.match canvas` dan `.match .arena-wrap`. Sisa layar adalah letterbox — boleh
dihias, tapi tidak boleh menampilkan pulau, kristal, atau karakter.

Dugaan penyebabnya: `UI-HANDOFF-CLAUDE.md` butir 1 masih mencantumkan
"recalibrate `drawHalfWidth`, `fullHalfWidth`, camera bias, dan Ink cost" sebagai
pekerjaan Claude yang belum selesai. Itu sudah selesai di Sesi 20, dan hasilnya
justru sebuah kewajiban di sisi CSS. Instruksi §5.0 tampaknya tidak terbaca.

### T-02 — Diperbaiki: wizard kanan memang terpotong, dan pengukuranku sebelumnya salah

Codex benar. Yang salah adalah cara A-09 memverifikasinya: aku membatasi lawan
dengan `player.radius` (badan fisika), padahal renderer menggambar dua hal yang
lebih lebar. Diukur di `.audit/probe-framing2.mjs`, dengan bounding box alpha
sprite yang diukur langsung (bukan ukuran quad — cell 176px sebagian besar
transparan, memakai quad melebih-lebihkan potongan sekitar 3×):

| Elemen | Batas kanan | Status pada bias 0.36 |
|---|---|---|
| Badan fisika (yang dicek A-09) | 0.640 | muat |
| Sprite piksel opak (slot 1, di-mirror) | 0.658 | muat, sisa 0.002 |
| **Cincin Wobble** | **0.677** | **terpotong 0.017** |

Cincin Wobble adalah satu-satunya readout kondisi kalah di dunia, jadi
memotongnya bukan cacat kosmetik. Lebih buruk: headroom tersisa **−0.017 unit**,
sementara posisi wizard terbawa antar-Turn — lawan yang terdorong sedikit ke
kanan hilang dari frame sepenuhnya.

**Perbaikan yang sudah diterapkan:** `camera.drawCenterBias` 0.36 → **0.45**.
Headroom menjadi +0.073 unit; wizard lokal tetap muat (tepi kiri −0.658 vs tepi
frame −0.950). Alternatifnya melebarkan `drawHalfWidth`, tapi itu memaksa
`costPerUnitLength` ikut bergerak (0.90 → 41.9) dan mengubah ekonomi Ink. Bias
gratis.

### T-03 — §5.3 terlewat: pip Wobble masih diskret tiga langkah

`matchGame.ts:494` menyetel `--wobble` sebagai fraksi kontinu, lalu CSS tidak
pernah memakainya. Yang dipakai adalah `data-level` dengan
`:nth-child(-n+N)` (`styles.css:200-202`, `572-574`), dan `wobbleLevel()`
membulatkan ke atas ke 3 tingkat.

Akibatnya Wobble 34 dan Wobble 66 tampil sama persis, padahal
`wobble.knockbackMultiplierAtMax: 2.6` membuat selisih itu terasa nyata di
knockback. `--wobble` saat ini adalah kode mati.

Perbaikan tetap seperti §5.3: pertahankan tiga pip sebagai bentuk, isi
fraksional dengan `clamp((wobble/100)·3 − n, 0, 1)`.

### T-04 — §3.5 dilanggar: ambang angin di-hardcode di renderer

`matchPresentation.ts:23` memutuskan label Light/Steady/Strong dari ambang
`0.22` dan `0.35` yang ditulis langsung di renderer.
`CONFIG.wind.accelerationLevels` adalah `[0, 0.16, 0.28, 0.42]`.

Hari ini pemetaannya kebetulan benar. Kalau level angin diubah — dan M-02 akan
mengubahnya — label akan salah tanpa satu pun test gagal. Ambangnya harus
diturunkan dari `accelerationLevels`, bukan disalin.

Terkait: panah angin hanya mengkodekan arah (`data-direction` −1/0/1);
kekuatannya hanya ada di teks. §3.2 meminta gauge arah **dan** kekuatan, karena
setelah M-02 angin adalah variabel paling menentukan di Round.

### T-05 — Sesuai kontrak

- `#setup-controls-slot` ada, `display: none`, dan digerbangi
  `.match[data-phase="setup"] ... :not(:empty)` — presentasi siap, inert, persis
  seperti §5.1 minta.
- Timer membaca `room.phaseRemainingMs` dari server dengan satu desimal
  (`matchGame.ts:577-580`), tidak ada durasi yang dihitung lokal. `castMs` tetap
  2000 (§5.2).
- Meter Ink kontinu: label angka + `#ink-fill` bar, bukan 4 tetes diskret.
- Sprite wizard ditolak untuk collision; posisi tetap dari snapshot server.

---

## 2. Status terhadap Definition of Done §6

| Kriteria | Status |
|---|---|
| Canvas 2:3 di setiap breakpoint | ❌ T-01 |
| `min-height`/`max-height` perusak rasio dicabut | ⚠️ dicabut, tapi diganti `height: 100%` yang sama merusaknya |
| Container 3 kontrol Setup, inert, ≥44×44 | ✅ |
| Pip Wobble fraksional | ❌ T-03 |
| Timer dari `CONFIG.phases` | ✅ |
| Tidak ada konstanta gameplay di luar `shared/config` | ❌ T-04 |
| `npm test` bersih | ✅ 198 lulus setelah perubahan bias |

---

## 3. Yang masih perlu dijalankan manusia atau browser

1. **Playtest interaktif** — empat butir di §0. Butuh ekstensi Chrome
   tersambung, atau BK menjalankan sendiri.
2. **`npm run typecheck` dan `npm run build`** — tidak bisa diverifikasi dari
   sandbox-ku (symlink workspace `@cozy/*` `EIO`, `vite build` `EPERM`). BK
   melaporkan build berhasil; itu yang berlaku.
3. **Framing saat kamera easing.** Perhitungan T-02 memakai frame Draw diam.
   `easeFrame` melewati halfWidth antara 1.15 dan 0.85 selama transisi, jadi ada
   jendela di mana framing berbeda dari keduanya. Perlu dilihat, bukan dihitung.
