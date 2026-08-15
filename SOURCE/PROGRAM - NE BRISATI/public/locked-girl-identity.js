'use strict';

// GLOBALNO ZAKLJUČANI IDENTITET GLAVNE DEVOJKE (v15.5, sekcija 16 master prompta).
// NE MENJATI, NE SKRAĆIVATI, NE PREVODITI, NE PARAFRAZIRATI tekst ispod — to je eksplicitno
// zabranjeno pravilima master prompta. Ako se identitet ikad ažurira, mora doći ceo novi
// blok od korisnika/spec-a, ne ručna izmena pojedinačnih reči.
//
// VAŽNO: garderoba NIJE zaključana na crvenu haljinu (v15.3 greška, ispravljeno u v15.5) —
// odeća se određuje po sceni, mora biti moderna/urbana/savremena. Vidi pravilo 0.10.
const LOCKED_GIRL_IDENTITY_POSITIVE_TEXT = String.raw`the same woman, same identity, same person in every image, consistent face, consistent character identity, ultra-realistic young woman, 23 years old, straight jet-black shoulder-length hair, hair length must stay exactly at shoulder level, hair must never be short, hair must never be long below the shoulders, deep emerald green eyes, vivid green eyes, bright natural green eye color, green eyes must remain identical in every image, eye color must never change, light skin, soft oval symmetrical face, almond-shaped green eyes, slightly lowered outer eye corners, slightly wider eye spacing, high cheekbones, narrow feminine jawline, defined but soft chin, slim straight nose bridge, straight elegant nose, thin natural eyebrows, natural medium lips, naturally fuller lower lip, thinner upper lip, subtle beauty mark under the left eye, soft feminine facial structure, realistic skin texture, natural pores, highly detailed eyes, realistic eyelashes, balanced facial proportions, identical facial features in every image, identical facial geometry in every image, identical hairstyle in every image, identical shoulder-length jet-black hair in every image, identical age in every image, identical body proportions in every image, the same person across all images, never change the woman, never replace her with another person, natural body proportions, photorealistic real human appearance, photorealistic smartphone photo realism, natural lighting, slight natural grain, realistic candid everyday atmosphere, realistic hands, realistic fingers, realistic anatomy, small minimalist Mini Mouse tattoo on the front upper right thigh, on the right leg above the knee toward the upper thigh, exact tattoo position must remain identical in every image, tattoo design must remain identical in every image, tattoo must never move to the left leg, side of thigh, back of thigh, knee area or hip area, tattoo is visible only when clothing and framing naturally reveal the front upper right thigh, otherwise the tattoo must be naturally hidden or out of frame, her clothing must be determined by the exact scene, lyrics, mood, weather, setting, action, location and emotional tone, refined modern urban everyday style, fashionable contemporary clothing, modern and tasteful styling, never default automatically to a sweater, never use old-fashioned clothing, never use historical clothing unless the selected music-video concept explicitly requires a historical period, never repeat the same outfit without a clear continuity reason, clothing may include modern dresses, skirts, jeans, tailored pants, elegant blouses, fitted tops, jackets or coats when appropriate to the scene.`;

const LOCKED_GIRL_IDENTITY_NEGATIVE_TEXT = String.raw`different woman, different person, changed face, changed facial features, changed facial geometry, changed eye shape, changed eye spacing, changed outer eye corners, changed cheekbones, changed jawline, changed chin, changed nose, changed lips, changed eyebrows, changed age, changed body proportions, blonde hair, brown hair, red hair, short hair, hair below the shoulders, long hair, curly hair, strongly wavy hair, changed hairstyle, blue eyes, brown eyes, gray eyes, non-green eyes, changed eye color, missing beauty mark, beauty mark in another position, missing Mini Mouse tattoo when the front upper right thigh is visibly exposed, tattoo on the left leg, tattoo on another leg, tattoo in another position, tattoo on the side of the thigh, tattoo on the back of the thigh, tattoo near the knee, tattoo near the hip, different tattoo design, oversized tattoo, old-fashioned clothing, vintage clothing, historical costume without explicit story justification, outdated fashion, repetitive sweater in every scene, inappropriate outfit for the scene, cartoon, anime, illustration, painting, 3D render, doll face, plastic skin, fake beauty filter, overedited skin, waxy skin, deformed hands, extra fingers, fused fingers, missing fingers, duplicated limbs, extra arms, extra legs, broken anatomy, distorted body, text, subtitle, logo, watermark.`;

// Kombinovan blok — ISTI format koji app.js već parsira preko "Negative prompt:" separatora
// (vidi LOCKED_GIRL_SPLIT u app.js). Menjati OVAJ separator format zahteva i izmenu app.js.
const LOCKED_GIRL_IDENTITY_COMBINED = `${LOCKED_GIRL_IDENTITY_POSITIVE_TEXT} Negative prompt: ${LOCKED_GIRL_IDENTITY_NEGATIVE_TEXT}`;

function sha256Hex(text) {
  // Sinhrona SHA-256 implementacija bez zavisnosti (Web Crypto je async, a ovaj fajl mora
  // sinhrono definisati konstante pri učitavanju stranice) — čist JS, samo za integritet prikaz.
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const bytes = new TextEncoder().encode(text);
  const bitLen = bytes.length * 8;
  const withOne = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  withOne.set(bytes);
  withOne[bytes.length] = 0x80;
  const view = new DataView(withOne.buffer);
  view.setUint32(withOne.length - 4, bitLen >>> 0);
  view.setUint32(withOne.length - 8, Math.floor(bitLen / 4294967296));
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < withOne.length; offset += 64) {
    const w = new Uint32Array(64);
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    H = H.map((value, index) => (value + [a, b, c, d, e, f, g, h][index]) | 0);
  }
  return H.map(value => (value >>> 0).toString(16).padStart(8, '0')).join('');
}

Object.defineProperty(window, 'LOCKED_GIRL_CHARACTER_ID', { value: 'main-woman-global-v1', writable: false, configurable: false, enumerable: true });
Object.defineProperty(window, 'LOCKED_GIRL_IDENTITY_POSITIVE', { value: LOCKED_GIRL_IDENTITY_POSITIVE_TEXT, writable: false, configurable: false, enumerable: true });
Object.defineProperty(window, 'LOCKED_GIRL_IDENTITY_NEGATIVE', { value: LOCKED_GIRL_IDENTITY_NEGATIVE_TEXT, writable: false, configurable: false, enumerable: true });
Object.defineProperty(window, 'LOCKED_GIRL_IDENTITY_BLOCK', { value: LOCKED_GIRL_IDENTITY_COMBINED, writable: false, configurable: false, enumerable: true });
Object.defineProperty(window, 'LOCKED_GIRL_IDENTITY_SHA256', { value: sha256Hex(LOCKED_GIRL_IDENTITY_COMBINED), writable: false, configurable: false, enumerable: true });
