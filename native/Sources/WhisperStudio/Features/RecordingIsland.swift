import SwiftUI

struct RecordingIsland: View {
    @Environment(StudioStore.self) private var store
    var body: some View {
        HStack(spacing: 16) {
            Button { store.route = .capture } label: {
                Label("Recording  \(StudioStyle.time(store.recording.elapsed ?? 0))", systemImage: "waveform")
            }.buttonStyle(.plain)
            Button("Stop recording", systemImage: "stop.fill") { Task { await store.stopRecording() } }
                .labelStyle(.iconOnly).buttonStyle(.bordered).tint(.red).disabled(store.busy)
        }
        .font(.callout).monospacedDigit().padding(12).padding(.leading, 8)
        .studioGlass(radius: 30)
    }
}
