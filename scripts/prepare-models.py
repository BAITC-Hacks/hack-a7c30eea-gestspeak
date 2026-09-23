"""Run ONLY on a connected preparation workstation. No meeting data is read."""
import argparse
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--whisper',default='Systran/faster-whisper-large-v3')
parser.add_argument('--destination',default='models')
parser.add_argument('--include-diarization',action='store_true')
args=parser.parse_args()
from huggingface_hub import snapshot_download
root=Path(args.destination)
snapshot_download(args.whisper,local_dir=str(root/'whisper'))
if args.include_diarization:
    # Requires prior acceptance of pyannote's model conditions and HF_TOKEN.
    snapshot_download('pyannote/speaker-diarization-community-1',local_dir=str(root/'diarization'))
print('Copy the models directory into the isolated deployment. Runtime uses local files only.')
