#!/usr/bin/env python3
"""Muzički Spot Studio reference-video analyzer.
Uses official PySceneDetect when available and falls back to a lightweight OpenCV detector.
"""
from __future__ import annotations
import argparse
import json
import math
import os
import statistics
import sys
from datetime import datetime, timezone


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('input')
    parser.add_argument('--output', required=True)
    parser.add_argument('--threshold', type=float, default=27.0)
    parser.add_argument('--min-scene', type=float, default=1.0)
    return parser.parse_args()


def fmt(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    minutes, sec = divmod(seconds, 60.0)
    hours, minutes = divmod(int(minutes), 60)
    return f"{hours:02d}:{minutes:02d}:{sec:06.3f}"


def analyze_with_pyscenedetect(video_path: str, threshold: float, min_scene: float):
    from scenedetect import detect, ContentDetector  # type: ignore
    import cv2  # type: ignore
    cap = cv2.VideoCapture(video_path)
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
    frames = float(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    duration = frames / fps if fps > 0 else 0
    cap.release()
    min_frames = max(1, round(min_scene * max(fps, 24)))
    found = detect(video_path, ContentDetector(threshold=threshold, min_scene_len=min_frames), show_progress=False)
    scenes = []
    for index, (start, end) in enumerate(found, 1):
        start_s = start.get_seconds()
        end_s = end.get_seconds()
        scenes.append({'number': index, 'start': round(start_s, 3), 'end': round(end_s, 3), 'duration': round(end_s - start_s, 3), 'startTimecode': fmt(start_s), 'endTimecode': fmt(end_s)})
    if not scenes and duration > 0:
        scenes = [{'number': 1, 'start': 0, 'end': round(duration, 3), 'duration': round(duration, 3), 'startTimecode': fmt(0), 'endTimecode': fmt(duration)}]
    return {'engine': 'PySceneDetect ContentDetector', 'fps': fps, 'width': width, 'height': height, 'duration': duration, 'scenes': scenes}


def analyze_with_opencv(video_path: str, threshold: float, min_scene: float):
    import cv2  # type: ignore
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError('Video nije moguce otvoriti.')
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    duration = frame_count / fps if fps > 0 else 0
    target_samples = min(900, max(120, int(duration * 2))) if duration else 300
    stride = max(1, frame_count // max(1, target_samples))
    last_gray = None
    scores = []
    sample_times = []
    brightness = []
    frame_index = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if frame_index % stride == 0:
            small = cv2.resize(frame, (96, 54), interpolation=cv2.INTER_AREA)
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            brightness.append(float(gray.mean()) / 255.0)
            if last_gray is not None:
                score = float(cv2.absdiff(gray, last_gray).mean())
                scores.append(score)
                sample_times.append(frame_index / fps if fps else 0)
            last_gray = gray
        frame_index += 1
    cap.release()
    dynamic = threshold
    if scores:
        med = statistics.median(scores)
        mad = statistics.median([abs(value - med) for value in scores]) or 1.0
        dynamic = max(threshold, med + 5.0 * mad)
    cuts = []
    last_cut = 0.0
    for when, score in zip(sample_times, scores):
        if score >= dynamic and when - last_cut >= min_scene:
            cuts.append((when, score))
            last_cut = when
    boundaries = [0.0] + [cut[0] for cut in cuts] + ([duration] if duration > 0 else [])
    scenes = []
    for index in range(max(0, len(boundaries) - 1)):
        start, end = boundaries[index], boundaries[index + 1]
        if end <= start:
            continue
        scenes.append({'number': len(scenes) + 1, 'start': round(start, 3), 'end': round(end, 3), 'duration': round(end - start, 3), 'startTimecode': fmt(start), 'endTimecode': fmt(end)})
    return {
        'engine': 'OpenCV LITE fallback', 'fps': fps, 'width': width, 'height': height, 'duration': duration,
        'thresholdUsed': round(dynamic, 3), 'brightnessAverage': round(statistics.mean(brightness), 4) if brightness else 0,
        'scenes': scenes
    }


def main():
    args = parse_args()
    video = os.path.abspath(args.input)
    if not os.path.isfile(video):
        raise FileNotFoundError(video)
    try:
        result = analyze_with_pyscenedetect(video, args.threshold, args.min_scene)
    except Exception as primary_error:
        result = analyze_with_opencv(video, args.threshold, args.min_scene)
        result['fallbackReason'] = str(primary_error)
    durations = [float(scene['duration']) for scene in result['scenes']]
    result.update({
        'ok': True,
        'fileName': os.path.basename(video),
        'fileSizeBytes': os.path.getsize(video),
        'analyzedAt': datetime.now(timezone.utc).isoformat(),
        'sceneCount': len(result['scenes']),
        'averageSceneDuration': round(statistics.mean(durations), 3) if durations else 0,
        'medianSceneDuration': round(statistics.median(durations), 3) if durations else 0,
        'shortestSceneDuration': round(min(durations), 3) if durations else 0,
        'longestSceneDuration': round(max(durations), 3) if durations else 0,
    })
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)
    print(json.dumps({'ok': True, 'output': os.path.abspath(args.output), 'sceneCount': result['sceneCount'], 'engine': result['engine']}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
