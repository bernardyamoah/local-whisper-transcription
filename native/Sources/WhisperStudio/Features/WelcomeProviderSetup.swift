import SwiftUI

struct WelcomeProviderSetup: View {
    @Environment(StudioStore.self) private var store
    @State private var key = ""
    @State private var working = false
    @State private var failure: String?

    var body: some View {
        VStack(spacing: 16) {
            if store.preferences.transcriptionProvider == "local" {
                ForEach(store.environment?.models ?? []) { model in
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(model.name).font(.headline)
                            if store.environment?.presets?[store.preferences.preset]?.model == model.id {
                                Text("Selected").font(.caption2).foregroundStyle(StudioStyle.accent)
                            }
                            Text(model.estimate).font(.caption).foregroundStyle(.secondary)
                            if model.downloading {
                                if let progress = model.progress { ProgressView(value: progress, total: 100) }
                                else { ProgressView().controlSize(.small) }
                                Text(model.phase).font(.caption).foregroundStyle(.secondary)
                            }
                            if let error = model.error { Text(error).font(.caption).foregroundStyle(.red) }
                        }
                        Spacer()
                        if model.installed {
                            Button("Use model", systemImage: "checkmark.circle") { select(model.id) }
                        } else {
                            Button(model.downloading ? "Downloading" : "Download", systemImage: "arrow.down") {
                                Task { await download(model.id) }
                            }.disabled(working || model.downloading)
                        }
                    }.padding(12).background(.primary.opacity(0.04), in: .rect(cornerRadius: 12))
                }
            } else if store.environment?.deepgram.configured == true {
                Label("Deepgram connected", systemImage: "checkmark.circle.fill").foregroundStyle(StudioStyle.accent)
            } else {
                SecureField("Deepgram API key", text: $key).textFieldStyle(.roundedBorder)
                    .onSubmit { if !key.isEmpty && !working { Task { await connect() } } }
                Button(working ? "Connecting…" : "Connect Deepgram") { Task { await connect() } }
                    .disabled(key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || working)
            }
            if let failure { Text(failure).font(.caption).foregroundStyle(.red) }
        }.frame(maxWidth: 460)
    }

    private func download(_ id: String) async {
        guard let api = store.api else { return }
        working = true; failure = nil
        defer { working = false }
        do {
            try await api.mutate("models/\(id)", body: ["confirm": true])
            select(id)
            try await store.refreshEnvironment()
        } catch { failure = error.localizedDescription }
    }

    private func select(_ model: String) {
        if let preset = store.environment?.presets?.first(where: { $0.value.model == model })?.key {
            store.preferences.preset = preset
        }
    }

    private func connect() async {
        guard let api = store.api else { return }
        working = true; failure = nil
        defer { working = false }
        do {
            try await api.mutate("providers/deepgram", body: ["api_key": key.trimmingCharacters(in: .whitespacesAndNewlines)])
            key = ""
            try await store.refreshEnvironment()
        } catch { failure = error.localizedDescription }
    }
}
