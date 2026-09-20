# Welcome audio

- sample.wav: original Whisper Studio copy synthesized with Deepgram Aura 2, Thalia (aura-2-thalia-en). Four phrases generated once, with 200ms gaps. Timing is recorded in voice-timing.json. https://developers.deepgram.com/docs/text-to-speech
- arrival.wav: original synthesized three-tone welcome cue.
- ambient.m4a: “First Light”, an original 64-second synthesized cinematic score created for Whisper Studio. Slow bowed-string harmonics, low pulse, and a four-chord arc. No samples or third-party recordings.

All playback is local. No API key ships in the app; onboarding makes no synthesis requests. Voice and music start with the welcome experience. Music ducks under voice, pauses during the microphone preview, and stops when onboarding closes.
