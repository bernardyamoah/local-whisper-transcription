import SwiftUI

@main
struct WhisperStudioApp: App {
    @NSApplicationDelegateAdaptor(StudioAppDelegate.self) private var delegate
    @State private var store = StudioStore()

    var body: some Scene {
        Window("Whisper Studio", id: "studio") {
            StudioRootView()
                .environment(store)
                .preferredColorScheme(store.showOnboarding ? .dark : store.scheme)
                .containerBackground(.clear, for: .window)
                .background { WindowTransparency(enabled: store.showOnboarding) }
                .tint(StudioStyle.accent)
                .frame(minWidth: 900, minHeight: 660)
                .task {
                    delegate.store = store
                    await store.start()
                    await store.monitor()
                }
        }
        .defaultSize(width: 1180, height: 800)
        .windowStyle(.hiddenTitleBar)
        .windowToolbarStyle(.unified)
        .commands {
            SidebarCommands()
            WorkspaceFindCommands()
            CommandGroup(replacing: .newItem) {
                Button("New Transcription") { store.route = .capture }.keyboardShortcut("n")
                Button("Import Recording…") {
                    if store.showOnboarding { Task { await store.completeWelcome(importRecording: true) } }
                    else { store.showImporter = true }
                }.keyboardShortcut("o")
            }
            CommandGroup(replacing: .appSettings) {
                Button("Settings…") { store.route = .settings }.keyboardShortcut(",")
            }
            CommandGroup(after: .appInfo) {
                Button("Check for Updates…") {
                    store.route = .settings
                    Task { await store.updates.check(manual: true) }
                }
            }
            CommandMenu("Recording") {
                Button(store.recording.active ? "Stop Recording" : "Record Meeting") {
                    Task { if store.recording.active { await store.stopRecording() } else { await store.startRecording() } }
                }.keyboardShortcut("r", modifiers: [.command, .shift]).disabled(store.busy)
            }
        }
        MenuBarExtra("Whisper Studio", systemImage: store.recording.active ? "record.circle.fill" : "waveform") {
            RecordingMenu().environment(store)
        }
    }
}
