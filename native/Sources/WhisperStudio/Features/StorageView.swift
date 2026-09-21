import SwiftUI

struct StorageView: View {
    @Environment(StudioStore.self) private var store
    @State private var media: [ImportedMedia] = []
    @State private var deletion: ImportedMedia?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if let env = store.environment {
                    Surface {
                        VStack(alignment: .leading, spacing: 20) {
                            Label("On this Mac", systemImage: "internaldrive").font(.headline)
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(Int64(env.usedBytes).formatted(.byteCount(style: .file))).font(.largeTitle.weight(.medium))
                                Text("used").foregroundStyle(.secondary)
                                Spacer()
                                Text("\(Int64(env.freeBytes).formatted(.byteCount(style: .file))) available").font(.callout).foregroundStyle(.secondary)
                            }
                            Divider().opacity(0.4)
                            SettingsRow(title: "Compute") { Text(env.compute).foregroundStyle(.secondary) }
                            StudioGlassGroup(spacing: 10) {
                                HStack {
                                    Button("Data folder", systemImage: "folder") { NSWorkspace.shared.open(URL(filePath: env.dataLocation)) }.studioButton()
                                    Button("Logs", systemImage: "doc.text") { NSWorkspace.shared.open(URL(filePath: env.dataLocation).appending(path: "logs")) }.studioButton()
                                }
                            }
                        }
                    }
                    if !media.isEmpty {
                        Text("Retained recordings").font(.headline)
                        Surface {
                            VStack(spacing: 18) {
                                ForEach(media) { item in
                                    HStack(spacing: 12) {
                                        Image(systemName: "waveform").foregroundStyle(.secondary)
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(item.name).lineLimit(2)
                                            Text(StudioStyle.time(item.duration)).font(.caption).foregroundStyle(.secondary)
                                        }
                                        Spacer()
                                        StudioGlassGroup(spacing: 8) {
                                            HStack(spacing: 8) {
                                                Button("Transcribe") { store.imported = item; store.route = .capture }.studioButton()
                                                Button("Delete", systemImage: "trash", role: .destructive) { deletion = item }.labelStyle(.iconOnly).studioIconButton(.ghost).foregroundStyle(.red)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }.padding(2)
        }.task { await refresh() }
            .confirmationDialog("Delete the original recording?", isPresented: Binding(get: { deletion != nil }, set: { if !$0 { deletion = nil } }), presenting: deletion) { item in
                Button("Delete", role: .destructive) { Task { await store.perform("media/\(item.id)", method: "DELETE", body: ["confirm": true]); await refresh() } }
            }
    }
    private func refresh() async {
        guard let api = store.api else { return }
        do { media = try await api.request("media") } catch { store.error = error.localizedDescription }
    }
}
