import Foundation

struct LiveUtterance: Decodable, Sendable {
    var source: String
    var start: Double
    var end: Double
    var text: String
    var final: Bool
}
