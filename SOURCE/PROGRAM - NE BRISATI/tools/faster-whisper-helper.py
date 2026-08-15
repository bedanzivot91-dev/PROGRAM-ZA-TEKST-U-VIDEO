import argparse, json, pathlib
from faster_whisper import WhisperModel

def srt_time(value: float) -> str:
    ms = max(0, int(round(value * 1000)))
    h, rem = divmod(ms, 3600000); m, rem = divmod(rem, 60000); s, ms = divmod(rem, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"

parser = argparse.ArgumentParser()
parser.add_argument('audio')
parser.add_argument('--model', default='tiny')
parser.add_argument('--language', default='sr')
parser.add_argument('--output', required=True)
args = parser.parse_args()
model = WhisperModel(args.model, device='cpu', compute_type='int8', cpu_threads=4, num_workers=1)
segments, info = model.transcribe(args.audio, language=args.language or None, word_timestamps=True, vad_filter=True, beam_size=3)
words, segment_rows = [], []
for segment in segments:
    segment_rows.append({'start': segment.start, 'end': segment.end, 'text': segment.text.strip()})
    for word in segment.words or []:
        words.append({'start': word.start, 'end': word.end, 'word': word.word.strip(), 'probability': word.probability})
out = pathlib.Path(args.output)
out.write_text(json.dumps({'language': info.language, 'duration': info.duration, 'model': args.model, 'compute_type': 'cpu-int8', 'words': words, 'segments': segment_rows}, ensure_ascii=False, indent=2), encoding='utf-8')
srt = []
for i, row in enumerate(segment_rows, 1):
    srt.extend([str(i), f"{srt_time(row['start'])} --> {srt_time(row['end'])}", row['text'], ''])
out.with_suffix('.srt').write_text('\n'.join(srt), encoding='utf-8')
print(str(out))
