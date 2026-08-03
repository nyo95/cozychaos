# Audit Cacat Mekanik & Logic — Sesi 19

**Pelaksana:** Claude (orchestrator). **Tanggal:** 2026-08-03.
**Cakupan:** `shared/`, `server/`, `api/`, `client/` pada HEAD, diukur terhadap
`PRD.md` + `PRD-AMENDMENTS.md` + `DESIGN-RUNE-BODY-COMBAT.md`.

Semua temuan di bawah punya bukti eksekusi, bukan pembacaan kode saja. Skrip
probe ada di `.audit/` dan bisa dijalankan ulang dengan
`node .audit/probe.mjs` dan `node .audit/probe2.mjs` setelah
`npx tsc --build shared`.

Suite yang ada (195 test) **lulus** dan tetap lulus. Itu bagian dari masalah:
tidak ada satu pun test yang menguji apakah sebuah match bisa selesai, apakah
angin adil, atau apakah stroke yang telat masuk masih dihitung. Ketiga hal itu
adalah tiga temuan teratas di bawah.

---

## Ringkasan prioritas

| ID | Severity | Cacat | Bukti |
|---|---|---|---|
| M-01 | **Blocker** | Match bisa tidak pernah selesai — 43% sampel masuk siklus deterministik | probe2 |
| M-02 | **Blocker** | Angin menentukan pemenang Round sebelum ada yang menggambar | probe2 |
| M-03 | **Serius** | Stroke/Cast yang telat dibuang diam-diam; latency menentukan hasil | kode |
| M-04 | **Serius** | Movement tidak ada sama sekali; Setup 3 detik kosong | kode |
| M-05 | **Serius** | Deploy Vercel tidak bisa menopang server authoritative | kode + config |
| M-06 | Sedang | `wobble.decayPerSecond` mati — mekanisme comeback tidak ada | probe |
| M-07 | Sedang | Lawan disconnect saat Draw mengunci pemain yang masih online | kode |
| M-08 | Rendah | Dua sumber kebenaran untuk Wobble/Ink; sebagian besar `CONFIG.combat` mati | kode |

---

## M-01 — Match bisa tidak pernah selesai (Blocker)

### Gejala terukur

Simulasi 60 seed, kedua pemain bermain identik dan wajar (stroke 0.8 unit,
Ink ~40, aim 20° ke atas):

```
both mid ink (0.8)     stalled=26/60  cycleTerdeteksi=26  avgMatch=174s
both light dart (0.35) stalled= 7/60  cycleTerdeteksi= 7  avgMatch=227s
both max wall (2.5)    stalled=15/20  wins slot0/slot1=0/5
```

"stalled" = 60 Turn (21 menit) tanpa pemenang. Pada **setiap** kasus stall,
probe mendeteksi state `(round, posisi, wobble)` yang berulang persis — jadi
ini bukan "lama", ini fixed point: match itu secara matematis tidak akan
pernah selesai.

### Mengapa

Tiga aturan yang benar sendiri-sendiri, tapi mengunci saat digabung:

1. Round hanya berakhir lewat knock-out (`room.ts:274`). Tidak ada batas Turn.
2. Wind dan crystal di-seed per **Round**, bukan per Turn
   (`environment.ts:createTurnEnvironment(seed, round)`). Round yang macet
   tidak pernah mengganti layout.
3. Wobble ter-cap di 100 (`config/index.ts:50`), jadi eskalasi knockback
   berhenti di 2.6x. Tidak ada tekanan yang terus naik.

Akibatnya: kalau Turn N menghasilkan posisi & wobble yang sama dengan Turn
N-k, Turn N+1 akan identik dengan Turn N-k+1 selamanya. Resolve deterministik
(itu memang invariant yang dikunci), jadi determinisme yang menjamin no-desync
juga yang mengunci stalemate.

Ini persis kegagalan yang sudah pernah kalian temukan dan tulis di
`config/index.ts:135` untuk kasus koridor crystal ("A cave that can deadlock a
match is not a hazard, it is a stall"). Perbaikannya waktu itu melebarkan
koridor — yang menghilangkan *satu* penyebab stall, bukan kelas masalahnya.

### Bertentangan dengan

PRD §19 "Match normal 3–5 menit" dan §18 Stage 2 exit criteria
("rata-rata match berada di bawah 5 menit").

### Arah perbaikan (pilih, jangan gabung semua)

- **Turn cap per Round** yang data-driven: setelah `maxTurnsPerRound`, Round
  diselesaikan — misalnya pemain dengan Wobble lebih tinggi kalah. Paling
  murah, langsung memotong seluruh kelas masalah.
- **Re-seed environment per Turn**, bukan per Round. Menghapus fixed point,
  tapi memperbesar M-02.
- **Arena menyempit tiap Turn dalam satu Round** (sudden-death creep).
  Paling sesuai "cozy chaos", paling mahal.

Rekomendasi: Turn cap dulu sebagai safety valve, karena ini juga satu-satunya
yang bisa dites secara deterministik.

---

## M-02 — Angin menentukan Round sebelum ada yang menggambar (Blocker)

### Gejala terukur

Dua pemain bermain **persis identik** (mirror sempurna), tanpa crystal, hanya
angin yang divariasikan:

```
wind 0     -> wobble slot0=22.3  slot1=22.3   ko=none    (adil)
wind 0.16  -> wobble slot0= 4.7  slot1=32.7   ko=none
wind 0.28  -> wobble slot0= 0.0  slot1=41.3   ko=slot1
wind 0.42  -> wobble slot0= 0.0  slot1=45.6   ko=slot1
```

Kontrol: tanpa angin, hasilnya mirror eksak (`endX = -0.7954 / +0.7954`,
wobble sama sampai 3 desimal). Jadi simulatornya sendiri **tidak bias** —
biasnya murni dari angin.

### Mengapa

`world.ts:236` menambahkan `wind.x` ke setiap partikel. Dalam duel yang
cermin, satu percepatan horizontal global bukan variasi netral: ia menambah
jangkauan satu pemain dan memotong jangkauan lawannya. Karena angin konstan
sepanjang Round (M-01 poin 2), pemain yang searah angin praktis mendapat
Round itu gratis.

`CONFIG.wind.accelerationLevels = [0, 0.16, 0.28, 0.42]` — dua dari empat
level (0.28 dan 0.42) sudah cukup untuk KO sepihak dengan permainan identik.
Artinya sekitar **separuh Round diputuskan oleh lemparan koin sebelum ada yang
menggambar**.

Ini terlihat juga di probe1 seed 1: KO berselang-seling persis mengikuti
paritas Round (T1 slot0 mati, T2 slot1 mati, T3 = T1, T4 = T2) karena tanda
angin berganti per Round.

### Bertentangan dengan

PRD §7.4 "Variasi akibat gambar kasar dibatasi agar kekalahan tidak terasa
acak" dan §20 risiko #2 "Physics terasa acak → kekalahan tidak adil →
mitigasi: variasi dibatasi".

### Arah perbaikan

Angin di Gunbound adil karena **kedua pemain menembak melawan angin yang sama
dari sisi berlawanan dalam giliran bergantian**. Di sini keduanya menembak
serentak, jadi model itu tidak terbawa. Opsi:

- Angin **simetris terhadap sumbu tengah**: dorong kedua rune menjauh/mendekat
  ke pusat arena, bukan satu arah global. Adil secara konstruksi.
- Angin per-pemain yang dicerminkan (slot0 dapat +w, slot1 dapat -w). Tetap
  memberi keputusan balistik, hilang keunggulan sepihaknya.
- Turunkan level maksimum sampai di bawah ambang KO sepihak, dan buktikan
  dengan test mirror seperti probe2 sebagai regression.

Apapun pilihannya, **test mirror wajib jadi invariant**: permainan identik dari
kedua sisi harus menghasilkan Wobble yang sama. Itu invariant yang sekarang
tidak ada di daftar `DESIGN-RUNE-BODY-COMBAT.md` dan seharusnya ada.

---

## M-03 — Stroke dan Cast yang telat dibuang diam-diam (Serius)

`room.ts:155` dan `room.ts:166`:

```ts
if (this.state.phase !== 'draw') return;   // submitStroke
if (this.state.phase !== 'cast') return;   // submitCast
```

`CONFIG.strokeLimits.submitGraceMs = 250` didefinisikan di
`config/index.ts:249`, ditandai sebagai batas PRD §15 — **dan tidak pernah
dibaca di mana pun**. Grep seluruh `shared/src`, `server/src`, `client/src`:
nol referensi.

### Konsekuensi

Client baru tahu fase Draw berakhir setelah broadcast server sampai. Pemain
yang menggambar sampai detik terakhir mengirim stroke-nya pada
`T_end + 2×latency`. Server sudah di fase `cast` → pesan dibuang tanpa balasan.

Lebih buruk, client tetap menganggap sukses (`matchGame.ts:307`): `send()`
hanya melaporkan status socket, bukan penerimaan. Pemain melihat
**"Rune locked. Waiting for your rival..."** padahal server tidak punya rune
mereka. Saat Reveal, summary mereka `null`, dan `beginResolve` membangun rune
kosong (`points ?? []`, `inkCommitted 0`).

Probe mengonfirmasi biaya penuhnya: rune kosong = 0 partikel, 0 massa, dan
lawan menerima 0 Wobble sementara pemain itu menerima 46.2. Satu Turn hilang
total, tanpa pemberitahuan, murni karena ping.

Fase Cast lebih rawan lagi: jendelanya cuma 2000 ms, jadi proporsi pemain yang
menyelesaikan drag di ujung jendela jauh lebih besar.

### Bertentangan dengan

A-03 ("Latency tidak dapat memengaruhi hasil Turn manapun") dan PRD §15
("Latency tidak menentukan siapa yang menembak lebih dulu"). Ini adalah klaim
arsitektural inti produk, dan saat ini tidak benar.

### Arah perbaikan

1. Pakai `submitGraceMs`: terima `submit` selama `phase === 'draw'` **atau**
   (`phase === 'cast'` dan `elapsed < submitGraceMs`). Sama untuk `cast`.
2. Tambahkan ack di protokol (`{ type: 'locked', kind: 'stroke'|'cast' }`)
   supaya client tidak pernah membohongi pemain.
3. Kalau pemain tidak submit sama sekali, itu keputusan sah — tapi harus
   terlihat berbeda dari "terkirim tapi hilang".

---

## M-04 — Movement tidak diimplementasikan (Serius)

`CONFIG.movement.speed`, `jumpImpulse`, `jumpsPerSetup`, dan fungsi
`canMove()` di `match/state.ts:102` **tidak dipanggil dari mana pun** kecuali
test. `ClientMessage` (`protocol/messages.ts`) hanya punya
`join | submit | cast | rematch | leave` — tidak ada pesan gerak. `Room` tidak
punya handler gerak. Posisi pemain hanya berubah lewat knockback fisika.

Jadi fase Setup selama 3 detik adalah 3 detik di mana pemain tidak bisa
melakukan apa pun.

### Bertentangan dengan

- PRD §17 "Wajib ada" → movement kiri/kanan + satu lompatan adalah MVP scope.
- A-03 secara eksplisit membayar penguncian movement di Resolve dengan janji:
  "Positioning tetap punya bobot taktis penuh — pemain memilih posisi selama
  4 detik Setup". Janji itu belum ada implementasinya, jadi A-03 saat ini
  hanya menghapus, tidak menukar.
- PRD §4.3 "No dead time".

### Catatan skeptis

Ini bukan sekadar fitur yang belum dikerjakan — ini menghilangkan satu-satunya
input pemain selain menggambar. Dengan M-01 dan M-02 di atas, sebuah Round
sekarang = dua gambar + angin, tanpa lever positional untuk keluar dari
stalemate. Kemungkinan besar M-04 adalah **penyebab bersama** M-01: kalau
pemain bisa memilih posisi tiap Turn, fixed point jauh lebih sulit terbentuk.

Rekomendasi: kerjakan M-04 sebelum menambal M-01, lalu ukur ulang stall rate.
Bisa jadi M-01 sebagian sembuh sendiri, dan Turn cap cukup jadi safety valve
tipis, bukan aturan yang terasa.

---

## M-05 — Deploy Vercel tidak bisa menopang server authoritative (Serius)

Sesi 18 sudah mencatat risiko dua socket mendarat di instance berbeda. Ada
tiga hal tambahan yang belum tercatat dan lebih cepat menggigit:

1. **`maxDuration: 300`** di `vercel.json`. Target durasi match adalah
   180–300 detik (PRD §19), dan probe menunjukkan match nyata sering di atas
   itu (avg 174–227 detik, dengan ekor panjang). Function akan dipotong
   di tengah match. Setiap match yang lewat 5 menit **pasti** gagal.

2. **Jam match adalah `setInterval` 30 Hz** (`app.ts:114`) dengan `unref()`.
   Di Fluid compute instance boleh disuspend antar-invocation; jam fase bisa
   melambat atau berhenti sementara, dan `Room.tick(Date.now())` akan
   melompat. `streamResolve` mengejar dengan while-loop, jadi frame akan
   di-flush berhamburan, tapi durasi fase Draw/Cast ikut molor — memperparah
   M-03.

3. **Resolve dihitung sinkron di satu tick.** `beginResolve` menjalankan
   seluruh ~5.7 detik fisika (341 step × 56 partikel + bond) dalam satu
   callback sebelum frame pertama dikirim. Satu instance yang menampung
   beberapa room akan memblokir jam semua room lain saat salah satu masuk
   Resolve.

Ditambah: `reconnectToken` dan tabel room hidup di memory instance, jadi
reconnect A-06 hanya berfungsi kalau socket baru kebetulan mendarat di
instance yang sama. `join` dengan token yang tidak dikenal jatuh ke jalur seat
baru, dan kalau dua seat sudah terisi → `room full`.

### Arah perbaikan

Untuk **test main-mainan sekarang**: naikkan `maxDuration`, dan pastikan hanya
satu instance yang hidup (batasi concurrency), lalu perlakukan URL Vercel
sebagai demo satu-room, bukan lobby publik.

Untuk **serius**: pindahkan room state + pub/sub ke store bersama, atau
pindahkan server ke runtime yang memang stateful dan long-lived (Fly.io,
Railway, VPS kecil) dan biarkan Vercel hanya menyajikan client statis. Opsi
kedua jauh lebih murah untuk arsitektur yang sudah authoritative-server ini.

---

## M-06 — `wobble.decayPerSecond` mati (Sedang)

`config/index.ts:56` menetapkan `decayPerSecond: 1.5` dengan komentar
"Slow bleed gives the losing player a route back. PRD §5.3 comeback goal."

Grep: nilai itu tidak pernah dibaca. Probe langsung:

```
start wobble 50/50 -> end 81.76/50.00 setelah 5683 ms
kalau decay diterapkan seharusnya ~41.47
```

Slot yang tidak tersentuh keluar di 50.00 persis. Tidak ada peluruhan.

Jadi mekanisme comeback yang didokumentasikan tidak ada. Ini juga relevan ke
M-01: tanpa peluruhan, Wobble monoton naik sampai cap, lalu sistem kehilangan
seluruh dinamikanya.

Keputusan yang perlu diambil, bukan sekadar tambal: **apakah comeback memang
diinginkan?** Kalau ya, terapkan di batas Turn (bukan per frame Resolve, yang
akan mengubah kalibrasi knockback). Kalau tidak, hapus konstantanya —
konstanta mati yang berkomentar meyakinkan lebih berbahaya daripada tidak ada
konstanta.

---

## M-07 — Disconnect lawan mengunci pemain yang masih online (Sedang)

`matchGame.ts:318` `canDraw()` mensyaratkan
`players.filter(connected).length === 2`. Tapi server hanya menjeda match saat
fase `setup` (`room.ts:196`). Kalau lawan putus di tengah Draw:

- server tetap menjalankan Draw → Cast → Reveal → Resolve;
- client yang masih online **tidak boleh menggambar** karena gate di atas;
- kedua pemain kehilangan Turn itu, dan yang online menerima Resolve dengan
  dua rune kosong.

A-06 menjanjikan jeda "pada batas Turn"; ini memenuhi huruf aturannya tapi
membuang satu Turn secara sepihak. Minimal: izinkan pemain yang online tetap
menggambar (tidak ada alasan mekanis melarangnya), atau jeda di batas fase
berikutnya, bukan menunggu Setup.

---

## M-08 — Dua sumber kebenaran, dan konfigurasi mati (Rendah, tapi jebakan)

- `MatchState.players[].wobble` dan `.ink` **tidak pernah diperbarui** setelah
  `createPlayer`. Kebenaran Wobble hidup di `Room.wobble` dan `Body.wobble`.
  `addWobble()` di `match/state.ts:218` tidak dipanggil di luar test. Siapa pun
  yang membaca `state.players[0].wobble` nanti akan mendapat 0 dan tidak akan
  sadar.
- **Seluruh blok `CONFIG.combat`** (`projectileSpeedScale`, `loopPush`,
  `vortexPull`, `vortexRelease`, `maxHits`, `unstableJitter`) tidak pernah
  dibaca — sisa desain proyektil sebelum Sesi 12.
- `CONFIG.aim.maxCastRadius` (dikunci oleh A-05) tidak dipakai; spawn selalu
  di depan caster. Ini konsekuensi sah dari pivot rune-body, tapi A-05 belum
  diamandemen untuk mencatatnya.
- `SpellRecipe.components` — seluruh pipeline motif → ForceComponent
  (strength, chirality, activateAtMs, lifetimeMs) dihitung tiap Turn di server
  dan **dibuang**; hanya `inkCommitted` dan `summary` yang dipakai. Sesuai
  dengan "classifier untuk telemetri", tapi biayanya dibayar tiap Turn.
- `findWinner` cabang sudden-death (`state.ts:154`) tidak terjangkau: masuk SD
  selalu dari 2–2, dan award tunggal selalu menghasilkan `reached.length === 1`.

Tidak ada yang salah hari ini. Semuanya adalah ranjau untuk sesi berikutnya —
persis kelas masalah yang menghasilkan M-06.

---

## Yang saya periksa dan **tidak** bermasalah

Supaya laporan ini tidak dibaca sebagai "semuanya rusak":

- Simulator itu sendiri **tidak bias slot**. Mirror test tanpa angin: posisi
  akhir `-0.7954 / +0.7954`, Wobble identik sampai 3 desimal.
- A-02 (double-KO / sudden death) benar. Semua jalur skor berujung pada satu
  pemenang; tidak ada seri yang bisa terbentuk.
- `repairStroke` + `parseClientMessage` menutup jalur cheat geometri:
  koordinat di-clamp, arc length dipotong 12.0, titik dibatasi 512, non-finite
  ditolak. Client yang dimodifikasi tidak bisa membeli massa ekstra.
- Ink → massa → kecepatan → jangkauan monoton dan crossover-nya jatuh di
  dalam rentang main (Ink 40), persis seperti yang didokumentasikan.
- "Dart vs wall" seimbang: dart menang 13/20. Wall bukan strategi dominan
  melawan lawan yang menyerang — masalahnya hanya muncul saat **keduanya**
  bertahan (M-01).
- Determinisme frame terjaga; `runResolve` murni terhadap inputnya.

---

## Urutan kerja yang saya sarankan

1. **M-04** (movement) — kembalikan lever pemain, lalu ukur ulang stall rate.
2. **M-02** (angin simetris) + tambahkan mirror-fairness sebagai invariant.
3. **M-01** (Turn cap sebagai safety valve, angkanya data-driven).
4. **M-03** (submit grace + ack) — ini yang paling dirasakan playtester.
5. **M-05** — putuskan: Vercel demo satu-instance, atau pindah host server.
6. **M-06/M-08** — bersihkan konstanta mati, atau implementasikan.

M-01 sampai M-04 semuanya menyentuh file berbeda dan bisa diparalelkan.
M-01 sebaiknya diukur ulang **setelah** M-04 selesai.

## Reproduksi

```bash
npx tsc --build shared
node .audit/probe.mjs    # pacing, wobble decay, submission kosong
node .audit/probe2.mjs   # mirror fairness, wind fairness, stall rate
node .audit/probe3.mjs   # stall rate strategi wall/dart
```
