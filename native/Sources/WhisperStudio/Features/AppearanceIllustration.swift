import SwiftUI

struct AppearanceIllustration: View {
    let mode: String
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                LinearGradient(colors: mode == "light" ? [Color(red: 0.93, green: 0.84, blue: 0.72), .white] : mode == "dark" ? [Color(red: 0.15, green: 0.17, blue: 0.22), .black] : [Color(red: 0.84, green: 0.74, blue: 0.64), Color(red: 0.17, green: 0.20, blue: 0.29)], startPoint: .topLeading, endPoint: .bottomTrailing)
                HStack(spacing: 0) {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 3) { ForEach(0..<3) { _ in Circle().fill(.gray.opacity(0.4)).frame(width: 4, height: 4) } }.padding(.bottom, 8)
                        ForEach(0..<4) { index in Capsule().fill(index == 0 ? StudioStyle.accent.opacity(0.4) : .gray.opacity(0.16)).frame(height: 4) }
                        Spacer()
                    }.padding(10).frame(width: geometry.size.width * 0.23).background(.gray.opacity(0.1))
                    VStack(alignment: .leading, spacing: 12) {
                        Capsule().fill(.gray.opacity(0.3)).frame(width: 48, height: 6)
                        HStack(spacing: 3) {
                            ForEach(0..<18) { index in Capsule().fill(StudioStyle.accent.opacity(0.65)).frame(width: 2, height: Double(8 + (index * 7 % 19))) }
                        }.frame(height: 28)
                        ForEach(0..<3) { index in Capsule().fill(.gray.opacity(0.15)).frame(width: max(12, geometry.size.width * (index == 2 ? 0.27 : 0.39)), height: 4) }
                    }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(width: geometry.size.width * 0.83, height: 112)
                .background(mode == "dark" ? Color(white: 0.16) : Color(white: 0.98), in: .rect(cornerRadius: 10))
                .clipShape(.rect(cornerRadius: 10))
                .rotationEffect(.degrees(-5))
            }.clipShape(.rect(cornerRadius: 12))
        }.accessibilityHidden(true)
    }
}
