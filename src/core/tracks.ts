import refUrl from '../assets/audio/hyperloops-ref.ogg';
import t2Url from '../assets/audio/hyperloops-02.ogg';
import t3Url from '../assets/audio/hyperloops-03.ogg';
import refAac from '../assets/audio/hyperloops-ref.m4a';
import t2Aac from '../assets/audio/hyperloops-02.m4a';
import t3Aac from '../assets/audio/hyperloops-03.m4a';

/**
 * Music tracks (imported, so a production build can inline them into a single index.html). Every file is prepared (trimmed, tempo-matched to 160 BPM) so that 8-bar section k
 * starts exactly at k × 12 s and beats fall at 0.05 + n × 0.375 s — one shared grid for all tracks.
 * Sources are the MP3s in music/ (trim values include each MP3's measured decoder delay):
 *   ref — music/hyperloops.mp3, the 2016 video soundtrack: trimmed 0.0257 s (10 sections, one per scene)
 *   t2  — music/hyperloops-02.mp3: trimmed 0.633 s, stretched 159→160 BPM (12 sections)
 *   t3  — music/hyperloops-03.mp3: trimmed 3.2095 s (8 sections)
 * Each track exists twice: Opus (.ogg, decodes without padding in Chrome/Firefox) and an AAC (.m4a) copy with
 * the same trims for Safari versions that can't decode Opus (e.g. older iPads). Both were checked to align.
 */
export const TRACKS = {
  ref: { url: refUrl, aac: refAac, sections: 10 },
  t2: { url: t2Url, aac: t2Aac, sections: 12 },
  t3: { url: t3Url, aac: t3Aac, sections: 8 },
} as const;

export type TrackId = keyof typeof TRACKS;

/** a level's music: one track, played from section `from` onward (looping back to `from` if the level outlasts it) */
export interface LevelMusic {
  track: TrackId;
  from: number;
}
