import SwiftUI

/// A miniature transcript workspace, rendered consistently at every card size.
struct AppearanceIllustration: View {
    let mode: String

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                workspace(dark: mode == "dark", size: geometry.size)
                if mode == "system" {
                    workspace(dark: true, size: geometry.size)
                        .mask(alignment: .trailing) {
                            Rectangle().frame(width: geometry.size.width / 2)
                        }
                    Rectangle().fill(.white.opacity(0.18)).frame(width: 1)
                }
            }
        }.accessibilityHidden(true)
    }

    private func workspace(dark: Bool, size: CGSize) -> some View {
        let ink = dark ? Color(white: 0.88) : Color(white: 0.2)
        let accent = dark ? Color(red: 0.66, green: 0.79, blue: 0.71) : Color(red: 0.30, green: 0.46, blue: 0.37)
        return ZStack {
            LinearGradient(colors: dark
                           ? [Color(red: 0.14, green: 0.20, blue: 0.18), Color(red: 0.06, green: 0.09, blue: 0.08)]
                           : [Color(red: 0.88, green: 0.93, blue: 0.89), Color(red: 0.96, green: 0.95, blue: 0.90)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            Circle().strokeBorder(ink.opacity(0.035), lineWidth: 28)
                .frame(width: size.width * 0.85).offset(x: size.width * 0.36, y: -size.height * 0.3)
            VStack(spacing: 0) {
                HStack(spacing: 5) {
                    ForEach(0..<3) { _ in Circle().fill(ink.opacity(0.18)).frame(width: 5, height: 5) }
                    Spacer()
                    Image(systemName: "sidebar.left").font(.system(size: 9)).foregroundStyle(ink.opacity(0.35))
                }.padding(11)
                Rectangle().fill(ink.opacity(0.07)).frame(height: 1)
                HStack(spacing: 0) {
                    VStack(alignment: .leading, spacing: 12) {
                        Image(systemName: "waveform").font(.system(size: 13, weight: .medium)).foregroundStyle(accent)
                        ForEach(0..<3) { index in
                            RoundedRectangle(cornerRadius: 3)
                                .fill(index == 0 ? accent.opacity(0.22) : ink.opacity(0.06))
                                .frame(height: 7)
                        }
                        Spacer(minLength: 0)
                    }.padding(10).frame(width: size.width * 0.18)
                        .background(ink.opacity(0.025))
                    VStack(alignment: .leading, spacing: 6) {
                        RoundedRectangle(cornerRadius: 2).fill(ink.opacity(0.65))
                            .frame(width: size.width * 0.23, height: 5)
                        HStack(spacing: 3) {
                            Image(systemName: "play.fill").font(.system(size: 7)).padding(.trailing, 4)
                            ForEach(0..<21) { index in
                                Capsule().frame(width: 2, height: CGFloat(4 + (index * 11 % 17)))
                            }
                        }.foregroundStyle(accent).frame(maxWidth: .infinity, minHeight: 28)
                            .background(accent.opacity(0.08), in: .rect(cornerRadius: 6))
                        ForEach(0..<3) { index in
                            HStack(alignment: .top, spacing: 7) {
                                Capsule().fill(accent.opacity(0.35)).frame(width: 13, height: 3)
                                VStack(alignment: .leading, spacing: 5) {
                                    Capsule().fill(ink.opacity(index == 1 ? 0.65 : 0.2)).frame(height: 3)
                                    Capsule().fill(ink.opacity(index == 1 ? 0.4 : 0.12))
                                        .frame(width: size.width * 0.25, height: 3)
                                }
                            }.padding(.vertical, 2)
                        }
                        Spacer(minLength: 0)
                    }.padding(12).frame(maxWidth: .infinity)
                }
            }
            .frame(width: size.width * 0.83, height: size.height * 0.83)
            .background(dark ? Color(red: 0.12, green: 0.15, blue: 0.14) : Color(white: 0.99), in: .rect(cornerRadius: 11))
            .clipShape(.rect(cornerRadius: 11))
            .overlay { RoundedRectangle(cornerRadius: 11).strokeBorder(ink.opacity(0.1), lineWidth: 0.5) }
        }
    }
}
