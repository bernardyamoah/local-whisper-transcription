import SwiftUI

struct RevealingWord: View {
    let word: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var visible = false
    var body: some View {
        Text(word).fixedSize()
            .opacity(visible ? 1 : 0.25)
            .blur(radius: visible || reduceMotion ? 0 : 4)
            .onAppear { withAnimation(.easeOut(duration: reduceMotion ? 0.1 : 0.28)) { visible = true } }
    }
}
