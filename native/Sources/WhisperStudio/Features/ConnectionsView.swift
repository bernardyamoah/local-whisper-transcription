import SwiftUI

struct ConnectionsView: View {
    @Environment(StudioStore.self) private var store
    @State private var selected: StudioIntegration?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                IntegrationCard(integration: .deepgram, configured: configured(.deepgram)) { selected = .deepgram }
                IntegrationCard(integration: .googleMeet, configured: configured(.googleMeet)) { selected = .googleMeet }
                IntegrationCard(integration: .jev, configured: configured(.jev)) { selected = .jev }
                if configured(.jev) {
                    @Bindable var store = store
                    Surface {
                        Toggle("Smart Moments", isOn: $store.preferences.smartMoments)
                            .onChange(of: store.preferences.smartMoments) { Task { await store.savePreferences(store.preferences) } }
                    }
                }
                if let error = store.environment?.jev.error { Text(error).font(.callout).foregroundStyle(.red) }
            }.padding(2)
        }.sheet(item: $selected) { integration in
            IntegrationSetup(integration: integration, configured: configured(integration), onSaved: {})
        }
    }
    private func configured(_ integration: StudioIntegration) -> Bool {
        switch integration {
        case .deepgram: store.environment?.deepgram.configured == true
        case .googleMeet: store.environment?.googleMeet.configured == true
        case .jev: store.environment?.jev.configured == true
        default: false
        }
    }
}
