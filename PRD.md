# Product Requirements Document — Project Cozy Chaos

**Status:** Draft v0.1  
**Tanggal:** 2 Agustus 2026  
**Nama produk:** Belum ditentukan  
**Working tagline:** **Draw Magic. Expect Chaos.**

---

## 1. Ringkasan Produk

Project Cozy Chaos adalah game duel multiplayer 2.5D dengan karakter penyihir kecil di pulau mimpi terapung. Pemain tidak memilih spell dari tombol: pemain menggambar rune, lalu bentuk, arah, dan ukurannya diterjemahkan menjadi spell fisik.

Pertandingan dibuat singkat, ringan, lucu, dan mudah diulang. Kegagalan menggambar tidak membatalkan spell; gambar yang kurang rapi menghasilkan sihir yang lebih liar tetapi tetap berguna.

### Elevator pitch

> Dua penyihir menggambar sihir secara bersamaan, lalu melihat hasil gambarnya bertabrakan, memantul, menarik, dan melempar lawan di arena fisika yang penuh kejutan.

### Janji utama kepada pemain

> **Setiap coretan menjadi sihir. Tidak ada gambar yang sia-sia.**

---

## 2. Masalah dan Peluang

Game duel kasual sering mudah dimainkan tetapi input-nya generik. Game menggambar spell biasanya hanya menggunakan gambar sebagai password untuk memilih spell yang sudah ditentukan.

Peluang produk ini adalah menjadikan gambar sebagai bagian dari simulasi:

- bentuk menentukan keluarga spell;
- arah menentukan arah cast;
- ukuran menentukan massa, area, dan konsumsi tinta;
- lengkungan atau sudut memengaruhi gerakan spell;
- ketidaksempurnaan menciptakan variasi lucu, bukan kegagalan total.

Kombinasi tersebut menghasilkan pengalaman yang mudah dipahami, tetapi tetap memberi ruang untuk eksperimen dan mastery.

---

## 3. Target Pemain

### Pemain utama

- Pemain kasual yang menyukai match 3–5 menit.
- Pasangan atau teman yang ingin bermain bersama tanpa belajar combo kompleks.
- Pemain yang menyukai physics comedy, kreativitas, dan kosmetik.
- Pemain yang tertarik pada Gunbound, party brawler, drawing games, atau cozy multiplayer.

### Bukan target utama MVP

- Pemain esports yang menuntut presisi frame-perfect.
- Pemain MMORPG atau open-world progression.
- Pemain yang mencari sistem equipment dan stat yang kompleks.

### Platform MVP

- Desktop web browser.
- Input utama: mouse.
- Arsitektur input harus mendukung touch, tetapi peluncuran mobile bukan syarat MVP.
- Gamepad bukan syarat MVP.

---

## 4. Pilar Desain

### 4.1 Draw is the play

Menggambar bukan menu terselubung. Geometri gambar harus memengaruhi perilaku spell yang muncul.

### 4.2 Cozy chaos

Konsekuensi harus lucu dan mudah dibaca. Pemain terpental, terbungkus gelembung, berputar, atau berubah sementara—bukan mati secara brutal.

### 4.3 No dead time

Kedua pemain menggambar dan bertindak secara bersamaan. Tidak ada giliran panjang untuk menunggu lawan.

### 4.4 Fast rematch

Satu match selesai dalam 3–5 menit. Rematch dapat dimulai dengan satu input tanpa kembali ke menu utama.

### 4.5 Expression over grind

Progression memberi variasi kosmetik, jurnal penemuan, dan identitas sosial. Progression tidak boleh memberi keunggulan statistik dalam duel.

---

## 5. Struktur Permainan

### 5.1 Mode utama MVP

- Online 1v1.
- Satu arena tetap.
- First to 3 Stars.
- Setiap knock-out memberikan 1 Star.
- Setelah knock-out, kedua pemain dan arena di-reset untuk ronde berikutnya.
- Jika kedua pemain jatuh hampir bersamaan, keduanya mendapat 1 Star.

### 5.2 Kondisi knock-out

Pemain mendapatkan knock-out ketika keluar dari batas aman pulau. Pemain kemudian dikembalikan oleh gelembung penyelamat; tidak ada visual kematian.

### 5.3 Sistem Wobble

Tidak ada health bar tradisional. Setiap benturan meningkatkan **Wobble**:

- Wobble rendah: knockback kecil.
- Wobble tinggi: pemain semakin mudah terpental.
- Wobble kembali ke nol pada awal ronde.

Sistem ini memberi comeback, membuat hasil fisika mudah dibaca, dan menghindari tema kekerasan berat.

---

## 6. Core Match Loop

Setiap ronde menggunakan fase yang sama:

1. **Setup — 4 detik**  
   Pemain dapat bergerak pendek, melompat, atau memilih posisi.

2. **Draw — 7 detik**  
   Dunia berhenti. Kedua pemain menggambar spell secara rahasia pada rune canvas masing-masing.

3. **Reveal — 1 detik**  
   Rune kedua pemain muncul sebagai antisipasi visual.

4. **Cast & Resolve — maksimal 8 detik**  
   Spell dilepas bersamaan dan simulasi fisika berjalan.

5. **Score/Reset — 2 detik**  
   Star diberikan jika terjadi knock-out. Jika tidak, ronde berikutnya dimulai dari posisi terakhir.

### Target durasi

- Ronde: 15–22 detik.
- Match normal: 3–5 menit.
- Waktu dari membuka game hingga cast pertama: kurang dari 60 detik.

---

## 7. Sistem Menggambar Spell

### 7.1 Aturan dasar

- Pemain menggambar satu stroke kontinu untuk MVP.
- Stroke dinormalisasi agar mouse cepat dan lambat tetap adil.
- Sistem membaca topologi, arah utama, ukuran, kurva, penutupan, dan jumlah sudut.
- Kecepatan tangan tidak menambah damage.
- Spell tidak boleh gagal total.
- Gambar yang tidak dikenali menjadi **Arcane Wisp**, spell fallback dengan dorongan kecil.

### 7.2 Ink Meter

Setiap ronde pemain memiliki jumlah tinta yang sama.

- Garis lebih panjang menghabiskan lebih banyak tinta.
- Ukuran spell dibatasi oleh tinta, bukan kecepatan tangan.
- Meter terlihat selama menggambar.
- Ketika tinta habis, stroke otomatis selesai.

### 7.3 Parameter yang dihasilkan

| Properti gambar | Dampak gameplay |
|---|---|
| Bentuk/topologi | Menentukan keluarga spell |
| Arah stroke utama | Menentukan arah cast |
| Ukuran | Menentukan ukuran/massa dan biaya tinta |
| Lengkungan | Menentukan spin atau kelengkungan gerak |
| Sudut | Menentukan bounce atau split |
| Ketidakteraturan | Memberi wobble visual dan variasi kecil yang dibatasi |

### 7.4 Prinsip fairness

- Sistem harus toleran terhadap motorik dan perangkat berbeda.
- Kerapian memberi kontrol, bukan damage mentah.
- Variasi akibat gambar kasar dibatasi agar kekalahan tidak terasa acak.
- Hasil klasifikasi spell dihitung oleh server.

---

## 8. Empat Keluarga Spell MVP

### 8.1 Stroke — Arc Bolt

**Input:** garis terbuka.  
**Peran:** spell cepat dan mudah diarahkan.  
**Fisika:** mendorong target sesuai arah stroke; garis melengkung menghasilkan sedikit curve.

### 8.2 Loop — Bubble Ward

**Input:** bentuk tertutup mendekati lingkaran.  
**Peran:** defense dan displacement.  
**Fisika:** gelembung dapat menyerap satu benturan, menggelinding, atau memantulkan objek. Ukuran loop menentukan ukuran dan berat.

### 8.3 Spiral — Vortex

**Input:** stroke berputar menuju pusat atau keluar dari pusat.  
**Peran:** kontrol ruang.  
**Fisika:** menarik pemain dan props lalu melemparkannya saat durasi selesai. Arah spiral menentukan arah putaran.

### 8.4 Angular — Prism Shard

**Input:** bentuk dengan beberapa sudut tajam.  
**Peran:** trick shot.  
**Fisika:** shard memantul; jumlah sudut yang valid menentukan jumlah pantulan, dengan batas yang tetap.

### 8.5 Arcane Wisp — fallback

**Input:** stroke yang tidak masuk empat keluarga di atas.  
**Peran:** menjamin setiap gambar menghasilkan respons.  
**Fisika:** proyektil lembut dengan knockback kecil dan gerakan lucu mengikuti karakter stroke.

---

## 9. Movement dan Physics

### Movement MVP

- Bergerak kiri/kanan.
- Satu lompatan pendek.
- Tidak ada dash, stamina, combo melee, atau skill karakter.
- Movement hanya aktif pada fase Setup dan Resolve jika pemain masih memiliki kontrol.

### Physics MVP

- Simulasi berjalan pada bidang 2D, tetapi divisualisasikan dengan model dan arena 3D.
- Karakter menggunakan rigid body sederhana dengan animasi squash, stretch, dan tumble.
- Tidak menggunakan full skeletal ragdoll pada MVP.
- Arena utama tidak dapat dihancurkan.
- Props tertentu dapat pecah, terdorong, menggelinding, atau jatuh.
- Semua interaksi gameplay harus memiliki telegraph visual yang jelas.

### Arena modifier

MVP hanya membutuhkan satu modifier setelah core loop terbukti menyenangkan:

- **Low Gravity:** semua knockback dan props melayang lebih lama.

Modifier lain seperti angin, lantai memantul, atau hujan mana masuk fase pasca-MVP.

---

## 10. Role-play dan Social Layer

Role-play dalam produk ini berarti ekspresi sosial ringan, bukan RPG statistik atau open world.

### Sanctum Camp

Sebuah ruangan kecil yang berfungsi sebagai lobby sosial:

- mengundang teman;
- berjalan dan melakukan emote;
- mencoba rune pada training dummy;
- mengganti topi, wand, warna tinta, dan ekspresi;
- melihat Spell Journal;
- memulai atau mengulang duel.

Camp dibangun setelah duel online inti stabil. Versi pertama cukup satu ruangan tanpa NPC, quest, crafting, atau dekorasi bebas.

---

## 11. Progression

### Spell Journal

- Mencatat bentuk yang pernah digunakan pemain.
- Membuka catatan visual dan tips, bukan menambah kekuatan.
- Menampilkan replay mini dari hasil spell yang menarik.

### Cosmetic progression

- Topi.
- Wand/staff.
- Warna dan tekstur tinta.
- Trail spell.
- Emote.
- Pose kemenangan.

### Aturan competitive integrity

- Semua pemain memiliki empat keluarga spell sejak awal.
- Tidak ada equipment dengan damage, mana, atau knockback lebih tinggi.
- Tidak ada gacha atau monetisasi dalam MVP.

---

## 12. Art Direction

### Identitas visual

> **Dreamy low-poly diorama + expressive magical ink.**

- Arena berupa potongan pulau mimpi yang mengambang.
- Kamera side-view 2.5D dengan sedikit perspektif isometrik untuk kedalaman visual.
- Bentuk besar, bulat, dan mudah dibaca.
- Material matte dengan pencahayaan lembut.
- Background menggunakan awan, menara terapung, dan layer parallax.
- Spell memakai garis bercahaya yang mempertahankan karakter gambar pemain.

### Karakter

Gunakan **chibi apprentice mage**, bukan stickman polos:

- kepala/topi besar;
- tubuh pendek;
- tangan dan lengan ekspresif;
- wajah sederhana;
- scarf atau ujung jubah memperjelas arah angin dan knockback;
- silhouette tetap terbaca pada ukuran kecil.

### Palet awal

- Dunia: hijau hangat, biru langit, batu lavender.
- UI: parchment gelap dan tinta krem.
- Spell: cyan, magenta, amber, dan violet dengan luminance yang konsisten.
- Warna bukan satu-satunya penanda jenis spell; setiap spell wajib memiliki bentuk dan suara berbeda.

---

## 13. Audio Direction

- Musik cozy dengan tempo ringan selama Setup dan Draw.
- Musik menambah lapisan perkusi saat Reveal dan Resolve.
- Setiap keluarga spell memiliki audio signature berbeda.
- Benturan memakai suara lembut dan lucu, bukan ledakan realistis.
- Karakter menggunakan gumaman, gasp, dan squeak tanpa dialog penuh.
- Audio harus memberi tahu cast, hit, Wobble tinggi, dan batas arena meskipun pemain tidak melihat UI.

---

## 14. UX dan Accessibility

- Tutorial interaktif pertama maksimal 60 detik.
- Preview tipis menunjukkan arah hasil spell sebelum stroke dikunci, tanpa memperlihatkan trajectory final secara sempurna.
- Draw assist memiliki pilihan Standard dan High.
- Tidak ada hukuman karena menggambar lambat.
- UI dapat diskalakan.
- Dukungan color-blind melalui bentuk, pattern, dan suara.
- Screen shake dapat dikurangi atau dimatikan.
- Flash intensity dapat dikurangi.
- Rematch, leave, mute, dan report mudah ditemukan.

---

## 15. Multiplayer dan Aturan Teknis

### Model network

- Server authoritative untuk fase match, klasifikasi stroke, skor, dan hasil physics.
- Client mengirim stroke dalam koordinat yang sudah dinormalisasi.
- Server membatasi jumlah titik, panjang stroke, ukuran, dan waktu submit.
- Kedua spell dikunci sebelum Reveal sehingga pemain tidak dapat bereaksi setelah melihat gambar lawan.
- Match menggunakan seed yang sama untuk semua variasi fisika dan modifier.
- State dikirim sebagai snapshot; client melakukan interpolasi visual.

### Mengapa fase simultan cocok untuk online

- Latency tidak menentukan siapa yang menembak lebih dulu.
- Server dapat menunggu kedua stroke sampai deadline yang sama.
- Simulasi memiliki awal dan akhir yang jelas.
- Replay dapat dibuat dari seed, state awal, dan dua stroke.

### Teknologi yang dikunci untuk prototipe

- Client: Vite + TypeScript + Three.js.
- Simulasi gameplay: engine rigid-body 2D yang berjalan secara authoritative di server.
- Transport: WebSocket.
- Rendering 3D tidak boleh menjadi sumber kebenaran physics.
- Konfigurasi spell dan match harus data-driven, bukan tersebar sebagai magic numbers.

Pemilihan library physics dan framework room server harus melalui spike kecil sebelum implementasi production. PRD ini mengunci arsitekturnya, bukan nama library-nya.

---

## 16. Pemanfaatan Proyek Lama

### Dari `D:\Projects\DreamyExpedition`

Gunakan sebagai:

- art bible dan mood reference;
- referensi floating island, tower, trees, grass, dan props;
- placeholder GLB yang lolos pengecekan performa dan hak penggunaan.

Catatan: 93 PNG hasil ekstraksi concept sheet dinyatakan belum production-ready. Jangan masukkan sebagai aset final tanpa cleanup dan pemeriksaan lisensi/provenance.

### Dari `D:\Projects\three`

Kandidat donor:

- setup Vite/Three.js;
- GLTF loading dan asset registry;
- input mouse/touch;
- event bus;
- atmosphere, particles, sky, dan post-processing yang lolos audit;
- model Mage, wand, staff, spellbook, serta animasi yang hak penggunaannya dapat dibuktikan.

Jangan dipindahkan utuh:

- procedural infinite world;
- chunk streaming;
- NPC system;
- custom terrain collision;
- shader lama yang saat ini gagal compile;
- asumsi kamera eksplorasi 3D.

### Aturan migrasi

- Buat codebase baru dan bersih.
- Port modul satu per satu setelah ada test atau demo penerimaan.
- Setiap aset wajib masuk asset provenance register: sumber, pemilik, lisensi, dan izin komersial.
- Jangan meng-copy folder `unused` secara massal.

---

## 17. Scope MVP

### Wajib ada

- Guest name tanpa pendaftaran akun.
- Create room dan join melalui room code.
- Online 1v1.
- Satu arena floating island.
- Empat keluarga spell dan satu fallback.
- Sistem Ink, Wobble, knock-out, Star, dan first-to-3.
- Fase Setup, Draw, Reveal, Resolve, dan Reset.
- Mouse drawing.
- Rematch.
- Tutorial singkat.
- Basic settings dan accessibility.
- Minimal sound dan VFX yang membuat spell mudah dibaca.

### Boleh ada jika core selesai

- Quick match.
- Low Gravity modifier.
- Satu ruang Sanctum Camp.
- Empat pilihan topi dan empat warna tinta.
- Replay pendek untuk knock-out terakhir.

### Tidak termasuk MVP

- 2v2 atau free-for-all.
- Open world.
- Procedural infinite world.
- Quest, crafting, inventory kompleks, atau NPC story.
- Classes dan skill tree.
- Terrain deformation penuh.
- Voice recognition.
- User-generated custom spell scripting.
- Ranked mode dan leaderboard global.
- Battle pass, shop, dan monetisasi.
- Mobile store release.

---

## 18. Roadmap Berbasis Exit Criteria

### Stage 0 — Spell Lab

Satu layar offline untuk menggambar dan melihat klasifikasi serta parameter spell.

**Lulus jika:** minimal 90% pemain uji dapat menghasilkan empat keluarga spell setelah tutorial singkat, tanpa bantuan developer.

### Stage 1 — Physics Toy

Satu karakter, satu dummy, empat spell, props, Wobble, dan knock-out.

**Lulus jika:** bermain bebas selama 10 menit tetap menghasilkan eksperimen baru dan hasil mudah dipahami.

### Stage 2 — Local Match Loop

Dua input pada satu mesin atau dua bot-input terkontrol untuk menguji seluruh fase match.

**Lulus jika:** first-to-3 dapat dimainkan berulang tanpa reset manual dan rata-rata match berada di bawah 5 menit.

### Stage 3 — Online 1v1

Room code, server authority, reconnect singkat, rematch, dan replay state.

**Lulus jika:** tidak ada perbedaan skor atau hasil physics antara dua client dalam pengujian jaringan normal.

### Stage 4 — Presentation dan Camp

Art direction final untuk satu arena, audio, onboarding, kosmetik awal, dan Sanctum Camp minimal.

**Lulus jika:** pemain baru memahami tujuan, melakukan cast, dan menyelesaikan match tanpa penjelasan verbal.

---

## 19. Success Metrics

### Validasi fun

- Pemain baru melakukan cast pertama dalam kurang dari 60 detik.
- Minimal 80% playtester menyelesaikan match pertama.
- Minimal 40% memilih rematch pada sesi uji.
- Minimal 70% dapat menjelaskan perbedaan empat spell setelah tiga match.
- Keluhan “gambar saya tidak terbaca” terjadi pada kurang dari 10% ronde uji.

### Kualitas teknis

- Target 60 FPS pada laptop kelas menengah dengan preset Standard.
- Tidak ada desync skor.
- Tidak ada spell yang gagal menghasilkan objek/effect.
- Reconnect singkat tidak menggandakan player atau Star.
- Waktu loading menuju lobby kurang dari 10 detik pada koneksi normal setelah aset ter-cache.

---

## 20. Risiko Utama dan Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Recognition terasa seperti ujian | Pemain frustrasi | Klasifikasi toleran, assist, dan Arcane Wisp fallback |
| Physics terasa acak | Kekalahan tidak adil | Server authoritative, variasi dibatasi, telegraph kuat |
| Physics online desync | Match tidak dipercaya | Simulasi server, fixed timestep, state snapshot |
| Scope berkembang menjadi RPG | MVP tidak selesai | Camp kecil; tanpa quest, stats, crafting, atau open world |
| Art indah tetapi tidak terbaca | Gameplay membingungkan | Silhouette besar, arena side-view, VFX per spell berbeda |
| Aset lama tidak jelas lisensinya | Risiko komersial | Asset provenance register sebelum aset masuk build |
| Vibe coding menghasilkan spaghetti | Sulit diperbaiki | TypeScript, modul kecil, data-driven config, test untuk stroke dan match state |
| Terlalu banyak konten sebelum fun | Waktu terbuang | Stage gate; jangan membuat arena/spell kedua sebelum Spell Lab dan Physics Toy lulus |

---

## 21. Guardrails untuk Vibe Coding

- Satu file tidak boleh menjadi tempat seluruh game loop, network, physics, dan render.
- Stroke classifier harus pure function dan memiliki dataset test.
- Server dan client berbagi schema serta konstanta match yang sama.
- Renderer tidak boleh menentukan skor atau collision.
- Spell dibuat dari data definition; penambahan spell tidak memerlukan perubahan core match loop.
- Semua randomness berasal dari seeded random.
- Setiap fitur harus memiliki kondisi penerimaan yang dapat dimainkan, bukan hanya “kode selesai”.
- Jangan menambah dependency tanpa alasan tertulis dan spike kecil.
- Jangan memoles camp, progression, atau kosmetik sebelum online duel stabil.

### Batas modul minimum

```text
client/
  drawing/       capture dan feedback stroke
  rendering/     Three.js, camera, VFX, animation
  input/         mouse dan touch abstraction
  ui/            lobby, HUD, result, settings
  net/           WebSocket client dan interpolation

server/
  rooms/         lifecycle match dan reconnect
  simulation/    authoritative physics dan fixed timestep
  validation/    stroke dan command limits

shared/
  spells/        classifier, parameter mapping, definitions
  match/         phase state machine dan scoring
  protocol/      message schemas
  config/        tuning values dan feature flags
```

---

## 22. Definition of Done MVP

MVP dianggap selesai hanya jika dua pemain dapat:

1. membuka game melalui URL;
2. memasukkan nama tamu;
3. membuat dan bergabung ke room;
4. memahami cara menggambar tanpa penjelasan developer;
5. memainkan match first-to-3 menggunakan empat keluarga spell;
6. melihat hasil physics dan skor yang sama pada kedua perangkat;
7. menyelesaikan match, rematch, atau keluar secara aman;
8. kembali bermain tanpa reload manual atau bantuan developer.

Kualitas MVP ditentukan oleh rasa **“sekali lagi”**, bukan jumlah spell, arena, atau kosmetik.

---

## 23. Keputusan yang Dikunci

- Genre: casual online physics duel.
- Format: 1v1, simultaneous rounds.
- Perspektif: 2.5D side-view.
- Match: first to 3 knock-out Stars, 3–5 menit.
- Karakter: chibi apprentice mage.
- Core input: menggambar satu stroke.
- Spell MVP: Stroke, Loop, Spiral, Angular, plus fallback.
- Failure philosophy: gambar buruk tetap menghasilkan sihir.
- Progression: cosmetic dan discovery, bukan power.
- Role-play: Sanctum Camp kecil, bukan open world.
- Technical authority: server menentukan klasifikasi, physics, dan skor.
- Proyek lama: donor terpilih, bukan fondasi yang di-merge utuh.

## 24. Keputusan yang Sengaja Ditunda

- Nama final dan logo.
- Model bisnis.
- Mobile store release.
- 2v2, ranked, dan spectator.
- Spell kombinasi multi-stroke.
- Terrain destruction penuh.

Penundaan ini tidak menghalangi pembangunan Spell Lab, Physics Toy, atau online MVP.
