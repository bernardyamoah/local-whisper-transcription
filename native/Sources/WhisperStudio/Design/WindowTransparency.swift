import SwiftUI
import AppKit

/// SwiftUI owns the content; AppKit clears the host window for the desktop-backed workspace.
struct WindowTransparency: NSViewRepresentable {
    let enabled: Bool
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    func makeNSView(context: Context) -> TransparentWindowAnchor { TransparentWindowAnchor() }
    func updateNSView(_ view: TransparentWindowAnchor, context: Context) {
        view.transparent = enabled && !reduceTransparency
        view.apply()
    }
}
