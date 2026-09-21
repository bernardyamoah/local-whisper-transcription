import SwiftUI

struct WorkspaceBackground: View {
    var body: some View {
        Color(nsColor: .windowBackgroundColor)
        .ignoresSafeArea().allowsHitTesting(false).accessibilityHidden(true)
    }
}
