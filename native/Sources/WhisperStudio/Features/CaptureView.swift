import SwiftUI

struct CaptureView: View {
    @Environment(StudioStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var targeted = false
    @State private var options = false

    var body: some View {
        @Bindable var store = store
        ScrollView {
            VStack(spacing: 20) {
                HStack {
                    Text(store.recording.active ? "Your meeting" : "New transcription").font(.title2).bold()
                    Spacer()
                    Button("Library", systemImage: "square.stack") { store.route = .library }.buttonStyle(.borderless)
                }.padding(.bottom, 8)
                if store.recording.active {
                    LiveRecordingView()
                } else {
                    Spacer(minLength: 12)
                    CompanionOrb(active: true).frame(width: 170, height: 170)
                        .scaleEffect(targeted ? 1.08 : 1)
                    VStack(spacing: 10) {
                        Text(store.busy ? "Bringing it in…" : store.imported?.name ?? (targeted ? "Let it land." : "What’s on your mind?")).font(.title).bold().multilineTextAlignment(.center).lineLimit(2)
                        if let media = store.imported {
                            Text(StudioStyle.time(media.duration)).font(.body).monospacedDigit().foregroundStyle(.secondary)
                        } else {
                            Text("Drop a recording. Or start something new.").foregroundStyle(.secondary)
                        }
                    }
                    HStack(spacing: 12) {
                        if store.imported != nil {
                            Button("Transcribe", systemImage: "sparkles") { Task { await store.transcribe() } }.studioButton(prominent: true)
                            Button("Choose another") { store.showImporter = true }.studioButton()
                        } else {
                            Button("Choose file", systemImage: "arrow.up.doc") { store.showImporter = true }.studioButton(prominent: true)
                            Button("Record meeting", systemImage: "mic") { Task { await store.startRecording() } }.studioButton()
                        }
                    }.controlSize(.regular).disabled(store.busy)
                    if store.busy { ProgressView().controlSize(.small) }
                    VStack(spacing: 0) {
                        Button {
                            withAnimation(reduceMotion ? nil : StudioStyle.spring) { options.toggle() }
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.semibold))
                                    .rotationEffect(.degrees(options ? 90 : 0))
                                Text("Options")
                                Spacer()
                                Text("\(store.preferences.transcriptionProvider == "local" ? "On this Mac" : "Deepgram") · \(store.selectedTemplate?.name ?? "Meeting")")
                                    .font(.callout).foregroundStyle(.secondary)
                            }
                            .padding(16).frame(maxWidth: .infinity, minHeight: 52)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityValue(options ? "Expanded" : "Collapsed")
                        if options {
                            CaptureOptions().padding(16).padding(.top, -4)
                                .transition(.opacity)
                        }
                    }.studioGlass(radius: 16).padding(.top, 24)
                    Spacer(minLength: 36)
                }
            }.padding(24).frame(maxWidth: 680).frame(maxWidth: .infinity)
        }
        .overlay { RoundedRectangle(cornerRadius: 24).strokeBorder(StudioStyle.accent, lineWidth: targeted ? 2 : 0).padding(12).allowsHitTesting(false) }
        .dropDestination(for: URL.self) { urls, _ in
            guard let file = urls.first, file.isFileURL, !store.recording.active, !store.busy else { return false }
            Task { await store.importFile(file) }; return true
        } isTargeted: { targeted = $0 }
        .animation(reduceMotion ? nil : StudioStyle.spring, value: targeted)
        .animation(reduceMotion ? nil : StudioStyle.spring, value: store.recording.active)
    }
}
