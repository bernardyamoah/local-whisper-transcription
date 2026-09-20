import SwiftUI

struct WorkspaceBackground: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast

    var body: some View {
        ZStack {
            if reduceTransparency || contrast == .increased {
                scheme == .dark ? Color(white: 0.075) : Color(white: 0.97)
            } else {
                DesktopBackdrop()
                (scheme == .dark ? Color.black.opacity(0.48) : Color.white.opacity(0.64))
                LinearGradient(colors: [.white.opacity(scheme == .dark ? 0.025 : 0.12), .clear],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
            }
        }
        .ignoresSafeArea().allowsHitTesting(false).accessibilityHidden(true)
    }
}
