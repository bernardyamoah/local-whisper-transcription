import Foundation

struct Bookmark: Codable, Identifiable, Sendable {
    var id: String
    var at: Double
    var kind: String
    var note: String
    var source: String
}
