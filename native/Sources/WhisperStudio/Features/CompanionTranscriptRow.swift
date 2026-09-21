import SwiftUI

struct CompanionTranscriptRow: View {
    let line: LiveUtterance
    let active: Bool
    let staggerIndex: Int

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var entered = false

    var body: some View {
        StaggeredTranscriptLine(text: line.text, active: active)
            .foregroundStyle(active ? Color.primary : Color.secondary)
            .opacity(reduceMotion || entered ? 1 : 0)
            .blur(radius: reduceMotion || entered ? 0 : 3)
            .offset(y: reduceMotion || entered ? 0 : 7)
            .task(id: line.identity) {
                await enter()
            }
    }

    @MainActor
    private func enter() async {
        guard !reduceMotion else {
            entered = true
            return
        }
        do {
            try await Task.sleep(for: .milliseconds(staggerIndex * 60))
        } catch {
            return
        }
        guard !Task.isCancelled else { return }
        withAnimation(.timingCurve(0.23, 1, 0.32, 1, duration: 0.22)) {
            entered = true
        }
    }
}
