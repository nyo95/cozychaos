# Proposal: Wild Spell Grammar + Ink Commitment

**Status:** proposal untuk keputusan lead; belum menjadi requirement.

**Requested by:** product ideator.

**Decision owner:** Claude sebagai main lead.

**Implementation owner:** belum ditentukan — Claude memilih apakah dikerjakan
oleh Claude, Codex, atau dibagi.

## Ringkasan keputusan yang diminta

Produk yang diinginkan bukan game yang meminta pemain menghafal empat simbol.
Pemain seharusnya dapat membuat coretan liar dan melihat geometri coretan itu
menjadi perilaku fisika yang tetap bisa dipahami.

Punchline yang diusulkan:

> **Gambar sihirmu sesukamu. Tetapi tinta yang kamu pakai menyerang adalah tinta
> yang tidak bisa menyelamatkanmu.**

Claude perlu memutuskan:

1. Terima, revisi, atau tolak arah ini sebelum Stage 1 dimulai.
2. Jika diterima, tentukan pemilik revisi PRD dan pemilik Spell Lab V2.
3. Tentukan apakah empat keluarga tetap terlihat oleh pemain atau hanya menjadi
   primitive internal.

Tidak boleh ada implementasi Stage 1 yang mengasumsikan jawaban sebelum
keputusan tersebut dibuat.

## Masalah pada desain saat ini

PRD saat ini mengklasifikasikan satu stroke menjadi tepat satu dari empat
keluarga: Stroke, Loop, Spiral, atau Angular. Ini mudah diuji, tetapi berisiko
mengubah menggambar menjadi ujian pengenalan bentuk: pemain berusaha menemukan
simbol yang diterima classifier, bukan bereksperimen dengan sihir.

Target pengalaman baru:

- Coretan kasar tetap memiliki niat dan konsekuensi.
- Dua gambar yang berbeda terasa berbeda secara fisik.
- Pemain dapat mencampur motif dalam satu gambar.
- Hasil detail boleh chaotic, tetapi fungsi besarnya harus dapat diprediksi.
- Keputusan terpenting bukan "simbol mana yang benar", melainkan "berapa banyak
  Ink yang berani saya commit sekarang".

## Empat keluarga menjadi grammar, bukan empat pilihan

Feature extractor yang sudah ada tetap berguna. Perubahan utamanya adalah tidak
lagi memilih satu pemenang mutlak. Motif dapat hidup bersamaan dan menyusun satu
hybrid spell.

| Motif pada gambar | Kontribusi perilaku |
|---|---|
| Segmen terbuka/panjang | thrust, proyektil, atau arah dorongan |
| Loop lokal | bubble, shield, atau bagian yang menyerap benturan |
| Spiral lokal | tarikan, putaran, atau medan vortex |
| Sudut tajam | bounce, split, atau perubahan arah |
| Persilangan | burst/chain yang tidak stabil |
| Ukuran/luas | radius dan massa, dibatasi biaya Ink |
| Kekasaran | variasi dan wobble yang dibatasi, bukan damage gratis |
| Arah perjalanan stroke | arah cast dan urutan aktivasi motif |

Contoh hasil:

- Garis dengan loop di ujung: bolt yang membawa bubble impact.
- Zigzag yang masuk ke spiral: shard memantul lalu membuat tarikan kecil.
- Loop besar dengan ekor terbuka: ward yang terdorong seperti bola.
- Coretan bersilang: serangan pendek, tidak stabil, dan sulit diarahkan.

Arcane Wisp tetap diperlukan sebagai floor untuk mark yang terlalu kecil atau
tidak punya struktur yang dapat dibaca.

## Ink sebagai commitment menyerang vs bertahan

Satu pool Ink dipakai untuk seluruh keputusan pada satu Turn:

- Ink yang digambar menjadi kompleksitas, ukuran, jangkauan, dan kontrol spell.
- Ink yang tersisa setelah Draw menjadi **Ward Reserve** selama Resolve.
- Pemain yang menghabiskan semua Ink mendapat spell maksimal tetapi hampir
  tidak memiliki perlindungan.
- Pemain yang menahan Ink lebih tahan terhadap benturan tetapi memberi tekanan
  ofensif lebih kecil.

Ward Reserve sebaiknya otomatis, bukan input real-time, agar prinsip fase
simultan dan toleransi latency tetap terjaga. Bentuk awal yang perlu diuji:

- mengurangi sebagian Wobble dari benturan pertama; atau
- mengurangi knockback dengan diminishing returns; atau
- membuat bubble singkat yang pecah setelah satu hit.

Anti-turtling wajib diuji. Kandidat pengaman: cap Ward Reserve, diminishing
returns, hanya melindungi satu benturan, atau arena pressure yang memaksa pemain
tetap menyerang. Angka final tidak boleh dipilih tanpa Physics Toy.

## Dampak terhadap pekerjaan yang sudah ada

Yang dapat dipakai kembali:

- pointer capture dan endpoint handling;
- Ink Meter dan batas panjang;
- normalisasi, resampling, smoothing, dan geometry features;
- Draw Assist/canonical fairness pipeline;
- seeded randomness, config, dan sebagian besar test infrastructure;
- Spell Lab sebagai tempat eksperimen.

Yang perlu didesain ulang:

- classifier single-family menjadi spell composer berbasis beberapa motif;
- `SpellInstance` agar dapat membawa beberapa effect/force component;
- tujuan Spell Lab dari "temukan 4/4" menjadi "buat dan pahami hybrid spell";
- PRD §7, §8, exit criteria Stage 0, dan success metrics;
- telemetry playtest agar mencatat motif, Ink committed, Ward Reserve, hasil
  benturan, dan apakah pemain memahami sebab-akibatnya.

Jadi Stage 0 bukan pekerjaan terbuang, tetapi classifier pemenang-tunggalnya
tidak boleh dianggap kontrak final.

## Progres jujur saat proposal dibuat

- Drawing/geometry foundation: sekitar 70%.
- Gameplay inti yang benar-benar dapat dimainkan: sekitar 10%.
- Multiplayer: 0% — belum ada server, room, sync, reconnect, atau authoritative
  physics.
- MVP keseluruhan: sekitar 8–12%.

Angka ini adalah estimasi engineering, bukan metrik keberhasilan produk. Jika
pivot diterima, sebagian mapping/classifier perlu diulang tetapi fondasi capture
dan geometry tetap dipakai.

## Roadmap yang diusulkan

### 0. Spell Lab V2 — Wild Spell Grammar

Hybrid motif, visual breakdown yang mudah dibaca, serta Ink committed vs Ward
Reserve. Uji pada manusia sebelum lanjut.

**Exit candidate:** pemain dapat sengaja membuat minimal tiga hasil hybrid yang
berbeda, menjelaskan penyebabnya, dan memahami trade-off Ink tanpa bantuan
developer.

### 1. Physics Toy

Satu karakter, satu dummy, arena, Wobble, knock-out, props, hybrid spell, dan
Ward Reserve.

**Exit candidate:** eksperimen bebas 10 menit tetap menghasilkan discovery baru
tanpa hasil terasa acak.

### 1.5 Network Risk Spike

Dua browser, satu cast, server-authoritative reading, seed dan hasil physics
identik. Belum perlu lobby atau progression.

**Tujuan:** multiplayer tidak ditunda sampai akhir sebagai risiko tersembunyi.

### 2. Local Match Loop

Dua pemain/bot input, Setup → Draw → Reveal → Resolve → Score, first-to-3, durasi
3–5 menit, dan trade-off attack/defense utuh.

### 3. Online 1v1 MVP

Room code, authoritative server, reconnect singkat, rematch, dan replay state.

### 4. Presentation dan Camp

Art, audio, onboarding, kosmetik, dan Sanctum Camp minimal setelah core loop
terbukti.

## Handoff untuk Claude

Claude diminta menuliskan keputusan di bawah ini sebelum pekerjaan berikutnya:

- **Product decision:** accepted / revised / rejected.
- **PRD owner:** Claude / Codex.
- **Spell Lab V2 owner:** Claude / Codex.
- **Reviewer:** pihak yang tidak menjadi implementer utama.
- **Network spike timing:** sesudah Physics Toy / sesudah Local Match.

Sampai keputusan itu ada, Codex tidak mengubah classifier atau memulai
multiplayer berdasarkan proposal ini.
