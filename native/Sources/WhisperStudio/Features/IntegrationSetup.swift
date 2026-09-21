import SwiftUI
import AppKit

enum StudioIntegration: String, Identifiable, CaseIterable {
    case deepgram, jev, obsidian, notion, webhook
    case googleMeet = "google-meet"
    var id: String { rawValue }
    var title: String {
        switch self { case .deepgram: "Deepgram"; case .googleMeet: "Google Meet"; case .jev: "JEV"; case .obsidian: "Obsidian"; case .notion: "Notion"; case .webhook: "Webhook" }
    }
    var subtitle: String {
        switch self {
        case .deepgram: "Live transcription in the cloud."
        case .googleMeet: "Automatic names for meeting speakers."
        case .jev: "Decisions, actions, and key moments."
        case .obsidian: "Your recordings, in your vault."
        case .notion: "Meeting notes where you work."
        case .webhook: "Send transcripts to your workflow."
        }
    }
    var provider: Bool { self == .deepgram || self == .googleMeet || self == .jev }
    var apiKeyProvider: Bool { self == .deepgram || self == .jev }
}

private struct GoogleAuthorization: Decodable { let authorizationUrl: URL }

struct IntegrationCard: View {
    let integration: StudioIntegration
    let configured: Bool
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 18) {
                PlatformIcon(name: integration.rawValue, size: 28)
                    .frame(width: 62, height: 62)
                    .background(.primary.opacity(0.055), in: .rect(cornerRadius: 18))
                VStack(alignment: .leading, spacing: 6) {
                    Text(integration.title).font(.title3.weight(.semibold))
                    Text(integration.subtitle).font(.callout).foregroundStyle(.secondary)
                }
                Spacer(minLength: 12)
                VStack(alignment: .trailing, spacing: 8) {
                    Text(configured ? "Manage" : "Set up").font(.callout.weight(.medium))
                    if configured { Label("Configured", systemImage: "checkmark.circle.fill").font(.caption).foregroundStyle(.secondary) }
                }
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            }.padding(22).frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
                .studioGlass(radius: 22, interactive: true)
        }.buttonStyle(.plain)
    }
}

struct IntegrationSetup: View {
    @Environment(StudioStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let integration: StudioIntegration
    let configured: Bool
    var destinations: ExportDestinations?
    let onSaved: () -> Void
    @State private var step = 0
    @State private var key = ""
    @State private var location = ""
    @State private var folder = "Whisper Studio"
    @State private var working = false
    @State private var failure: String?
    @State private var confirmDisconnect = false

    private var googleClientID: String {
        (Bundle.main.object(forInfoDictionaryKey: "GoogleMeetClientID") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }
    private var googleClientSecret: String {
        (Bundle.main.object(forInfoDictionaryKey: "GoogleMeetClientSecret") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    private var valid: Bool {
        if integration == .googleMeet { return !googleClientID.isEmpty && !googleClientSecret.isEmpty }
        if integration.provider { return !key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if integration == .notion { return !location.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (configured || !key.isEmpty) }
        return !location.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(integration.title).font(.headline)
                Spacer()
                Button { dismiss() } label: { Image(systemName: "xmark") }.studioIconButton(.ghost).help("Close setup").disabled(working)
            }.padding(24)
            VStack(spacing: 22) {
                ZStack {
                    RoundedRectangle(cornerRadius: 28).fill(.primary.opacity(0.035)).frame(width: 126, height: 126).rotationEffect(.degrees(-8))
                    PlatformIcon(name: integration.rawValue, size: 46)
                        .frame(width: 104, height: 104).studioGlass(radius: 28)
                    if step == 2 {
                        Image(systemName: "checkmark.circle.fill").font(.system(size: 28)).foregroundStyle(StudioStyle.accent)
                            .background(.background, in: Circle()).offset(x: 47, y: 45)
                    }
                }.padding(.top, 12)
                VStack(spacing: 8) {
                    Text(step == 2 ? (integration.provider ? "Connected" : "Destination saved") : step == 0 ? integration.subtitle : "Set up \(integration.title)")
                        .font(.title2.weight(.semibold)).multilineTextAlignment(.center)
                    Text(step == 2 ? "\(integration.title) is ready in Whisper Studio." : step == 0 ? intro : "")
                        .font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
                if step == 1 { fields.transition(.opacity) }
                if let failure { Text(failure).font(.callout).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true).accessibilityAddTraits(.updatesFrequently) }
                Spacer(minLength: 0)
            }.padding(.horizontal, 36).frame(maxWidth: .infinity).frame(height: 390).id(step)
            StudioGlassGroup(spacing: 12) {
                HStack(spacing: 12) {
                    if step == 1 { Button("Back") { changeStep(0) }.studioButton(.ghost).disabled(working) }
                    else if configured && integration.provider && step == 0 {
                        Button("Disconnect", role: .destructive) { confirmDisconnect = true }.studioButton(.destructive)
                    }
                    Spacer()
                    if working { ProgressView().controlSize(.small) }
                    Button(actionTitle) {
                        if step == 2 { dismiss() }
                        else if step == 0 { changeStep(1) }
                        else { Task { await save() } }
                    }.studioButton(.primary).keyboardShortcut(.defaultAction).disabled(working || (step == 1 && !valid))
                }
            }.padding(24)
        }.frame(width: 560).background(WorkspaceBackground())
            .interactiveDismissDisabled(working)
            .onAppear {
                switch integration {
                case .obsidian: location = destinations?.obsidianVault ?? ""; folder = destinations?.obsidianFolder ?? "Whisper Studio"
                case .notion: location = destinations?.notionParentId ?? ""
                case .webhook: location = destinations?.webhookUrl ?? ""
                default: break
                }
            }
            .confirmationDialog("Disconnect \(integration.title)?", isPresented: $confirmDisconnect) {
                Button("Disconnect", role: .destructive) { Task { await disconnect() } }
            }
    }
    private var actionTitle: String {
        if step == 2 { return "Done" }
        if step == 0 { return configured ? "Edit setup" : "Get started" }
        if integration == .googleMeet { return "Continue with Google" }
        return integration.provider ? "Connect" : "Save destination"
    }
    private var intro: String {
        switch integration {
        case .deepgram: "Connect with your Deepgram API key."
        case .googleMeet: "Sign in with the Google account you use for Meet. Whisper Studio can name speakers after each call."
        case .jev: "Connect your TypeSafe API key for Smart Moments."
        case .obsidian: "Choose a vault and a folder for your Markdown exports."
        case .notion: "Add an integration token and a page shared with that integration."
        case .webhook: "Choose an HTTPS endpoint. Exports are sent only when you choose Send."
        }
    }
    @ViewBuilder private var fields: some View {
        VStack(alignment: .leading, spacing: 16) {
            if integration.apiKeyProvider {
                fieldLabel(integration == .jev ? "TypeSafe API key" : "API key")
                SecureField(configured ? "Enter a replacement key" : "Paste API key", text: $key)
            } else if integration == .googleMeet {
                VStack(alignment: .leading, spacing: 14) {
                    Label("View meetings you attended", systemImage: "person.2")
                    Label("Match transcript timing with participant names", systemImage: "text.bubble")
                    Label("Keep recordings and transcripts on this Mac", systemImage: "lock.shield")
                }
                .font(.callout)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
                .studioGlass(radius: 18)
                if googleClientID.isEmpty {
                    Text("Google Meet is not available in this build.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                } else if working {
                    Label("Finish signing in in your browser", systemImage: "safari")
                        .font(.callout.weight(.medium))
                        .foregroundStyle(.secondary)
                }
            } else if integration == .obsidian {
                fieldLabel("Vault")
                Button {
                    let panel = NSOpenPanel(); panel.canChooseDirectories = true; panel.canChooseFiles = false
                    panel.allowsMultipleSelection = false; panel.prompt = "Choose vault"
                    if panel.runModal() == .OK, let url = panel.url { location = url.path }
                } label: {
                    HStack { Image(systemName: "folder"); Text(location.isEmpty ? "Choose vault…" : URL(filePath: location).lastPathComponent).lineLimit(1); Spacer(); Image(systemName: "chevron.up.chevron.down") }
                }.studioButton().help(location)
                fieldLabel("Folder in vault")
                TextField("Whisper Studio", text: $folder)
            } else {
                fieldLabel(integration == .notion ? "Parent page ID" : "Endpoint URL")
                TextField(integration == .notion ? "Page ID" : "https://", text: $location)
                fieldLabel(integration == .notion ? "Integration token" : "Bearer token · optional")
                SecureField(configured ? "Leave blank to keep the saved token" : "Paste token", text: $key)
            }
        }.textFieldStyle(.roundedBorder).controlSize(.large)
    }
    private func fieldLabel(_ title: String) -> some View { Text(title).font(.callout.weight(.medium)) }
    private func changeStep(_ value: Int) {
        failure = nil
        withAnimation(reduceMotion ? nil : StudioStyle.spring) { step = value }
    }
    private func save() async {
        guard let api = store.api else { failure = "The local service is unavailable. Try again."; return }
        failure = nil
        let value = location.trimmingCharacters(in: .whitespacesAndNewlines)
        if integration == .webhook {
            guard let url = URL(string: value), url.scheme == "https", url.host != nil else { failure = "Enter a valid HTTPS endpoint."; return }
        }
        if integration == .obsidian {
            var directory: ObjCBool = false
            guard FileManager.default.fileExists(atPath: value, isDirectory: &directory), directory.boolValue else { failure = "Choose an existing vault folder."; return }
            guard !folder.hasPrefix("/"), !folder.split(separator: "/").contains("..") else { failure = "Choose a folder inside your vault."; return }
        }
        working = true
        defer { working = false }
        do {
            if integration == .googleMeet {
                let authorization: GoogleAuthorization = try await api.request(
                    "providers/google-meet/start",
                    method: "POST",
                    body: [
                        "client_id": googleClientID,
                        "client_secret": googleClientSecret,
                    ]
                )
                NSWorkspace.shared.open(authorization.authorizationUrl)
                for _ in 0..<60 {
                    try await Task.sleep(for: .seconds(2))
                    try await store.refreshEnvironment()
                    if store.environment?.googleMeet.configured == true {
                        key = ""; onSaved(); changeStep(2); return
                    }
                }
                throw StudioFailure(message: "Google connection timed out. Return here and try again.")
            } else if integration.provider {
                try await api.mutate("providers/\(integration.rawValue)", body: ["api_key": key.trimmingCharacters(in: .whitespacesAndNewlines)])
                try await store.refreshEnvironment()
            } else {
                var body: [String: Any] = [:]
                switch integration {
                case .obsidian: body = ["obsidian_vault": value, "obsidian_folder": folder]
                case .notion: body = ["notion_parent_id": value]; if !key.isEmpty { body["notion_token"] = key }
                case .webhook: body = ["webhook_url": value]; if !key.isEmpty { body["webhook_secret"] = key }
                default: break
                }
                try await api.mutate("export-destinations", method: "PUT", body: body)
            }
            key = ""; onSaved(); changeStep(2)
        } catch { failure = error.localizedDescription }
    }
    private func disconnect() async {
        guard let api = store.api else { return }
        working = true
        defer { working = false }
        do {
            try await api.mutate("providers/\(integration.rawValue)", method: "DELETE", body: ["confirm": true])
            try await store.refreshEnvironment(); onSaved(); dismiss()
        } catch { failure = error.localizedDescription }
    }
}
