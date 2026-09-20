import SwiftUI

struct LibraryEmptyState: View {
    @Environment(StudioStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var targeted = false

    var body: some View {
        VStack(spacing: 24) {
            RecordingIllustration(highlighted: targeted)

            VStack(spacing: 8) {
                Text(targeted ? "Drop to import" : "No recordings yet")
                    .font(.title2.weight(.semibold))
                Text("Drop an audio or video file here.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: 10) {
                Button("Import recording", systemImage: "square.and.arrow.down") {
                    store.showImporter = true
                }.studioButton(prominent: true)
                Button("Record meeting", systemImage: "mic") {
                    if store.recording.active { store.route = .capture }
                    else { Task { await store.startRecording() } }
                }.studioButton()
            }
            .controlSize(.large)
            .disabled(store.busy)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .background(targeted ? StudioStyle.accent.opacity(0.045) : Color.clear)
        .overlay {
            if targeted {
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(StudioStyle.accent.opacity(0.5), style: StrokeStyle(lineWidth: 1.5, dash: [6, 5]))
                    .padding(16)
                    .allowsHitTesting(false)
            }
        }
        .animation(reduceMotion ? nil : StudioStyle.spring, value: targeted)
        .dropDestination(for: URL.self) { urls, _ in
            guard !store.busy, !store.recording.active,
                  let url = urls.first, url.isFileURL else { return false }
            Task { await store.importFile(url) }
            return true
        } isTargeted: { targeted = $0 }
    }
}
