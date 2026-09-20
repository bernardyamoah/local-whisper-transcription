import Foundation

struct MeetingNotes: Decodable, Sendable {
    var summary: String
    var chapters: [Chapter]
    var topics: [String]
}
