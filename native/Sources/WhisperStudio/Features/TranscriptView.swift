import SwiftUI

struct TranscriptView: View {
    let jobId: String
    @Environment(StudioStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var model = TranscriptModel()
    @State private var export = false
    @State private var rename = false
    @State private var title = ""

    var body: some View {
        VStack(spacing: 0) {
            if let job = model.job {
                HStack(spacing: 16) {
                    Button("Back to library", systemImage: "chevron.left") { store.route = .library }.labelStyle(.iconOnly).studioIconButton(.ghost)
                    VStack(alignment: .leading, spacing: 6) {
                        Button { title = job.title; rename = true } label: { Text(job.title).font(.title2).bold().lineLimit(1) }.buttonStyle(.plain).help("Rename recording")
                        Text("\(StudioStyle.time(job.duration)) · \((job.detectedLanguage ?? job.language).uppercased()) · \(job.provider == "local" ? "On this Mac" : "Deepgram")").font(.callout).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if job.state == "completed" {
                        StudioGlassGroup(spacing: 10) {
                            HStack(spacing: 10) {
                                Button("Export", systemImage: "square.and.arrow.up") { export = true }.studioButton(.primary)
                                Button("Show bookmarks", systemImage: "sidebar.right") { model.inspector.toggle() }.labelStyle(.iconOnly).studioIconButton()
                            }
                        }
                    }
                }.padding(24)
                if job.state == "completed" {
                    TranscriptToolbar(model: model)
                    HSplitView {
                        TranscriptContent(model: model)
                        if model.inspector { TranscriptInspector(model: model).frame(minWidth: 280, idealWidth: 310, maxWidth: 370) }
                    }
                    if job.playbackAvailable { PlaybackBar(controller: model.playback, video: job.playbackKind == "video").padding(16) }
                } else { TranscriptionProgress(job: job) }
            } else { ProgressView("Opening transcript").frame(maxWidth: .infinity, maxHeight: .infinity) }
            if let error = model.error {
                HStack {
                    Text(error).font(.callout).foregroundStyle(.red)
                    if model.unsaved { Button("Retry saving") { if let api = store.api { Task { await model.retryEdits(api: api) } } }.disabled(model.saving) }
                }.padding()
            }
        }
        .task { if let api = store.api { await model.watch(id: jobId, api: api) } }
        .task { await model.playback.monitor() }
        .onDisappear { model.playback.stop() }
        .sheet(isPresented: $export) { if let job = model.job { ExportSheet(job: job).environment(store) } }
        .alert("Rename recording", isPresented: $rename) {
            TextField("Title", text: $title)
            Button("Save") { if let api = store.api { Task { await model.rename(title, api: api) } } }
            Button("Cancel", role: .cancel) { }
        }
        .animation(reduceMotion ? nil : StudioStyle.spring, value: model.inspector)
    }
}
