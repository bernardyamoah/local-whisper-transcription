import SwiftUI

struct StudioSettingsView: View {
    @Environment(StudioStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var section = SettingsCategory.appearance
    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                Button("Workspace", systemImage: "arrow.left") { store.route = .library }
                    .buttonStyle(.plain).padding(.horizontal, 10).padding(.bottom, 24)
                Text("Settings").font(.title2.weight(.semibold)).padding(.horizontal, 10).padding(.bottom, 16)
                ForEach(SettingsCategory.allCases) { item in
                    SidebarItem(title: item.title, icon: item.icon, selected: section == item, badge: item == .updates && store.updates.updateAvailable) {
                        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) { section = item }
                    }
                }
                Spacer()
                HStack(spacing: 8) {
                    Image(systemName: "waveform").font(.title3)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Whisper Studio").font(.callout.weight(.medium))
                        Text(store.environment?.version ?? "").font(.caption).foregroundStyle(.secondary)
                    }
                }.padding(12)
            }.padding(20).frame(width: 242)
                .glassEffect(.regular, in: .rect(cornerRadius: 24))
                .padding(12)
            VStack(alignment: .leading, spacing: 24) {
                HStack(alignment: .firstTextBaseline) {
                    Text(section.title).font(.system(size: 28, weight: .semibold)).tracking(-0.6)
                    Spacer()
                }.padding(.bottom, 2)
                Group {
                    switch section {
                    case .appearance: AppearanceView()
                    case .preferences: PreferencesView()
                    case .connections: ConnectionsView()
                    case .destinations: DestinationSettingsView()
                    case .models: ModelsView()
                    case .storage: StorageView()
                    case .updates: UpdatesView()
                    }
                }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .id(section).transition(.opacity)
            }.padding(36).frame(maxWidth: 1000, maxHeight: .infinity, alignment: .topLeading)
                .frame(maxWidth: .infinity)
                .background(Color(nsColor: .windowBackgroundColor))
        }.background(Color(nsColor: .windowBackgroundColor).ignoresSafeArea())
    }
}
