import SwiftUI

struct RecordingIllustration: View {
    var searching = false
    var highlighted = false
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Canvas { context, size in
            let scale = min(size.width / 360, size.height / 230)
            context.translateBy(x: (size.width - 360 * scale) / 2, y: (size.height - 230 * scale) / 2)
            context.scaleBy(x: scale, y: scale)
            let dark = scheme == .dark
            let ink = dark ? Color.white : Color(white: 0.18)
            let paper = dark ? Color(white: 0.19) : Color(white: 0.99)
            let silver = dark ? Color(white: 0.35) : Color(white: 0.83)
            let accent = Color(red: 0.42, green: 0.62, blue: 0.72)

            // A continuous magnetic ribbon becomes lines on the transcript.
            var ribbon = Path()
            ribbon.move(to: CGPoint(x: 68, y: 155))
            ribbon.addCurve(to: CGPoint(x: 224, y: 179), control1: CGPoint(x: 46, y: 230), control2: CGPoint(x: 145, y: 236))
            ribbon.addCurve(to: CGPoint(x: 272, y: 112), control1: CGPoint(x: 274, y: 115), control2: CGPoint(x: 218, y: 75))
            context.stroke(ribbon, with: .linearGradient(Gradient(colors: [silver, accent, ink.opacity(0.4)]), startPoint: CGPoint(x: 50, y: 180), endPoint: CGPoint(x: 270, y: 100)), style: StrokeStyle(lineWidth: 8, lineCap: .round))
            context.stroke(ribbon, with: .color(.white.opacity(0.35)), lineWidth: 1)

            var sheet = context
            sheet.translateBy(x: 215, y: 22)
            sheet.rotate(by: .degrees(8))
            let page = Path(roundedRect: CGRect(x: 0, y: 0, width: 115, height: 153), cornerRadius: 9)
            sheet.fill(page, with: .linearGradient(Gradient(colors: [paper, dark ? Color(white: 0.13) : Color(white: 0.92)]), startPoint: .zero, endPoint: CGPoint(x: 115, y: 153)))
            sheet.stroke(page, with: .color(ink.opacity(0.12)), lineWidth: 1)
            for row in 0..<6 {
                let width: CGFloat = [61, 77, 68, 44, 74, 56][row]
                let line = Path(roundedRect: CGRect(x: 18, y: 44 + CGFloat(row) * 14, width: width, height: 3), cornerRadius: 1.5)
                sheet.fill(line, with: .color(row == 2 ? accent : ink.opacity(0.13)))
            }
            sheet.fill(Path(roundedRect: CGRect(x: 18, y: 22, width: 32, height: 5), cornerRadius: 2), with: .color(accent.opacity(0.8)))

            let center = CGPoint(x: 114, y: 104)
            let outer = CGRect(x: 38, y: 28, width: 152, height: 152)
            context.fill(Path(ellipseIn: outer), with: .linearGradient(Gradient(colors: [paper, silver, paper]), startPoint: CGPoint(x: 40, y: 28), endPoint: CGPoint(x: 190, y: 180)))
            context.stroke(Path(ellipseIn: outer), with: .color(ink.opacity(0.16)), lineWidth: 1)
            for ring in 0..<12 {
                let radius = CGFloat(64 - ring * 2)
                context.stroke(Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)), with: .color(ink.opacity(0.035)), lineWidth: 0.7)
            }
            for spoke in 0..<3 {
                var arm = context
                arm.translateBy(x: center.x, y: center.y)
                arm.rotate(by: .degrees(Double(spoke) * 120 - 24))
                let hole = Path(roundedRect: CGRect(x: -12, y: -57, width: 24, height: 34), cornerRadius: 12)
                arm.fill(hole, with: .linearGradient(Gradient(colors: [ink.opacity(0.65), ink.opacity(0.38)]), startPoint: CGPoint(x: 0, y: -57), endPoint: CGPoint(x: 0, y: -23)))
                arm.stroke(hole, with: .color(.white.opacity(0.4)), lineWidth: 1)
            }
            context.fill(Path(ellipseIn: CGRect(x: 97, y: 87, width: 34, height: 34)), with: .color(paper))
            context.stroke(Path(ellipseIn: CGRect(x: 97, y: 87, width: 34, height: 34)), with: .color(ink.opacity(0.2)), lineWidth: 1)
            context.fill(Path(ellipseIn: CGRect(x: 108, y: 98, width: 12, height: 12)), with: .color(accent))

            if searching {
                let lens = CGRect(x: 246, y: 126, width: 56, height: 56)
                context.fill(Path(ellipseIn: lens), with: .color(accent.opacity(0.14)))
                context.stroke(Path(ellipseIn: lens), with: .color(ink.opacity(0.65)), lineWidth: 4)
                var handle = Path(); handle.move(to: CGPoint(x: 294, y: 175)); handle.addLine(to: CGPoint(x: 314, y: 197))
                context.stroke(handle, with: .color(ink.opacity(0.65)), style: StrokeStyle(lineWidth: 7, lineCap: .round))
            }
        }
        .frame(width: 340, height: 218)
        .scaleEffect(highlighted && !reduceMotion ? 1.04 : 1)
        .animation(reduceMotion ? nil : StudioStyle.spring, value: highlighted)
        .accessibilityHidden(true)
    }
}
