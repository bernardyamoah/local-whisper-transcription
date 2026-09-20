import SwiftUI

struct CompanionTransition: Transition {
    var reduceMotion: Bool
    func body(content: Content, phase: TransitionPhase) -> some View {
        content
            .blur(radius: reduceMotion || phase.isIdentity ? 0 : 8)
            .opacity(phase.isIdentity ? 1 : 0)
    }
}
