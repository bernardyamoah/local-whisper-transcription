import Foundation

struct AppRelease: Codable, Equatable, Sendable {
    let version: String
    let downloadURL: URL
    let filename: String
    let sizeBytes: Int64
    let sha256: String?
    let publishedAt: Date?

    enum CodingKeys: String, CodingKey {
        case version
        case downloadURL = "download_url"
        case filename
        case sizeBytes = "size_bytes"
        case sha256
        case publishedAt = "published_at"
    }
}

enum AppUpdatePhase: Equatable {
    case idle
    case checking
    case current
    case available
    case downloading
    case ready(URL)
    case failed(String)
}
