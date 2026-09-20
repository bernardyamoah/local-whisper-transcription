import SwiftUI

struct DestinationSettingsView: View {
    @Environment(StudioStore.self) private var store
    @State private var destinations: ExportDestinations?
    @State private var selected: StudioIntegration?
    @State private var failure: String?
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                ForEach([StudioIntegration.obsidian, .notion, .webhook]) { integration in
                    IntegrationCard(integration: integration, configured: configured(integration)) { selected = integration }
                        .disabled(destinations == nil)
                }
                if let failure {
                    HStack { Text(failure).foregroundStyle(.red); Button("Retry") { Task { await load() } }.studioButton() }
                } else if destinations == nil { ProgressView() }
            }.padding(2)
        }.task { await load() }
            .sheet(item: $selected) { integration in
                IntegrationSetup(integration: integration, configured: configured(integration), destinations: destinations) {
                    Task { await load() }
                }
            }
    }
    private func configured(_ integration: StudioIntegration) -> Bool {
        guard let destinations else { return false }
        switch integration {
        case .obsidian: return !destinations.obsidianVault.isEmpty
        case .notion: return destinations.notionConnected && !destinations.notionParentId.isEmpty
        case .webhook: return destinations.webhookConnected
        default: return false
        }
    }
    private func load() async {
        guard let api = store.api else { failure = "The local service is unavailable."; return }
        do { destinations = try await api.request("export-destinations"); failure = nil }
        catch { failure = error.localizedDescription }
    }
}
