import SwiftUI

struct StudioButtonStyle: ButtonStyle {
    var prominent = false
    @Environment(\.colorScheme) private var scheme
    @Environment(\.controlSize) private var size
    @Environment(\.isEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .lineLimit(1)
            .padding(.horizontal, 14)
            .frame(height: size == .large || size == .extraLarge ? 38 : 32)
            .foregroundStyle(prominent ? (scheme == .dark ? Color.black : .white) : Color.primary)
            .background {
                if prominent {
                    RoundedRectangle(cornerRadius: 10).fill(scheme == .dark ? Color.white.opacity(0.94) : Color(white: 0.13))
                } else {
                    RoundedRectangle(cornerRadius: 10).fill(.primary.opacity(0.055))
                }
            }
            .overlay {
                RoundedRectangle(cornerRadius: 10).strokeBorder(.primary.opacity(prominent ? 0 : 0.14))
            }
            .contentShape(.rect(cornerRadius: 10))
            .opacity(enabled ? (configuration.isPressed ? 0.72 : 1) : 0.4)
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
            .animation(reduceMotion ? nil : .spring(response: 0.22, dampingFraction: 1), value: configuration.isPressed)
    }
}
