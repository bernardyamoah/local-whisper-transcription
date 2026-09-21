import SwiftUI

struct StaggeredTranscriptLine: View {
    let text: String
    let active: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var revealedWordCount = 0

    private var words: [String] {
        text.split(whereSeparator: \.isWhitespace).map(String.init)
    }

    var body: some View {
        WordFlowLayout(spacing: 5) {
            ForEach(words.indices, id: \.self) { index in
                Text(words[index])
                    .fixedSize()
                    .opacity(isRevealed(index) ? 1 : 0)
                    .blur(radius: isRevealed(index) || reduceMotion ? 0 : 4)
            }
        }
        .task(id: "\(active)-\(words.count)") {
            await revealWords()
        }
    }

    private func isRevealed(_ index: Int) -> Bool {
        reduceMotion || !active || index < revealedWordCount
    }

    @MainActor
    private func revealWords() async {
        let target = words.count
        if revealedWordCount > target {
            revealedWordCount = target
        }
        guard active, !reduceMotion else {
            revealedWordCount = target
            return
        }
        while revealedWordCount < target {
            do {
                try await Task.sleep(for: .milliseconds(45))
            } catch {
                return
            }
            guard !Task.isCancelled else { return }
            withAnimation(.timingCurve(0.23, 1, 0.32, 1, duration: 0.2)) {
                revealedWordCount += 1
            }
        }
    }
}
