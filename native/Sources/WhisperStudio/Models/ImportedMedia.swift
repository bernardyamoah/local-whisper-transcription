import Foundation

struct ImportedMedia: Decodable, Identifiable, Sendable {
    var id: String
    var name: String
    var duration: Double
    var size: Double
}
