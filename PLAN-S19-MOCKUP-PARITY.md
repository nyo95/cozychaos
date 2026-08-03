# Plan Sesi 19+ — Mockup Parity dulu, Logic Polish belakangan

**Ditulis:** Claude (orchestrator), 2026-08-03.
**Keputusan BK:** portrait mobile-first; trajectory preview jalur parsial;
Codex mengerjakan presentasi sampai mockup jadi; Claude memoles logic di akhir.

Dokumen ini adalah kontrak kerja antara Codex dan Claude untuk fase berikutnya.
Tujuannya satu: dua orang bekerja paralel tanpa saling menimpa, dan tanpa
membuat pekerjaan satu pihak harus dibongkar oleh pihak lain.

Temuan yang mendasari: `AUDIT-MECHANICS-S19.md`.
Kontrak combat yang berlaku: `DESIGN-RUNE-BODY-COMBAT.md`.

---

## 0. Keberatan yang perlu dicatat sebelum mulai

Urutan "presentasi dulu, logic belakangan" masuk akal untuk momentum, tapi
punya dua biaya nyata. Aku catat di sini supaya kalau nanti kena, kita tahu ini
keputusan sadar, bukan kejutan.

**Playtest di atas match yang belum bisa selesai akan menghasilkan data
sampah.** M-01 membuat 43% match mid-Ink masuk siklus tak berujung dan M-02
membuat separuh Round diputus angin sebelum ada yang menggambar. Kalau mockup
selesai lalu dipakai playtest sebelum keduanya diperbaiki, keluhan penguji akan
tentang "bosan" dan "tidak adil" — dan kita tidak akan bisa membedakan mana
yang salah presentasi dan mana yang salah mekanik. **Mitigasi: boleh demo,
jangan playtest formal, sampai M-01 dan M-02 selesai.**

**Portrait bukan pekerjaan layout murni.** `ink.costPerUnitLength` dikalibrasi
terhadap `camera.drawHalfWidth`; A-04 mengunci canvas gambar sebagai jendela
1:1 ke arena. Mengubah rasio layar tanpa mengubah pasangan konstanta itu
membuat gesture yang sama membeli massa berbeda, dan crossover
offence/defence di Ink 40 bergeser diam-diam. **Mitigasi: §2 di bawah —
angkanya dikunci sekarang, sebelum Codex menyentuh layout.**

---

## 1. Pembagian kepemilikan file

Aturannya sederhana: **satu file, satu pemilik.** Kalau butuh menyentuh file
milik pihak lain, tulis di changelog dan sebutkan alasannya.

### Milik Codex (fase ini)

```
client/index.html
client/src/styles/**            (atau di mana pun CSS berada)
client/src/rendering/**         kecuali viewport.ts (lihat catatan)
client/public/assets/**
ASSET-PROVENANCE.md
```

### Milik Claude (fase berikutnya)

```
shared/src/**                   seluruhnya, termasuk config
server/src/**
api/**
client/src/net/**
client/src/input/**
client/src/drawing/**
client/src/rendering/viewport.ts
AUDIT-MECHANICS-S19.md
```

### Milik bersama, wajib koordinasi

```
client/src/ui/matchGame.ts      Codex: pemetaan ke elemen DOM baru
                                Claude: input gerak, submit path, state
PRD-AMENDMENTS.md               siapa pun yang mengubah kontrak, tulis amandemen
changelog.md                    setiap sesi, siapa pun
```

`viewport.ts` milik Claude karena `toScreen`/`toArena` adalah invers eksak yang
sudah jadi invariant terkunci. Kalau butuh framing berbeda untuk portrait,
minta lewat perubahan `CONFIG.camera`, jangan sentuh matematikanya.

---

## 2. Kalibrasi pendahulu — ✅ SELESAI 3 Agustus 2026

Blocker ini sudah dibereskan. Amandemen: A-09. Probe: `.audit/probe-framing.mjs`.

Hipotesis awalku sebagian **salah**, dan koreksinya penting untuk Codex:

- Aku menduga `ink.costPerUnitLength` harus diturunkan ulang dari
  `drawHalfWidth` baru dengan rumus `26 × fullHalfWidth / drawHalfWidth`. Rumus
  itu keliru: ia menyeret `fullHalfWidth` ke dalam persamaan ekonomi Ink,
  padahal tidak ada yang menggambar pada kamera Full. Invariant yang benar
  adalah `2 · drawHalfWidth · costPerUnitLength = 75.5 Ink per sapuan selebar
  canvas`, dan ia tidak menyentuh `fullHalfWidth` sama sekali.
- Karena itu **`drawHalfWidth` dan `costPerUnitLength` tidak berubah.** Ekonomi
  Ink identik dengan build landscape; crossover offence/defence terverifikasi
  tetap persis di Ink 40 (`predictLaunch` reach 1.10 = jarak antar-wizard 1.10).

Yang ternyata benar-benar bergerak adalah hal yang tidak ada di rencana awal:

| Konstanta | Lama | Baru | Alasan |
|---|---|---|---|
| `camera.arenaAspectRatio` | (tidak ada) | `2/3` | Rasio canvas menentukan biaya Ink vertikal. Dibiarkan bebas, HP membayar 2.89× desktop. Lihat §5.0. |
| `camera.fullHalfWidth` | 1.45 | **1.15** | Pada 1.45 pulau hanya 69% lebar canvas di portrait. |
| `camera.drawCenterBias` | 0.30 | **0.36** | Tepi kanan frame Draw berhenti di 0.60; sisi jauh lawan ada di 0.64. Lawan terpotong — cacat ini sudah ada sejak build landscape. |

**Codex sekarang boleh mengunci ukuran canvas** — dengan syarat rasionya 2:3 di
semua breakpoint (§5.0).

---

## 3. Scope Codex — parity dengan mockup

Urutan bebas, tapi ini kriteria "selesai"-nya.

### 3.1 Layout portrait

- Root layout portrait-first, arena canvas sebagai elemen dominan di tengah.
- Chrome atas: dua kartu pemain (portrait, bintang, pip), kode room, timer
  fase besar di tengah, label Round.
- Chrome bawah: meter Ink, lalu satu area aksi besar (`DRAG TO AIM` di mockup).
- Desktop tidak boleh rusak: turunkan ke layout yang sama dengan lebar maksimum,
  bukan layout kedua yang terpisah.

### 3.2 Elemen HUD yang **tidak boleh hilang**

Mockup menghilangkan dua readout yang sudah ada dan keduanya menopang mekanik.
Keduanya wajib punya tempat di desain baru:

| Readout | Ada sekarang di | Kenapa wajib |
|---|---|---|
| **Angin** | `matchGame.ts:372` (`#wind-status`) | Setelah M-02, angin adalah variabel paling menentukan di Round. Butuh gauge arah + kekuatan, bukan teks kecil. Ini elemen paling Gunbound di layar. |
| **Wobble** | `matchScene.ts:515` (cincin di sekitar wizard) | Satu-satunya penggerak kondisi kalah. Kalau tidak terbaca, KO terasa acak (PRD §20 risiko #2). Pip 3 titik di kartu pemain pada mockup boleh jadi tempatnya — konfirmasi maksudnya, dan ingat Wobble kontinu 0–100, bukan 3 tingkat. |

Kalau pip di bawah portrait pemain di mockup memang dimaksudkan sebagai Wobble,
bagus. Kalau itu penanda Turn, Wobble tetap butuh tempat sendiri.

### 3.3 Elemen HUD yang perlu diselaraskan angkanya

- Timer di mockup menunjukkan `AIM 03.8`, sedangkan `CONFIG.phases.castMs`
  adalah `2000`. Codex **jangan** mengubah angka ini di renderer — kalau 3.8
  detik yang diinginkan, itu perubahan config milik Claude, dan menambah ~1.8
  detik ke Turn yang sudah 21 detik terhadap batas PRD 22 detik.
- Meter Ink di mockup menampilkan `12 INK` plus 4 tetes. Ink sebenarnya
  kontinu 0–100 dan diturunkan dari panjang stroke. 4 tetes boleh sebagai
  kuartil visual; jangan jadikan Ink terasa diskret 4 langkah.
- Readout `FAST • LONG RANGE` sudah benar secara konsep dan **wajib** dibaca
  dari `predictLaunch()`, bukan dari tabel hardcode. Ini invariant terkunci di
  `DESIGN-RUNE-BODY-COMBAT.md`: kalau HUD dan simulasi berbeda, bug-nya adalah
  ada yang berhenti memanggil `predictLaunch`.

### 3.4 Ruang yang harus disisakan untuk pekerjaan Claude

Dua fitur akan masuk dan butuh tempat di layar. Sisakan slotnya sekarang supaya
layout tidak dibongkar dua kali.

1. **Kontrol gerak Setup (M-04).** Portrait mobile berarti kontrol sentuh:
   dua tombol arah + satu tombol lompat, atau satu zona drag. Hanya aktif
   selama fase Setup, tersembunyi di fase lain. Sediakan container-nya, biarkan
   kosong.
2. **Preview trajectory parsial.** Digambar di canvas, bukan DOM — tapi
   pastikan area arena punya headroom vertikal untuk lengkungan lob, jangan
   dipepet chrome.

### 3.5 Aturan yang tidak boleh dilanggar

- **Tidak ada angka tuning di kode renderer.** Semua konstanta gameplay hidup
  di `shared/src/config`. Kalau renderer butuh sebuah angka gameplay, impor.
- **Rendering tidak pernah jadi sumber kebenaran fisika** (PRD §15, A-07).
  Collision, posisi, dan tabrakan datang dari snapshot server.
- **Aset masuk `ASSET-PROVENANCE.md` sebelum masuk build** (PRD §16).
- Palet dan bentuk bukan satu-satunya penanda: PRD §12 mewajibkan tiap
  informasi punya bentuk/pola, bukan hanya warna (dukungan color-blind).

---

## 4. Scope Claude — setelah mockup jadi

Urutan sudah disepakati. Nomornya mengacu ke `AUDIT-MECHANICS-S19.md`.

| # | Pekerjaan | Menyentuh | Catatan |
|---|---|---|---|
| 0 | Kalibrasi kamera–Ink portrait (§2) | `shared/config` | **Mendahului Codex**, bukan menyusul |
| 1 | **M-04 movement** | protokol, `shared/sim`, `server/room`, input client | Tambah `MoveMessage`; simulasi Setup authoritative; gerak hanya di Setup (A-03) |
| 2 | **Ukur ulang M-01** | `.audit/` | Jalankan probe stall rate dengan positioning aktif. Angka ini menentukan seberapa keras Turn cap perlu |
| 3 | **M-02 angin adil** | `shared/sim/world`, `config.wind` | Angin simetris atau dicerminkan per-pemain. Tambah mirror-fairness sebagai invariant terkunci |
| 4 | **M-01 Turn cap** | `shared/match/state`, `config` | Safety valve data-driven, setinggi mungkin supaya tidak terasa |
| 5 | **M-03 submit grace + ack** | protokol, `server/room`, `client/ui` | Pakai `submitGraceMs` yang sudah ada tapi mati; tambah ack supaya client berhenti membohongi pemain |
| 6 | **Trajectory preview parsial** | `client/rendering`, `shared` | Wajib dihitung dari integrator yang sama dengan Resolve, memudar setelah ~40%, dan **melengkung mengikuti angin**. Preview lurus di dunia berangin lebih buruk daripada tidak ada preview |
| 7 | M-05 keputusan hosting | `vercel.json` atau pindah host | Lihat §5 |
| 8 | M-06/M-08 bersih-bersih | `shared/config` | Implementasikan `wobble.decayPerSecond` atau hapus; buang `CONFIG.combat` yang mati |

Nomor 1–5 masing-masing menyentuh file berbeda dari milik Codex, jadi aman
dikerjakan paralel kalau ternyata perlu.

---

## 5. Keputusan — TERKUNCI 3 Agustus 2026 (BK)

Tiga dari empat sudah dijawab. Amandemen resmi: `PRD-AMENDMENTS.md` A-08 dan
A-09. Angka-angkanya sudah ada di `shared/src/config` — Codex tinggal
mengimpor, jangan menyalin.

### 5.0 Rasio arena dikunci lintas device (A-09) — **ini yang paling mengubah pekerjaan Codex**

Implementasi mobile pertama membiarkan tinggi canvas mengambil sisa layar
(`calc(100dvh - 9.75rem)` di HP, `aspect-ratio: 16/9` di desktop). Itu
memberikan HP portrait **2.89× biaya Ink vertikal desktop** dan jumlah arena
yang berbeda untuk membidik — diukur di `.audit/probe-framing.mjs`. Rasio
canvas bukan pilihan layout; ia adalah konstanta gameplay.

**Yang harus berubah di CSS:**

```
canvas { aspect-ratio: 2 / 3; }   /* SEMUA breakpoint, tanpa kecuali */
```

- Sumbernya `CONFIG.camera.arenaAspectRatio`. Kalau bisa, inject sebagai CSS
  custom property dari TS supaya tidak ada angka gameplay yang hidup di CSS
  (§3.5). Kalau tidak praktis, tulis komentar yang menunjuk ke A-09.
- Sisa ruang layar adalah **letterbox**, bukan arena. Boleh diisi background
  dekoratif — tapi apa pun di luar rasio 2:3 tidak boleh menampilkan pulau,
  kristal, karakter, atau apa pun yang terlihat seperti geometri arena.
- Desktop 1280×720 → arena 480×720 px, kolom tengah. Ini konsekuensi yang
  sudah diterima, bukan bug.
- `min-height`/`max-height` yang ada sekarang di §3.1 harus dicabut; keduanya
  merusak rasio terkunci.

**Framing baru yang sudah masuk config:** `fullHalfWidth` 1.45 → **1.15**,
`drawCenterBias` 0.30 → **0.36**. `drawHalfWidth` dan `ink.costPerUnitLength`
**tidak berubah** — ekonomi Ink identik dengan build lama.

### 5.1 Model input gerak (A-08) — **held-direction**

Kiri/kanan ditahan + satu lompat per Setup. Konstanta `movement.speed`,
`movement.jumpImpulse`, `movement.jumpsPerSetup` sudah ada dan akan dipakai apa
adanya.

**Yang Codex sediakan sekarang:** container untuk **tiga** kontrol sentuh di
chrome bawah, masing-masing minimal 44×44 px, hanya terlihat saat
`data-phase="setup"` dan tidak memakan ruang di fase lain. Biarkan tanpa
handler — Claude yang menyambungkan ke protokol (M-04).

### 5.2 Durasi Aim (A-08) — **tetap 2.0 detik**

`phases.castMs` tetap `2000`. `AIM 03.8` di mockup adalah art direction.
HUD wajib membaca `CONFIG.phases`, jangan menampilkan angka tetap.

### 5.3 Arti pip di kartu pemain — **Wobble**, dengan satu koreksi

Implementasi sekarang memakai tiga pip diskret. Wobble kontinu 0–100, dan
`wobble.knockbackMultiplierAtMax` membuat perbedaan antara Wobble 30 dan 60
terasa nyata di knockback. Tiga langkah membuang informasi itu.

Perbaikan: pertahankan tiga pip sebagai bentuk (PRD §12 mensyaratkan bentuk,
bukan hanya warna), tapi isi pip **fraksional** — pip ke-n terisi
`clamp((wobble/100)·3 − n, 0, 1)`. Cincin Wobble di dunia
(`matchScene.ts:515`) tetap ada; ia yang menghubungkan angka HUD ke karakter.

### 5.4 Hosting server (M-05) — **masih menggantung**

Ini satu-satunya keputusan §5 yang belum dijawab, dan ia tidak memblokir Codex.

`maxDuration: 300` di `vercel.json` lebih pendek
daripada durasi match yang ditargetkan sendiri, room state hidup di memory satu
instance, dan jam fase adalah `setInterval` di function yang boleh disuspend.
Untuk demo satu-room, naikkan `maxDuration` dan perlakukan URL Vercel sebagai
demo. Untuk apa pun yang lebih serius: client statis tetap di Vercel, server
pindah ke runtime stateful (Fly.io/Railway/VPS). Opsi kedua jauh lebih murah
daripada memindahkan room state ke Redis.

## 6. Definition of done fase ini

Codex dianggap selesai ketika:

- **canvas arena berrasio 2:3 di setiap breakpoint**, `min-height`/`max-height`
  yang merusak rasio sudah dicabut, dan tidak ada geometri arena yang digambar
  di area letterbox (A-09);
- tiga kontrol sentuh Setup punya container yang hanya muncul di
  `data-phase="setup"`, masing-masing ≥44×44 px, tanpa handler (§5.1);
- pip Wobble terisi fraksional, bukan tiga langkah diskret (§5.3);
- timer membaca `CONFIG.phases`, bukan angka tetap (§5.2);
- layout portrait berjalan di HP dan tidak merusak desktop;
- semua elemen mockup ada, plus gauge angin dan indikator Wobble;
- container kontrol gerak dan headroom trajectory sudah tersedia;
- tidak ada konstanta gameplay baru di luar `shared/src/config`;
- `npm test`, `npm run typecheck`, dan `npm run build` bersih;
- aset baru tercatat di `ASSET-PROVENANCE.md`;
- entri changelog ditulis.

Setelah itu Claude mengambil daftar §4 nomor 1 ke bawah.

**Yang tidak boleh terjadi:** playtest formal dengan penguji manusia sebelum
M-01 dan M-02 selesai. Demo silakan.
