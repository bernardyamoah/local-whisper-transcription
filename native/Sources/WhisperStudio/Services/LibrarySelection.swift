import Foundation
import Observation

@MainActor @Observable
final class LibrarySelection {
    var selecting = false
    var selected: Set<String> = []
    var pending: Set<String> = []
    var confirming = false
    private(set) var deleting = false
    private(set) var failure: String?

    func toggle(_ id: String) {
        if selected.contains(id) { selected.remove(id) } else { selected.insert(id) }
    }

    func propose(_ ids: Set<String>) {
        guard !ids.isEmpty, !deleting else { return }
        pending = ids
        confirming = true
    }

    func delete(using operation: (String) async throws -> Void) async {
        guard !deleting, !pending.isEmpty else { return }
        deleting = true
        failure = nil
        let ids = pending
        var failed: Set<String> = []
        for id in ids.sorted() {
            do { try await operation(id); selected.remove(id) }
            catch { failed.insert(id); failure = error.localizedDescription }
        }
        pending = failed
        if !failed.isEmpty { failure = "\(failed.count) could not be deleted. \(failure ?? "Try again.")" }
        deleting = false
        if selected.isEmpty { selecting = false }
    }
}
