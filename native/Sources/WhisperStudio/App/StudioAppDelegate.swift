import SwiftUI

@MainActor
final class StudioAppDelegate: NSObject, NSApplicationDelegate {
    var store: StudioStore?
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if store?.recording.active == true || store?.busy == true {
            let alert = NSAlert()
            alert.messageText = "A recording or import is still in progress"
            alert.informativeText = "Finish it before quitting Whisper Studio."
            alert.addButton(withTitle: "Keep Open")
            alert.runModal()
            return .terminateCancel
        }
        store?.engine.stop()
        return .terminateNow
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
}
