import SwiftUI

struct CompanionTranscript: View {
    let utterances: [LiveUtterance]
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 13) {
                    ForEach(Array(utterances.enumerated()), id: \.element.identity) { index, line in
                        CompanionTranscriptRow(
                            line: line,
                            active: line.identity == utterances.last?.identity,
                            staggerIndex: index
                        )
                    }
                    Color.clear.frame(height: 1).id("latest")
                }
                .font(.system(size: 20, weight: .medium)).tracking(-0.3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 4)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(utterances.map(\.text).joined(separator: " "))
                .animation(
                    reduceMotion ? nil : .timingCurve(0.23, 1, 0.32, 1, duration: 0.22),
                    value: utterances.map(\.identity)
                )
            }
            .scrollIndicators(.hidden)
            .mask {
                VStack(spacing: 0) {
                    LinearGradient(colors: [.clear, .black], startPoint: .top, endPoint: .bottom).frame(height: 6)
                    Rectangle()
                }
            }
            .onChange(of: utterances.last?.text) {
                withAnimation(reduceMotion ? nil : .timingCurve(0.23, 1, 0.32, 1, duration: 0.22)) {
                    proxy.scrollTo("latest", anchor: .bottom)
                }
            }
            .onAppear { proxy.scrollTo("latest", anchor: .bottom) }
        }
    }
}
