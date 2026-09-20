import SwiftUI

struct TranscriptInspector: View {
    @Bindable var model: TranscriptModel
    @Environment(StudioStore.self) private var store
    @State private var speakerId: Int?
    @State private var speakerName = ""
    @State private var showSpeaker = false
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
                            Text("\(speakers.count)").font(.caption).foregroundStyle(.secondary)
                        }
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
                    }.menuStyle(.borderlessButton).labelsHidden().frame(width: 24, height: 28)
                        .background(.primary.opacity(0.08), in: .rect(cornerRadius: 8))
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
}
