import SwiftUI

/// A voice-shaped signature, drawn live rather than a generic icon or looping movie.
struct VoiceRibbon: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var active = true
    var compact = false
    @State private var pointer = CGPoint(x: 0.5, y: 0.5)
    @State private var touching = false
    @State private var origin = Date()

    var body: some View {
        GeometryReader { geometry in
            TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion || !active)) { timeline in
                let time = reduceMotion || !active ? 0 : timeline.date.timeIntervalSince(origin)
                Canvas { context, size in
                    let center = size.height * 0.5
                    let amplitude = size.height * (compact ? 0.22 : 0.32)
                    for strand in 0..<32 {
                        let depth = Double(strand) / 31
                        var path = Path()
                        for point in 0...180 {
                            let x = Double(point) / 180
                            let envelope = pow(sin(x * .pi), 2.2)
                            let focus = exp(-pow((x - pointer.x) * 5, 2)) * (touching ? 0.7 : 0.12)
                            let wave = sin(x * 12 + time * 1.4 + depth * 2.5)
                            let harmonic = cos(x * 19 - time * 0.8 + depth * 4) * 0.3
                            let y = center + (wave + harmonic) * amplitude * envelope * (0.3 + depth * 0.7 + focus)
                            let position = CGPoint(x: x * size.width, y: y + (depth - 0.5) * 30 * envelope)
                            if point == 0 { path.move(to: position) } else { path.addLine(to: position) }
                        }
                        context.stroke(path, with: .linearGradient(
                            Gradient(colors: [.white.opacity(0.04), Color(red: 0.68, green: 0.8, blue: 0.91).opacity(0.3 + depth * 0.35), .white.opacity(0.85), .white.opacity(0.03)]),
                            startPoint: .zero, endPoint: CGPoint(x: size.width, y: size.height)), lineWidth: 0.6 + depth * 0.6)
                    }
                }
            }
            .onContinuousHover { phase in
                switch phase {
                case .active(let point): pointer = CGPoint(x: point.x / geometry.size.width, y: point.y / geometry.size.height); touching = true
                case .ended: touching = false
                }
            }
        }.accessibilityHidden(true)
    }
}
