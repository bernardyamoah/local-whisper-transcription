import SwiftUI

struct RecordingCompanionView: View {
    @Environment(StudioStore.self) private var store
    let open: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: store.recording.active ? "record.circle.fill" : "checkmark.circle")
                    .foregroundStyle(store.recording.active ? .red : StudioStyle.accent)
                Text(store.recording.active ? StudioStyle.time(store.recording.elapsed ?? 0) : "Recording saved")
                    .font(.callout.weight(.medium)).monospacedDigit()
                Spacer()
                Button("Open Whisper", systemImage: "arrow.up.right") { open() }
                    .labelStyle(.iconOnly).buttonStyle(.borderless).help("Open Whisper")
                if store.recording.active {
                    Button("Stop recording", systemImage: "stop.fill") { Task { await store.stopRecording() } }
                        .labelStyle(.iconOnly).buttonStyle(.bordered).disabled(store.busy).help("Stop recording (Command–Shift–R)")
                }
            }
            Text(store.error ?? store.recording.liveError ?? store.recording.liveTranscript?.last?.text ?? (store.recording.active ? "Listening…" : "Open Whisper to view transcription progress."))
                .font(.callout).foregroundStyle(.secondary).lineLimit(2)
                .frame(maxWidth: .infinity, minHeight: 34, alignment: .leading)
            Text("Command–Shift–R to toggle recording").font(.caption2).foregroundStyle(.tertiary)
        }
        .padding(18).frame(width: 350, height: 154)
        .studioGlass(radius: 24)
        .preferredColorScheme(store.scheme)
    }
}
