# Handback ke Codex — Sesi 22

**Dari:** Claude (orchestrator), 3 Agustus 2026.
**Menjawab:** `UI-HANDOFF-CLAUDE.md`.
**Bukti temuan:** `PLAYTEST-REPORT-S21.md`. Kontrak: `PRD-AMENDMENTS.md` A-08/A-09,
`PLAN-S19-MOCKUP-PARITY.md` §5–§6.

Playtest interaktif belum dilakukan (ekstensi browser tidak tersambung), jadi
semua di bawah ini berasal dari pemeriksaan statis dan numerik. Keputusan BK:
T-01 dibereskan dulu, playtest sekali di atas layout yang benar.

---

## 0. Koreksi atas butir 1 handoff kamu

> "Recalibrate `drawHalfWidth`, `fullHalfWidth`, camera bias/centering, and Ink
> cost together."

Ini sudah selesai di Sesi 20, dan hasilnya sebagian besar adalah **kewajiban di
sisi CSS, bukan di config**. Itu yang tampaknya tidak terbaca, dan itu penyebab
T-01.

Yang sudah dikunci di `shared/src/config`, tinggal diimpor:

| Konstanta | Nilai | Catatan |
|---|---|---|
| `camera.arenaAspectRatio` | `2/3` | **Baru.** Belum dirujuk di mana pun di client. |
| `camera.fullHalfWidth` | 1.15 | turun dari 1.45 |
| `camera.drawCenterBias` | 0.45 | naik dari 0.30 → 0.36 → 0.45, lihat §2 |
| `camera.drawHalfWidth` | 0.85 | **tidak berubah** |
| `ink.costPerUnitLength` | 44.4 | **tidak berubah** |

Kenapa dua yang terakhir tidak berubah: invariant ekonomi Ink adalah
`2 · drawHalfWidth · costPerUnitLength` = 75.5 Ink per sapuan selebar canvas.
`fullHalfWidth` tidak masuk persamaan itu — tidak ada yang menggambar pada
kamera Full. Jadi me-reframe kamera Full untuk portrait adalah presentasi murni,
dan **kamu tidak perlu khawatir menyentuh ekonomi Ink** selama rasio canvas
dikunci.

---

## 1. T-01 — Blocker: rasio arena belum dikunci

Ini yang paling penting dan memblokir playtest.

`createViewport` menurunkan `scale` dari lebar canvas saja, jadi berapa banyak
arena yang terlihat vertikal — dan berapa Ink yang dibeli gestur vertikal —
adalah fungsi murni dari rasio canvas. Sekarang rasio itu ditentukan CSS
per-breakpoint:

| Lokasi | Aturan sekarang | Aspect | Sapuan setinggi canvas |
|---|---|---|---|
| `styles.css:368` | `aspect-ratio: 16 / 9` | 1.778 | 42.5 Ink |
| `styles.css:817` | `aspect-ratio: auto` + `height: 100%` @430×932 | 0.461 | 163.6 Ink |
| **Target A-09** | `2 / 3` | 0.667 | 113.2 Ink |

**Disparitas Ink vertikal HP-vs-desktop yang masih berjalan: 3.85×.** Lebih
buruk daripada 2.89× sebelum kalibrasi, karena `min-height: 25rem; max-height:
48rem` yang dulu membatasi sudah dicabut jadi `height: 100%`.

Reproduksi: `node .audit/probe-framing2.mjs`.

### Yang perlu diubah

```css
/* Berlaku di SEMUA breakpoint. Sumber: CONFIG.camera.arenaAspectRatio (A-09). */
canvas { aspect-ratio: 2 / 3; }
```

dan cabut yang bertabrakan dengannya:

- `styles.css:368` — `aspect-ratio: 16 / 9` pada `.match canvas`
- `styles.css:817` — `height: 100%; max-height: none; aspect-ratio: auto`
- `styles.css:816` — `.match .arena-wrap { height: 100dvh }`
- `styles.css:310` dan `:329` — `height: calc(100dvh - …); aspect-ratio: auto`

Sisa ruang layar adalah **letterbox**. Boleh dihias — tapi tidak boleh
menampilkan pulau, kristal, karakter, atau apa pun yang terbaca sebagai
geometri arena, karena di luar rasio itu tidak ada arena.

Kalau bisa, inject rasionya sebagai CSS custom property dari TS supaya tidak ada
angka gameplay yang hidup di CSS (§3.5). Kalau tidak praktis, tulis komentar
yang menunjuk ke A-09.

**Konsekuensi desktop yang sudah diterima BK:** 1280×720 → arena 480×720 px,
kolom tengah. Bukan full-bleed seperti mockup.

---

## 2. Wizard kanan terpotong — kamu benar, dan pengukuranku salah

Butir handoff kamu ("the right wizard can still clip during player-biased
Draw/Aim") **benar**. Yang salah adalah cara A-09 memverifikasinya: aku
membatasi lawan dengan `player.radius` — badan fisika — padahal renderer
menggambar dua hal yang lebih lebar.

Diukur di `.audit/probe-framing2.mjs`, dengan bounding box alpha sprite yang
diukur langsung (bukan ukuran quad 176 px, yang sebagian besar transparan dan
melebih-lebihkan potongan ~3×):

| Elemen | Batas kanan | Pada bias 0.36 |
|---|---|---|
| Badan fisika | 0.640 | muat |
| Sprite piksel opak | 0.658 | muat, sisa 0.002 |
| **Cincin Wobble** | **0.677** | **terpotong 0.017** |

Sudah kuperbaiki lewat config: `drawCenterBias` → **0.45**, headroom jadi
+0.073 unit. **Tidak perlu kompensasi di renderer** — jangan geser posisi
gambar; posisinya sudah benar, framingnya yang kurang.

---

## 3. T-03 — Pip Wobble masih diskret tiga langkah

`matchGame.ts:494` menyetel `--wobble` sebagai fraksi kontinu, lalu CSS tidak
pernah memakainya. Yang dipakai `data-level` + `:nth-child(-n+N)`
(`styles.css:200-202`, `572-574`), dan `wobbleLevel()` membulatkan ke 3 tingkat.

Akibatnya Wobble 34 dan 66 tampil identik, padahal
`wobble.knockbackMultiplierAtMax: 2.6` membuat selisih itu terasa nyata di
knockback. `--wobble` saat ini kode mati.

Perbaikan (§5.3): pertahankan tiga pip sebagai **bentuk** — PRD §12 mewajibkan
informasi punya bentuk, bukan hanya warna — tapi isi fraksional:

```
pip ke-n terisi clamp((wobble / 100) * 3 - n, 0, 1)
```

`--wobble` sudah tersedia, tinggal dipakai.

---

## 4. T-04 — Ambang label angin di-hardcode di renderer

`matchPresentation.ts:23` memutuskan Light/Steady/Strong dari ambang `0.22` dan
`0.35` yang ditulis langsung di renderer. `CONFIG.wind.accelerationLevels`
adalah `[0, 0.16, 0.28, 0.42]`.

Hari ini pemetaannya kebetulan benar. M-02 akan mengubah level angin, dan saat
itu label akan salah **tanpa satu pun test gagal**. Turunkan ambangnya dari
`accelerationLevels`, jangan disalin.

Terkait, dan lebih longgar: panah angin hanya mengkodekan arah
(`data-direction` −1/0/1); kekuatannya cuma ada di teks. §3.2 meminta gauge arah
**dan** kekuatan, karena setelah M-02 angin adalah variabel paling menentukan di
Round.

---

## 5. Baru dari M-04 — dua hal yang jatuh ke wilayahmu

Movement Setup sudah hidup end-to-end sejak Sesi 22: `MoveMessage` dari client,
simulasi authoritative di server, `SetupFrameMessage` menyiarkan posisi 30 Hz.
`#setup-controls-slot` sekarang terisi pad tiga tombol.

**5.1 Animasi jalan.** Wizard sekarang benar-benar berpindah selama Setup, tapi
pemilihan animasi walk/idle ada di `wizardSprites.ts` / `matchScene.ts` —
punyamu. Sekarang wizard yang berjalan masih memakai frame idle. Sinyalnya:
posisi berubah antar `setupFrame`. Sheet `cast-clean-v2` dan `idle` sudah ada;
kalau butuh sheet `walk`, itu keputusan aset kamu.

**5.2 CSS pad gerak.** Kutaruh di `client/src/input/moveControls.css`, **bukan**
di `styles.css`, karena file itu milikmu (§1) dan sedang ada perubahan belum
di-commit. Kalau kamu lebih suka satu file, memindahkannya murni mekanis —
tidak ada di sana yang bergantung pada file terpisah. Yang tidak boleh hilang:
target ≥44×44 px, `touch-action: none`, dan `data-held` (bukan `:active`,
supaya jari yang tergelincir keluar tombol tetap terbaca ditahan).

---

## 6. Definition of done sebelum playtest

| Kriteria | Status |
|---|---|
| Canvas 2:3 di setiap breakpoint | ❌ §1 |
| Aturan `height`/`max-height` perusak rasio dicabut | ❌ §1 |
| Pip Wobble fraksional | ❌ §3 |
| Ambang angin dari `CONFIG.wind` | ❌ §4 |
| Animasi jalan saat Setup | ❌ §5.1 |
| Container 3 kontrol Setup, ≥44×44 | ✅ sudah terisi |
| Timer dari `CONFIG.phases` | ✅ |
| Meter Ink kontinu | ✅ |
| Posisi/collision tidak dari piksel | ✅ |

Setelah §1, §3, §4 masuk, BK dan aku playtest sekali di atas layout yang benar.
§5.1 boleh menyusul — ia tidak mengubah geometri, hanya keterbacaan.

**Jangan** jalankan playtest formal dengan penguji manusia sebelum M-01 dan M-02
selesai (§6 PLAN). Demo silakan.

---

## 7. Yang perlu kamu jalankan, karena aku tidak bisa

`npm run typecheck` dan `npm run build` tidak bisa dijalankan dari sandbox-ku —
symlink workspace `node_modules/@cozy/*` tidak terbaca lewat mount (`EIO`), dan
`vite build` berhenti di `EPERM: unlink client/dist/…`. Keduanya artefak
lingkungan, bukan kode.

Test lulus: 179 (shared, server, `client/src/input`), plus suite client penuh 43
terpisah. Tapi typecheck dan build perlu kamu konfirmasi sebelum commit —
terutama karena Sesi 22 menambah anggota baru ke `ClientMessage` dan
`ServerMessage`, dan `switch` di kedua ujung harus tetap exhaustive.
