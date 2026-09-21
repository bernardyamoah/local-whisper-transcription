import SwiftUI

/// Responds to transcript arrivals, not an estimated microphone level.
struct CompanionSpeechPulse: View {
    let active: Bool
    let speaking: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if active {
                HStack(spacing: 3) {
                    ForEach(0..<5) { index in
                        Capsule().frame(width: 2, height: speaking ? CGFloat([8, 16, 22, 13, 7][index]) : 4)
                    }
                }
                .foregroundStyle(.primary.opacity(0.75))
                .animation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.85), value: speaking)
            } else {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(StudioStyle.accent)
            }
        }.frame(width: 24, height: 26).accessibilityHidden(true)
    }
}
