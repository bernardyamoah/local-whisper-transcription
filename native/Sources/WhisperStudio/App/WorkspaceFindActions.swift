import SwiftUI

struct WorkspaceFindActions {
    let find: () -> Void
    var next: (() -> Void)?
    var previous: (() -> Void)?
}

extension FocusedValues {
    @Entry var workspaceFind: WorkspaceFindActions?
}
