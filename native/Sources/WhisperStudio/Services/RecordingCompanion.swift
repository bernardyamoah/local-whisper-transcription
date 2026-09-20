import SwiftUI
import Carbon

@MainActor
final class RecordingCompanion {
    private var panel: NSPanel?
    private weak var mainWindow: NSWindow?
    private weak var store: StudioStore?
    private var hotKey: EventHotKeyRef?
    private var handler: EventHandlerRef?

    func connect(_ store: StudioStore) {
        guard self.store == nil else { return }
        self.store = store
        var event = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let context = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(GetApplicationEventTarget(), { _, _, context in
            guard let context else { return OSStatus(eventNotHandledErr) }
            MainActor.assumeIsolated {
                Unmanaged<RecordingCompanion>.fromOpaque(context).takeUnretainedValue().toggle()
            }
            return noErr
        }, 1, &event, context, &handler)
        let status = RegisterEventHotKey(UInt32(kVK_ANSI_R), UInt32(cmdKey | shiftKey),
                                        EventHotKeyID(signature: 0x57535052, id: 1),
                                        GetApplicationEventTarget(), 0, &hotKey)
        if status != noErr { store.notice = "Recording shortcut is unavailable. Use the Recording menu." }
    }

    func toggle() {
        guard let store, store.api != nil, !store.busy, !store.showOnboarding else { return }
        Task { if store.recording.active { await store.stopRecording() } else { await store.startRecording() } }
    }

    func show() {
        guard let store else { return }
        mainWindow = NSApp.windows.first { !($0 is NSPanel) && $0.isVisible }
        if panel == nil {
            let window = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 350, height: 154),
                                 styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
            window.level = .floating
            window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            window.isOpaque = false
            window.backgroundColor = .clear
            window.hasShadow = false
            window.isMovableByWindowBackground = true
            window.hidesOnDeactivate = false
            window.contentView = NSHostingView(rootView: RecordingCompanionView(open: { [weak self] in self?.open() })
                .environment(store))
            if let screen = mainWindow?.screen ?? NSScreen.main {
                let frame = screen.visibleFrame
                window.setFrameOrigin(NSPoint(x: frame.maxX - 370, y: frame.minY + 24))
            }
            panel = window
        }
        panel?.orderFrontRegardless()
        mainWindow?.miniaturize(nil)
    }

    func open() {
        mainWindow?.deminiaturize(nil)
        mainWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        panel?.orderOut(nil)
    }
}
