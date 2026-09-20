import SwiftUI

/// A recording activity indicator, not a measured microphone level.
struct RecordingWave: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 24, paused: reduceMotion)) { timeline in
            Canvas { context, size in
                let t = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate
                for index in 0..<25 {
                    let x = Double(index)
                    let envelope = sin((x + 1) / 26 * .pi)
                    let height = 4 + envelope * (10 + 18 * abs(sin(t * 3 + x * 0.65)))
                    let rect = CGRect(x: x * size.width / 25, y: (size.height - height) / 2, width: 3, height: height)
                    context.fill(Path(roundedRect: rect, cornerRadius: 2), with: .color(.primary.opacity(0.65)))
                }
            }
        }.frame(width: 128, height: 34).accessibilityHidden(true)
    }
}
