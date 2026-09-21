import SwiftUI

struct CompanionOrb: View {
    var active = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: !active || reduceMotion)) { timeline in
            let t = active && !reduceMotion ? timeline.date.timeIntervalSinceReferenceDate : 0
            GeometryReader { geometry in
                let side = min(geometry.size.width, geometry.size.height)
                ZStack {
                    Circle().fill(.white.opacity(0.025))
                    ZStack {
                        Circle().glassEffect(.regular, in: .circle)
                        Ellipse().fill(Color(red: 0.52, green: 0.62, blue: 0.70)).frame(width: side * 0.85, height: side * 0.55)
                            .offset(x: side * 0.12 * sin(t * 1.1), y: -side * 0.16).blur(radius: side * 0.13)
                        Ellipse().fill(Color(white: scheme == .dark ? 0.24 : 0.64)).frame(width: side * 0.8, height: side * 0.6)
                            .offset(x: side * 0.15 * cos(t * 0.9), y: side * 0.26).blur(radius: side * 0.14)
                        Circle().fill(.white.opacity(0.75)).frame(width: side * 0.4).blur(radius: side * 0.13)
                            .offset(x: -side * 0.17, y: -side * 0.23)
                        Circle().strokeBorder(LinearGradient(colors: [.white.opacity(0.85), .white.opacity(0.05), .white.opacity(0.4)], startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1.3)
                        Ellipse().fill(.white.opacity(0.5)).frame(width: side * 0.32, height: side * 0.07)
                            .blur(radius: side * 0.035).rotationEffect(.degrees(-35)).offset(x: -side * 0.2, y: -side * 0.25)
                    }.clipShape(.circle).rotationEffect(.degrees(active ? sin(t * 0.7) * 12 : -12))
                        .scaleEffect(active ? 0.94 + sin(t * 1.8) * 0.035 : 0.94)

                }.padding(side * 0.12)
            }
        }.accessibilityHidden(true)
    }
}
