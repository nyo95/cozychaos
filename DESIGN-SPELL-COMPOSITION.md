# Kontrak Desain: Wild Spell Composition + Ink Commitment

**Status:** kontrak implementasi. Menggantikan model klasifikasi pemenang-tunggal.
**Design owner:** Claude
**Implementation owner:** Codex
**Menggantikan:** PRD §7.1 (satu keluarga per stroke), §8 (empat keluarga sebagai
pilihan pemain), exit criteria Stage 0.

---

## 1. Arah produk yang dikunci

Diputuskan oleh BK sebagai pemilik produk:

1. **Coretan liar, bukan empat simbol.** Tidak ada bentuk "benar" yang harus
   ditemukan pemain.
2. **Ink adalah keputusan inti.** Ink yang dipakai menyerang adalah ink yang
   tidak bisa dipakai bertahan.
3. **Pemain tahu kasarnya, kaget detailnya.** Sebelum commit ia tahu coretannya
   "mendorong keras ke kanan-atas"; ia tidak tahu pantulannya ke mana, apa yang
   tersenggol, siapa yang terguling.
4. **Empat keluarga menjadi primitive internal.** Pemain tidak pernah melihat
   kata "Arc Bolt" maupun checklist 4 slot. Nama keluarga hanya hidup di kode.

Butir 3 adalah yang paling mudah dilanggar tanpa sadar, dan konsekuensinya
paling mahal. Keputusan ink hanya bermakna kalau pemain bisa memperkirakan apa
yang ia beli. Kedua pemain menggambar serentak dan rahasia (PRD §6.2), jadi
serangan lawan sudah tidak diketahui; kalau hasil coretannya sendiri **juga**
tidak diketahui, keputusan commit jadi lempar koin. **Chaos ada di detail
eksekusi, tidak pernah di kategori hasil.**

---

## 2. Model: stroke → motif → recipe

Satu stroke tidak lagi menghasilkan satu keluarga. Ia menghasilkan **resep**
berisi beberapa komponen gaya yang aktif berurutan sesuai arah menggambar.

```
raw points
  → extractFeatures()          [sudah ada, tidak berubah]
  → segmentMotifs()            [BARU]  → MotifOccurrence[]
  → composeRecipe()            [BARU]  → SpellRecipe
  → simulasi                   [Physics Toy]
```

`extractFeatures`, pipeline kanonik Draw Assist, resampling, ink meter, dan
seeded random **tidak berubah**. Yang berubah hanya konsumen di hilirnya.

Biaya pivot rendah karena `scoreFamilies()` sudah menghitung skor kontinu untuk
kelima keluarga dan selama ini empat di antaranya dibuang.

---

## 3. Segmentasi motif

Motif ditemukan dari **perpotongan sendiri** (self-intersection), bukan dari
skor global. Alasannya: itu definisi loop yang dipakai mata manusia. Kalau garis
menyilang dirinya sendiri, di situ ada gelung — tidak peduli seberapa berantakan
sisanya.

Pada 96 titik hasil resample, pemindaian pasangan segmen berbiaya sepele.

### Aturan

1. **Cari semua perpotongan sendiri.** Setiap perpotongan mendefinisikan satu
   *loop span* — rentang indeks antara dua titik potong.
2. **Loop span dengan radius rata** (`radiusTrend` lokal rendah) → motif `LOOP`.
3. **Loop span dengan radius memanjat/menyusut** (`radiusTrend` lokal tinggi) →
   motif `SPIRAL`. Chirality lokal menentukan arah putaran.
4. **Sisa stroke di luar loop span** = *open run*. Deteksi sudut di dalamnya
   dengan `detectCorners` yang sudah ada:
   - open run tanpa sudut → motif `THRUST`
   - setiap sudut → motif `BOUNCE`
5. **Loop span yang saling tumpang tindih rapat** (≥3 perpotongan dalam rentang
   pendek) → motif `UNSTABLE`, menggantikan motif lain di rentang itu.
6. **Tidak ada motif sama sekali** → satu motif `WISP` lemah. Ini lantai yang
   menjaga janji PRD §1: setiap coretan menjadi sihir.

### Bentuk data

```ts
type MotifKind = 'thrust' | 'loop' | 'spiral' | 'bounce' | 'unstable' | 'wisp';

interface MotifOccurrence {
  readonly kind: MotifKind;
  /** Posisi awal & akhir sepanjang stroke, 0–1. Menentukan urutan aktivasi. */
  readonly from: number;
  readonly to: number;
  /** Pusat motif di koordinat arena. Titik spawn untuk loop/spiral/unstable. */
  readonly center: Vec2;
  /** Arah perjalanan lokal. Bermakna untuk thrust/bounce. */
  readonly direction: Vec2;
  /** Ukuran lokal dalam satuan arena. */
  readonly size: number;
  /** +1 / -1 / 0. Bermakna untuk spiral. */
  readonly chirality: -1 | 0 | 1;
  /** Panjang busur rentang ini. Dasar biaya ink dan kekuatan. */
  readonly arcLength: number;
}
```

### Batas

`maxMotifs = 5`. Coretan dengan lebih banyak motif digabung: motif terlemah
dilebur ke tetangga terdekat yang sejenis. Tanpa batas ini, coretan padat
menghasilkan puluhan komponen yang tidak bisa dibaca dalam 8 detik Resolve dan
membuat biaya simulasi tak terbatas.

---

## 4. Komposisi menjadi resep

```ts
interface ForceComponent {
  readonly kind: MotifKind;
  readonly origin: Vec2;
  readonly direction: Vec2;
  readonly radius: number;
  readonly mass: number;
  readonly strength: number;
  readonly chirality: -1 | 0 | 1;
  /** Detik sejak Resolve dimulai. Motif aktif sesuai urutan menggambar. */
  readonly activateAtMs: number;
  readonly lifetimeMs: number;
}

interface SpellRecipe {
  readonly components: readonly ForceComponent[];
  /** Ink yang dibelanjakan untuk resep ini. */
  readonly inkCommitted: number;
  /** Sisa ink. Menjadi Ward Reserve saat Resolve. */
  readonly inkReserved: number;
  /** Ringkasan kasar untuk preview. Lihat §6. */
  readonly summary: RecipeSummary;
}
```

### Aturan komposisi

- **Urutan aktivasi mengikuti arah menggambar.** Motif pada `from` lebih kecil
  aktif lebih dulu. `activateAtMs = from × spreadMs`, `spreadMs` data-driven.
- **Kekuatan tiap komponen sebanding dengan porsi ink-nya**, bukan dengan
  jumlah motif. Menggambar sepuluh gelung kecil tidak menghasilkan sepuluh
  gelembung penuh; menghasilkan sepuluh gelembung kecil.
- **Konservasi:** total `strength` seluruh komponen dibatasi oleh
  `inkCommitted`. Ini yang membuat trade-off ink nyata — tanpa ini, coretan
  panjang gratis lebih kuat dan tidak ada alasan menahan ink.
- **THRUST membawa proyektil melewati motif lain** yang berada di jalurnya,
  sehingga contoh "garis dengan gelung di ujung" menjadi dorongan yang membawa
  gelembung, bukan dua spell terpisah.
- Semua parameter komponen dihitung dari **`classification.canonical`**.
  Draw Assist tidak boleh menyentuh satu pun angka di sini — aturan dari sesi 2
  tetap berlaku penuh dan `fairness.test.ts` harus diperluas untuk menutupi
  resep, bukan hanya `SpellInstance`.

---

## 5. Model ink

Satu pool per Turn (PRD §7.2, scope per-Turn dari A-01).

```
inkCommitted = Σ (arcLength motif × costPerUnitLength) + costToStart
inkReserved  = CONFIG.ink.total − inkCommitted
```

**Ward Reserve tetap milik Physics Toy, bukan Spell Lab V2.** Alasannya tidak
berubah: Spell Lab tidak punya lawan, tidak punya Resolve, tidak punya benturan
masuk. Trade-off menyerang-vs-bertahan tidak bisa dirasakan di tempat yang tidak
ada yang menyerang. Angka finalnya juga tidak bisa dipilih tanpa Physics Toy.

Yang **wajib** ada di Spell Lab V2: tampilan pembagian ink yang jelas —
committed vs reserved — sehingga konsepnya sudah terbaca sebelum ia berfungsi.

Formula Ward Reserve yang akan diuji di Physics Toy (jangan diimplementasi
sekarang): mengurangi Wobble dari benturan pertama, atau meredam knockback
dengan diminishing returns, atau gelembung singkat sekali pakai. Anti-turtling
wajib diuji bersamaan.

---

## 6. Apa yang dilihat pemain

Ini kontrak yang menjaga butir 3 di §1. Melanggarnya membuat keputusan ink
menjadi lempar koin.

**Ditampilkan sebelum commit** — kasar, bukan detail:

```ts
interface RecipeSummary {
  /** Arah dominan, dibulatkan ke 8 penjuru. */
  readonly heading: 'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW'|'none';
  /**
   * Kekuatan kasar. Tiga tingkat saja.
   *
   * AMANDEMEN (sesi 8): dihitung dari **committed-Ink**, bukan dari total
   * strength komponen. Total strength jitter ~1% karena cap per-motif, dan
   * sebuah zigzag mendarat tepat di batas band sehингga readout-nya berkedip di
   * bawah tremor — melanggar sifat 8. Committed Ink stabil dan, untuk stroke
   * yang terbaca, sebanding dengan strength. Recipe wisp-only dipatok `ringan`.
   * Batas band diletakkan di celah antar-cluster (0.44 dan 0.67), bukan di
   * atasnya.
   */
  readonly force: 'ringan' | 'sedang' | 'berat';
  /** Urutan motif sebagai ikon, bukan nama. */
  readonly shape: readonly MotifKind[];
  readonly inkCommitted: number;
  readonly inkReserved: number;
}
```

**Dilarang ditampilkan sebelum Resolve:** trajectory, titik pantul, prediksi
tabrakan, angka knockback, dan nama keluarga spell.

**Dilarang di mana pun:** checklist "Discovered n/4" dan label "Arc Bolt",
"Bubble Ward", "Vortex", "Prism Shard". Nama-nama itu tetap ada di kode sebagai
primitive internal dan tidak pernah muncul di UI.

Panel discovery yang ada sekarang **dihapus**, bukan diberi label ulang. Itu
checklist berburu simbol dan keberadaannya membentuk perilaku pemain.

---

## 7. Kontrak test

Ini menjawab keberatan utama saya terhadap komposisi bebas: bahwa ruang hasilnya
kombinatorial dan sistemnya tidak akan pernah bisa dinyatakan bekerja. Sifat-sifat
di bawah ini dapat diuji tanpa menyebutkan hasil spesifik.

**Deteksi motif** — fixture stroke sintetis baru di `__fixtures__`:

| Fixture | Motif yang diharapkan |
|---|---|
| garis lurus | `[thrust]` |
| garis dengan gelung di ujung | `[thrust, loop]` dengan `loop.from > 0.5` |
| gelung di awal lalu ekor | `[loop, thrust]` dengan `loop.from < 0.5` |
| zigzag 3 sudut | `[thrust, bounce×3]` |
| zigzag masuk spiral | `bounce` mendahului `spiral` |
| spiral 2 putaran | `[spiral]` dengan chirality benar |
| coretan bersilang padat | mengandung `unstable` |
| titik kecil | `[wisp]` |

**Sifat yang wajib berlaku:**

1. **Monotonisitas.** Gelung lebih besar → `radius` komponen loop lebih besar.
   Ink lebih banyak → total `strength` lebih besar. Tidak boleh ada pembalikan.
2. **Konservasi.** Σ `strength` ≤ plafon yang ditentukan `inkCommitted`, untuk
   setiap stroke di seluruh dataset.
3. **Lantai.** Setiap input, termasuk array kosong dan satu ketukan,
   menghasilkan ≥1 komponen dengan angka berhingga.
4. **Plafon.** Tidak ada stroke yang menghasilkan lebih dari `maxMotifs`
   komponen.
5. **Urutan.** `activateAtMs` monoton naik mengikuti `from`.
6. **Fairness.** Standard dan High assist menghasilkan resep yang **identik
   angka per angka**. Perluasan langsung dari `fairness.test.ts` yang ada.
7. **Determinisme.** Stroke yang sama + seed yang sama → resep yang sama, bit
   per bit. Syarat replay PRD §15.
8. **Stabilitas kategori.** Ini yang menjaga butir 3 di §1: dua stroke yang
   berbeda tipis harus punya `summary.heading` dan `summary.force` yang sama.
   Diuji dengan menambah tremor kecil pada fixture dan memastikan ringkasannya
   tidak berubah, meskipun detail komponennya berubah. **Chaos di detail, bukan
   di kategori** — dan tes inilah yang membuat kalimat itu punya gigi.

Sifat 8 adalah tes terpenting di dokumen ini. Kalau ia gagal, keputusan ink
menjadi lempar koin dan seluruh premis produk runtuh.

---

## 8. Telemetry — wajib, bukan menyusul

Playtest terpisah dibatalkan oleh pemilik produk. Karena itu **instrumentasi
harus ikut di V2, bukan sesudahnya.** Tanpa ini, motif dirancang dari tebakan
kita dan tidak ada mekanisme untuk mengoreksinya.

Setiap stroke yang di-commit dicatat, dan dapat diekspor sebagai JSON dari
Spell Lab:

```ts
interface StrokeRecord {
  readonly sessionId: string;
  readonly index: number;
  readonly motifs: readonly { kind: MotifKind; from: number; size: number }[];
  readonly inkCommitted: number;
  readonly inkReserved: number;
  readonly summary: RecipeSummary;
  readonly drawMs: number;
  readonly pointCount: number;
  readonly assist: AssistLevel;
}
```

Orang pertama yang menyentuh V2 menghasilkan data yang tadinya diminta dari
sesi observasi. Yang dicari: motif apa yang muncul spontan, motif mana yang
tidak pernah muncul (berarti tidak terjangkau), dan berapa ink yang orang
belanjakan tanpa disuruh.

---

## 9. Yang tidak berubah

Jangan disentuh tanpa menjalankan `fairness.test.ts` dan `classifier.test.ts`
lebih dulu:

- `shared/src/spells/geometry.ts` — resample, smooth, corner detection, winding,
  enclosure, decimate.
- `shared/src/spells/features.ts` — termasuk pipeline kanonik Draw Assist.
- `shared/src/config/` — pola data-driven; tambahkan nilai baru di sini, bukan
  di kode motif.
- `shared/src/match/` — Turn/Round, Wobble, scoring, seeded random.
- `client/src/input/`, `client/src/drawing/` — pointer lifecycle dan ink meter.

Tiga kali dalam tiga sesi, perubahan yang tampak menyederhanakan merusak satu
keluarga spell secara diam-diam. Ambang di file-file itu punya alasan tertulis,
dan beberapa kontra-intuitif justru karena versi intuitifnya sudah dicoba dan
gagal.

`classifyStroke` tetap ada dan tetap diuji. Ia menjadi primitive internal yang
dipakai `segmentMotifs` untuk menilai tiap span, bukan lagi jawaban akhir.

---

## 10. Urutan kerja

```
1. segmentMotifs() + fixture + test deteksi        (Codex)
2. composeRecipe() + test sifat 1–8                (Codex)
3. Telemetry StrokeRecord + ekspor JSON            (Codex)
4. Spell Lab V2 UI: preview kasar + pembagian ink  (Codex)
5. Hapus panel discovery                           (Codex)
6. Revisi PRD §7/§8 + exit criteria                (Claude)
7. Network Risk Spike                              (Codex, paralel, independen)
8. Physics library spike                           (Codex, paralel, independen)
```

Butir 7 dan 8 tidak menyentuh satu pun file yang ada dan boleh jalan sekarang.

**Exit criteria Spell Lab V2:** pemain dapat sengaja membuat tiga hasil yang
terasa berbeda, menjelaskan kenapa berbeda, dan menyebutkan berapa ink yang ia
sisakan — tanpa bantuan developer dan tanpa pernah melihat nama keluarga spell.
