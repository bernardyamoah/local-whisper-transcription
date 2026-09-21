import SwiftUI

struct UpdatesView: View {
    @Environment(StudioStore.self) private var store
    @AppStorage("automaticallyDownloadUpdates") private var automaticallyDownload = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Surface {
                    VStack(alignment: .leading, spacing: 20) {
                        HStack(spacing: 14) {
                            Image(systemName: statusIcon).font(.system(size: 28)).foregroundStyle(statusColor)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(statusTitle).font(.headline)
                                Text(statusDetail).font(.callout).foregroundStyle(.secondary)
                            }
                            Spacer()
                            action
                        }
                        Divider().opacity(0.4)
                        SettingsRow(title: "Installed version") { Text(store.updates.currentVersion).foregroundStyle(.secondary) }
                        if let release = store.updates.latest {
                            SettingsRow(title: "Latest version") { Text(release.version).foregroundStyle(.secondary) }
                            SettingsRow(title: "Download size") {
                                Text(release.sizeBytes.formatted(.byteCount(style: .file))).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                Surface {
                    VStack(alignment: .leading, spacing: 18) {
                        SettingsRow(title: "Automatically download updates") {
                            Toggle("Automatically download updates", isOn: $automaticallyDownload).toggleStyle(.switch)
                        }
                        Text("Whisper Studio checks quietly in the background. Downloaded updates wait in Downloads until you choose to install them.")
                            .font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }.padding(2)
        }
        .onChange(of: automaticallyDownload) { _, enabled in
            if enabled, store.updates.updateAvailable { Task { await store.updates.download() } }
        }
    }

    @ViewBuilder private var action: some View {
        switch store.updates.phase {
        case .checking, .downloading:
            ProgressView().controlSize(.small)
        case .available:
            Button("Download", systemImage: "arrow.down.circle") { Task { await store.updates.download() } }.studioButton(.primary)
        case .ready:
            Button("Open Installer", systemImage: "shippingbox") { store.updates.openInstaller() }.studioButton(.primary)
        default:
            Button("Check Now") { Task { await store.updates.check(manual: true) } }.studioButton()
        }
    }

    private var statusTitle: String {
        switch store.updates.phase {
        case .idle: "Updates"
        case .checking: "Checking for updates…"
        case .current: "Whisper Studio is up to date"
        case .available: "An update is available"
        case .downloading: "Downloading update…"
        case .ready: "Update ready to install"
        case .failed: "Couldn’t check for updates"
        }
    }

    private var statusDetail: String {
        switch store.updates.phase {
        case .available: "Version \(store.updates.latest?.version ?? "") is ready to download."
        case .downloading: "You can keep using Whisper Studio while it downloads."
        case .ready(let url): "Saved to \(url.lastPathComponent)."
        case .failed(let message): message
        default: "Current version \(store.updates.currentVersion)"
        }
    }

    private var statusIcon: String {
        switch store.updates.phase {
        case .available: "arrow.down.circle.fill"
        case .downloading: "arrow.down.circle"
        case .ready: "checkmark.circle.fill"
        case .failed: "exclamationmark.triangle.fill"
        default: "checkmark.seal"
        }
    }

    private var statusColor: Color {
        switch store.updates.phase {
        case .available, .ready: StudioStyle.accent
        case .failed: .orange
        default: .secondary
        }
    }
}
