import SwiftUI

struct TranscriptInspector: View {
    @Bindable var model: TranscriptModel
    @Environment(StudioStore.self) private var store
    @State private var speakerId: Int?
    @State private var speakerName = ""
    @State private var showSpeaker = false
    @State private var identifying = false
    @State private var identityMessage: String?
    var speakers: [TranscriptSegment] {
        var seen = Set<Int>()
        return (model.job?.segments ?? []).filter { segment in
            guard let id = segment.speaker else { return false }
            return seen.insert(id).inserted
        }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Meeting insights", systemImage: "sparkles").font(.headline)
                    Text("Find key moments and create a summary from transcript excerpts with JEV.").font(.callout).foregroundStyle(.secondary)
                    GlassEffectContainer {
                    VStack(alignment: .leading, spacing: 12) {
                    Button("Rescan Smart Moments", systemImage: "arrow.clockwise") {
                        if let api = store.api { Task { await model.analyze(summary: false, api: api) } }
                    }.studioButton()
                    Button("Generate highlights & summary", systemImage: "text.badge.star") {
                        if let api = store.api { Task { await model.analyze(summary: true, api: api) } }
                    }.studioButton(.primary)
                    }.disabled(model.requestingAnalysis || model.job?.analysis?.busy == true || store.environment?.jev.configured != true)
                    }
                    if model.requestingAnalysis || model.job?.analysis?.busy == true {
                        ProgressView("Analyzing transcript…").controlSize(.small)
                    }
                    if let failure = model.job?.analysis?.error {
                        Text(failure).font(.callout).foregroundStyle(.red)
                    }
                    if model.job?.analysis?.state == "completed" {
                        Text("Analysis complete").font(.caption).foregroundStyle(.secondary)
                    }
                    if store.environment?.jev.configured != true {
                        Text("Connect JEV in Settings to get started.").font(.callout).foregroundStyle(.secondary)
                    }
                }
                if let notes = model.job?.notes, !notes.summary.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Summary", systemImage: "text.alignleft").font(.headline)
                        Text(notes.summary).font(.callout).foregroundStyle(.secondary).textSelection(.enabled)
                    }
                    ForEach(notes.chapters, id: \.start) { chapter in
                        Button { model.playback.seek(chapter.start) } label: {
                            VStack(alignment: .leading, spacing: 4) { Text(StudioStyle.time(chapter.start)).font(.caption).foregroundStyle(.secondary); Text(chapter.title).font(.callout) }
                        }.buttonStyle(.plain)
                    }
                }
                Surface {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack {
                            Label("Speakers", systemImage: "person.2").font(.headline)
                            Spacer()
                            if store.environment?.googleMeet.configured == true {
                                Button("Identify names", systemImage: "person.crop.circle.badge.checkmark") {
                                    Task { await identifySpeakers() }
                                }
                                .labelStyle(.iconOnly)
                                .studioIconButton()
                                .help("Match speakers with Google Meet")
                                .disabled(identifying)
                            }
                            Text("\(speakers.count)").font(.caption).foregroundStyle(.secondary)
                        }
                        if identifying { ProgressView("Matching Google Meet…").controlSize(.small) }
                        else if let identityMessage { Text(identityMessage).font(.caption).foregroundStyle(.secondary) }
                        if speakers.isEmpty {
                            Text("No speakers identified").font(.callout).foregroundStyle(.secondary)
                        }
                        ForEach(speakers) { segment in
                            Button {
                                speakerId = segment.speaker
                                speakerName = segment.speakerName ?? ""
                                showSpeaker = true
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: "person.fill")
                                        .font(.callout).frame(width: 30, height: 30)
                                        .background(.primary.opacity(0.07), in: .circle)
                                    Text(segment.speakerName ?? "Speaker \((segment.speaker ?? 0) + 1)")
                                        .font(.callout.weight(.medium)).lineLimit(2)
                                    Spacer(minLength: 4)
                                    Image(systemName: "pencil").font(.caption)
                                }.padding(9)
                                    .background(.primary.opacity(0.045), in: .rect(cornerRadius: 12))
                                    .contentShape(Rectangle())
                            }.buttonStyle(.plain).help("Rename speaker")
                        }
                    }
                }
                Surface {
                VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Label("Bookmarks", systemImage: "bookmark").font(.headline)
                    Spacer()
                    Menu("Add bookmark", systemImage: "plus") {
                        ForEach(model.job?.template.bookmarks ?? [], id: \.self) { kind in
                            Button(kind) { if let api = store.api { Task { await model.addBookmark(kind, api: api) } } }
                        }
                    }.menuStyle(.borderlessButton).labelsHidden().studioIconButton().frame(width: 28, height: 28)
                }
                if let error = store.environment?.jev.error { Text(error).font(.callout).foregroundStyle(.red) }
                if model.job?.bookmarks.isEmpty == true { Text("No bookmarks yet").font(.callout).foregroundStyle(.secondary) }
                ForEach(model.job?.bookmarks ?? []) { mark in
                    Button { model.playback.seek(mark.at) } label: {
                        VStack(alignment: .leading, spacing: 7) {
                            HStack {
                                Label(mark.kind, systemImage: mark.source == "jev" ? "sparkle" : "bookmark").font(.callout)
                                Spacer()
                                Text(StudioStyle.time(mark.at)).font(.caption).monospacedDigit().foregroundStyle(.secondary)
                            }
                            if !mark.note.isEmpty { Text(mark.note).font(.callout).foregroundStyle(.secondary) }
                        }.padding(12).background(.quaternary.opacity(0.3), in: .rect(cornerRadius: 12))
                    }.buttonStyle(.plain).contextMenu {
                        Button("Remove bookmark", role: .destructive) {
                            guard let api = store.api, let id = model.job?.id else { return }
                            Task {
                                do { try await api.mutate("jobs/\(id)/bookmarks/\(mark.id)", method: "DELETE"); model.job = try await api.request("jobs/\(id)") }
                                catch { model.error = error.localizedDescription }
                            }
                        }
                    }
                }
                }
                }
            }.padding(14)
        }.background(.primary.opacity(0.025))
        .alert("Rename speaker", isPresented: $showSpeaker) {
            TextField("Name", text: $speakerName)
            Button("Save") {
                if let id = speakerId, let api = store.api { Task { await model.renameSpeaker(id, name: speakerName, api: api) } }
            }
            Button("Cancel", role: .cancel) { }
        }
    }
    private func identifySpeakers() async {
        guard let api = store.api else { return }
        identifying = true
        defer { identifying = false }
        do {
            identityMessage = try await model.identifySpeakers(api: api).message
        } catch {
            identityMessage = error.localizedDescription
        }
    }
}
