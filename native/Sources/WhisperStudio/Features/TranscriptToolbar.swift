import SwiftUI

struct TranscriptToolbar: View {
    @FocusState private var searchFocused: Bool
    @Bindable var model: TranscriptModel
    @Environment(StudioStore.self) private var store
    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary).accessibilityHidden(true)
                TextField("Find in transcript", text: $model.query).textFieldStyle(.plain).focused($searchFocused).onSubmit { model.step(1) }
                    .onChange(of: model.query) { model.matchIndex = 0; model.search() }
                if !model.query.isEmpty {
                    Text(model.matches.isEmpty ? "No matches" : "\(model.matchIndex + 1) of \(model.matches.count)").font(.caption).foregroundStyle(.secondary).fixedSize()
                    Button("Clear search", systemImage: "xmark.circle.fill") { model.query = "" }.labelStyle(.iconOnly).buttonStyle(.plain).foregroundStyle(.secondary)
                }
            }.padding(9).background(.primary.opacity(0.035), in: .rect(cornerRadius: 12))
            ControlGroup {
                Button("Previous match", systemImage: "chevron.up") { model.step(-1) }
                Button("Next match", systemImage: "chevron.down") { model.step(1) }
            }.labelStyle(.iconOnly).frame(width: 64).disabled(model.matches.isEmpty)
            if model.saving { ProgressView().controlSize(.mini).help("Saving edits") }
            Divider().frame(height: 18)
            Button("Undo", systemImage: "arrow.uturn.backward") { if let api = store.api { model.undo(api: api) } }.labelStyle(.iconOnly).disabled(model.history.isEmpty || model.saving)
            Button("Copy", systemImage: "doc.on.doc", action: model.copy).labelStyle(.iconOnly)
            Toggle("Follow", isOn: $model.followPlayback).toggleStyle(.button).help("Follow playback")
        }.buttonStyle(.borderless).padding(10).studioGlass(radius: 16)
        .padding(.horizontal, 20).padding(.bottom, 8)
        .focusedSceneValue(\.workspaceFind, WorkspaceFindActions(find: { searchFocused = true }, next: model.matches.isEmpty ? nil : { model.step(1) }, previous: model.matches.isEmpty ? nil : { model.step(-1) }))
    }
}
