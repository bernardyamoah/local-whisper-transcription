import Foundation

struct JobPage: Decodable, Sendable {
    var items: [JobSummary]
    var total: Int
}
