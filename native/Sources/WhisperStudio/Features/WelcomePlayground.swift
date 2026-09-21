import SwiftUI

struct WelcomePlayground: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var revealed = false
    @State private var hovering = false

    var body: some View {
        Button {
            withAnimation(reduceMotion ? nil : .spring(response: 0.45, dampingFraction: 0.8)) {
                revealed.toggle()
            }
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 24)
                    .fill(.primary.opacity(0.035))
                    .frame(width: 210, height: 140)
                    .rotationEffect(.degrees(revealed ? 7 : -9))
                    .offset(x: -20, y: 12)
                VStack(spacing: 18) {
                    HStack {
                        Image(systemName: revealed ? "text.alignleft" : "waveform")
                        Spacer()
                        Image(systemName: revealed ? "checkmark.circle.fill" : "play.circle")
                            .foregroundStyle(StudioStyle.accent)
                    }.font(.body)
                    ZStack {
                        if revealed {
                            Text("A thought worth keeping.")
                                .font(.title3.weight(.medium))
                                .multilineTextAlignment(.leading)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .transition(.opacity)
                        } else {
                            HStack(spacing: 5) {
                                ForEach(0..<23) { index in
                                    Capsule()
                                        .fill(StudioStyle.accent.opacity(index % 3 == 0 ? 1 : 0.65))
                                        .frame(width: 4, height: CGFloat([12, 20, 34, 24, 46, 30, 18][index % 7]))
                                }
                            }.transition(.opacity)
                        }
                    }.frame(height: 56)
                }
                .padding(22)
                .frame(width: 244, height: 158)
                .studioGlass(radius: 24, interactive: true)
                .rotationEffect(.degrees(reduceMotion ? 0 : revealed ? -3 : hovering ? 0 : 4))
                .offset(y: hovering && !reduceMotion ? -4 : 0)
            }
            .frame(width: 300, height: 210)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .animation(reduceMotion ? nil : StudioStyle.spring, value: hovering)
        .accessibilityLabel(revealed ? "Play sample again" : "Preview a transcription")
        .accessibilityValue(revealed ? "A thought worth keeping" : "Sample audio waveform")
        .help("Click to play with a sample")
    }
}
