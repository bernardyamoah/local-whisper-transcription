import Foundation

struct TranscriptSegment: Codable, Identifiable, Equatable, Sendable {
    var id: Int
    var start: Double
    var end: Double
    var text: String
    var speaker: Int?
    var speakerName: String?
}
