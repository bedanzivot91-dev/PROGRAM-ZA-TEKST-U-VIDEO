'use strict';

// Sekcija 5: ekstenzija mora imati STABILAN ID (ne slučajan pri svakom ponovnom učitavanju),
// da bi server mogao da drži tačnu chrome-extension://ID allow-listu za CORS. Chrome dodeljuje
// stabilan ID kada manifest.json ima "key" polje (base64 SPKI DER javni ključ) — ID se računa
// deterministički iz tog ključa, pa server i manifest MORAJU koristiti isti ključ.

const crypto = require('crypto');

// Javni ključ iz browser-extension/MSS-ChatGPT-Plus-Most/manifest.json "key" polja.
// Menjati OVO zahteva i izmenu manifest.json (i obrnuto) — ID mora ostati usklađen.
const MSS_EXTENSION_PUBLIC_KEY_B64 = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7zqE0f4hwDWZ1R+s2G+BmUUxYms3NHtER7XU7rC/pKQEJt8TXaYTIwAtVo3RnjMJ3RWzVHFet48R76JmuFcvHCVenBYMBCG7xrOxVNRvwaQcTM6gds9kQQ5COq8DU35Shh9AvHEcsJ88lrgcI/+5w0qDcpXcRCCXegyWOnsDeVQ1ODUJqAy73YcLeBdbxiIoL9fCsK0SfLdMg+BfIzV/yC4hXu0WNGt4h1JSHTzvFfRNyn78x0kYcrmuH2whfoSe4G6yHEKnzV5l8zbZblvdx+j51NqG4eHTU213D3gVp28FE2Zs/6aeok4Zbbxsy65fCbOOnMToJ4Wt4AHFHqw1WwIDAQAB';

// Chrome-ov dokumentovani algoritam: SHA-256 hash DER-enkodovanog javnog ključa, prvih 16
// bajtova, svaki nibble (4 bita) mapiran na slovo a-p (0->a, 1->b, ..., 15->p).
function computeChromeExtensionId(base64PublicKeyDer) {
  const derBytes = Buffer.from(base64PublicKeyDer, 'base64');
  const hash = crypto.createHash('sha256').update(derBytes).digest();
  const first16 = hash.subarray(0, 16);
  let id = '';
  for (const byte of first16) {
    const high = (byte >> 4) & 0x0f;
    const low = byte & 0x0f;
    id += String.fromCharCode(97 + high) + String.fromCharCode(97 + low);
  }
  return id;
}

const MSS_EXTENSION_ID = computeChromeExtensionId(MSS_EXTENSION_PUBLIC_KEY_B64);
const MSS_EXTENSION_ORIGIN = `chrome-extension://${MSS_EXTENSION_ID}`;

module.exports = { computeChromeExtensionId, MSS_EXTENSION_PUBLIC_KEY_B64, MSS_EXTENSION_ID, MSS_EXTENSION_ORIGIN };
