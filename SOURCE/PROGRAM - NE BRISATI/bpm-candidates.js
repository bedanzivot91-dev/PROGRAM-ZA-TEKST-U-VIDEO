'use strict';

// Sekcija 6: "Nemoj automatski označiti BPM kao potvrđen samo zato što algoritam ima visoku
// internu ocenu. Na primer, 158 BPM može biti half-time osećaj od 79 BPM." Ovaj modul NIKAD
// ne "potvrđuje" BPM sam — samo predlaže kandidate sa confidence vrednostima; korisnik bira.

function round2(value) { return Math.round(value * 100) / 100; }

// Brz sirovi BPM (npr. preko 140) je čest slučaj oktavne greške detektora — stvarni "osećaj"
// pesme je često upola sporiji. Analogno, veoma spor BPM (ispod ~75) često se percipira duplo brže.
function buildBpmCandidates(rawBpm) {
  const bpm = Number(rawBpm);
  if (!Number.isFinite(bpm) || bpm <= 0) return [];

  const candidates = [{ value: round2(bpm), confidence: 0.6, type: 'primary', recommended: false }];

  const half = bpm / 2;
  if (half >= 40) {
    const confidence = bpm >= 140 ? 0.55 : 0.3;
    candidates.push({ value: round2(half), confidence, type: 'half_time', recommended: false });
  }

  const double = bpm * 2;
  if (double <= 220) {
    const confidence = bpm <= 75 ? 0.5 : 0.2;
    candidates.push({ value: round2(double), confidence, type: 'double_time', recommended: false });
  }

  const highestConfidence = Math.max(...candidates.map(c => c.confidence));
  const topCandidates = candidates.filter(c => c.confidence === highestConfidence);
  // Kada je izjednačeno, "primary" ostaje preporučen (najmanje iznenađujući izbor za korisnika).
  const recommended = topCandidates.find(c => c.type === 'primary') || topCandidates[0];
  recommended.recommended = true;

  return candidates;
}

module.exports = { buildBpmCandidates };
