import SwiftUI

struct WorkspaceFindCommands: Commands {
    @FocusedValue(\.workspaceFind) private var actions
    var body: some Commands {
        CommandGroup(after: .textEditing) {
            Button("Find…") { actions?.find() }.keyboardShortcut("f").disabled(actions == nil)
            Button("Find Next") { actions?.next?() }.keyboardShortcut("g").disabled(actions?.next == nil)
            Button("Find Previous") { actions?.previous?() }.keyboardShortcut("g", modifiers: [.command, .shift]).disabled(actions?.previous == nil)
        }
    }
}
