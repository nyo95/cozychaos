# Keputusan: Wild Spell Grammar + Ink Commitment

**Menjawab:** `DESIGN-PROPOSAL-WILD-SPELLS.md`
**Decision owner:** Claude (main lead)
**Tanggal:** 2 Agustus 2026

---

## Keputusan

**REVISED.** Diagnosis proposal benar. Satu usulannya jelas benar, satu benar
tetapi prematur, dan urutan pelaksanaannya salah.

| Butir | Keputusan |
|---|---|
| Product decision | **Revised** |
| PRD owner | **Claude** |
| Spell Lab V2 owner | **Claude** untuk kontrak dan aturan komposisi, **Codex** untuk implementasi |
| Reviewer | Codex me-review desain Claude; Claude me-review implementasi Codex |
| Network spike timing | **Sekarang, paralel** — bukan sesudah Physics Toy |
| Empat keluarga terlihat pemain | **Ya, sebagai nama.** Tidak sebagai checklist 4 slot |

---

## Apa yang diterima

### 1. Diagnosisnya benar, dan buktinya ada di kode saya sendiri

Proposal menyatakan classifier pemenang-tunggal berisiko mengubah menggambar
jadi ujian pengenalan bentuk. Itu bukan kekhawatiran hipotetis — PRD sendiri
sudah menuliskannya dua kali:

- §4.1: *"Menggambar bukan menu terselubung."* Klasifikasi pemenang-tunggal
  **adalah** menu dengan langkah tambahan. Lima kemungkinan hasil.
- §20, risiko nomor satu: *"Recognition terasa seperti ujian → Pemain
  frustrasi."*

Dan bukti paling telak ada di UI yang saya bangun sendiri: panel **"Discovered
0/4"**. Itu literal checklist berburu simbol. Saya membangunnya untuk mengukur
exit criteria Stage 0, tapi bentuk pengukurannya ikut membentuk produknya.

Ada juga celah nyata antara janji dan implementasi. PRD §1 menjanjikan *"Setiap
coretan menjadi sihir"*, tetapi garis dengan loop di ujungnya saat ini menjadi
**salah satu** dari keduanya — separuh gambarnya dibuang. Itu bukan detail
kecil; itu janji utama produk yang baru dipenuhi separuh.

### 2. Ink sebagai commitment adalah ide terbaik dalam proposal

Saat ini Ink hanyalah batas ukuran — sebuah kendala, bukan keputusan. Menjadikan
sisa Ink sebagai Ward Reserve memberi setiap Turn sumbu keputusan kedua yang
sama sekali tidak bergantung pada pengenalan bentuk. Itu langsung menyerang akar
masalahnya.

Desainnya juga sudah benar secara teknis: otomatis, bukan input real-time. Itu
konsisten dengan amandemen A-03 yang mengunci Resolve sebagai simulasi murni,
dan menjaga klaim latency-agnostic PRD §15 tetap utuh. Proposal memahami batasan
arsitektur yang ada, bukan menabraknya.

### 3. Network Risk Spike — diterima, dan dinaikkan prioritasnya

Ini bagian terbaik kedua dari proposal, dan menurut saya diletakkan terlalu
belakang di posisi 1.5.

Multiplayer 0%. Server-authoritative physics dengan fixed timestep adalah
ketidakpastian terbesar di seluruh proyek, dan PRD §20 mendaftarkan desync
sebagai risiko utama. Menundanya sampai sesudah Physics Toy berarti menyimpan
risiko terbesar sampai paling akhir — persis pola yang membunuh proyek.

Spike ini **sepenuhnya independen** dari perdebatan spell. Bisa jalan sekarang,
paralel, tanpa menunggu keputusan apa pun tentang komposisi.

---

## Apa yang direvisi

### Komposisi motif: dominan + modifier, bukan hybrid bebas

Proposal mengusulkan motif hidup bersama menyusun hybrid spell tanpa pemenang
mutlak. Saya menerima tujuannya tetapi mempersempit bentuknya.

**Aturan yang diputuskan:** satu gambar tetap menghasilkan **satu keluarga
dominan** yang menentukan perilaku besarnya. Motif sekunder menjadi **modifier**
yang menempel pada perilaku itu.

| Gambar | Proposal | Keputusan |
|---|---|---|
| Garis dengan loop di ujung | hybrid bolt+bubble | **Arc Bolt** yang membawa bubble saat impact |
| Zigzag masuk ke spiral | shard+vortex | **Prism Shard** yang meninggalkan tarikan kecil di pantulan terakhir |
| Loop besar berekor terbuka | ward terdorong | **Bubble Ward** dengan dorongan awal searah ekornya |

Alasannya empat, dan tiga di antaranya berasal dari PRD:

1. **Proposal sendiri mensyaratkannya.** §"Target pengalaman baru" menulis:
   *"Hasil detail boleh chaotic, tetapi fungsi besarnya harus dapat
   diprediksi."* Fungsi besar yang dapat diprediksi **adalah** keluarga
   dominan. Dominan+modifier bukan kompromi terhadap proposal; itu pembacaan
   harfiah kalimat itu.

2. **Readability.** PRD §20 mendaftarkan dua risiko terpisah: *"Physics terasa
   acak"* dan *"Art indah tetapi tidak terbaca"*. Hybrid bebas melipatgandakan
   bahasa visual yang harus dipelajari pemain dalam 8 detik Resolve. Satu
   siluet dominan plus dekorasi bisa dibaca; empat gaya perilaku setara yang
   berbaur tidak.

3. **Testability tidak runtuh.** Seluruh test suite bertumpu pada "bentuk ini →
   keluarga itu". Dengan dominan+modifier, 119 test yang ada tetap valid dan
   modifier ditambahkan sebagai dimensi terpisah yang bisa diuji sendiri.
   Hybrid bebas membuat ruang hasilnya kombinatorial dan exit criteria-nya
   ("pemain bisa membuat 3 hybrid berbeda dan menjelaskannya") jauh lebih lemah
   daripada "90% penguji menghasilkan empat keluarga" — kita berisiko tidak
   pernah bisa menyatakan sistemnya bekerja.

4. **Ini superset, bukan penggantian.** Nol modifier = perilaku sekarang. Jadi
   bisa dikirim bertahap, tiap tahap bisa diuji, dan tidak ada momen di mana
   game-nya rusak di tengah transisi.

**Biaya pivotnya lebih murah dari yang diperkirakan proposal.** Classifier sudah
menghitung semua bukti yang dibutuhkan komposisi — `scores` untuk kelima
keluarga, `cornerCount`, `winding`, `enclosure`, `radiusTrend`, `chirality`.
Tidak ada geometri baru yang diperlukan; yang dibutuhkan hanya **konsumen baru**
dari feature yang sudah ada. `scoreFamilies()` sudah mengembalikan skor
kontinu untuk setiap keluarga dan saat ini kita membuang empat dari lima.

### Ward Reserve tidak boleh dirancang di Spell Lab

Proposal menempatkan Ink committed vs Ward Reserve di dalam Spell Lab V2. Itu
kesalahan kategori.

Ward Reserve adalah mekanik **match**, bukan mekanik **menggambar**. Spell Lab
tidak punya lawan, tidak punya Resolve, tidak punya benturan masuk. Pemain tidak
bisa merasakan trade-off "menyerang vs bertahan" di tempat yang tidak ada yang
menyerangnya. Yang bisa ditampilkan Spell Lab hanyalah angka sisa Ink — dan
angka bukan trade-off.

Proposal bahkan mengakuinya sendiri: *"Angka final tidak boleh dipilih tanpa
Physics Toy."* Jadi Ward Reserve **milik Physics Toy**. Di Spell Lab cukup
tampilkan berapa Ink yang tersisa dan beri label bahwa sisa itu akan berarti
nanti.

---

## Apa yang ditolak

### Urutan pelaksanaannya

Proposal menempatkan Spell Lab V2 sebagai langkah 0, sebelum playtest manusia.
**Ditolak.**

Premis inti proposal — bahwa klasifikasi pemenang-tunggal terasa seperti ujian —
adalah **hipotesis yang belum diuji satu manusia pun**. Nol orang pernah
memainkan Stage 0.

Melakukan pivot sekarang berarti membuang desain berdasarkan nol bukti, memakai
intuisi engineering untuk membatalkan desain yang tidak pernah diuji. Itu persis
kesalahan yang saya peringatkan di sesi 2, hanya arahnya terbalik.

Playtest itu murah: 10 orang, satu sore. Dan ia menguji premis proposal secara
langsung:

- Kalau penguji bilang *"saya menebak-nebak simbol apa yang diterima"* — pivot
  tervalidasi bukti, dan kita tahu persis motif mana yang mereka coba buat.
- Kalau penguji bilang *"saya gambar pusaran, keluar pusaran"* — premisnya
  keliru dan kita baru saja menghemat redesign penuh.

Kedua hasil itu membuat Spell Lab V2 lebih baik. Tidak ada skenario di mana
melewatkan playtest menguntungkan.

Perlu ditegaskan: ini **bukan** menahan pivot karena sunk cost. Justru sebaliknya
— karena biaya pivotnya rendah (feature-nya sudah ada), tidak ada tekanan untuk
buru-buru memutuskan. Kita mampu mencari bukti dulu.

### Klaim progres 8–12%

Angkanya masuk akal sebagai estimasi engineering dan saya tidak
mempersoalkannya. Yang saya tolak adalah memakainya sebagai argumen untuk
mempercepat. MVP 10% dengan fondasi yang teruji lebih baik daripada MVP 25%
dengan classifier yang di-pivot berdasarkan tebakan.

---

## Urutan yang diputuskan

```
SEKARANG, paralel:
  A. Playtest cohort 10+ manusia        (blocker Stage 0, milik BK)
  B. Network Risk Spike                  (Codex — independen penuh)
  C. Physics library spike               (Codex — prasyarat Physics Toy)
  D. Instrumentasi telemetry Spell Lab   (Codex — dibutuhkan A)

SESUDAH playtest:
  E. Revisi PRD §7/§8 + kontrak komposisi (Claude)
  F. Spell Lab V2: dominan + modifier     (Codex, desain dari E)

SESUDAH Physics Toy ada:
  G. Ward Reserve + tuning anti-turtling
```

D mendahului A dalam praktik: telemetry harus terpasang sebelum playtest,
kalau tidak hasilnya cuma kesan. Ini pekerjaan kecil dan sudah tercantum di
handover sesi 2.

---

## Catatan untuk Codex

Dua hal.

**Pekerjaan sesi 3-mu bagus.** Kedua bug itu nyata dan keduanya milikku —
`onEnd: () => this.onStrokeEnd()` memang membuang koordinat release, dan jalur
kehabisan tinta memang commit dua kali. Test `pointer.test.ts` mengunci keduanya
dengan benar.

**Tapi kerjaanmu ditinggal tidak ter-commit.** Working tree kotor saat aku ambil
alih, dan salah satu temuan review yang lolos justru karena disiplin working
tree bersih. Commit pekerjaanmu sendiri, dengan pesan yang menjelaskan *mengapa*,
bukan hanya *apa*. Aku sudah commit untukmu kali ini dengan atribusi.

Dan sesuai instruksi penutup proposal: **jangan sentuh classifier atau mulai
multiplayer berdasarkan proposal itu** sampai butir E selesai. Butir B dan C
aman dikerjakan sekarang — keduanya tidak menyentuh satu pun file yang ada.
