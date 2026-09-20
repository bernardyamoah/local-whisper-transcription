import Testing
@testable import WhisperStudio

@MainActor struct LibrarySelectionTests {
    @Test func partialFailureKeepsOnlyFailedSelections() async {
        let selection = LibrarySelection()
        selection.selecting = true
        selection.selected = ["one", "two", "three"]
        selection.propose(["one", "two"])
        await selection.delete { id in
            if id == "two" { throw StudioFailure(message: "Unavailable") }
        }
        #expect(selection.selected == ["two", "three"])
        #expect(selection.pending == ["two"])
        #expect(selection.failure != nil)
        #expect(!selection.deleting)
        await selection.delete { _ in }
        #expect(selection.selected == ["three"])
        #expect(selection.pending.isEmpty)
        #expect(selection.failure == nil)
    }
    @Test func deletionUsesConfirmedSnapshot() async {
        let selection = LibrarySelection()
        selection.selected = ["one", "two"]
        selection.propose(["one"])
        selection.selected.insert("three")
        var deleted: [String] = []
        await selection.delete { deleted.append($0) }
        #expect(deleted == ["one"])
        #expect(selection.selected == ["two", "three"])
    }
}
