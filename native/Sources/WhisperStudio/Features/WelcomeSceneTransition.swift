import SwiftUI

struct WelcomeSceneTransition: ViewModifier {
    var progress: CGFloat
    func body(content: Content) -> some View {
        content
            .opacity(1 - progress)
            .blur(radius: progress * 10)
            .scaleEffect(1 - progress * 0.025)
    }
}
