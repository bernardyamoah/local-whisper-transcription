import Foundation

struct MeetingAnalysis: Decodable, Sendable {
    var state: String
    var error: String?
    var busy: Bool { state == "queued" || state == "running" }
}
