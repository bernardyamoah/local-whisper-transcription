import Foundation

struct RecordingState: Decodable, Sendable {
    var state: String
    var id: String?
    var name: String?
    var elapsed: Double?
    var template: String?
    var liveTranscript: [LiveUtterance]?
    var liveError: String?
    var bookmarks: [Bookmark]?
    var active: Bool { state == "recording" }
}
