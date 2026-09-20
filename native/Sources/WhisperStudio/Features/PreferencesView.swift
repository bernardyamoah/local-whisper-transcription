import SwiftUI

struct PreferencesView: View {
    @Environment(StudioStore.self) private var store
    @State private var draft = Preferences()
    @State private var saving = false
    @State private var failure: String?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Transcription", systemImage: "waveform").font(.headline)
                    Surface {
                        VStack(spacing: 16) {
                            SettingsRow(title: "Default provider") { Picker("Default provider", selection: $draft.transcriptionProvider) {
                                Text("On this Mac").tag("local"); Text("Deepgram").tag("deepgram")
                            } }
                            Divider().opacity(0.4)
                            SettingsRow(title: "Quality") { Picker("Quality", selection: $draft.preset) {
                                Text("Quick").tag("fast"); Text("Balanced").tag("balanced"); Text("Precise").tag("accurate")
                            } }
                            Divider().opacity(0.4)
                            SettingsRow(title: "Language") { Picker("Language", selection: $draft.language) {
                                Text("Detect automatically").tag("auto")
                                ForEach(store.environment?.languages ?? [], id: \.self) { code in
                                    Text(Locale.current.localizedString(forLanguageCode: code) ?? code).tag(code)
                                }
                            } }
                            Divider().opacity(0.4)
                            SettingsRow(title: "Hardware") { Picker("Hardware", selection: $draft.hardware) { Text("Automatic").tag("auto"); Text("Apple Silicon").tag("apple") } }
                        }.pickerStyle(.menu)
                    }
                }
                VStack(alignment: .leading, spacing: 12) {
                    Label("Recordings", systemImage: "mic").font(.headline)
                    Surface {
                        VStack(spacing: 16) {
                            SettingsRow(title: "Keep original files") { Toggle("Keep original files", isOn: $draft.retainSource).toggleStyle(.switch) }
                            Divider().opacity(0.4)
                            SettingsRow(title: "Maximum duration") {
                                HStack { Text("\(Int(draft.maxDurationHours)) hours").monospacedDigit(); Stepper("Hours", value: $draft.maxDurationHours, in: 1...24) }
                            }
                            Divider().opacity(0.4)
                            SettingsRow(title: "Titles from transcript") { Text("On device").foregroundStyle(.secondary) }
                        }
                    }
                }
                HStack {
                    Button("Replay welcome", systemImage: "play.circle") { store.showOnboarding = true }.studioButton()
                    Spacer()
                    if saving { ProgressView().controlSize(.small) }
                    Button("Save changes") { Task { await save() } }.studioButton(prominent: true)
                        .disabled(saving || draft == store.preferences)
                }
                if let failure { Text(failure).font(.callout).foregroundStyle(.red) }
            }.padding(2).controlSize(.regular)
        }.onAppear { draft = store.preferences }
    }
    private func save() async {
        guard let api = store.api else { return }
        saving = true; failure = nil
        defer { saving = false }
        do {
            let encoder = JSONEncoder(); encoder.keyEncodingStrategy = .convertToSnakeCase
            let body = try JSONSerialization.jsonObject(with: encoder.encode(draft)) as? [String: Any] ?? [:]
            let saved: Preferences = try await api.request("settings", method: "PUT", body: body)
            store.preferences = saved; draft = saved; store.notice = "Preferences saved"
        } catch { failure = error.localizedDescription }
    }
}
