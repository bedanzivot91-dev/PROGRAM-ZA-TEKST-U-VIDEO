#!/usr/bin/env python3
"""MusicAnalysisEngine (sekcija 11): BPM, beat/downbeat, onset, RMS energija, spectral flux,
novelty curve preko librosa. Nikad ne pretpostavlja jedan "tacan" BPM - vraca kandidate
(glavni, half-time, double-time) sa confidence vrednostima, izbor potvrdjuje korisnik (sekcija 6)."""
from __future__ import annotations
import argparse
import json
import os
import sys


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('input')
    parser.add_argument('--output', required=True)
    return parser.parse_args()


def analyze(audio_path: str):
    import numpy as np
    import librosa

    y, sr = librosa.load(audio_path, sr=None, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))

    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
    primary_bpm = float(tempo) if hasattr(tempo, '__float__') else float(tempo[0])
    beat_times_ms = [round(t * 1000) for t in librosa.frames_to_time(beat_frames, sr=sr)]

    try:
        _, downbeat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr, trim=False, units='frames')
        downbeat_times_ms = beat_times_ms[::4] if len(beat_times_ms) >= 4 else beat_times_ms[:1]
    except Exception:
        downbeat_times_ms = beat_times_ms[::4] if len(beat_times_ms) >= 4 else beat_times_ms[:1]

    onset_frames = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, backtrack=True)
    onset_times = librosa.frames_to_time(onset_frames, sr=sr)
    onset_strengths = onset_env[onset_frames] if len(onset_frames) else np.array([])
    max_strength = float(onset_strengths.max()) if len(onset_strengths) else 1.0
    onsets = [
        {'timeMs': round(float(t) * 1000), 'strength': round(float(s) / max_strength, 4) if max_strength else 0}
        for t, s in zip(onset_times, onset_strengths)
    ]

    hop_length = 512
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    rms_times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)
    # Downsample energiju na najviše ~200 tačaka - frontend ne treba sirove nizove (sekcija 11).
    target_points = min(200, len(rms))
    if target_points and len(rms) > target_points:
        indices = np.linspace(0, len(rms) - 1, target_points).astype(int)
        rms_ds = rms[indices]
        rms_times_ds = rms_times[indices]
    else:
        rms_ds = rms
        rms_times_ds = rms_times
    max_rms = float(rms_ds.max()) if len(rms_ds) else 1.0
    energy_points = [
        {'timeMs': round(float(t) * 1000), 'value': round(float(v) / max_rms, 4) if max_rms else 0}
        for t, v in zip(rms_times_ds, rms_ds)
    ]

    # Novelty curve (aproksimacija promene teksture) preko normalizovanog onset envelope-a,
    # downsample-ovano na reprezentativne tacke (sekcija 11: "12-20 reprezentativnih tacaka").
    if len(onset_env):
        max_env = float(onset_env.max()) or 1.0
        env_times = librosa.frames_to_time(np.arange(len(onset_env)), sr=sr)
        novelty_target = min(20, len(onset_env))
        idx = np.linspace(0, len(onset_env) - 1, novelty_target).astype(int)
        novelty_curve = [
            {'timeMs': round(float(env_times[i]) * 1000), 'value': round(float(onset_env[i]) / max_env, 4)}
            for i in idx
        ]
    else:
        novelty_curve = []

    candidates = [{'value': round(primary_bpm, 2), 'confidence': 0.7, 'type': 'primary'}]
    half = primary_bpm / 2
    double = primary_bpm * 2
    if half >= 40:
        candidates.append({'value': round(half, 2), 'confidence': 0.5, 'type': 'half_time'})
    if double <= 220:
        candidates.append({'value': round(double, 2), 'confidence': 0.3, 'type': 'double_time'})

    return {
        'ok': True,
        'durationMs': round(duration * 1000),
        'sampleRate': int(sr),
        'bpm': {'primary': round(primary_bpm, 2), 'candidates': candidates},
        'beatTimesMs': beat_times_ms,
        'downbeatTimesMs': downbeat_times_ms,
        'onsets': onsets[:500],  # razumna gornja granica
        'energy': energy_points,
        'noveltyCurve': novelty_curve,
    }


def main():
    args = parse_args()
    audio_path = os.path.abspath(args.input)
    if not os.path.isfile(audio_path):
        raise FileNotFoundError(audio_path)
    result = analyze(audio_path)
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)
    print(json.dumps({'ok': True, 'output': os.path.abspath(args.output), 'bpm': result['bpm']['primary']}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
