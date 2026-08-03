# DESIGN — Rune Arena (sub-game)

Status: **DRAFT / disepakati arah, belum implementasi.**
Konteks: hasil diskusi 2026-08-03. Mode ini **BUKAN** pengganti game utama
(turn-based drawing duel). Ini **sub-game terpisah** yang dipilih dari lobby,
sehingga game utama tetap utuh dan tidak ada risiko regresi.

Untuk ide yang ditolak & alasannya, lihat bagian "Keputusan yang ditolak".

---

## 1. Ringkasan

Duel 1v1 real-time di mana **menggambar mantra dipindah ke awal** sebagai fase
membangun karakter (Forge), lalu match jadi **adu mekanik** dengan men-*trigger*
3 jurus yang sudah digambar tadi. Menang lewat **HP habis** (bukan bintang,
bukan dorong keluar arena).

Perbedaan inti vs game utama:

| Aspek            | Game utama (drawing duel)        | Rune Arena (sub-game)                 |
|------------------|----------------------------------|---------------------------------------|
| Menggambar       | tiap Turn, rahasia               | sekali di awal (Forge), jadi loadout  |
| Ritme            | turn-based, Resolve deterministik| real-time, server-tick otoritatif     |
| Menang           | 3 bintang via knock-out          | 1 bar HP habis                        |
| Gerak            | hanya fase Setup                 | bebas (dalam separuh arena)           |
| Dodge            | tidak ada                        | swipe 4 arah (Tekken-style)           |

---

## 2. Alur match

### Fase 0 — Forge (loadout, sekali di awal)
- Tiap pemain menggambar **3 jurus**.
- Tiap coretan diproses `shared/src/spells` (classifier + mapping) → **kartu
  jurus** dengan stat block (lihat §3). Family coretan menentukan arketipe.
- Selesai Forge, menggambar berhenti. Jurus terkunci untuk sisa match.

### Fase 1 — Duel (real-time)
- Loop bebas: gerak, cast jurus, dodge, kapan saja.
- HP bar + mana bar per pemain. HP 0 = kalah, match selesai (tanpa ronde).
- Terkunci di separuh arena masing-masing (§5).
- Menang = lawan HP 0.

---

## 3. Stat block jurus (turunan dari gambar)

Sebagian besar **sudah ada** di `shared/src/spells/mapping.ts`
(`SpellInstance`) dan tinggal dipetakan ulang; sisanya baru.

| Stat                     | Sumber                                             | Status |
|--------------------------|----------------------------------------------------|--------|
| **dmg**                  | `knockback`/`mass`/momentum → konversi ke damage   | reuse  |
| **spd**                  | `speed` (confidence × family)                      | reuse  |
| **radius/area**          | `size` → `radius`                                  | reuse  |
| **spin / bounce**        | curvature / cornerCount                            | reuse  |
| **ink (cost gambar)**    | `inkCost` dari arcLength                            | reuse  |
| **def**                  | bentuk tertutup/melingkupi (`loop`/`enclosure`)    | BARU   |
| **mana-cost + cooldown** | turunan dari inkCost & family (anti-spam)          | BARU   |
| **melee/range profile**  | lihat §4 (kontrol trigger)                         | BARU   |

Arketipe family yang sudah ada (`shared/src/config/spells.ts`):
- `stroke` / Arc Bolt — proyektil cepat → **range dmg**
- `angular` / Prism Shard — proyektil mantul → **range, kontrol**
- `loop` / Bubble Ward — diam, melingkupi → **def / perisai**
- `spiral` / Vortex — area diam → **kontrol area**
- `wisp` / Arcane Wisp — lemah, kacau → **utility murah**

---

## 4. Kontrol

- **Gerak:** kiri/kanan (tombol / drag), dalam batas separuh arena. Lompat.
- **Cast jurus (3 tombol):** skema tekan-tahan —
  - **Tap cepat = melee:** jurus muncul persis di depan caster, jangkauan
    pendek, mana murah, cepat. Cocok jarak dekat.
  - **Tahan / charge = range:** jurus dilempar sebagai proyektil; makin lama
    ditahan makin jauh & kuat (dalam batas), mana lebih mahal.
- **Dodge (swipe 4 arah, Tekken mapping):**
  - swipe ←/→ = sidestep (hindar proyektil samping)
  - swipe ↑ = lompat (hindar yang rendah)
  - swipe ↓ = nunduk/slide (hindar yang tinggi)
  - i-frame singkat (~300 ms) saat dodge; batasi jumlah/cooldown biar tak spam.
- **Poin desain:** badan vs badan **tanpa sihir = tidak ada damage kontak.**
  Damage hanya dari jurus.

---

## 5. Arena

- Arena `halfWidth = 1.0`, ground `y = 0`, tengah `x = 0` (dari `CONFIG.arena`).
- **Kunci separuh:** slot 0 clamp `x ∈ [-1, -deadzone]`, slot 1 `x ∈ [+deadzone, +1]`.
  Tidak bisa menyeberang garis tengah → simetris & adil.
- **Hanya hazard/stalaktit atas yang reseed** (per interval / per kill).
  Titik tengah & lantai tetap centris.
- `killWallX` / `killFloorY` tetap dipakai **hanya untuk proyektil** yang meleset
  (biar hilang), bukan untuk men-KO pemain.

---

## 6. Netcode (bagian paling berat, tapi terisolasi)

Game utama deterministik & dihitung serentak — model itu **tidak** cocok untuk
real-time. Karena Rune Arena sub-game terpisah, kita pakai model sendiri
**tanpa menyentuh game lama**:

- **Server otoritatif**, jalankan sim di tick tetap (~30–60 Hz).
- Klien kirim input (`move`, `castStart/castRelease`, `dodge`), server proses &
  broadcast snapshot state; klien interpolasi.
- **Bukan rollback.** Untuk 1v1 yang tidak frame-perfect ini cukup; window
  dodge dibuat lebar (~300 ms+) supaya latency tertutup.

---

## 7. Peta reuse vs baru

**Reuse:**
- `shared/src/spells/*` — classifier & mapping untuk Forge.
- `shared/src/sim/*` (runeBody / physics proyektil) — perilaku jurus terbang.
- Sprite pixellab, rendering arena, `SceneEffects`.

**Baru:**
- Loop match real-time (server tick) + protokol pesan input/state real-time.
- State model HP/mana/cooldown (bukan Wobble/bintang).
- UI: layar Forge, HUD HP+mana, 3 tombol cast (tap/hold), swipe dodge.
- Sprite baru per wizard: `dodge-l/r`, `jump`, `duck`, `hurt`, `melee`.
- SFX (WebAudio) + hit-VFX (asset `collision-burst.png` dll. sudah ada).

---

## 8. Parameter yang perlu ditune (default awal)

- HP total: **100**, target match ~8–12 exchange.
- Mana: regen pelan; tiap cast makan mana + cooldown per jurus.
- Dodge: i-frame ~300 ms, batasi frekuensi (cooldown ~700 ms?).
- Deadzone tengah arena: ~0.1 unit.
- Knockback: kecil (reaksi kena saja), tidak untuk mendorong keluar.

---

## 9. Rencana bertahap

- **Fase A — pisahkan & fondasi:** pilihan mode di lobby; skeleton room
  real-time (server tick + protokol input/state); reuse arena render.
- **Fase B — Forge:** layar gambar 3 jurus → stat block via classifier; HUD kartu.
- **Fase C — duel core:** HP/mana, gerak + batas separuh arena, cast tap=melee /
  hold=range, damage → HP, menang saat HP 0.
- **Fase D — dodge & feel:** swipe 4 arah + i-frame; sound + hit-VFX + shake;
  sprite dodge/hurt/melee.
- **Fase E — balance & polish:** tuning §8, hazard reseed, edge cases netcode.

Catatan: bug room-code global-keydown (game utama) tetap perlu diperbaiki
terpisah — tidak tergantung sub-game ini.

---

## 10. Keputusan yang ditolak

- **Replace game utama** → ditolak; dibuat sub-game agar tanpa risiko regresi.
- **Fighter swipe penuh (buang menggambar)** → ditolak; membuang identitas game
  & butuh tulis ulang total. Menggambar dipertahankan sebagai fase Forge.
- **Pertahankan bintang/ronde** → ditolak; menang murni HP agar simpel & pendek.
