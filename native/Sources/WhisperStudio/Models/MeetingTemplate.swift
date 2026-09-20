import Foundation

struct MeetingTemplate: Codable, Identifiable, Sendable {
    var id: String
    var name: String
    var description: String
    var bookmarks: [String]
}
