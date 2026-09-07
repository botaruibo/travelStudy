# Debug Session: volcengine-asr-resume
- **Status**: [OPEN]
- **Issue**: A 30-minute MP3 transcription through Volcengine ASR did not complete; determine the interruption cause and whether it can resume.
- **Debug Server**: Pending startup
- **Log File**: .dbg/trae-debug-log-volcengine-asr-resume.ndjson

## Reproduction Steps
1. Start audio-based video analysis for the affected compressed video.
2. Wait for Volcengine ASR transcription to complete or fail.
3. Inspect task state, error details, and transcript artifacts.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | The outgoing ASR request timed out or was interrupted in transit. | Medium | Low | Pending |
| B | Volcengine returned an API error after accepting the request. | Medium | Low | Pending |
| C | Transcription is a single request with no persisted segment checkpoint. | High | Low | Pending |
| D | Task retry restarts the pipeline rather than resuming a saved checkpoint. | High | Low | Pending |
| E | The transcript or subtitle artifact write failed after ASR returned. | Low | Low | Pending |

## Log Evidence
- `tasks.task-video-0078cefe-ba48-4b10-90b6-ca8290a914ee` failed at `2026-08-23T14:59:31.933+08:00` with progress `0.52`.
- Its error is `基于字幕的场景分析失败：SiliconFlow 模型密钥未配置`, not a Volcengine ASR transport or API error.
- Task metadata contains `audioProgress: 90`; this is the client-side progress cap used while sending audio packets, not an ASR completion percentage.
- The affected video is `2192.4903` seconds (36:32), and its generated MP3 is `17,540,788` bytes.
- The same task produced `media/transcripts/video-1787450036368-eyu619.txt` (34,191 bytes) and `media/subtitles/video-1787450036368-eyu619.vtt` (50,185 bytes), both written at `2026-08-23 14:59:31`.
- `runVideoPipeline` writes the transcript and VTT only after `transcribeAudio` returns final utterances, then invokes subtitle-based scene segmentation.
- `TaskManager.retry(..., 'checkpoint')` only requeues the task; `runVideoPipeline` does not inspect existing transcript/VTT artifacts and starts ASR again.

## Verification Conclusion
| ID | Conclusion |
|----|------------|
| A | Rejected for this task: no ASR timeout or transport error is recorded. |
| B | Rejected for this task: no Volcengine API error is recorded. |
| C | Confirmed: transcript/VTT are persisted only after ASR completes; no incremental ASR checkpoint exists. |
| D | Confirmed: the `checkpoint` retry label does not resume ASR. It re-runs the entire analysis pipeline. |
| E | Rejected: artifacts were successfully written; the failure occurred in the subsequent SiliconFlow subtitle segmentation stage. |

## Fix In Progress
- Audio analysis now uses five-minute ASR segments. Each completed segment persists absolute-time utterances, transcript, VTT, and a SQLite-linked checkpoint.
- A later retry resumes from the first incomplete segment. A completed VTT skips ASR and continues with scene segmentation.
- Re-clicking the same audio analysis requeues the latest failed task instead of creating a new billed task.
- The empty video-analysis state now retains the last task error in an inline status panel.
- Static validation passed for the changed Electron modules, renderer build, and diff whitespace checks.
- Existing failure `task-video-0078cefe-ba48-4b10-90b6-ca8290a914ee` has reusable VTT/TXT evidence and will exercise the completed-transcription resume branch.

## Subtitle Follow-up
- The generated VTT existed, but `videos.subtitle_path` and `videos.transcript_path` were null because the prior pipeline only persisted those fields after later scene analysis succeeded.
- `VideoPlayer` conditionally mounts its subtitle `<track>` only when `subtitle_path` is present, so the VTT was never loaded.
- The pipeline now persists subtitle and transcript paths immediately after transcription, and startup reconciles existing generated files into the database.
- After restart, the affected row points to both local files; the VTT's first cue is `00:00:01.612 --> 00:00:05.414`.

## Scene Coverage Follow-up
- The ASR output is complete: 436 VTT cues cover `1.612s` through `2192.412s` (36:32).
- The prior scene result stops at `1260.412s` (21:00), while `videos.duration` is `2192.4903s`; this proves the missing scenes were not caused by ASR.
- `normalizeVttScenes` omitted `study_advice`, so every LLM-provided learning suggestion was discarded before scene insertion. Template and video-analysis UI bindings are present and correctly use `scene.study_advice`.
- The old scene request submitted the whole VTT in one response constrained to 4096 output tokens; the model returned 12 early scenes and empty advice fields rather than covering the latter content.
- The fix splits this VTT into six timestamp-preserving windows, covering all 436 cues through `2192.412s`, with a coverage event emitted after each window.
