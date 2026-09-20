import SwiftUI

enum StudioStyle {
    static let accent = Color(red: 0.36, green: 0.61, blue: 0.83)
    static let sage = Color(red: 0.48, green: 0.58, blue: 0.65)
    static let spacing = 20.0
    static let radius = 12.0
    static let spring = Animation.spring(response: 0.35, dampingFraction: 1)
    static func time(_ value: Double) -> String {
        let seconds = max(0, Int(value.isFinite ? value : 0))
        let minutes = seconds / 60
        return "\(minutes < 10 ? "0" : "")\(minutes):\(seconds % 60 < 10 ? "0" : "")\(seconds % 60)"
    }
}
