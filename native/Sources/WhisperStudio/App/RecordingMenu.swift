import SwiftUI

struct RecordingMenu: View {
    @Environment(StudioStore.self) private var store
    @Environment(\.openWindow) private var openWindow
    var body: some View {
        Button("Open Whisper Studio") { openWindow(id: "studio"); NSApp.activate(ignoringOtherApps: true) }
        Divider()
        if store.recording.active {
            Text("Recording · \(StudioStyle.time(store.recording.elapsed ?? 0))")
            Button("Stop Recording") { Task { await store.stopRecording(); openWindow(id: "studio") } }.disabled(store.busy)
        } else {
            Button("Record Meeting") { Task { await store.startRecording() } }.disabled(store.api == nil || store.busy)
        }
        Divider()
        Button("Quit Whisper Studio") { NSApp.terminate(nil) }.keyboardShortcut("q")
    }
}
