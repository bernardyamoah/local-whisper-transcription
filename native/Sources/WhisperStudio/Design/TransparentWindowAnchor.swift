import AppKit

@MainActor final class TransparentWindowAnchor: NSView {
    var transparent = false
    override func viewDidMoveToWindow() { super.viewDidMoveToWindow(); apply() }
    func apply() {
        guard let window else { return }
        window.isOpaque = !transparent
        window.backgroundColor = transparent ? .clear : .windowBackgroundColor
        window.hasShadow = !transparent
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = transparent
        window.invalidateShadow()
    }
}
