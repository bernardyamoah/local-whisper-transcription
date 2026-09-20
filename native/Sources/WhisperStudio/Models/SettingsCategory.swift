import SwiftUI

enum SettingsCategory: String, CaseIterable, Identifiable {
    case appearance, preferences, connections, destinations, models, storage, updates
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var icon: String {
        switch self {
        case .appearance: "circle.lefthalf.filled"
        case .preferences: "slider.horizontal.3"
        case .connections: "point.3.connected.trianglepath.dotted"
        case .destinations: "paperplane"
        case .models: "cpu"
        case .storage: "internaldrive"
        case .updates: "arrow.down.circle"
        }
    }
}
