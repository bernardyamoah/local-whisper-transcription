import SwiftUI

struct CaptureOptions: View {
    @Environment(StudioStore.self) private var store
    var body: some View {
        @Bindable var store = store
        StudioGlassGroup(spacing: 12) {
            Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 16) {
                GridRow {
                    Picker("Transcription", selection: $store.preferences.transcriptionProvider) {
                        Text("On this Mac").tag("local"); Text("Deepgram").tag("deepgram")
                    }.studioMenuControl()
                    Picker("Language", selection: $store.preferences.language) {
                        Text("Detect automatically").tag("auto")
                        ForEach(store.environment?.languages ?? [], id: \.self) { code in Text(Locale.current.localizedString(forLanguageCode: code) ?? code).tag(code) }
                    }.studioMenuControl()
                }
                GridRow {
                    Picker("Template", selection: $store.template) {
                        ForEach(store.environment?.meetingTemplates ?? []) { item in Text(item.name).tag(item.id) }
                    }.studioMenuControl()
                    Picker("Quality", selection: $store.preferences.preset) {
                        Text("Quick").tag("fast"); Text("Balanced").tag("balanced"); Text("Precise").tag("accurate")
                    }.studioMenuControl().disabled(store.preferences.transcriptionProvider != "local")
                }
                GridRow {
                    TextField("Meeting name", text: $store.recordingName).textFieldStyle(.roundedBorder).gridCellColumns(2)
                }
            }
        }
    }
}
