import SwiftUI

struct ModelsView: View {
    @Environment(StudioStore.self) private var store
    @State private var delete: ModelInfo?
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                ForEach(store.environment?.models ?? []) { model in
                    Surface {
                        HStack(spacing: 20) {
                            Image(systemName: "cpu").font(.title).foregroundStyle(StudioStyle.accent)
                            VStack(alignment: .leading, spacing: 7) {
                                Text(model.name).font(.headline)
                                Text(model.estimate).font(.callout).foregroundStyle(.secondary)
                                if model.downloading {
                                    if let progress = model.progress { ProgressView(value: progress, total: 100).frame(width: 160) } else { ProgressView().controlSize(.small) }
                                    Text(model.phase).font(.caption).foregroundStyle(.secondary)
                                }
                                if let error = model.error { Text(error).font(.callout).foregroundStyle(.red) }
                            }
                            Spacer()
                            if model.installed {
                                Label("Installed", systemImage: "checkmark.circle").font(.callout).foregroundStyle(.secondary)
                                Button("Remove", role: .destructive) { delete = model }.studioButton(.destructive)
                            } else {
                                Button("Download", systemImage: "arrow.down.circle") { Task { await store.perform("models/\(model.id)", body: ["confirm": true]) } }.studioButton(.primary).disabled(model.downloading)
                            }
                        }
                    }
                }
            }
        }
        .confirmationDialog("Remove downloaded model?", isPresented: Binding(get: { delete != nil }, set: { if !$0 { delete = nil } }), presenting: delete) { model in
            Button("Remove \(model.name)", role: .destructive) { Task { await store.perform("models/\(model.id)", method: "DELETE", body: ["confirm": true]) } }
        }
    }
}
