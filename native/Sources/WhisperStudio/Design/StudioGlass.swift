import SwiftUI

struct StudioGlass: ViewModifier {
    var radius: CGFloat = 20
    var interactive = false

    @ViewBuilder
    func body(content: Content) -> some View {
        if interactive {
            content.glassEffect(.regular.interactive(), in: .rect(cornerRadius: radius))
        } else {
            content.glassEffect(.regular, in: .rect(cornerRadius: radius))
        }
    }
}

struct StudioGlassGroup<Content: View>: View {
    var spacing: CGFloat = 12
    @ViewBuilder let content: Content

    var body: some View {
        GlassEffectContainer(spacing: spacing) { content }
    }
}

extension View {
    @ViewBuilder
    func studioButton(_ kind: StudioButtonKind = .secondary) -> some View {
        switch kind {
        case .primary:
            buttonStyle(.glassProminent)
                .buttonBorderShape(.capsule)
                .tint(StudioStyle.accent)
        case .secondary:
            buttonStyle(.glass)
                .buttonBorderShape(.capsule)
                .tint(Color.primary)
                .foregroundStyle(.primary)
        case .ghost:
            buttonStyle(.plain)
                .foregroundStyle(.primary)
        case .destructive:
            buttonStyle(.glassProminent)
                .buttonBorderShape(.capsule)
                .tint(.red)
        }
    }

    /// Gives freestanding icon actions the same interactive material as text actions.
    /// Keep borderless buttons inside system toolbars, where macOS supplies the glass container.
    @ViewBuilder
    func studioIconButton(_ kind: StudioButtonKind = .secondary) -> some View {
        switch kind {
        case .primary:
            buttonStyle(.glassProminent)
                .buttonBorderShape(.circle)
                .tint(StudioStyle.accent)
        case .secondary:
            buttonStyle(.glass)
                .buttonBorderShape(.circle)
                .tint(Color.primary)
                .foregroundStyle(.primary)
        case .ghost:
            buttonStyle(.plain)
                .foregroundStyle(.primary)
        case .destructive:
            buttonStyle(.glassProminent)
                .buttonBorderShape(.circle)
                .tint(.red)
        }
    }

    /// Menu-style pickers do not inherit the app's button style consistently on macOS.
    func studioMenuControl() -> some View {
        buttonStyle(.glass)
            .buttonBorderShape(.capsule)
            .tint(Color.primary)
            .foregroundStyle(.primary)
    }

    func studioGlass(radius: CGFloat = 20, interactive: Bool = false) -> some View {
        modifier(StudioGlass(radius: radius, interactive: interactive))
    }
}
