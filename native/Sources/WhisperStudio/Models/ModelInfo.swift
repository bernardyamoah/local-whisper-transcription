import Foundation

struct ModelInfo: Decodable, Identifiable, Sendable {
    var id: String
    var name: String
    var estimate: String
    var installed: Bool
    var downloading: Bool
    var phase: String
    var progress: Double?
    var error: String?
}
