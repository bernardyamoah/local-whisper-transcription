import SwiftUI

struct DestinationIllustration: View {
    let symbol: String
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12).fill(.primary.opacity(0.04))
                .frame(width: 52, height: 62).rotationEffect(.degrees(-14)).offset(x: -12, y: 2)
            VStack(spacing: 7) {
                PlatformIcon(name: symbol == "diamond" ? "obsidian" : symbol == "doc.text" ? "notion" : "webhook", size: 25)
                Capsule().fill(.primary.opacity(0.18)).frame(width: 22, height: 2)
                Capsule().fill(.primary.opacity(0.1)).frame(width: 15, height: 2)
            }.frame(width: 52, height: 62).studioGlass(radius: 12).rotationEffect(.degrees(7))
        }.frame(width: 86, height: 88).accessibilityHidden(true)
    }
}
