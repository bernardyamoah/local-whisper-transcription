import Foundation

struct ExportDestinations: Decodable, Sendable {
    var obsidianVault: String
    var obsidianFolder: String
    var notionParentId: String
    var notionConnected: Bool
    var webhookUrl: String
    var webhookConnected: Bool
}
