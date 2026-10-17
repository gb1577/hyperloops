/**
 * Music tracks. Every file is prepared (trimmed, tempo-matched to 160 BPM) so that 8-bar section k
 * starts exactly at k × 12 s and beats fall at 0.05 + n × 0.375 s — one shared grid for all tracks.
 * Sources are the MP3s in music/ (trim values include each MP3's measured decoder delay):
 *   ref — music/hyperloops.mp3, the 2016 video soundtrack: trimmed 0.0257 s (10 sections, one per scene)
 *   t2  — music/hyperloops-02.mp3: trimmed 0.633 s, stretched 159→160 BPM (12 sections)
 *   t3  — music/hyperloops-03.mp3: trimmed 3.2095 s (8 sections)
 */
export const TRACKS = {
  ref: { url: 'audio/hyperloops-ref.ogg', sections: 10 },
  t2: { url: 'audio/hyperloops-02.ogg', sections: 12 },
  t3: { url: 'audio/hyperloops-03.ogg', sections: 8 },
} as const;

export type TrackId = keyof typeof TRACKS;

export interface SectionRef {
  track: TrackId;
  section: number;
}
