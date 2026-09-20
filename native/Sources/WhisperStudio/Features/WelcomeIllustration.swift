import SwiftUI

struct WelcomeIllustration: View {
    let step: Int
    var body: some View {
        ZStack {
            CompanionOrb(active: true).frame(width: 180, height: 180)
            if step > 0 {
                Image(systemName: step == 1 ? "lock.shield" : "sparkles")
                    .font(.system(size: 32, weight: .light)).foregroundStyle(.white)
            }
        }.accessibilityHidden(true)
    }
}
