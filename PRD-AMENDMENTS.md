# PRD Amendments — Project Cozy Chaos

**Status:** A1, disetujui 2 Agustus 2026
**Berlaku atas:** `PRD.md` v0.1

Dokumen ini mencatat cacat logic yang ditemukan pada audit PRD v0.1 beserta
resolusi yang disetujui. Di mana dokumen ini bertentangan dengan `PRD.md`,
dokumen ini yang berlaku.

---

## A-01 — Terminologi "ronde" ambigu; sistem Wobble tidak berfungsi

**Severity:** Kritis — memblokir seluruh core loop.

### Masalah

PRD memakai kata "ronde" untuk dua konsep yang berbeda:

1. Siklus fase 15–22 detik (§6: Setup → Draw → Reveal → Resolve → Reset).
2. Segmen permainan yang berakhir dengan knock-out dan menghasilkan Star (§5.1).

§5.3 menyatakan "Wobble kembali ke nol pada awal ronde." Jika "ronde" berarti
makna (1), Wobble ter-reset setiap ~20 detik dan tidak pernah menumpuk.
Karena §5.3 juga menyatakan knockback membesar seiring Wobble, knock-out
menjadi hampir mustahil dan match tidak akan pernah selesai.

Verifikasi aritmetika terhadap target PRD sendiri:

```
match  = 180–300 detik  (§6)
siklus =  15–22 detik   (§6)
=> 9–15 siklus per match
=> 3 Star per match (§5.1)
=> ~3–5 siklus akumulasi Wobble per Star
```

Angka PRD hanya konsisten jika Wobble bertahan lintas siklus.

### Resolusi

Terminologi dikunci menjadi dua istilah berbeda dan dipakai konsisten di
seluruh kode:

| Istilah | Arti | Durasi |
|---|---|---|
| **Turn** | satu siklus fase Setup→Draw→Reveal→Resolve→Reset | 15–22 detik |
| **Round** | segmen yang berakhir dengan knock-out, menghasilkan 1 Star | 3–5 Turn |
| **Match** | first-to-3 Stars | 3–5 menit |

Aturan yang mengikuti:

- **Wobble** direset pada awal **Round**, bukan Turn. Wobble menumpuk lintas
  Turn — inilah mesin yang membuat knock-out terjadi.
- **Ink** direset pada awal setiap **Turn**. Setiap Turn memberi tinta penuh
  yang sama untuk kedua pemain (§7.2 tetap berlaku, dibaca sebagai per-Turn).
- Posisi pemain dan arena direset pada awal **Round** (§5.1), tidak pada
  pergantian Turn (§6 langkah 5 tetap berlaku).

**Catatan implementasi:** `PRD.md` tidak diedit; kata "ronde" di sana dibaca
sebagai **Turn**, kecuali pada §5.1 dan §5.3 yang dibaca sebagai **Round**.

---

## A-02 — Double knock-out pada skor 2–2 tidak terdefinisi

**Severity:** Kritis — state match tidak terjangkau resolusinya.

### Masalah

§5.1 memberi 1 Star kepada kedua pemain jika keduanya jatuh hampir bersamaan.
Pada skor 2–2 hal ini menghasilkan 3–3. Format first-to-3 tidak punya aturan
untuk seri, sehingga match tidak dapat diselesaikan.

### Resolusi

- Double-KO tetap memberi 1 Star kepada kedua pemain, **kecuali** jika
  pemberian tersebut membuat kedua pemain mencapai skor kemenangan.
- Dalam kasus tersebut, tidak ada Star yang diberikan dan match masuk
  **Sudden Death**: satu Round tambahan, knock-out pertama menang.
- Dalam Sudden Death, double-KO diulang tanpa batas sampai ada pemenang
  tunggal. Jendela double-KO diperkecil menjadi 150 ms (dari 400 ms) agar
  konvergen.
- Ambang double-KO adalah konstanta data-driven, bukan magic number.

---

## A-03 — Movement saat fase Resolve bertentangan dengan klaim latency

**Severity:** Serius — merusak jaminan arsitektur network.

### Masalah

§15 menyatakan fase simultan membuat "latency tidak menentukan siapa yang
menembak lebih dulu", dan bahwa replay dapat dibuat dari "seed, state awal,
dan dua stroke".

§9 menyatakan "Movement hanya aktif pada fase Setup dan Resolve jika pemain
masih memiliki kontrol." Input gerak selama Resolve adalah input real-time
yang bersaing dengan simulasi fisika yang sedang berjalan. Ini
mengembalikan latency sebagai faktor penentu, dan membuat klaim replay salah
— replay akan butuh input log lengkap, bukan hanya dua stroke.

### Resolusi

**Movement dikunci selama fase Resolve.** §9 diamandemen menjadi:

> Movement hanya aktif pada fase **Setup**.

Konsekuensi yang dijaga:

- Resolve adalah simulasi murni. Tidak ada input pemain yang diterima.
- Replay benar-benar dapat direkonstruksi dari `seed + state awal + dua stroke`.
- Latency tidak dapat memengaruhi hasil Turn manapun.
- Positioning tetap punya bobot taktis penuh — pemain memilih posisi selama
  4 detik Setup, dengan pengetahuan penuh atas posisi lawan.

---

## A-04 — Frame of reference untuk arah cast tidak didefinisikan

**Severity:** Gap — fitur inti tanpa spesifikasi.

### Masalah

§7.3 menyatakan "Arah stroke utama menentukan arah cast", tetapi stroke
digambar pada rune canvas sementara spell muncul di arena. PRD tidak pernah
mendefinisikan pemetaan koordinat canvas ke koordinat dunia.

### Resolusi

**Canvas adalah jendela ke arena.** Rune canvas adalah overlay transparan
yang menutupi viewport arena dengan pemetaan 1:1.

- Menggambar garis ke kanan-atas menghasilkan spell yang melesat ke
  kanan-atas.
- Menggambar lingkaran di atas kepala lawan menghasilkan gelembung tepat di
  sana.
- Tidak ada rotasi relatif terhadap arah hadap karakter.
- Tidak ada beban belajar tambahan — mendukung target §19 "cast pertama
  dalam kurang dari 60 detik".

Selama fase Draw dunia berhenti (§6), sehingga overlay tidak pernah
menargetkan sesuatu yang bergerak. Posisi lawan pada saat Draw dimulai adalah
posisi yang dilihat pemain, dan itu adalah kebenaran yang dipakai server.

Stroke dikirim ke server dalam koordinat arena yang sudah dinormalisasi
(bukan piksel), sehingga resolusi layar dan ukuran window tidak memengaruhi
hasil (§15).

---

## A-05 — Bentuk tertutup tidak memiliki arah stroke utama

**Severity:** Gap — dua dari lima keluarga spell tanpa aturan spawn.

### Masalah

Loop (§8.2) dan Spiral (§8.3) adalah bentuk tertutup atau mendekati tertutup.
Untuk bentuk seperti itu "arah stroke utama" secara matematis tidak bermakna:
vektor titik-awal-ke-titik-akhir mendekati nol dan arahnya ditentukan oleh
noise. Aturan §7.3 tidak dapat diterapkan.

### Resolusi

Aturan spawn dipisah berdasarkan topologi:

| Keluarga | Topologi | Spawn | Arah |
|---|---|---|---|
| Stroke (Arc Bolt) | terbuka | posisi caster | arah stroke utama |
| Angular (Prism Shard) | terbuka | posisi caster | arah stroke utama |
| Loop (Bubble Ward) | tertutup | **centroid gambar** | tidak ada |
| Spiral (Vortex) | tertutup/melingkar | **centroid gambar** | arah putar (chirality) |
| Wisp (fallback) | apa saja | posisi caster | arah stroke utama, dilemahkan |

Batas yang wajib ada:

- Jarak spawn centroid dibatasi radius maksimum dari caster
  (`maxCastRadius`, data-driven). Centroid di luar radius di-clamp ke tepi
  radius, bukan ditolak — sesuai §7.1 "spell tidak boleh gagal total".
- Untuk bentuk terbuka, arah stroke utama dihitung dari regresi arah pada
  stroke yang sudah di-resample, bukan dari vektor titik awal ke titik akhir.
  Ini membuat arah tahan terhadap tremor di ujung stroke.

---

## A-06 — Reconnect ada di success metrics tetapi tidak di scope MVP

**Severity:** Minor — inkonsistensi scope.

### Masalah

§19 menetapkan kriteria kualitas "Reconnect singkat tidak menggandakan player
atau Star", dan §18 Stage 3 menyebut "reconnect singkat". Namun §17 "Wajib
ada" tidak mencantumkan reconnect.

### Resolusi

Reconnect ditambahkan ke §17 "Wajib ada" dengan cakupan minimal:

- Jendela reconnect 30 detik setelah koneksi putus.
- Match dijeda pada batas Turn, bukan di tengah Resolve.
- Rejoin memulihkan skor, Wobble, dan posisi dari state server.
- Melewati jendela reconnect memberi kemenangan kepada lawan.

Reconnect **tidak** mencakup migrasi host, resume lintas sesi, atau
persistensi setelah server restart.

---

## A-07 — Renderer MVP tidak lagi dikunci ke Three.js

**Severity:** Serius — constraint arsitektur lama bertentangan dengan renderer
yang sudah berjalan dan dengan keterbacaan core loop.

### Masalah

PRD §15 menetapkan `Client: Vite + TypeScript + Three.js`, sementara runtime
sejak Stage 0 memakai Canvas 2D berlapis. Membiarkan nama library itu sebagai
requirement memberi sinyal keliru bahwa renderer harus dipindah ke 3D, padahal
gameplay, kamera, input, dan collision contract saat ini berada pada satu bidang
side-view.

Ini bukan larangan universal terhadap game isometric. Untuk kontrak produk dan
MVP ini, perpindahan tersebut mengubah dua sifat inti:

1. **Literalitas coretan.** PRD §1 menjanjikan setiap coretan menjadi sihir.
   Stroke pemain adalah kurva 2D di layar. Runtime isometric harus memilih
   bidang kedalaman untuk kurva itu; pilihan tersebut menambahkan interpretasi
   yang tidak ada pada input literal pemain.
2. **Keterbacaan balistik.** Arc, wind, pantulan crystal, dan jarak serang
   Gunbound-like saat ini dibaca pada satu bidang. Kedalaman tersembunyi dapat
   membuat hasil meleset terasa tidak adil, bertentangan dengan cozy chaos pada
   §4.2.

### Resolusi

Baris PRD §15 dibaca sebagai:

> Client: Vite + TypeScript + **renderer Canvas 2D berlapis**.

- Runtime 3D/isometric berada di luar scope MVP.
- 3D tetap sah sebagai **pipeline aset**: karakter atau environment dapat
  dibuat dari sumber 3D lalu dirender menjadi sprite 2D.
- Hanya hasil 2D yang masuk runtime; authoritative physics dan input mapping
  tetap berada pada bidang side-view.
- Keputusan ini dapat ditinjau kembali setelah combat lulus playtest manusia,
  tetapi perubahan itu adalah pivot produk, bukan penggantian skin.

---

## A-08 — Platform MVP bergeser ke portrait mobile-first

**Severity:** Serius — mengubah target platform yang dikunci PRD §3.

### Masalah

PRD §3 mengunci MVP ke *desktop web browser* dengan *input utama: mouse*, dan
menyebut dukungan touch sebagai kewajiban arsitektur saja. Arah desain yang
diputuskan BK pada 3 Agustus 2026 adalah sebaliknya: portrait mobile adalah
bentuk utama, desktop menyesuaikan.

Ini bukan keputusan layout. Tiga hal di PRD ikut bergeser bersamanya.

### Resolusi

**Platform MVP dibaca ulang sebagai:**

> Portrait mobile web adalah target utama. Desktop adalah target yang wajib
> tetap berjalan, dirender dengan geometri arena yang sama (A-09), bukan
> sebagai layout kedua.

Konsekuensi yang ikut terkunci:

- **Input utama adalah sentuh.** Mouse tetap sah dan tidak boleh punya
  keunggulan presisi yang dikodekan. Semua kontrol interaktif minimal 44×44 px.
- **Gerak Setup memakai model held-direction** (kiri/kanan ditahan + satu
  lompat per Setup), sesuai PRD §9 dan konstanta `movement.speed`,
  `movement.jumpImpulse`, `movement.jumpsPerSetup` yang sudah ada. Model
  tap-to-position ditolak karena menghapus lompatan dari PRD §9. Chrome bawah
  wajib menyediakan tiga kontrol sentuh yang hanya aktif saat fase Setup.
- **Durasi fase tidak berubah.** `phases.castMs` tetap `2000`. Timer `AIM 03.8`
  pada mockup adalah art direction, bukan spesifikasi; menaikkannya akan
  membawa Turn ke ~22.8 detik, melewati batas 22 detik di PRD §19.

### Yang tidak berubah

Gamepad tetap di luar scope. Aplikasi native tetap di luar scope; targetnya
adalah web di browser mobile.

---

## A-09 — Rasio arena dikunci lintas device sebagai constraint keadilan

**Severity:** Blocker — tanpa ini, device menentukan sebagian hasil duel.

### Masalah

`createViewport` menurunkan `scale` dari lebar canvas saja:

```
scale = width / (2 · camera.halfWidth)
```

Akibatnya berapa banyak arena yang terlihat **secara vertikal** adalah fungsi
murni dari rasio canvas — dan karena Ink ditagih per satuan panjang busur di
ruang arena (A-04 mengunci canvas gambar sebagai overlay 1:1), rasio canvas
juga menentukan berapa Ink yang dibeli sebuah gestur vertikal.

Implementasi mobile pertama membiarkan tinggi canvas mengambil sisa layar
(`calc(100dvh - 9.75rem)` di HP, `aspect-ratio: 16/9` di desktop). Diukur di
`.audit/probe-framing.mjs`:

| Device | Sapuan setinggi layar |
|---|---|
| Desktop 16:9 | 42.5 Ink |
| iPhone 14 Pro portrait | 122.9 Ink (**2.89×**) |
| 390×844 portrait | 123.9 Ink (**2.92×**) |

Dua pemain pada device berbeda karena itu (a) melihat jumlah arena yang berbeda
untuk membidik, dan (b) membayar harga berbeda untuk rune dengan bentuk yang
sama. Keduanya bertentangan dengan A-03 dan PRD §15.

### Resolusi

**`camera.arenaAspectRatio` dikunci ke `2/3` untuk semua device.** Canvas arena
selalu dirender pada rasio ini; sisa ruang layar adalah letterbox, bukan arena.

Kandidat yang diukur sebelum memilih:

| Rasio | Frame vertikal | Catatan |
|---|---|---|
| 3:4 | −1.40 .. 1.80 | Kill floor −1.4 persis di tepi frame — KO resolve di luar layar. **Ditolak.** |
| **2:3** | **−1.52 .. 1.92** | Pulau 87% lebar canvas; desktop letterbox 480×720. **Dipilih.** |
| 0.64 | −1.60 .. 2.00 | Setara, tapi rasio non-standar tanpa keuntungan terukur. |
| 9:16 | −1.84 .. 2.24 | 0.44 unit langit kosong ekstra tanpa gameplay di dalamnya. |
| 9:19.5 | −2.30 .. 2.70 | Desktop letterbox menyusut ke 332×720. |

Konstanta yang bergerak bersamanya:

- `camera.fullHalfWidth` **1.45 → 1.15.** Pada 1.45 pulau menyusut ke 69% lebar
  canvas di HP. 1.15 adalah framing tersempit yang masih memuat pulau (±1.0),
  langit-langit kristal (1.3), dan kill floor (−1.4) dengan margin.
- `camera.drawCenterBias` **0.30 → 0.36.** Pada 0.30 tepi kanan frame Draw
  berhenti di 0.60 sementara sisi jauh lawan ada di `spawnX + radius` = 0.64 —
  lawan terpotong. Cacat ini sudah ada sejak build landscape.

### Invariant Ink yang dipertahankan

`camera.drawHalfWidth` dan `ink.costPerUnitLength` **tidak berubah**, karena
invariant yang mengatur ekonomi Ink adalah:

```
2 · camera.drawHalfWidth · ink.costPerUnitLength = 75.5 Ink per sapuan selebar canvas
```

`fullHalfWidth` tidak masuk persamaan ini — tidak ada yang menggambar pada
kamera Full. Karena itu me-reframe kamera Full untuk portrait adalah presentasi
murni. Terverifikasi: fraksi lebar layar yang membeli Ink 40 tetap **0.530**,
dan crossover offence/defence tetap jatuh **persis di Ink 40**
(`predictLaunch`: reach 1.10 = jarak antar-wizard 1.10).

### Yang berubah dan diterima

Bentuk yang diukur terhadap **tinggi** layar menjadi lebih mahal: sapuan
setinggi canvas naik dari 42.5 ke 113.2 Ink. Bentuk yang diukur terhadap
**lebar** layar — termasuk semua lingkaran dan spiral yang diskalakan terhadap
lebar — berbiaya identik dengan sebelumnya. Anisotropi total justru turun dari
1.78× (landscape) menjadi 1.50× (portrait 2:3).

---

## Ringkasan konstanta yang dikunci amandemen ini

Nilai-nilai ini hidup di `shared/config` sebagai data, bukan magic number.

| Konstanta | Nilai | Sumber |
|---|---|---|
| `wobble.resetScope` | `"round"` | A-01 |
| `ink.resetScope` | `"turn"` | A-01 |
| `doubleKoWindowMs` | `400` | A-02 |
| `doubleKoWindowSuddenDeathMs` | `150` | A-02 |
| `movement.activePhases` | `["setup"]` | A-03 |
| `aim.frame` | `"arena-overlay"` | A-04 |
| `spawn.maxCastRadius` | data-driven, di-clamp | A-05 |
| `reconnect.windowMs` | `30000` | A-06 |
| `phases.castMs` | `2000` (tetap) | A-08 |
| `movement` model | held-direction + 1 lompat | A-08 |
| `camera.arenaAspectRatio` | `2/3`, semua device | A-09 |
| `camera.fullHalfWidth` | `1.15` | A-09 |
| `camera.drawCenterBias` | `0.36` | A-09 |
| `camera.drawHalfWidth` × `ink.costPerUnitLength` | `0.85 × 44.4` → 75.5 Ink/sapuan | A-09 |
