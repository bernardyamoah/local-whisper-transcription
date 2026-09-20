import SwiftUI

extension EnvironmentValues {
    @Entry var plainSettingsSurfaces = false
}

struct StudioGlass: ViewModifier {
    @Environment(\.plainSettingsSurfaces) private var plainSettingsSurfaces
    var radius: CGFloat = 20
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast

    func body(content: Content) -> some View {
        Group {
            if plainSettingsSurfaces {
                content.background(Color(nsColor: .controlBackgroundColor), in: .rect(cornerRadius: radius))
                    .overlay { RoundedRectangle(cornerRadius: radius).strokeBorder(.primary.opacity(contrast == .increased ? 0.25 : 0.06)) }
            } else if reduceTransparency || contrast == .increased {
                content.background(.background, in: .rect(cornerRadius: radius))
                    .overlay { RoundedRectangle(cornerRadius: radius).strokeBorder(.primary.opacity(0.25)) }
            } else if #available(macOS 26, *) {
                content.glassEffect(.regular.tint(scheme == .dark ? .black.opacity(0.22) : .white.opacity(0.12)), in: .rect(cornerRadius: radius))
            } else {
                content.background(.ultraThinMaterial, in: .rect(cornerRadius: radius))
                    .overlay { RoundedRectangle(cornerRadius: radius).strokeBorder(.white.opacity(0.2)) }
            }
        }

    }
}

extension View {
    @ViewBuilder
    func studioButton(prominent: Bool = false) -> some View {
        buttonStyle(StudioButtonStyle(prominent: prominent))
    }

    func studioGlass(radius: CGFloat = 20) -> some View { modifier(StudioGlass(radius: radius)) }
}
