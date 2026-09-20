import Foundation

enum TranscriptSearch {
    static func matches(_ segments: [TranscriptSegment], query: String) -> [Int] {
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
        return segments.filter { $0.text.localizedStandardContains(query) }.map(\.id)
    }
    static func nextIndex(current: Int, direction: Int, count: Int) -> Int {
        guard count > 0 else { return 0 }
        return (current + direction + count) % count
    }
    static func active(_ segments: [TranscriptSegment], at time: Double) -> Int? {
        segments.last(where: { $0.start <= time && time < $0.end })?.id
    }
}
