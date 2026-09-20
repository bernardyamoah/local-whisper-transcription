import SwiftUI

struct StudioSidebar: View {
    @Environment(StudioStore.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Image(systemName: "waveform").font(.title3.weight(.medium))
                Text("Whisper").font(.headline)
            }.padding(.horizontal, 12).padding(.top, 20).padding(.bottom, 24)

            SidebarItem(title: "New recording", icon: "waveform.badge.plus", selected: store.route == .capture || store.route == nil) {
                store.route = .capture
            }
            SidebarItem(title: "Library", icon: "square.stack", selected: store.route == .library) {
                store.route = .library
            }
            Spacer()
            SidebarItem(title: "Settings", icon: "gearshape", selected: store.route == .settings, badge: store.updates.updateAvailable) {
                store.route = .settings
            }
            HStack(spacing: 7) {
                Image(systemName: store.preferences.transcriptionProvider == "local" ? "lock.shield" : "cloud")
                Text(store.preferences.transcriptionProvider == "local" ? "On this Mac" : "Deepgram")
            }.font(.caption).foregroundStyle(.secondary)
                .padding(.horizontal, 12).padding(.top, 12).padding(.bottom, 16)
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background { WorkspaceBackground() }
        .navigationSplitViewColumnWidth(min: 200, ideal: 220, max: 280)
    }
}
